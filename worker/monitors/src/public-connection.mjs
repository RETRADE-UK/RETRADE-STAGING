import { seal, unseal } from './connection.mjs';
import { createPublicSession, validatePublicSession, publicSessionExpiresAt } from './adapters/vinted-public-session.mjs';

// Same encrypted session and generation fences for setup and scheduled scans.
// A rejected search never triggers token rotation or a replacement identity.
export async function managedPublicConnection({rpc,request,userId,snapshot,manual=false,now=Date.now}) {
  const current=snapshot ?? await rpc('monitor_public_snapshot',{p_user:userId});
  if (!manual && (!current || current.mode!=='public' || !['verified','rate_limited','unavailable','testing'].includes(current.state)))
    return {state:'unavailable',generation:current?.generation};
  const key=await rpc('monitor_connection_key');
  let previous=null;
  if(current?.mode==='public' && current.ciphertext) {
    try {previous=validatePublicSession(await unseal(current.ciphertext,key,userId));}
    catch {return {state:'invalid',generation:current.generation};}
  }
  if(previous && current.state==='verified'
    && Math.min(Date.parse(current.expiresAt),Date.parse(publicSessionExpiresAt(previous,now())))>now()+120000) {
    return {state:'verified',session:previous,generation:current.generation};
  }
  const claim=await rpc('monitor_public_begin',{p_user:userId,p_manual:manual});
  if(!claim.accepted) {
    // A proactive refresh cooldown need not interrupt a still-valid session.
    // A competing renewal changes the generation and must never be reused.
    if(previous && current.state==='verified' && claim.generation===current.generation
      && Date.parse(publicSessionExpiresAt(previous,now()))>now()+30000)
      return {state:'verified',session:previous,generation:current.generation};
    return {state:'rate_limited',deferred:true,retryAt:claim.retryAt,generation:claim.generation};
  }
  let session=null,expiresAt=null,state='unavailable',retryAt=null,httpStatus=null,diagnostics=null;
  try {
    ({session,expiresAt}=await createPublicSession({request,session:previous,now}));state='verified';
  } catch(e) {
    httpStatus=e.status||null;
    diagnostics=e.diagnostics||null;
    state=[401,403,404].includes(e.status) || ['session_invalid','session_destination','session_missing','session_expired','unexpected_content_type'].includes(e.code)
      ?'blocked':e.status===429?'rate_limited':'unavailable';
    retryAt=state==='blocked'?null:new Date(Math.max(e.retryAt||0,now()+300000)).toISOString();
  }
  const saved=await rpc('monitor_connection_finish',{p_user:userId,p_attempt:claim.attempt,p_generation:claim.generation,
    p_state:state,p_ciphertext:session?await seal(session,key,userId):null,p_expires:expiresAt,p_retry:retryAt});
  return saved?{state,session,generation:claim.generation,retryAt,httpStatus,diagnostics,renewed:state==='verified',retryable:state==='unavailable'||state==='rate_limited'}
    :{state:'unavailable',deferred:true,generation:claim.generation};
}

export async function persistPublicSession({rpc,userId,generation,session,now=Date.now}) {
  const key=await rpc('monitor_connection_key');
  return rpc('monitor_public_session_save',{p_user:userId,p_generation:generation,
    p_ciphertext:await seal(validatePublicSession(session),key,userId),p_expires:publicSessionExpiresAt(session,now())});
}

// Operator-only, read-only timing evidence. Never return token claims, cookie
// values, anonymous identifiers, encryption material or provider responses.
export async function publicConnectionDiagnostics({rpc,userId,now=Date.now}) {
  const current=await rpc('monitor_public_snapshot',{p_user:userId});
  if(current?.mode!=='public' || !current.ciphertext) return {stored:false};
  const key=await rpc('monitor_connection_key');
  let session;
  try {session=validatePublicSession(await unseal(current.ciphertext,key,userId));}
  catch {return {stored:true,valid:false};}
  const effectiveExpiresAt=publicSessionExpiresAt(session,now());
  return {stored:true,valid:true,recordedExpiresAt:current.expiresAt,
    effectiveExpiresAt,expired:Date.parse(effectiveExpiresAt)<=now(),cookieCount:session.cookies.length};
}

export const publicMessages=Object.freeze({
  blocked:'Vinted refused catalogue access from this server. Monitoring is paused; no account token is needed.',
  rate_limited:'Vinted requested a pause. Wait until the next permitted check.',
  unavailable:'Catalogue access could not be verified. Monitoring is paused; try a check after the wait shown below.'
});
