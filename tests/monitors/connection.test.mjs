import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionInput, seal, unseal, renewConnection } from '../../worker/monitors/src/connection.mjs';
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
 for(const [code,state] of [[401,'reconnect'],[403,'blocked'],[429,'rate_limited'],[500,'reconnect']]){
  let calls=0;const r=await renewConnection({credentials:input,request:async()=>{calls++;return new Response(input.refreshToken,{status:code,headers:{'retry-after':'600'}});}});
  assert.equal(calls,1);assert.equal(r.state,state);assert.equal(JSON.stringify(r).includes(input.refreshToken),false);
 }
 for(const request of [async()=>{throw new Error(input.refreshToken);},async()=>new Response('<html>no</html>'),async()=>response({access_token:input.refreshToken}),async()=>response({access_token:input.refreshToken,refresh_token:input.refreshToken,expires_in:-1}),async()=>new Response('x'.repeat(40001),{headers:{'content-type':'application/json'}})]){
  assert.deepEqual(await renewConnection({credentials:input,request}),{state:'reconnect'});
 }
 assert.deepEqual(await renewConnection({credentials:input,timeoutMs:5,request:()=>new Promise(()=>{})}),{state:'reconnect'});
});
