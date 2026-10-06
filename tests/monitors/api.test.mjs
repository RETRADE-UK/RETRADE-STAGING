import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
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

test('session checks require registered ownership and a durable cooldown before provider traffic', async () => {
  let mode='anonymous';
  const calls=transport(path=>{
    if(path==='/auth/v1/user')return {id:user,is_anonymous:mode==='anonymous'};
    if(path.startsWith('/rest/v1/monitor_recipes?'))return mode==='foreign'?[]:[{id,revision:1,recipe:canonBenchmark()}];
    if(path.endsWith('/rpc/monitor_session_claim'))return {accepted:false,retryAt:'2026-10-06T10:00:00Z'};
  });
  const body={op:'sessionCheck',id,searchText:'Canon',accessToken:'synthetic-private-session-value'};
  assert.equal((await post(body,false)).status,401);
  assert.equal((await post(body)).status,403);
  mode='foreign'; assert.equal((await post(body)).status,400);
  mode='registered'; assert.equal((await post({...body,accessToken:'cookie=bad'})).status,400);
  assert.equal((await post(body)).status,429);
  assert(!calls.some(c=>c.path.startsWith('/web/')));
});

test('session sample reaches owner history without storing credentials or opening the global gate', async () => {
  const accessToken='synthetic-private-session-value';
  const calls=transport((path,body)=>{
    if(path==='/auth/v1/user')return {id:user};
    if(path.startsWith('/rest/v1/monitor_recipes?'))return [{id,revision:1,recipe:canonBenchmark()}];
    if(path.endsWith('/rpc/monitor_session_claim')) {assert.equal(body.p_user,user);return {accepted:true,checkId:id};}
    if(path.startsWith('/web/gateway/svc-catalogue/items?'))return {items:[{id:123,title:'Canon 600D',price:{amount:'80',currency_code:'GBP'}}]};
    if(path.endsWith('/rpc/monitor_session_finish')) {
      assert.equal(body.p_user,user);assert.equal(body.p_monitor,id);assert.equal(body.p_items[0].listing.captureMode,'session_check');
      assert(!JSON.stringify(body).includes(accessToken));return {saved:1,checkedAt:'2026-10-06T10:00:00Z',retryAt:'2026-10-06T10:05:00Z'};
    }
  });
  const response=await post({op:'sessionCheck',id,user_id:'forged',searchText:'Canon',accessToken});
  const result=await response.json();
  assert.equal(response.status,200);assert.equal(result.saved,1);assert.equal(result.status,'sample_received');
  assert.equal(response.headers.get('cache-control'),'no-store');assert(!JSON.stringify(result).includes(accessToken));
  assert(!calls.some(c=>/source_state|monitor_claim$|monitor_commit|outbox/.test(c.path)));
});

test('a refused session stores only diagnostic status and cannot mark the source ready', async () => {
  const calls=transport((path,body)=>{
    if(path==='/auth/v1/user')return {id:user};
    if(path.startsWith('/rest/v1/monitor_recipes?'))return [{id,revision:1,recipe:canonBenchmark()}];
    if(path.endsWith('/rpc/monitor_session_claim'))return {accepted:true,checkId:id};
    if(path.startsWith('/web/gateway/svc-catalogue/items?'))return new Response('private upstream detail',{status:403});
    if(path.endsWith('/rpc/monitor_session_finish')) {
      assert.equal(body.p_status,'blocked');assert.deepEqual(body.p_items,[]);return {saved:0};
    }
  });
  const response=await post({op:'sessionCheck',id,searchText:'Canon',accessToken:'synthetic-private-session-value'});
  assert.equal((await response.json()).status,'blocked');
  assert.equal(calls.filter(c=>c.path.startsWith('/web/')).length,1);
  assert(!calls.some(c=>c.path.endsWith('/rpc/monitor_source_state')));
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
  const ciphertext=await seal({refreshToken:'synthetic-refresh-token-value',accessToken:'synthetic-access-token-value',userAgent:'Synthetic Browser 1.0',country:'GB'},key,user);
  const waiting = '33333333-3333-4333-8333-333333333333';
  const calls = transport(path => {
    if (path.endsWith('/rpc/monitor_config')) return {...config,source_status:'ready'};
    if (path.endsWith('/rpc/monitor_tick_lease')) return true;
    if (path.endsWith('/rpc/monitor_auto_claim')) return [
      {id,user_id:user,revision:1,recipe:{...canonBenchmark(),searchTerms:['camera']},last_success_at:'2026-09-28T10:00:00Z'},
      {id:waiting,user_id:user,revision:1,recipe:canonBenchmark(),last_success_at:null},
    ];
    if (path.endsWith('/rpc/monitor_connection_key')) return key;
    if (path.endsWith('/rpc/monitor_connection_worker')) return {state:'verified',ciphertext,generation:id,expiresAt:new Date(Date.now()+3600000).toISOString()};
    if (path.startsWith('/rest/v1/monitor_matches?')) return [];
    if (path.startsWith('/web/gateway/svc-catalogue/items?')) return {items:Array.from({length:50},(_,i)=>({id:i+1,title:'Canon 600D',price:{amount:'80',currency_code:'GBP'}}))};
    if (path.endsWith('/rpc/monitor_auto_commit')) return true;
    if (path.endsWith('/rpc/monitor_source_state')) return null;
    if (path.endsWith('/rpc/monitor_push_claim')) return [];
    if (path.endsWith('/rpc/monitor_release_claims') || path.endsWith('/rpc/monitor_tick_release')) return null;
  });
  assert.equal((await post({op:'tick'},false,{'x-monitor-token':config.token})).status,200);
  assert.deepEqual(calls.filter(c=>c.path.endsWith('/rpc/monitor_auto_commit')).map(c=>c.body.p_id),[waiting]);
  assert.equal(calls.filter(c=>c.path.startsWith('/web/gateway/svc-catalogue/items?')).length,6);
});

test('persistent connection rejects anonymous users and never accepts a supplied owner', async()=>{
 let anonymous=true;
 const calls=transport((path,body)=>{
  if(path==='/auth/v1/user')return {id:user,is_anonymous:anonymous};
  if(path.endsWith('/rpc/monitor_connection_disconnect')) {assert.equal(body.p_user,user);return null;}
  if(path.endsWith('/rpc/monitor_connection_status'))return {state:'disconnected',stored:false};
 });
 assert.equal((await post({op:'connectionTest',credentials:{}})).status,403);
 assert.equal((await post({op:'savedSessionCheck',id})).status,403);
 assert.equal((await post({op:'connectionDisconnect'})).status,403);
 anonymous=false;
 assert.equal((await post({op:'connectionDisconnect',user_id:'foreign'})).status,200);
 assert(!calls.some(c=>c.path.includes('oauth')));
});
test('actual handler encrypts rotation before returning status and fences disconnect',async()=>{
 const credentials={refreshToken:'synthetic-original-refresh',userAgent:'Synthetic Browser 1.0',country:'GB'};
 const key=Buffer.alloc(32,42).toString('base64');
 let completed=true;
 const calls=transport((path,body)=>{
  if(path==='/auth/v1/user')return {id:user};
  if(path.endsWith('/rpc/monitor_connection_key'))return key;
  if(path.endsWith('/rpc/monitor_connection_begin')){
   assert.equal(body.p_user,user);assert(!JSON.stringify(body).includes(credentials.refreshToken));
   return {accepted:true,attempt:id,generation:id,ciphertext:body.p_ciphertext};
  }
  if(path==='/oauth/token')return {access_token:'synthetic-new-access-token',refresh_token:'synthetic-new-refresh-token',expires_in:3600};
  if(path.endsWith('/rpc/monitor_connection_finish')){
   assert.equal(body.p_user,user);assert.equal(body.p_state,'verified');
   assert(!JSON.stringify(body).includes('synthetic-new'));return completed;
  }
  if(path.endsWith('/rpc/monitor_connection_status'))return {state:'verified',stored:true};
 });
 const r=await post({op:'connectionTest',credentials,user_id:'foreign'});assert.equal(r.status,200);
 const output=await r.text();assert(!output.includes(key));assert(!output.includes('synthetic-'));assert(!output.includes('ciphertext'));
 completed=false;assert.equal((await post({op:'connectionTest',credentials})).status,409);
 assert(!calls.some(c=>/monitor_source_state|monitor_claim$|monitor_commit|outbox/.test(c.path)));
});
