import { seal, unseal } from './connection.mjs';
import { createPublicSession, validatePublicSession } from './adapters/vinted-public-session.mjs';

// Same encrypted session and generation fences for setup and scheduled scans.
// A rejected search never triggers token rotation or a replacement identity.
export async function managedPublicConnection({rpc,request,userId,snapshot,manual=false,now=Date.now}) {
  const current=snapshot ?? await rpc('monitor_public_snapshot',{p_user:userId});
  if (!manual && (!current || current.mode!=='public' || !['verified','rate_limited'].includes(current.state)))
    return {state:'unavailable',generation:current?.generation};
  const key=await rpc('monitor_connection_key');
  if(current?.mode==='public' && current.state==='verified' && Date.parse(current.expiresAt)>now()+120000) {
    try {return {state:'verified',session:validatePublicSession(await unseal(current.ciphertext,key,userId)),generation:current.generation};}
    catch {return {state:'unavailable',generation:current.generation};}
  }
  const claim=await rpc('monitor_public_begin',{p_user:userId,p_manual:manual});
  if(!claim.accepted) return {state:'rate_limited',retryAt:claim.retryAt,generation:claim.generation};
  let session=null,expiresAt=null,state='unavailable',retryAt=null,httpStatus=null;
  try {
    ({session,expiresAt}=await createPublicSession({request,now}));state='verified';
  } catch(e) {
    httpStatus=e.status||null;
    state=[401,403,404].includes(e.status)?'blocked':e.status===429?'rate_limited':'unavailable';
    retryAt=e.retryAt?new Date(e.retryAt).toISOString():null;
  }
  const saved=await rpc('monitor_connection_finish',{p_user:userId,p_attempt:claim.attempt,p_generation:claim.generation,
    p_state:state,p_ciphertext:session?await seal(session,key,userId):null,p_expires:expiresAt,p_retry:retryAt});
  return saved?{state,session,generation:claim.generation,retryAt,httpStatus}:{state:'unavailable',generation:claim.generation};
}

export async function persistPublicSession({rpc,userId,generation,session}) {
  const key=await rpc('monitor_connection_key');
  return rpc('monitor_public_persist',{p_user:userId,p_generation:generation,p_ciphertext:await seal(validatePublicSession(session),key,userId)});
}

export const publicMessages=Object.freeze({
  blocked:'Vinted refused catalogue access from this server. Monitoring is paused; no account token is needed.',
  rate_limited:'Vinted requested a pause. Wait until the next permitted check.',
  unavailable:'Catalogue access could not be verified. Monitoring is paused; try a check after the wait shown below.'
});
