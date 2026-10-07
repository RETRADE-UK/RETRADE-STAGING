import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionInput, seal, unseal, renewConnection, managedConnection } from '../../worker/monitors/src/connection.mjs';
const input = {refreshToken:'synthetic-refresh-token-value',userAgent:'Synthetic Test Browser 1.0',country:'GB'};
const key = Buffer.alloc(32,42).toString('base64');
const response = body => Response.json(body);
test('credentials encrypted with unique nonces and account binding',async()=>{
 const a=await seal(input,key,'owner-a'),b=await seal(input,key,'owner-a');
 assert.notDeepEqual(a,b);assert.equal(JSON.stringify(a).includes(input.refreshToken),false);
 assert.deepEqual(await unseal(a,key,'owner-a'),input);
 await assert.rejects(unseal(a,key,'owner-b'));
 await assert.rejects(unseal({...a,data:a.data.slice(4)},key,'owner-a'));
});
test('reject cookie headers, URL tokens, header injection and other countries',()=>{
 for(const patch of [{refreshToken:'https://example.test/token'},{refreshToken:'cookie=value;other=secret'},{userAgent:'test\r\nCookie:bad'},{country:'FR'}]) assert.throws(()=>connectionInput({...input,...patch}),TypeError);
});
test('bounded UK renewal saves both rotated credentials and expiry',async()=>{
 let calls=0;
 const result=await renewConnection({credentials:input,now:()=>100000,request:async(url,options)=>{
  calls++;assert.equal(url.href,'https://www.vinted.co.uk/oauth/token');assert.equal(options.redirect,'error');
  assert.equal(options.headers['user-agent'],input.userAgent);
  assert.equal(JSON.parse(options.body).refresh_token,input.refreshToken);
  return response({access_token:'synthetic-access-token-new',refresh_token:'synthetic-refresh-token-new',expires_in:3600});
 }});
 assert.equal(calls,1);assert.equal(result.state,'verified');assert.equal(result.credentials.refreshToken,'synthetic-refresh-token-new');
 assert.equal(result.expiresAt,new Date(3700000).toISOString());
});
test('refusals and uncertain responses are sanitized and never retried',async()=>{
 for(const [code,state] of [[401,'blocked'],[403,'blocked'],[429,'rate_limited'],[500,'unavailable']]){
  let calls=0;const r=await renewConnection({credentials:input,request:async()=>{calls++;return new Response(input.refreshToken,{status:code,headers:{'retry-after':'600'}});}});
  assert.equal(calls,1);assert.equal(r.state,state);assert.equal(JSON.stringify(r).includes(input.refreshToken),false);
 }
 for(const request of [async()=>{throw new Error(input.refreshToken);},async()=>new Response('<html>no</html>'),async()=>response({access_token:input.refreshToken}),async()=>response({access_token:input.refreshToken,refresh_token:input.refreshToken,expires_in:-1}),async()=>new Response('x'.repeat(40001),{headers:{'content-type':'application/json'}})]){
  assert.deepEqual(await renewConnection({credentials:input,request}),{state:'unavailable'});
 }
 assert.deepEqual(await renewConnection({credentials:input,timeoutMs:5,request:()=>new Promise(()=>{})}),{state:'unavailable'});
});

test('only explicit invalid_grant requests reconnection; optional rotation preserves the current grant',async()=>{
 for(const [error,state] of [['invalid_grant','reconnect'],['invalid_client','blocked'],['unknown','blocked']]){
  const result=await renewConnection({credentials:input,request:async()=>Response.json({error,error_description:input.refreshToken},{status:400})});
  assert.equal(result.state,state);assert(!JSON.stringify(result).includes(input.refreshToken));
 }
 const result=await renewConnection({credentials:input,request:async()=>response({access_token:'synthetic-access-token-value',expires_in:3600})});
 assert.equal(result.state,'verified');assert.equal(result.credentials.refreshToken,input.refreshToken);
});
test('12-hour simulation renews across stateless worker restarts using each durably rotated grant',async()=>{
 let clock=Date.parse('2026-10-07T00:00:00Z'),version=0,renewals=0;
 let current={state:'verified',generation:'v0',expiresAt:new Date(clock-1).toISOString(),ciphertext:await seal(input,key,'owner-a')};
 const rpc=async(name,args)=>{
  if(name==='monitor_connection_snapshot')return {...current};
  if(name==='monitor_connection_key')return key;
  if(name==='monitor_connection_begin')return {accepted:true,attempt:'attempt',generation:'v'+(++version),ciphertext:current.ciphertext};
  if(name==='monitor_connection_finish'){current={state:args.p_state,generation:args.p_generation,expiresAt:args.p_expires,ciphertext:args.p_ciphertext};return true;}
  throw Error(name);
 };
 const request=async(_,opts)=>{
  assert.equal(JSON.parse(opts.body).refresh_token,renewals ? 'synthetic-refresh-rotated-'+renewals : input.refreshToken);
  renewals++;return response({access_token:'synthetic-access-rotated-'+renewals,refresh_token:'synthetic-refresh-rotated-'+renewals,expires_in:7200});
 };
 for(let hour=0;hour<12;hour++){
  const session=await managedConnection({rpc,request,userId:'owner-a',now:()=>clock});
  assert.equal(session.state,'verified');assert.equal(session.credentials.accessToken,'synthetic-access-rotated-'+renewals);
  assert.equal((await unseal(current.ciphertext,key,'owner-a')).refreshToken,session.credentials.refreshToken);
  clock+=3600000;
 }
 assert.equal(renewals,6);
});
test('managed rate limits use the same ISO retry time for storage, callers and existing leases',async()=>{
 const clock=Date.parse('2026-10-07T00:00:00Z'),expected=new Date(clock+600000).toISOString();
 const ciphertext=await seal(input,key,'owner-a');let calls=0,stored;
 const rpc=async(name,args)=>{
  if(name==='monitor_connection_key')return key;
  if(name==='monitor_connection_begin')return {accepted:true,attempt:'attempt',generation:'next',ciphertext};
  if(name==='monitor_connection_finish'){stored=args;return true;}
  throw Error(name);
 };
 const options={rpc,userId:'owner-a',snapshot:{state:'verified',ciphertext,expiresAt:new Date(clock-1).toISOString()},now:()=>clock,
  request:async()=>{calls++;return new Response(null,{status:429,headers:{'retry-after':'600'}});}};
 const result=await managedConnection(options);
 assert.equal(result.state,'rate_limited');assert.equal(result.retryAt,expected);assert.equal(stored.p_retry,expected);
 assert.equal(result.credentials,undefined);assert.equal(calls,1);
 const leased=await managedConnection({...options,rpc:async(name,args)=>name==='monitor_connection_begin'?{accepted:false,retryAt:expected}:rpc(name,args)});
 assert.equal(leased.retryAt,expected);assert.equal(calls,1,'An active retry lease makes no provider request');
});
