import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSession } from '../../worker/monitors/src/session-check.mjs';
import { canonBenchmark } from '../../worker/monitors/src/contracts.mjs';
import { createVintedSource, VINTED_CATALOG_PATH } from '../../worker/monitors/src/adapters/vinted-source.mjs';
const accessToken = 'synthetic-secret-value-never-live';
const recipe = canonBenchmark();
const input = { accessToken, recipe, searchText: 'Canon' };
const item = (id, title = 'Canon 600D', price = '80') => ({ id, title, price: { amount: price, currency_code: 'GBP' } });

test('session check sends one token to the fixed current endpoint, filters and labels real-shaped results', async () => {
  let calls = 0;
  const result = await checkSession({ ...input, request: async (url, options) => {
    calls++;
    assert.equal(url.origin,'https://www.vinted.co.uk'); assert.equal(url.pathname,VINTED_CATALOG_PATH);
    assert.equal(url.searchParams.get('price_from'),'51.00'); assert.equal(url.searchParams.get('price_to'),'100.00');
    assert.equal(url.searchParams.get('search_text'),'Canon'); assert.equal(url.searchParams.get('per_page'),'20');
    assert.equal(options.headers.cookie,'access_token_web='+accessToken);
    assert.equal(options.redirect,'error'); assert.equal(options.method,'GET'); assert(!url.href.includes(accessToken));
    return Response.json({items:[item(101),item(102,'Canon 600D','150'),item(103,'Canon camera')]});
  }});
  assert.equal(calls,1); assert.equal(result.status,'sample_received'); assert.equal(result.received,3);
  assert.deepEqual(result.items.map(x=>[x.listing.id,x.result.status]),[['101','match']]);
  assert(result.items.every(x=>x.listing.captureMode==='session_check'));
  assert.equal(result.items[0].listing.url,'https://www.vinted.co.uk/items/101');
  assert(!JSON.stringify(result).includes(accessToken));
});
test('empty and unfamiliar payloads never become a verified listing source', async () => {
  for(const [payload,status] of [[{items:[]},'empty'],[{items:[{id:1}]},'schema_changed'],[{data:{items:[item(1)]}},'schema_changed']]) {
    const r=await checkSession({...input,request:async()=>Response.json(payload)});
    assert.equal(r.status,status);assert.equal(r.items.length,0);
  }
});
test('refusal, expiry and rate limit stop after one request and never echo provider bodies', async () => {
  for(const [http,status] of [[401,'access_rejected'],[403,'blocked'],[429,'rate_limited'],[404,'endpoint_unavailable'],[500,'unavailable']]) {
    let calls=0;
    const r=await checkSession({...input,request:async()=>{calls++;return new Response(accessToken,{status:http,headers:{'Retry-After':'600'}});}});
    assert.equal(r.status,status);assert.equal(calls,1);assert(!JSON.stringify(r).includes(accessToken));assert.equal(r.items.length,0);
    assert(r.retryAt>Date.now()+590000);
  }
  const r=await checkSession({...input,request:async()=>{throw new Error(accessToken);}});
  assert.equal(r.status,'unavailable');assert(!JSON.stringify(r).includes(accessToken));
});
test('invalid cookie/header bundles or unsaved queries never make a network request', async () => {
  let calls=0;const request=async()=>{calls++;throw new Error('Unexpected request');};
  for(const bad of ['',null,'Cookie: '+accessToken,'access_token_web='+accessToken,accessToken+'; x=1',accessToken+'\r\nx-secret: x','x'.repeat(8193)]) {
    await assert.rejects(checkSession({...input,request,accessToken:bad}),TypeError);
  }
  await assert.rejects(checkSession({...input,request,searchText:'Unowned search'}),TypeError);
  assert.equal(calls,0);
});
test('anonymous transport never inherits another source instance’s credential', async () => {
  const seen=[];const request=async(_,options)=>{seen.push(options.headers.cookie);return Response.json({items:[]});};
  await createVintedSource({request,accessToken}).searchPage({searchText:'Canon'});
  await createVintedSource({request}).searchPage({searchText:'Canon'});
  assert.deepEqual(seen,['access_token_web='+accessToken,undefined]);
});
