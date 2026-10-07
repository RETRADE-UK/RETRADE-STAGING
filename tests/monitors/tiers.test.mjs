import test from 'node:test';
import assert from 'node:assert/strict';
import {canonTierPresets} from '../../worker/monitors/src/presets.mjs';
import {matchListing} from '../../worker/monitors/src/engine/match.mjs';
import {normalizeListing} from '../../worker/monitors/src/adapters/vinted-normalize.mjs';
import {monitorInput} from '../../worker/monitors/src/service-validation.mjs';
import {automaticScan} from '../../worker/monitors/src/automatic.mjs';
import {seal} from '../../worker/monitors/src/connection.mjs';
const tiers=canonTierPresets();
const raw=(id,title,price,status='Very good')=>({id,title,price:{amount:String(price),currency_code:'GBP'},status});
const listing=(title,price,status)=>normalizeListing(raw(123,title,price,status),{observedAt:'2026-10-07T00:00:00Z'});
test('restored bands have exact boundaries, alias caps, reported-condition and title filters',()=>{
 const low=tiers[0].data.recipe,mid=tiers[1].data.recipe;
 for(const [title,price,tier,expected] of [
  ['Canon EOS 650D',75,low,'match'],['Canon EOS 650D',75.01,low,'reject'],
  ['Canon EOS 650D',75,mid,'reject'],['Canon EOS 650D',75.01,mid,'match'],
  ['Canon EOS 650D',125,mid,'match'],['Canon EOS 650D',125.01,mid,'reject'],
  ['Canon Rebel T3i',70,low,'match'],['Canon Rebel T3i',70.01,low,'reject'],
  ['Canon Rebel T5i',95,mid,'match'],['Canon Rebel T5i',95.01,mid,'reject'],
  ['Canon 600D faulty',50,low,'reject'],['Shoes Rebel',50,low,'pending'],
  ['Canon 600D expanded guide',50,low,'reject'],['Remote switch for Canon 600D',50,low,'reject'],
  ['Canon 600D with lens and remote switch',60,low,'match'],
 ])assert.equal(matchListing(listing(title,price),tier).status,expected,title+' '+price);
 assert.equal(matchListing(listing('Canon 600D',60,'Satisfactory'),low).status,'reject');
 assert.equal(matchListing(listing('Canon 600D',60,null),low).status,'pending');
});
test('incomplete original definitions remain labelled and cannot scan or alert',()=>{
 assert.equal(tiers.length,4);
 for(const {data} of tiers.slice(2)){
  assert(data.recipe.setupRequired);assert(!data.enabled);assert(!data.notifications);
  assert.throws(()=>monitorInput({...data,enabled:true}),/original model and price rules/);
  assert.equal(matchListing(listing('Canon 600D',50),data.recipe).reason,'setup_required');
 }
});
test('two price tiers reuse source requests but save only passing finds and retain ID-only overlap',async()=>{
 const key=Buffer.alloc(32,17).toString('base64'),owner='fixture-owner';
 const encrypted=await seal({accessToken:'synthetic-only-access-token',refreshToken:'synthetic-refresh',userAgent:'Synthetic Browser 1.0',country:'GB'},key,owner);
 const monitors=tiers.slice(0,2).map((t,i)=>({id:'m'+i,user_id:owner,revision:1,recipe:t.data.recipe}));
 const commits=[];let requests=0;
 const result=await automaticScan({token:'fixture',db:async()=>[],rpc:async(name,args)=>{
  if(name==='monitor_auto_claim')return monitors;
  if(name==='monitor_connection_worker')return {state:'verified',generation:'fixture',ciphertext:encrypted,expiresAt:new Date(Date.now()+3600000).toISOString()};
  if(name==='monitor_connection_key')return key;
  if(name==='monitor_catalog_commit'){commits.push(args);return true;}
  throw new Error(name);
 },request:async(url)=>{
  requests++;assert.equal(url.searchParams.get('price_from'),'0.00');assert.equal(url.searchParams.get('price_to'),'125.00');
  return Response.json({items:[raw(100,'Canon 600D',60),raw(101,'Canon 700D',90),raw(102,'Rebel shoes',60),raw(103,'Canon 600D faulty',45)]});
 }});
 assert.equal(requests,2);assert.equal(result.committed,2);
 assert.deepEqual(commits.map(c=>c.p_items.map(x=>x.listing.id)),[['100'],['101']]);
 assert.deepEqual(commits[0].p_seen,['100','101','102','103']);
 assert(!JSON.stringify(commits.map(c=>c.p_items)).includes('shoes'));
});
