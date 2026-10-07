import { publicSession } from './public-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecipe} from '../../worker/monitors/src/contracts.mjs';
import {canonTierPresets} from '../../worker/monitors/src/presets.mjs';
import {matchListing} from '../../worker/monitors/src/engine/match.mjs';
import {normalizeListing} from '../../worker/monitors/src/adapters/vinted-normalize.mjs';
import {monitorInput} from '../../worker/monitors/src/service-validation.mjs';
import {automaticScan} from '../../worker/monitors/src/automatic.mjs';
import {seal} from '../../worker/monitors/src/connection.mjs';
const tiers=canonTierPresets();
const raw=(id,title,price,status='Very good')=>({id,title,price:{amount:String(price),currency_code:'GBP'},status});
const listing=(title,price,status)=>normalizeListing(raw(123,title,price,status),{observedAt:'2026-10-07T00:00:00Z'});
test('configured rules enforce exact boundaries, alias caps, reported-condition and title filters',()=>{
 const shared={models:['600D','650D','700D'],conditions:['good','very_good'],titleRejectTerms:['faulty'],modelMaxPricePence:{'600D':7000,'700D':9500}};
 const low=createRecipe({...shared,maxPricePence:7500}),mid=createRecipe({...shared,minPricePence:7501,maxPricePence:12500});
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
test('four complete tiers cover 20 models with gapless exclusive bands and conservative caps',()=>{
 assert.equal(tiers.length,4);
 assert.deepEqual(tiers.map(t=>[t.data.recipe.minPricePence,t.data.recipe.maxPricePence]),[[0,6000],[6001,10000],[10001,16000],[0,15000]]);
 assert.equal(tiers[0].data.recipe.models.length,20);
 for(const {data} of tiers){
  assert(!data.recipe.setupRequired);assert(!data.enabled);assert(!data.notifications);
  assert.doesNotThrow(()=>monitorInput({...data,enabled:true,notifications:true}));
 }
 const hits=(title,price,status)=>tiers.map((t,i)=>matchListing(listing(title,price,status),t.data.recipe).status==='match'?i:null).filter(i=>i!==null);
 for(const [title,price,expected] of [
  ['Canon 700D',60,[0]],['Canon 700D',60.01,[1]],['Canon 700D',100,[1]],['Canon 700D',100.01,[]],
  ['Canon 750D',100.01,[2]],['Canon 750D',130,[2]],['Canon 750D',130.01,[]],
  ['Canon Rebel SL3',160,[2]],['Canon Rebel SL3',160.01,[]],['Canon EOS80D',120,[2]],
  ['Canon 1000D',30,[0]],['Canon 1000D',30.01,[]],['Canon Rebel T3',40,[0]],
  ['Canon 600D 18-55mm + 55-250mm lenses',100,[3]],
  ['Canon 700D + 18-55 lens',120,[2]],['Canon 700D + 18-55 lens',120.01,[]],
  ['Canon EF-S 18-55 lens 700D 600D',30,[]],
  ['Canon 600D kit extras',100,[]],['Canon 600D body only 18-55 55-250 sold separately',100,[]],
  ['Lens for Canon 600D 18-55 and 55-250',60,[]],['Canon 600D battery grip',20,[]],
  ['Canon 750D faulty',60,[]],['Canon 750D read description',60,[]],['Rebel shoes',30,[]],
 ])assert.deepEqual(hits(title,price),expected,title+' '+price);
 assert.deepEqual(hits('Canon 750D',70,'Satisfactory'),[]);
 assert.deepEqual(hits('Canon 750D',70,null),[]);
});
test('two price tiers reuse source requests but save only passing finds and retain ID-only overlap',async()=>{
 const key=Buffer.alloc(32,17).toString('base64'),owner='fixture-owner';
 const encrypted=await seal(publicSession(),key,owner);
 const monitors=[{minPricePence:0,maxPricePence:7500},{minPricePence:7501,maxPricePence:12500}].map((band,i)=>({id:'m'+i,user_id:owner,revision:1,recipe:createRecipe({...band,models:['600D','700D'],searchTerms:['Canon','EOS Rebel'],conditions:['good','very_good'],titleRejectTerms:['faulty']})}));
 const commits=[];let requests=0;
 const result=await automaticScan({token:'fixture',db:async()=>[],rpc:async(name,args)=>{
  if(name==='monitor_auto_claim')return monitors;
  if(name==='monitor_connection_worker')return {mode:'public',state:'verified',generation:'fixture',ciphertext:encrypted,expiresAt:new Date(Date.now()+3600000).toISOString()};
  if(name==='monitor_connection_key')return key;
  if(name==='monitor_public_persist')return true;
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
