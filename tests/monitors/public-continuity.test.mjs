import test from 'node:test';
import assert from 'node:assert/strict';
import { managedPublicConnection, persistPublicSession } from '../../worker/monitors/src/public-connection.mjs';
import { seal, unseal } from '../../worker/monitors/src/connection.mjs';
import { publicSession } from './public-fixtures.mjs';

const key=Buffer.alloc(32,42).toString('base64');
test('24-hour restart simulation retains identity and durable replacement cookies across expiry and 503',async()=>{
 let clock=Date.parse('2026-10-08T00:00:00Z'),version=0,renewals=0,failed=false;
 let cookieExpiry=clock+3600000;
 let current={mode:'public',state:'verified',generation:'g0',expiresAt:new Date(clock+3600000).toISOString(),ciphertext:await seal(publicSession('token-0',clock),key,'owner')};
 const rpc=async(name,args)=>{
  if(name==='monitor_public_snapshot')return structuredClone(current);
  if(name==='monitor_connection_key')return key;
  if(name==='monitor_public_begin'){
   if(Date.parse(current.retryAt)>clock)return {accepted:false,generation:current.generation,retryAt:current.retryAt};
   current.generation='g'+(++version);current.state='testing';
   return {accepted:true,generation:current.generation,attempt:'attempt'};
  }
  if(name==='monitor_connection_finish'){
   Object.assign(current,{state:args.p_state,expiresAt:args.p_expires,retryAt:args.p_retry});
   if(args.p_ciphertext)current.ciphertext=args.p_ciphertext;
   return true;
  }
  if(name==='monitor_public_session_save'){
   current.ciphertext=args.p_ciphertext;current.expiresAt=args.p_expires;return true;
  }
  throw Error(name);
 };
 const request=async(url,opts)=>{
  assert.equal(url.hostname,'www.vinted.co.uk');
  assert.equal(opts.headers['x-anon-id'],'synthetic-anonymous-id');
  assert.equal(opts.headers.cookie,clock<cookieExpiry?'access_token_web=token-'+renewals:'','Never transmit a cookie expired during backoff');
  if(renewals===3 && !failed){failed=true;return new Response(null,{status:503,headers:{'retry-after':'300'}});}
  renewals++;cookieExpiry=clock+3600000;return new Response('',{headers:{'content-type':'text/html','set-cookie':`access_token_web=token-${renewals}; Domain=.vinted.co.uk; Path=/; Max-Age=3600`}});
 };
 // Each call reconstructs the stateless worker from encrypted storage.
 for(let minute=0;minute<24*60;minute++) {
  const result=await managedPublicConnection({rpc,request,userId:'owner',now:()=>clock});
  if(result.session){
   assert.equal(result.session.anonId,'synthetic-anonymous-id');
   await persistPublicSession({rpc,userId:'owner',generation:result.generation,session:result.session,now:()=>clock});
   assert.equal((await unseal(current.ciphertext,key,'owner')).cookies[0].value,'token-'+renewals);
  } else assert(result.retryable||result.deferred);
  clock+=60000;
 }
 assert(failed);assert(renewals>=24);assert.equal(current.state,'verified');
});

test('lease waits and corrupt session storage never issue provider traffic',async()=>{
 const clock=Date.now(),ciphertext=await seal(publicSession('old',clock),key,'owner');
 const snapshot={mode:'public',state:'testing',generation:'g',ciphertext,expiresAt:new Date(clock+1000).toISOString()};
 let requests=0;
 const rpc=async name=>name==='monitor_connection_key'?key:{accepted:false,generation:'g',retryAt:new Date(clock+60000).toISOString()};
 const request=async()=>{requests++;throw Error('should not request');};
 assert.equal((await managedPublicConnection({rpc,request,snapshot,userId:'owner'})).deferred,true);
 assert.equal((await managedPublicConnection({rpc,request,snapshot:{...snapshot,ciphertext:{}},userId:'owner'})).state,'invalid');
 assert.equal(requests,0);
});

test('refused renewal stops after one request and keeps previous ciphertext out of diagnostics',async()=>{
 const now=Date.now(),ciphertext=await seal(publicSession('private-cookie',now),key,'owner');let calls=0,finish;
 const rpc=async(name,args)=>{
  if(name==='monitor_connection_key')return key;
  if(name==='monitor_public_begin')return {accepted:true,generation:'next',attempt:'attempt'};
  if(name==='monitor_connection_finish'){finish=args;return true;}
  throw Error(name);
 };
 const result=await managedPublicConnection({rpc,userId:'owner',snapshot:{mode:'public',state:'verified',ciphertext,expiresAt:new Date(now).toISOString()},
  request:async()=>{calls++;return new Response('private-body',{status:403});}});
 assert.equal(calls,1);assert.equal(result.state,'blocked');assert.equal(result.retryable,false);
 assert.equal(finish.p_ciphertext,null);assert(!JSON.stringify(result).includes('private'));
});

test('proactive renewal cooldown permits only the current still-valid generation',async()=>{
 const clock=Date.now(),session=publicSession('valid',clock);session.cookies[0].expiresAt=clock+90000;
 const current={mode:'public',state:'verified',generation:'g',expiresAt:new Date(clock+90000).toISOString(),ciphertext:await seal(session,key,'owner')};
 let generation='g';
 const rpc=async name=>name==='monitor_connection_key'?key:{accepted:false,generation,retryAt:new Date(clock+60000).toISOString()};
 const args={rpc,userId:'owner',snapshot:current,now:()=>clock,request:()=>{throw Error('no renewal during cooldown');}};
 assert.equal((await managedPublicConnection(args)).session.cookies[0].value,'valid');
 generation='replacement';assert.equal((await managedPublicConnection(args)).session,undefined);
});
