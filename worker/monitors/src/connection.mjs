// Read-only UK connection experiment. Never log inputs, bodies or raw errors.
import { readJson, retryAt, validateAccessToken } from './adapters/vinted-source.mjs';
const enc = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export function connectionInput(input) {
  if (!input || typeof input.refreshToken !== 'string' || !/^[A-Za-z0-9._~-]{20,8192}$/.test(input.refreshToken))
    throw new TypeError('Enter only the refresh_token_web cookie value.');
  if (typeof input.userAgent !== 'string' || !/^[\x20-\x7e]{10,512}$/.test(input.userAgent))
    throw new TypeError('Enter the User-Agent from the browser signed in to Vinted.');
  if (input.country !== 'GB') throw new TypeError('Only Vinted UK (GB) is supported.');
  return { refreshToken: input.refreshToken, userAgent: input.userAgent, country: 'GB' };
}
export async function seal(credentials, key, userId) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('monitor:v1:'+userId)},k,enc.encode(JSON.stringify(credentials)));
  return {v:1,iv:b64(iv),data:b64(new Uint8Array(ciphertext))};
}
export async function unseal(value,key,userId) {
  if (value?.v !== 1) throw new Error('Credential format unavailable');
  const k = await crypto.subtle.importKey('raw',unb64(key),'AES-GCM',false,['decrypt']);
  const clear = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(value.iv),additionalData:enc.encode('monitor:v1:'+userId)},k,unb64(value.data));
  return JSON.parse(new TextDecoder().decode(clear));
}
export async function renewConnection({credentials,request,now=Date.now,timeoutMs=7000}) {
  const input = connectionInput(credentials), controller = new AbortController();
  let timer;
  // An uncertain outcome may already have rotated the token: never retry it.
  try {
    return await Promise.race([new Promise(resolve => {timer=setTimeout(()=>{controller.abort();resolve({state:'unavailable'});},timeoutMs);}), (async()=>{
      const response = await request(new URL('https://www.vinted.co.uk/oauth/token'),{
        method:'POST',redirect:'error',signal:controller.signal,
        headers:{'content-type':'application/json',accept:'application/json','user-agent':input.userAgent},
        body:JSON.stringify({client_id:'web',scope:'user',grant_type:'refresh_token',refresh_token:input.refreshToken})
      });
      if (!response.ok) {
        // Only an explicit invalid_grant proves that the saved grant is unusable.
        // Never persist error descriptions: providers can echo credentials in them.
        let code = null;
        if ([400,401].includes(response.status)) {
          try { const body=await readJson(response,40000); code=body?.error; } catch {}
        } else await response.body?.cancel().catch(()=>{});
        return {state:code==='invalid_grant'?'reconnect':[400,401,403].includes(response.status)?'blocked':response.status===429?'rate_limited':'unavailable',
          retryAt:response.status===429?retryAt(response.headers.get('retry-after'),now(),300000):null};
      }
      const payload = await readJson(response,40000);
      validateAccessToken(payload.access_token);
      const refreshToken=payload.refresh_token ?? input.refreshToken;
      connectionInput({...input,refreshToken});
      if (!Number.isSafeInteger(payload.expires_in) || payload.expires_in<60 || payload.expires_in>2592000) return {state:'unavailable'};
      return {state:'verified',credentials:{...input,refreshToken,accessToken:payload.access_token},
        expiresAt:new Date(now()+payload.expires_in*1000).toISOString()};
    })()]);
  } catch { return {state:'unavailable'}; }
  finally {clearTimeout(timer);controller.abort();}
}
export const connectionMessages = Object.freeze({
 disconnected:'No saved Vinted connection.',
 testing:'Testing session renewal…',
 verified:'Session renewal is available. Search access must also pass before the connection is ready.',
 reconnect:'Vinted rejected the saved refresh grant. Reconnect your Vinted session.',
 blocked:'Vinted refused renewal. This is a connection-method problem; a new token has not been shown to fix it.',
 rate_limited:'Vinted requested a pause. Wait until the next permitted test.',
 unavailable:'Renewal could not be safely confirmed. The saved connection is retained for review; an uncertain refresh is not repeated automatically.'
});

// The manual check and scheduled worker use the same expiry/rotation path.
// Database leases serialize refreshes; a replacement must be durable before use.
export async function managedConnection({rpc,request,userId,snapshot,credentials=null,now=Date.now}) {
  try {
    const current=snapshot ?? await rpc('monitor_connection_snapshot',{p_user:userId});
    if (!credentials && (!current || !['verified','rate_limited'].includes(current.state)))
      return {state:current?.state || 'disconnected',retryAt:current?.retryAt || null};
    const key=await rpc('monitor_connection_key');
    if (!credentials && current.state==='verified' && Date.parse(current.expiresAt)>now()+120000)
      return {state:'verified',credentials:await unseal(current.ciphertext,key,userId),generation:current.generation,expiresAt:current.expiresAt};
    const claim=await rpc('monitor_connection_begin',{p_user:userId,p_ciphertext:credentials?await seal(connectionInput(credentials),key,userId):null});
    if (!claim.accepted) return {state:'rate_limited',retryAt:claim.retryAt};
    const result=await renewConnection({credentials:await unseal(claim.ciphertext,key,userId),request,now});
    const saved=await rpc('monitor_connection_finish',{p_user:userId,p_attempt:claim.attempt,p_generation:claim.generation,
      p_state:result.state,p_ciphertext:result.credentials?await seal(result.credentials,key,userId):null,
      p_expires:result.expiresAt||null,p_retry:result.retryAt?new Date(result.retryAt).toISOString():null});
    if (!saved) return {state:'unavailable'};
    return {...result,retryAt:result.retryAt?new Date(result.retryAt).toISOString():null,generation:claim.generation};
  } catch { return {state:'unavailable'}; }
}
