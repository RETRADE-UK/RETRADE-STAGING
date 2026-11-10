/* Same-release UI hotfix: replace a stale navigation asset before activation,
 * but leave all other caches and business records untouched. No real network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {root,assets}=require('../scripts/assets.cjs');
const path=require('node:path');
(async()=>{
 const scope='https://test.example/app/',nav=scope+'src/platform/navigation.js?v='+assets.build;
 const buckets=new Map(),handlers={};let failed=false,activated=0;
 const caches={async keys(){return [...buckets.keys()]},async delete(k){return buckets.delete(k)},async open(k){if(!buckets.has(k))buckets.set(k,new Map());const b=buckets.get(k);return {async put(k,r){b.set(typeof k==='string'?k:k.url,r.clone())},async match(k){const r=b.get(typeof k==='string'?k:k.url);return r&&r.clone()}}}};
 const cache=await caches.open('retrade-static-'+assets.build);
 await cache.put(nav,new Response('old-navigation'));
 await cache.put(scope+'app.js?v='+assets.build,new Response('unchanged-loader'));
 const self={registration:{scope},clients:{claim:async()=>{}},skipWaiting:async()=>{activated++},addEventListener:(name,fn)=>handlers[name]=fn};
 const context=vm.createContext({self,URL,Request,Response,Map,Set,Promise,setTimeout,caches,fetch:async r=>{
  if(failed&&r.url===nav)throw Error('offline');
  return new Response(r.url===nav?'editable-search-navigation':'asset:'+r.url);
 }});
 context.importScripts=()=>{vm.runInContext(fs.readFileSync(path.join(root,'config/assets.js'),'utf8'),context);self.RT_ASSETS=context.RT_ASSETS;};
 vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),context);
 async function install(){const work=[];handlers.install({waitUntil:p=>work.push(p)});await Promise.all(work);}
 await install();
 assert.equal(await(await cache.match(nav)).text(),'editable-search-navigation');
 assert.equal(await(await cache.match(scope+'app.js?v='+assets.build)).text(),'unchanged-loader');
 assert.equal(activated,1);
 failed=true;await assert.rejects(install(),/navigation update/i);
 assert.equal(activated,1,'A failed refresh must not activate a stale hotfix');
 assert.equal(await(await cache.match(nav)).text(),'editable-search-navigation','Offline failure preserves the cached UI');
 console.log('PASS search hotfix: stale navigation refreshed, offline safety, unrelated assets preserved');
})().catch(e=>{console.error(e);process.exitCode=1;});
