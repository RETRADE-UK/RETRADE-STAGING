import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipe } from '../../worker/monitors/src/contracts.mjs';
import { monitorInput } from '../../worker/monitors/src/service-validation.mjs';
import { createVintedSource, scanCatalog } from '../../worker/monitors/src/adapters/vinted-source.mjs';
import { recipeSourceQueries, recipeSourceKey, groupSourcePriceScope } from '../../worker/monitors/src/recipe-source.mjs';
import { checkSession } from '../../worker/monitors/src/session-check.mjs';
import { automaticScan } from '../../worker/monitors/src/automatic.mjs';
import { matchListing } from '../../worker/monitors/src/engine/match.mjs';
import { publicSession } from './public-fixtures.mjs';
import { seal } from '../../worker/monitors/src/connection.mjs';

// Candidate request fields are checked against fixtures only. Never a live probe.
globalThis.fetch = () => { throw new Error('Real network forbidden in link tests'); };
const url = (min, max, brand = 217414, time = 1785357197) =>
  `https://www.vinted.co.uk/catalog?search_id=1483763887&order=newest_first&catalog[]=3075&page=1&time=${time}&status_ids[]=2&status_ids[]=3&status_ids[]=4&status_ids[]=1&status_ids[]=6&currency=GBP&search_by_image_uuid=&search_by_image_id=&brand_ids[]=${brand}&price_to=${max}${min ? '&price_from=' + min : ''}`;
const bands = [[0,50],[51,100],[101,200],[201,300]].map(([min,max], index) =>
  createRecipe({ searchUrl: url(min,max,217414,1785357197 + index), customModels: ['600D'] }));
const item = (id, title = 'Canon 600D', price = '80') => ({ id, title, price: { amount: price, currency_code: 'GBP' } });
const monitor = (recipe, id = 'a', user_id = 'owner-a') => ({ recipe, id, user_id, revision: 1 });

test('URL recipes derive exact prices without invented keywords or silent conflicts', () => {
  assert.deepEqual(bands.map(r => [r.minPricePence,r.maxPricePence]), [[0,5000],[5100,10000],[10100,20000],[20100,30000]]);
  assert(bands.every(r => r.searchTerms.length === 0 && r.searchUrl));
  assert.equal(createRecipe(bands[1]).searchUrl, bands[1].searchUrl);
  assert.throws(() => createRecipe({ ...bands[1], minPricePence: 5001 }), /prices must match/);
  assert.throws(() => createRecipe({ ...bands[1], searchTerms: ['Canon'] }), /not both/);
  assert.throws(() => createRecipe({ searchUrl: 'https://other.test/catalog' }));
  assert.throws(() => createRecipe({ searchUrl: '' }));
  assert.throws(() => createRecipe({ searchTerms: [] }), /model/);
});

test('body-supplied opt-in cannot enable URL recipes and detail-dependent rules remain unavailable', () => {
  const body = { name:'Camera link', recipe:bands[1], enabled:true, notifications:false, archived:false, candidateLinkSearch:true };
  assert.throws(() => monitorInput(body), /not verified/);
  assert.equal(monitorInput(body, {candidateLinkSearch:true}).recipe.searchUrl, bands[1].searchUrl);
  assert.throws(() => monitorInput({...body,recipe:{...bands[1],rejectTerms:['faulty']}}, {candidateLinkSearch:true}), /not available/);
});

test('default adapter, diagnostic and bounded scanner make zero requests for unverified URL mode', async () => {
  let calls=0; const request=async()=>{calls++;throw new Error('Unexpected source request');};
  const source=createVintedSource({request});
  await assert.rejects(source.searchPage(recipeSourceQueries(bands[1])[0]), e=>e.code==='link_search_unverified');
  await assert.rejects(scanCatalog({source,recipe:bands[1]}), e=>e.code==='link_search_unverified');
  assert.equal((await checkSession({request,recipe:bands[1]})).status, 'source_unverified');
  assert.equal(calls,0);
});

test('candidate URL adapter sends all source filters once without an account token', async () => {
  let calls=0;
  const source=createVintedSource({candidateLinkSearch:true, request:async (u,options)=>{
    calls++;
    assert.equal(u.origin,'https://www.vinted.co.uk');
    assert.equal(u.searchParams.has('search_text'),false);
    assert.equal(u.searchParams.get('attribute_ids[catalog]'),'3075');
    assert.equal(u.searchParams.get('attribute_ids[brand]'),'217414');
    assert.equal(u.searchParams.get('attribute_ids[status]'),'1,2,3,4,6');
    assert.equal(u.searchParams.get('price_from'),'51.00');
    assert.equal(u.searchParams.get('price_to'),'100.00');
    assert.equal(u.searchParams.get('order'),'newest_first');
    assert.equal(u.searchParams.has('time'),false);
    assert.equal(options.headers.cookie,undefined);
    assert.equal(options.redirect,'error');
    return Response.json({items:[item(1)]});
  }});
  const result=await scanCatalog({source,recipe:bands[1],candidateLinkSearch:true});
  assert.equal(calls,1);assert.equal(result.coverageComplete,true);
  assert.equal(matchListing(result.listings[0],bands[1]).status,'match');
  await assert.rejects(source.searchPage({...recipeSourceQueries(bands[1])[0],searchText:'Canon'}), /legacy fields/);
  assert.equal(calls,1);
});

test('all non-price filters and owner identity fence grouping while exact price bands still apply locally', () => {
  const rows=bands.map((r,i)=>monitor(r,String(i)));
  rows.push(monitor(createRecipe({searchUrl:url(0,900,99)}),'different-brand'));
  rows.push(monitor(createRecipe({searchUrl:url(0,800)}),'different-owner','owner-b'));
  assert.deepEqual(groupSourcePriceScope(rows,rows[0]),{minPricePence:0,maxPricePence:30000});
  assert.equal(recipeSourceKey(bands[0]),recipeSourceKey(bands[3]));
  assert.notEqual(recipeSourceKey(rows[0].recipe),recipeSourceKey(rows[4].recipe));
  const queries=bands.map(r=>recipeSourceQueries(r,{priceScope:groupSourcePriceScope(rows,rows[0])})[0]);
  assert(queries.every(q=>JSON.stringify(q)===JSON.stringify(queries[0])),'Provenance cannot fragment the page cache');
  for(const changed of ['status_ids[]=9','catalog[]=5','size_ids[]=3','color_ids[]=7','material_ids[]=8','video_game_platform_ids[]=2','search_text=EOS']) {
    const altered=createRecipe({searchUrl:url(0,50)+'&'+changed});
    assert.notEqual(recipeSourceKey(bands[0]),recipeSourceKey(altered));
  }
});

test('public-session candidate uses anonymous session cookies and current filters without personal refresh or bearer credentials', async () => {
  let calls=0;
  const source=createVintedSource({publicSession:publicSession(),candidateLinkSearch:true,request:async (u,options)=>{
    calls++;
    assert.equal(u.origin,'https://api.vinted.co.uk');assert.equal(u.pathname,'/svc-catalogue/items');
    assert.equal(u.searchParams.get('attribute_ids[catalog]'),'3075');
    assert.equal(u.searchParams.get('attribute_ids[brand]'),'217414');
    assert.equal(u.searchParams.get('attribute_ids[status]'),'1,2,3,4,6');
    assert.equal(u.searchParams.has('catalog_ids'),false);
    assert.equal(options.headers.cookie,'access_token_web=synthetic-public-token');
    assert.equal(options.headers.authorization,undefined);
    assert(!JSON.stringify(options.headers).includes('refresh_token'));
    assert(!u.href.includes('token'));assert.equal(options.redirect,'error');
    return Response.json({items:[item(1)]});
  }});
  const result=await scanCatalog({source,recipe:bands[1],candidateLinkSearch:true});
  assert.equal(calls,1);assert.equal(result.listings.length,1);
});

test('unmapped catalogue facets fail before transport without falling back to the legacy schema', async () => {
  let calls=0;
  const source=createVintedSource({candidateLinkSearch:true,publicSession:publicSession(),request:async()=>{
    calls++;throw new Error('Unmapped facet must never reach transport');
  }});
  const recipe=createRecipe({searchUrl:url(0,50)+'&video_game_platform_ids[]=8'});
  await assert.rejects(scanCatalog({source,recipe,candidateLinkSearch:true}), /Unsupported catalogue facet/);
  const query=recipeSourceQueries(bands[1])[0];
  await assert.rejects(source.searchPage({...query,linkSearch:{...query.linkSearch,unknownFacet:[1]}}), /Unsupported search configuration/);
  assert.equal(calls,0);
});

test('model whitelist and title blacklist remain a separate layer; source-only recipes can match their results', async () => {
  const source=createVintedSource({candidateLinkSearch:true,request:async()=>Response.json({items:[item(1),item(2,'Other camera'),item(3,'Canon 600D broken'),item(4,'Canon 600D','50.50')]})});
  const scan=await scanCatalog({source,recipe:bands[1],candidateLinkSearch:true});
  const recipe=createRecipe({...bands[1],titleRejectTerms:['broken']});
  assert.deepEqual(scan.listings.map(l=>matchListing(l,recipe).status),['match','pending','reject','reject']);
  const all=createRecipe({searchUrl:url(51,100)});
  assert.equal(matchListing(scan.listings[1],all).reason,'source_filters');
  assert.equal(matchListing(scan.listings[3],all).reason,'price');
});

test('candidate diagnostic preserves fixed saved scope and 403 remains a single hard refusal', async () => {
  let calls=0;
  const input={recipe:bands[1],publicSession:publicSession(),candidateLinkSearch:true,request:async()=>{calls++;return new Response('captcha',{status:403});}};
  const result=await checkSession(input);
  assert.equal(result.status,'blocked');assert.equal(result.httpStatus,403);assert.equal(calls,1);
  await assert.rejects(checkSession({...input,searchText:'Canon'}), /saved search/);
  await assert.rejects(checkSession({...input,sourceRecipe:createRecipe({searchUrl:url(51,100,99)})}), /saved URL filters/);
  assert.equal(calls,1);
});

async function automaticFixture({capability=false, status=200, selectedMonitors=null}={}) {
  const monitors=selectedMonitors || [
    ...bands.map((r,i)=>monitor(r,String(i))),
    monitor(createRecipe({searchUrl:url(51,100,99)}),'other-brand'),
    monitor(bands[1],'other-owner','owner-b'),
  ];
  const key=Buffer.alloc(32,42).toString('base64');
  const calls=[],requests=[],commits=[],failures=[];
  const rpc=async(name,args)=>{
    calls.push(name);
    if(name==='monitor_auto_claim')return monitors;
    if(name==='monitor_connection_worker')return {mode:'public',state:'verified',generation:'generation',ciphertext:await seal(publicSession(),key,args.p_user),expiresAt:new Date(Date.now()+3600000).toISOString()};
    if(name==='monitor_connection_key')return key;
    if(name==='monitor_public_session_save')return true;
    if(name==='monitor_catalog_commit'){commits.push(args);return true;}
    if(name==='monitor_public_failure'){failures.push(args);return null;}
    throw new Error(name);
  };
  const result=await automaticScan({rpc,request:async u=>{
    requests.push(u);return status===200?Response.json({items:[item(1)]}):new Response('captcha',{status});
  },token:'synthetic-lease',candidateLinkSearch:capability});
  return {result,calls,requests,commits,failures};
}

test('default automatic scan skips unverified URL recipes before session access or network', async () => {
  const f=await automaticFixture();
  assert.deepEqual(f.calls,['monitor_auto_claim']);assert.equal(f.requests.length,0);assert.equal(f.commits.length,0);
  assert(f.result.diagnostics.every(x=>x.status==='source_unverified'));
});

test('candidate automatic grouping shares one widened query per owner/scope and preserves local bands', async () => {
  const f=await automaticFixture({capability:true});
  assert.equal(f.requests.length,3,'four price bands share once, different brand and owner each need their own page');
  assert.equal(f.commits.length,6);
  assert.deepEqual(f.commits.slice(0,4).map(c=>c.p_items.length),[0,1,0,0]);
  assert.equal(f.requests[0].searchParams.get('price_to'),'300.00');
  assert.equal(f.requests[0].searchParams.has('search_text'),false);
});

test('candidate automatic refusals stop that owner without retrying other price bands', async () => {
  const f=await automaticFixture({capability:true,status:403});
  assert.equal(f.requests.length,2,'one refusal per independent owner, no retries for peers');
  assert.equal(f.commits.length,0);assert(f.failures.every(x=>x.p_stop===true));
});

test('cached pages still enforce each monitor condition evidence and cannot establish a false baseline', async () => {
  for(const recipe of [bands[1],createRecipe({kind:'canon',models:['600D'],searchTerms:['Canon'],minPricePence:5100,maxPricePence:10000})]) {
    const first=monitor(recipe,'a');
    const strict=monitor(createRecipe({...recipe,conditions:['very_good']}),'b');
    const later=monitor(recipe,'c');
    const f=await automaticFixture({capability:true,selectedMonitors:[first,strict,later]});
    assert.equal(f.requests.length,1,'Missing cached condition data must not trigger another source request');
    assert.equal(f.result.requests,1);assert.equal(f.result.committed,1);
    assert.deepEqual(f.commits.map(c=>c.p_id),['a'],'Strict monitor must not commit items, seen IDs or a baseline');
    assert.equal(f.commits[0].p_complete,true);assert.equal(f.commits[0].p_items.length,1);
    assert.equal(f.failures.length,1);assert.equal(f.failures[0].p_status,'blocked');
    assert.equal(f.failures[0].p_stop,true);assert.equal(f.failures[0].p_http,null);
    assert.equal(f.failures[0].p_requests,1);assert.equal(f.failures[0].p_retry,null);
    assert.match(f.failures[0].p_message,/Catalogue data or session changed/);
    assert.equal(f.calls.filter(name=>name==='monitor_public_session_save').length,1,'Cache checks do not renew or persist again');
  }
});
