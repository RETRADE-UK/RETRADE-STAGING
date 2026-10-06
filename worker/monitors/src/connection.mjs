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
    return await Promise.race([new Promise(resolve => {timer=setTimeout(()=>{controller.abort();resolve({state:'reconnect'});},timeoutMs);}), (async()=>{
      const response = await request(new URL('https://www.vinted.co.uk/oauth/token'),{
        method:'POST',redirect:'error',signal:controller.signal,
        headers:{'content-type':'application/json',accept:'application/json','user-agent':input.userAgent},
        body:JSON.stringify({client_id:'web',scope:'user',grant_type:'refresh_token',refresh_token:input.refreshToken})
      });
      if (!response.ok) {
        await response.body?.cancel().catch(()=>{});
        return {state:response.status===403?'blocked':response.status===429?'rate_limited':'reconnect',
          retryAt:response.status===429?retryAt(response.headers.get('retry-after'),now(),300000):null};
      }
      const payload = await readJson(response,40000);
      validateAccessToken(payload.access_token);
      connectionInput({...input,refreshToken:payload.refresh_token});
      if (!Number.isSafeInteger(payload.expires_in) || payload.expires_in<60 || payload.expires_in>2592000) return {state:'reconnect'};
      return {state:'verified',credentials:{...input,refreshToken:payload.refresh_token,accessToken:payload.access_token},
        expiresAt:new Date(now()+payload.expires_in*1000).toISOString()};
    })()]);
  } catch { return {state:'reconnect'}; }
  finally {clearTimeout(timer);controller.abort();}
}
export const connectionMessages = Object.freeze({
 disconnected:'No saved Vinted connection.',
 testing:'Testing session renewal…',
 verified:'Vinted session renewal succeeded. The replacement token is saved securely. Use automatic searches to keep enabled monitors updated.',
 reconnect:'Renewal could not be confirmed. Enter fresh Vinted details before another attempt; an uncertain request is never retried automatically.',
 blocked:'Vinted refused renewal (403). No automatic retries will run. The connection method needs review.',
 rate_limited:'Vinted requested a pause. Wait until the next permitted test.',
 unavailable:'Connection storage is unavailable. No background requests will run.'
});
