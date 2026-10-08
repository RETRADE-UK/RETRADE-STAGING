import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { publicSession } from './public-fixtures.mjs';
import { seal } from '../../worker/monitors/src/connection.mjs';
import { canonBenchmark } from '../../worker/monitors/src/contracts.mjs';

// Execute the actual handler with all transport substituted. No staging account,
// source traffic, subscription secrets or notification provider is contacted.
let handler;
globalThis.Deno = { env: { get: key => key === 'SUPABASE_URL' ? 'https://dvnrxmdejxfuazmpnudj.supabase.co' : 'fixture-key' }, serve: fn => { handler = fn; } };
let source = readFileSync(new URL('../../supabase/functions/monitor-service/index.ts', import.meta.url), 'utf8');
source = source.replace('import webpush from "npm:web-push@3.6.7";', 'const webpush = { generateVAPIDKeys() { throw new Error("Unexpected key generation"); } };');
source = source.replaceAll('"../../../worker/', '"' + new URL('../../worker/', import.meta.url).href);
await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const user = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const config = { token: 'fixture-cron', vapid: { publicKey: 'fixture-public' }, source_status: 'blocked', source_message: 'Blocked fixture' };
const post = (body, auth = true, headers = {}) => handler(new Request('https://fixture.test/', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer fixture-user' } : {}), ...headers }, body: JSON.stringify(body),
}));
function transport(respond) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url); const path = u.pathname + u.search;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ path, body });
    const result = respond(path, body);
    if (result === undefined) throw new Error('Unexpected request: ' + path);
    return result instanceof Response ? result : Response.json(result);
  };
  return calls;
}
test('user and cron routes reject unauthenticated calls without source traffic', async () => {
  const calls = transport(path => path.endsWith('/rpc/monitor_config') ? config : undefined);
  assert.equal((await post({ op: 'feed', id }, false)).status, 401);
  assert.equal((await post({ op: 'tick' }, false)).status, 401);
  assert.equal((await post({ op: 'sourceCheck' }, false)).status, 401);
  assert.equal(calls.length, 2);
});

test('catalogue checks require registered ownership and durable cooldown before source traffic',async()=>{
 let mode='anonymous';
 const calls=transport(path=>{
  if(path==='/auth/v1/user')return {id:user,is_anonymous:mode==='anonymous'};
  if(path.startsWith('/rest/v1/monitor_recipes?'))return mode==='foreign'?[]:[{id,revision:1,recipe:canonBenchmark()}];
  if(path.endsWith('/rpc/monitor_session_claim'))return {accepted:false,retryAt:'2026-10-07T23:00:00Z'};
  if(path.endsWith('/rpc/monitor_connection_status'))return {state:'disconnected'};
 });
 const body={op:'catalogueTest',id};
 assert.equal((await post(body,false)).status,401);
 assert.equal((await post(body)).status,403);
 mode='foreign';assert.equal((await post(body)).status,400);
 mode='registered';assert.equal((await (await post(body)).json()).status,'rate_limited');
 assert(!calls.some(c=>c.path.startsWith('/svc-catalogue/') || c.path==='/'));
 assert.equal((await post({op:'connectionTest',credentials:{refreshToken:'retired'}})).status,409);
});

test('operator expiry diagnostic is read-only, authenticated and contains no session secrets',async()=>{
 const key=Buffer.alloc(32,42).toString('base64'),clock=Date.now();
 const exp=Math.floor(clock/1000)+900;
 const token='private-header.'+Buffer.from(JSON.stringify({exp,privateClaim:'never-return'})).toString('base64url')+'.private-signature';
 const ciphertext=await seal(publicSession(token,clock),key,user);
 const calls=transport((path,body)=>{
  if(path.endsWith('/rpc/monitor_config'))return config;
  if(path.endsWith('/rpc/monitor_public_snapshot')){assert.equal(body.p_user,user);return {mode:'public',ciphertext,expiresAt:new Date(clock+3600000).toISOString()};}
  if(path.endsWith('/rpc/monitor_connection_key'))return key;
 });
 assert.equal((await post({op:'connectionDiagnostics',userId:user})).status,401,'A user JWT cannot read operator diagnostics');
 assert.equal((await post({op:'connectionDiagnostics',userId:'invalid'},false,{'x-monitor-token':config.token})).status,400);
 const r=await post({op:'connectionDiagnostics',userId:user},false,{'x-monitor-token':config.token});
 assert.equal(r.status,200);
 const result=await r.json();
 assert.deepEqual(result,{stored:true,valid:true,recordedExpiresAt:new Date(clock+3600000).toISOString(),effectiveExpiresAt:new Date(exp*1000).toISOString(),expired:false,cookieCount:1});
 for(const secret of [token,key,'privateClaim','never-return','synthetic-anonymous-id','ciphertext'])assert(!JSON.stringify(result).includes(secret));
 assert(calls.every(c=>['monitor_config','monitor_public_snapshot','monitor_connection_key'].some(fn=>c.path.endsWith('/rpc/'+fn))));
});

test('public setup persists before searching, stores match-only samples and stops on refusal',async()=>{
 const key=Buffer.alloc(32,42).toString('base64');let completed=true,rejected=false,healthy=false;
 const calls=transport((path,body)=>{
  if(path==='/auth/v1/user')return {id:user};
  if(path.startsWith('/rest/v1/monitor_recipes?'))return [{id,revision:1,recipe:canonBenchmark()}];
  if(path.endsWith('/rpc/monitor_session_claim'))return {accepted:true,checkId:id};
  if(path.endsWith('/rpc/monitor_public_snapshot'))return null;
  if(path.endsWith('/rpc/monitor_connection_key'))return key;
  if(path.endsWith('/rpc/monitor_public_begin')){assert.equal(body.p_user,user);assert.equal(body.p_manual,true);return {accepted:true,attempt:id,generation:id};}
  if(path==='/')return new Response('',{headers:{'content-type':'text/html','set-cookie':'access_token_web=synthetic-public-session; Domain=.vinted.co.uk; Path=/; Secure'}});
  if(path.endsWith('/rpc/monitor_connection_finish')){assert(!JSON.stringify(body).includes('synthetic-public-session'));return completed;}
  if(path.startsWith('/svc-catalogue/')){
   assert(completed,'uncommitted session cannot be used');assert(path.includes('per_page=50'));
   return rejected?new Response('private error',{status:403}):{items:[{id:123,title:'Canon 600D',price:{amount:'80',currency_code:'GBP'},item_box:{item_id:123,second_line:'Very good'}}]};
  }
  if(path.endsWith('/rpc/monitor_public_session_save'))return true;
  if(path.endsWith('/rpc/monitor_saved_session_finish')){
   assert.equal(body.p_user,user);assert.equal(body.p_generation,id);healthy=body.p_status==='sample_received';
   if(healthy){assert.equal(body.p_items[0].listing.condition,'very_good');assert.equal(body.p_items[0].listing.captureMode,'session_check');}
   else assert.deepEqual(body.p_items,[]);
   return {saved:body.p_items.length};
  }
  if(path.endsWith('/rpc/monitor_session_finish')){assert.equal(body.p_status,'unavailable');return {saved:0};}
  if(path.endsWith('/rpc/monitor_public_failure')){assert.equal(body.p_http,403);assert.equal(body.p_stop,true);return null;}
  if(path.endsWith('/rpc/monitor_connection_status'))return {state:completed?'verified':'unavailable',stored:completed,canStart:completed&&healthy};
 });
 let r=await post({op:'catalogueSample',id,searchText:'Canon',user_id:'forged'});let result=await r.json();
 assert.equal(r.status,200);assert.equal(result.saved,1);assert.equal(result.connection.canStart,true);
 assert.equal(r.headers.get('cache-control'),'no-store');assert(!JSON.stringify(result).includes('synthetic-public-session'));
 rejected=true;result=await (await post({op:'catalogueSample',id,searchText:'Canon'})).json();assert.equal(result.status,'blocked');assert.equal(result.connection.canStart,false);
 assert.equal(calls.filter(c=>c.path.startsWith('/svc-catalogue/')).length,2,'No automatic replay after refusal');
 completed=false;result=await (await post({op:'catalogueTest',id})).json();assert.equal(result.status,'unavailable');
 assert.equal(calls.filter(c=>c.path.startsWith('/svc-catalogue/')).length,2,'Lost persistence fences catalogue use');
 assert(!calls.some(c=>c.path.includes('oauth')||c.path.includes('outbox')));
});

test('status is read-only and retains server ownership scope', async () => {
  const calls = transport(path => {
    if (path === '/auth/v1/user') return { id: user };
    if (path.endsWith('/rpc/monitor_config')) return config;
    if (path.endsWith('/rpc/monitor_connection_status')) return {state:'disconnected',stored:false};
    if (path.endsWith('/rpc/monitor_push_status')) return [];
    if (path.startsWith('/rest/v1/monitor_recipes?') || path.startsWith('/rest/v1/monitor_push_subscriptions?')) {
      assert(path.includes('user_id=eq.' + user)); return [];
    }
  });
  const response = await post({ op: 'status' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).source.status, 'blocked');
  assert(!calls.some(c => c.path.includes('monitor_save')));
});
test('feed checks ownership then uses exact-identity snapshot, not a display-only comparison', async () => {
  transport(path => {
    if (path === '/auth/v1/user') return { id: user };
    if (path.startsWith('/rest/v1/monitor_recipes?')) return [{ id, revision: 3 }];
    if (path.endsWith('/rpc/monitor_feed_snapshot')) return { matches: [], discord: [], comparisonMatches: [], baselineAt: null };
  });
  const response = await post({ op: 'feed', id });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).baselineReady, false);
});
test('no connected accounts tick drains recovery only and releases both lease layers', async () => {
  const calls = transport(path => {
    if (path.endsWith('/rpc/monitor_config')) return config;
    if (path.endsWith('/rpc/monitor_tick_lease')) return true;
    if (path.endsWith('/rpc/monitor_auto_claim')) return [];
    if (path.endsWith('/rpc/monitor_push_claim')) return [];
    if (path.endsWith('/rpc/monitor_release_claims') || path.endsWith('/rpc/monitor_tick_release')) return null;
  });
  assert.equal((await post({ op: 'tick' }, false, { 'x-monitor-token': config.token })).status, 200);
  assert.deepEqual(calls.slice(-2).map(c => c.path), ['/rest/v1/rpc/monitor_release_claims','/rest/v1/rpc/monitor_tick_release']);
  assert(!calls.some(c => c.path.includes('monitor_claim?') || c.path.includes('/catalog/')));
});
test('anonymous staging users cannot subscribe or send pushes', async () => {
  transport(path => path === '/auth/v1/user' ? { id: user, is_anonymous: true } : undefined);
  assert.equal((await post({ op: 'subscribe', subscription: {} })).status, 403);
  assert.equal((await post({ op: 'testPush' })).status, 403);
});

test('history/state/device operations use verified owner and reject malformed requests', async () => {
  const calls=transport((path,body)=>{
    if(path==='/auth/v1/user')return {id:user};
    if(path.startsWith('/rest/v1/monitor_recipes?'))return [{id,revision:3}];
    if(path.endsWith('/rpc/monitor_history')){assert.equal(body.p_user,user);return {rows:[],nextCursor:null};}
    if(path.endsWith('/rpc/monitor_set_item_state')){assert.equal(body.p_user,user);return null;}
    if(path.startsWith('/rest/v1/monitor_push_subscriptions?')){assert(path.includes('user_id=eq.'+user));assert(path.includes('select=id'));return [{id:'device'}];}
  });
  assert.equal((await post({op:'history',id,filter:'all',query:'',user_id:'foreign'})).status,200);
  assert.equal((await post({op:'history',id,filter:'all',query:'',cursor:{at:'bad',id:'1'}})).status,400);
  assert.equal((await post({op:'itemState',id,listingId:'1',saved:'true'})).status,400);
  assert.equal((await post({op:'itemState',id,listingId:'1',saved:true})).status,200);
  assert.deepEqual(await (await post({op:'device',endpoint:'https://push.example/fixture'})).json(),{registered:true});
  assert.equal(calls.filter(c=>c.path.endsWith('/rpc/monitor_set_item_state')).length,1);
});

test('request-heavy recipes cannot starve never-scanned monitors in an unordered claim batch', async () => {
  const key=Buffer.alloc(32,42).toString('base64');
  const ciphertext=await seal(publicSession(),key,user);
  const waiting = '33333333-3333-4333-8333-333333333333';
  const calls = transport(path => {
    if (path.endsWith('/rpc/monitor_config')) return {...config,source_status:'ready'};
    if (path.endsWith('/rpc/monitor_tick_lease')) return true;
    if (path.endsWith('/rpc/monitor_auto_claim')) return [
      {id,user_id:user,revision:1,recipe:{...canonBenchmark(),searchTerms:['camera']},last_success_at:'2026-09-28T10:00:00Z'},
      {id:waiting,user_id:user,revision:1,recipe:canonBenchmark(),last_success_at:null},
    ];
    if (path.endsWith('/rpc/monitor_connection_key')) return key;
    if (path.endsWith('/rpc/monitor_connection_worker')) return {mode:'public',state:'verified',ciphertext,generation:id,expiresAt:new Date(Date.now()+3600000).toISOString()};
    if (path.startsWith('/rest/v1/monitor_matches?')) return [];
    if (path.startsWith('/svc-catalogue/items?')) return {items:Array.from({length:50},(_,i)=>({id:i+1,title:'Canon 600D',price:{amount:'80',currency_code:'GBP'}}))};
    if (path.endsWith('/rpc/monitor_catalog_commit')||path.endsWith('/rpc/monitor_public_session_save')) return true;
    if (path.endsWith('/rpc/monitor_source_state')) return null;
    if (path.endsWith('/rpc/monitor_push_claim')) return [];
    if (path.endsWith('/rpc/monitor_release_claims') || path.endsWith('/rpc/monitor_tick_release')) return null;
  });
  assert.equal((await post({op:'tick'},false,{'x-monitor-token':config.token})).status,200);
  assert.deepEqual(calls.filter(c=>c.path.endsWith('/rpc/monitor_catalog_commit')).map(c=>c.body.p_id),[waiting]);
  assert.equal(calls.filter(c=>c.path.startsWith('/svc-catalogue/items?')).length,6);
});

test('persistent connection rejects anonymous users and never accepts a supplied owner', async()=>{
 let anonymous=true;
 const calls=transport((path,body)=>{
  if(path==='/auth/v1/user')return {id:user,is_anonymous:anonymous};
  if(path.endsWith('/rpc/monitor_connection_disconnect')) {assert.equal(body.p_user,user);return null;}
  if(path.endsWith('/rpc/monitor_connection_status'))return {state:'disconnected',stored:false};
 });
 assert.equal((await post({op:'catalogueTest',id})).status,403);
 assert.equal((await post({op:'catalogueSample',id})).status,403);
 assert.equal((await post({op:'connectionDisconnect'})).status,403);
 anonymous=false;
 assert.equal((await post({op:'connectionDisconnect',user_id:'foreign'})).status,200);
 assert(!calls.some(c=>c.path.includes('oauth')));
});
test('trial start is registered-owner scoped and pausing does not start another window',async()=>{
 let anonymous=true;
 const calls=transport((path,body)=>{
  if(path==='/auth/v1/user')return {id:user,is_anonymous:anonymous};
  if(path.endsWith('/rpc/monitor_trial_start')){assert.equal(body.p_user,user);return {};}
  if(path.endsWith('/rpc/monitor_connection_automatic')){assert.equal(body.p_user,user);assert.equal(body.p_enabled,false);return null;}
  if(path.endsWith('/rpc/monitor_connection_status'))return {state:'verified',automatic:true};
 });
 assert.equal((await post({op:'connectionAutomatic',enabled:true})).status,403);
 anonymous=false;
 assert.equal((await post({op:'connectionAutomatic',enabled:true,user_id:'foreign'})).status,200);
 assert.equal((await post({op:'connectionAutomatic',enabled:false})).status,200);
 assert.equal(calls.filter(c=>c.path.endsWith('/monitor_trial_start')).length,1);
 assert(!calls.some(c=>c.path.includes('oauth')));
});
