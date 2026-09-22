/* Versioned, scope-relative static cache. Business/API traffic never enters it. */
importScripts('./config/assets.js');
const ASSETS=self.RT_ASSETS;
const BUILD=ASSETS.build;
const CACHE_PREFIX='retrade-static-';
const CACHE_NAME=CACHE_PREFIX+BUILD;
const SCRIPTS=['app.js','config/assets.js'].concat(ASSETS.entry,ASSETS.bindings,[ASSETS.launch,ASSETS.core],ASSETS.critical,ASSETS.deferred,ASSETS.lazy);
const SHELL=['index.html','manifest.webmanifest'].concat(ASSETS.styles,ASSETS.icons);
const STATIC_SET=new Set(SCRIPTS.concat(SHELL,ASSETS.launchImages));
const SCRIPT_SET=new Set(SCRIPTS);
const SCOPE=new URL(self.registration.scope);
const pending=new Map();
let warming=null;
function assetURL(path){return new URL(path,SCOPE).href;}
function cacheKey(path){return assetURL(path)+(SCRIPT_SET.has(path)?'?v='+BUILD:'');}
async function fetchAndCache(path){
  if(pending.has(path))return pending.get(path);
  const work=(async()=>{
    try{
      const response=await fetch(new Request(cacheKey(path),{credentials:'same-origin',cache:SCRIPT_SET.has(path)?'default':'no-cache'}));
      if(!response||!response.ok)return null;
      const cache=await caches.open(CACHE_NAME);
      try{await cache.put(cacheKey(path),response.clone());}catch(_){}
      return response;
    }catch(_){return null;}
  })();
  pending.set(path,work);
  try{return await work;}finally{pending.delete(path);}
}
async function cachedAsset(path){
  const cache=await caches.open(CACHE_NAME);
  return (await cache.match(cacheKey(path)))||(await fetchAndCache(path));
}
async function warmPaths(paths){
  let next=0;
  // Three fetches at most; large module bursts must not saturate the connection.
  await Promise.all(Array.from({length:Math.min(3,paths.length)},async()=>{
    while(next<paths.length){const path=paths[next++];await cachedAsset(path);}
  }));
}
function warmRuntime(){
  if(warming)return warming;
  // Statements/exporters and device-specific launch images are cached on use.
  const paths=SCRIPTS.filter(path=>!ASSETS.lazy.includes(path));
  warming=warmPaths(paths).finally(()=>{warming=null;});
  return warming;
}
async function navigationResponse(request,event){
  const cache=await caches.open(CACHE_NAME);
  const network=(async()=>{
    try{
      const response=await fetch(request);
      if(!response||!response.ok)return null;
      try{await cache.put(cacheKey('index.html'),response.clone());}catch(_){}
      return response;
    }catch(_){return null;}
  })();
  event.waitUntil(network.then(()=>{}));
  const early=await Promise.race([network,new Promise(resolve=>setTimeout(()=>resolve(null),140))]);
  if(early)return early;
  return (await cache.match(cacheKey('index.html')))||(await network)||new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RETRADE · Offline</title><body style="background:#0f1724;color:#fff;font:18px system-ui;padding:10vh 24px"><h1>RETRADE</h1><p>Your workspace isn’t available offline yet. Reconnect, then try again.</p><button onclick="location.reload()">Try again</button></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    // Small shell first. Optional runtime warming starts after the brand reveal.
    await warmPaths(SHELL.concat(['app.js','config/assets.js']));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=(await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME);
    // One previous generation supports already-open tabs during a release.
    await Promise.all(keys.slice(0,-1).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{
  const d=event.data;
  if(!d||d.type!=='RT_WARM_STATIC'||d.build!==BUILD||d.saveData)return;
  event.waitUntil(warmRuntime());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(!request||request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname))return;
  const path=url.pathname.slice(SCOPE.pathname.length);
  if(request.mode==='navigate'&&(path===''||path==='index.html')){
    event.respondWith(navigationResponse(request,event));return;
  }
  const legacy=ASSETS.legacy[path];
  if(!STATIC_SET.has(path)&&!legacy)return;
  event.respondWith((async()=>{
    // Old tabs can still ask for a root script after this worker takes control.
    if(legacy){
      const keys=(await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).reverse();
      for(const key of keys){const hit=await (await caches.open(key)).match(request,{ignoreSearch:true});if(hit)return hit;}
    }
    const target=legacy||path;
    const response=await cachedAsset(target);
    return response?response.clone():fetch(request);
  })());
});
