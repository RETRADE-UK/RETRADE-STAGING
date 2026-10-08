import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicSession, acceptPublicCookies, publicCookieHeader, publicSessionExpiresAt } from '../../worker/monitors/src/adapters/vinted-public-session.mjs';
import { createVintedSource } from '../../worker/monitors/src/adapters/vinted-source.mjs';
import { normalizeListing } from '../../worker/monitors/src/adapters/vinted-normalize.mjs';
import { publicSession } from './public-fixtures.mjs';
const now=Date.parse('2026-10-07T21:00:00Z');
const api=new URL('https://api.vinted.co.uk/svc-catalogue/items');

test('public cookie jar enforces host/path/expiry, replacement, deletion and foreign-domain rejection',()=>{
 const s=publicSession('one',now);
 const h=new Headers();
 h.append('set-cookie','host_only=private; Path=/');
 h.append('set-cookie','wrong=private; Domain=attacker.test; Path=/');
 h.append('set-cookie','scoped=limited; Domain=.vinted.co.uk; Path=/account');
 h.append('set-cookie','access_token_web=two; Domain=.vinted.co.uk; Path=/; Max-Age=300');
 acceptPublicCookies(s,h,new URL('https://www.vinted.co.uk/'),now);
 assert.equal(publicCookieHeader(s,api,now),'access_token_web=two');
 assert.equal(publicCookieHeader(s,api,now+301000),'');
 assert.throws(()=>publicCookieHeader(s,new URL('https://attacker.test/'),now));
 assert.throws(()=>publicCookieHeader(s,new URL('http://api.vinted.co.uk/'),now));
 acceptPublicCookies(s,new Headers({'set-cookie':'access_token_web=; Domain=.vinted.co.uk; Path=/; Max-Age=0'}),api,now);
 assert.equal(publicCookieHeader(s,api,now),'');
});

test('public session and catalogue use fixed destinations and never account OAuth or browser impersonation',async()=>{
 const calls=[];
 const request=async(url,opts)=>{
  calls.push(url.href);assert.equal(opts.redirect,'error');assert(opts.headers['user-agent'].startsWith('RETRADE-Monitor/'));
  if(url.hostname==='www.vinted.co.uk')return new Response('',{headers:{'content-type':'text/html','x-anon-id':'anonymous-fixture','set-cookie':'access_token_web=public-fixture; Domain=.vinted.co.uk; Path=/; Secure; HttpOnly; Max-Age=1800'}});
  assert.equal(url.origin,'https://api.vinted.co.uk');assert.equal(url.pathname,'/svc-catalogue/items');
  assert.equal(opts.headers.cookie,'access_token_web=public-fixture');assert.equal(opts.headers['x-anon-id'],'anonymous-fixture');
  assert.equal(opts.headers.locale,'en-GB');
  return Response.json({items:[]},{headers:{'set-cookie':'access_token_web=next-public; Domain=.vinted.co.uk; Path=/; Max-Age=1800'}});
 };
 const {session,expiresAt}=await createPublicSession({request,now:()=>now});
 assert.equal(Date.parse(expiresAt),now+1800000);
 await createVintedSource({request,publicSession:session,now:()=>now}).searchPage({searchText:'Canon'});
 assert.equal(session.cookies[0].value,'next-public');assert.equal(calls.length,2);
 assert.throws(()=>createVintedSource({request,publicSession:session,accessToken:'account-secret-not-allowed'}));
});

test('session failures stop after one bounded request including a stalled transport',async()=>{
 for(const status of [401,403,429]){
  let n=0;await assert.rejects(createPublicSession({now:()=>now,request:async()=>{n++;return new Response('private',{status,headers:{'retry-after':'600'}});}}),e=>e.status===status && e.retryAt===now+600000);
  assert.equal(n,1);
 }
 await assert.rejects(createPublicSession({timeoutMs:5,request:()=>new Promise(()=>{})}),e=>e.code==='timeout');
 await assert.rejects(createPublicSession({request:async()=>new Response('',{headers:{'content-type':'text/html','set-cookie':'access_token_web=host-only; Path=/'}})}),e=>e.code==='session_missing');
});

test('renewal carries the existing scoped session and keeps anonymous identity across restarts',async()=>{
 const previous=publicSession('current',now);
 previous.cookies.push({name:'api_only',value:'not-for-homepage',domain:'api.vinted.co.uk',hostOnly:true,path:'/',expiresAt:now+3600000});
 const result=await createPublicSession({session:previous,now:()=>now,request:async(url,opts)=>{
  assert.equal(url.href,'https://www.vinted.co.uk/');
  assert.equal(opts.headers.cookie,'access_token_web=current');
  assert.equal(opts.headers['x-anon-id'],previous.anonId);
  return new Response('',{headers:{'content-type':'text/html','set-cookie':'access_token_web=renewed; Domain=.vinted.co.uk; Path=/; Max-Age=1800'}});
 }});
 assert.equal(previous.cookies[0].value,'current','Do not mutate a session before a successful replacement');
 assert.equal(result.session.anonId,previous.anonId);
 assert.equal(Date.parse(result.expiresAt),now+1800000);
});

test('access expiry honors earlier JWT hints and cookie scope but never extends cookie lifetime',()=>{
 const jwt=exp=>'header.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.signature';
 for(const [exp,expected] of [[now/1000+300,now+300000],[now/1000+7200,now+3600000]]) {
  assert.equal(Date.parse(publicSessionExpiresAt(publicSession(jwt(exp),now),now)),expected);
 }
 for(const value of ['opaque-token','a.not-json.b',jwt('bad')]) assert.equal(Date.parse(publicSessionExpiresAt(publicSession(value,now),now)),now+3600000);
 const s=publicSession('api',now);s.cookies.push({...s.cookies[0],value:'wrong-scope',domain:'www.vinted.co.uk',expiresAt:now-1});
 assert.equal(Date.parse(publicSessionExpiresAt(s,now)),now+3600000);
 s.cookies=[];assert.equal(Date.parse(publicSessionExpiresAt(s,now)),now);
});

test('current condition cards normalise exactly and never infer from a title or unknown status',()=>{
 const base={id:123,title:'Good Canon 600D',price:{amount:'60',currency_code:'GBP'}};
 const normalized=extra=>normalizeListing({...base,...extra},{observedAt:new Date(now).toISOString()}).condition;
 for(const [label,want] of [['Very good','very_good'],['One size · Good','good'],['New without tags','new'],['New with tags','new'],['Satisfactory','satisfactory']])
  assert.equal(normalized({item_box:{item_id:123,second_line:label}}),want);
 for(const card of [{item_id:456,second_line:'Good'},{item_id:123,second_line:'Good but broken'},{item_id:123,accessibility_label:'Condition: Good'}]) assert.equal(normalized({item_box:card}),null);
 assert.equal(normalized({status:'Unknown',item_box:{item_id:123,second_line:'Good'}}),null);
 assert.equal(normalized({}),null);
});
