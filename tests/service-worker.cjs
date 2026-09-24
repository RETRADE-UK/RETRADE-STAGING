/* Deterministic worker contract tests: zero network, zero user data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {root,assets}=require('../scripts/assets.cjs');
const path=require('node:path');
async function harness(scope='https://test.example/app/'){
 const buckets=new Map(),listeners={},requests=[];let active=0,max=0,offline=false;
 const caches={async keys(){return [...buckets.keys()]},async delete(k){return buckets.delete(k)},async open(k){if(!buckets.has(k))buckets.set(k,new Map());const map=buckets.get(k);return {async put(key,response){map.set(typeof key==='string'?key:key.url,response.clone())},async match(key,opts={}){let url=typeof key==='string'?key:key.url;const found=[...map].find(([k])=>opts.ignoreSearch?k.split('?')[0]===url.split('?')[0]:k===url);return found?.[1].clone()}}}};
 const self={registration:{scope},location:new URL(scope),clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>listeners[name]=fn};
 const context=vm.createContext({self,URL,Request,Response,Map,Set,Promise,setTimeout,caches,fetch:async request=>{const url=typeof request==='string'?request:request.url;requests.push(url);if(offline)throw Error('offline');active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;return new Response('asset:'+url);}});
 context.importScripts=()=>{vm.runInContext(fs.readFileSync(path.join(root,'config/assets.js'),'utf8'),context);self.RT_ASSETS=context.RT_ASSETS;};
 vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),context);
 async function emit(name,extra={}){const work=[];let response;listeners[name]({...extra,waitUntil:p=>work.push(p),respondWith:p=>response=p});const result=await response;await Promise.all(work);return result;}
 return {emit,requests,caches,get max(){return max},set offline(v){offline=v}};
}
(async()=>{
 const h=await harness();await h.emit('install');assert(h.max<=3,'Installation must bound concurrency');assert(!h.requests.some(u=>u.includes(assets.core)||u.includes('assets/launch/')),'No core or device image flood during install');
 const n=h.requests.length;await h.emit('message',{data:{type:'RT_WARM_STATIC',build:assets.build,saveData:true}});assert.equal(h.requests.length,n,'Save-Data skips optional warming');
 await Promise.all([h.emit('message',{data:{type:'RT_WARM_STATIC',build:assets.build}}),h.emit('message',{data:{type:'RT_WARM_STATIC',build:assets.build}})]);
 assert(h.max<=3,'Concurrent warm messages share the bounded queue');assert.equal(new Set(h.requests).size,h.requests.length,'No duplicate warm requests');assert(!h.requests.some(u=>assets.lazy.some(p=>u.includes(p))),'Export engines load on demand');
 const before=h.requests.length;const r=await h.emit('fetch',{request:new Request('https://test.example/app/'+assets.core+'?v='+assets.build)});assert((await r.text()).includes(assets.core));assert.equal(h.requests.length,before,'Current source served from cache');
 const older=await h.caches.open('retrade-static-old');
 await older.put('https://test.example/app/'+assets.core+'?v=old',new Response('old-core'));
 assert.equal(await (await h.emit('fetch',{request:new Request('https://test.example/app/'+assets.core+'?v=old')})).text(),'old-core','Old tabs receive their exact cached generation');
 const newer=await h.emit('fetch',{request:new Request('https://test.example/app/config/assets.js?v=future')});
 assert.equal(await newer.text(),'asset:https://test.example/app/config/assets.js?v=future','New HTML must not receive the active worker old manifest');
 const olderCSS=await h.emit('fetch',{request:new Request('https://test.example/app/assets/styles/application.css?v=old')});
 assert.equal(await olderCSS.text(),'asset:https://test.example/app/assets/styles/application.css?v=old','Styles honour the requested generation too');
 assert.equal(await h.emit('fetch',{request:new Request('https://test.example/app/private-data.json')}),undefined,'Unknown/business data bypass caching');
 assert.equal(await h.emit('fetch',{request:new Request('https://test.example/other/'+assets.core)}),undefined,'Scope is honoured');
 const old=await h.caches.open('retrade-static-previous');await old.put('https://test.example/app/app-core.js?v=old',new Response('previous-core'));
 assert.equal(await (await h.emit('fetch',{request:new Request('https://test.example/app/app-core.js?v=old')})).text(),'previous-core','Open old tabs retain their matching cached source');
 h.offline=true;assert((await (await h.emit('fetch',{request:new Request('https://test.example/app/'+assets.core)})).text()).includes(assets.core),'Offline cached core remains available');
 const empty=await harness();empty.offline=true;const offline=await empty.emit('fetch',{request:{url:'https://test.example/app/',method:'GET',mode:'navigate'}});assert.equal(offline.status,503);assert((await offline.text()).includes('Try again'),'Offline first visit offers recovery instead of blank screen');
 console.log('PASS service worker: bounded/deduplicated warming, Save-Data, lazy assets, path scope, legacy tabs and offline recovery');
})().catch(e=>{console.error(e);process.exitCode=1});
