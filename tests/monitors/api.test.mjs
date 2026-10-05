import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
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
    return Response.json(result);
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
test('status is read-only and retains server ownership scope', async () => {
  const calls = transport(path => {
    if (path === '/auth/v1/user') return { id: user };
    if (path.endsWith('/rpc/monitor_config')) return config;
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
test('blocked source tick drains recovery only and releases both lease layers', async () => {
  const calls = transport(path => {
    if (path.endsWith('/rpc/monitor_config')) return config;
    if (path.endsWith('/rpc/monitor_tick_lease')) return true;
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
  const waiting = '33333333-3333-4333-8333-333333333333';
  const calls = transport(path => {
    if (path.endsWith('/rpc/monitor_config')) return {...config,source_status:'ready'};
    if (path.endsWith('/rpc/monitor_tick_lease')) return true;
    if (path.endsWith('/rpc/monitor_claim')) return [
      {id,revision:1,recipe:{...canonBenchmark(),searchTerms:['camera']},last_success_at:'2026-09-28T10:00:00Z'},
      {id:waiting,revision:1,recipe:canonBenchmark(),last_success_at:null},
    ];
    if (path.startsWith('/rest/v1/monitor_matches?')) return [];
    if (path.startsWith('/api/v2/catalog/items?')) return {items:Array.from({length:50},(_,i)=>({id:i+1,title:'Canon 600D',price:{amount:'80',currency_code:'GBP'}}))};
    if (path.endsWith('/rpc/monitor_commit')) return true;
    if (path.endsWith('/rpc/monitor_source_state')) return null;
    if (path.endsWith('/rpc/monitor_push_claim')) return [];
    if (path.endsWith('/rpc/monitor_release_claims') || path.endsWith('/rpc/monitor_tick_release')) return null;
  });
  assert.equal((await post({op:'tick'},false,{'x-monitor-token':config.token})).status,200);
  assert.deepEqual(calls.filter(c=>c.path.endsWith('/rpc/monitor_commit')).map(c=>c.body.p_id),[waiting]);
  assert.equal(calls.filter(c=>c.path.startsWith('/api/v2/catalog/items?')).length,6);
});
