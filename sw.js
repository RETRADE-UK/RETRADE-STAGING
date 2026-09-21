// RETRADE service worker — warm app shell + immutable child scripts v20260921-v1514.
const BUILD='20260921-v1514';
const CACHE_PREFIX='retrade-static-';
const CACHE_NAME=CACHE_PREFIX+BUILD;
const CHILD_SCRIPTS=[
  'launch-experience.js','app-core.js','performance-system.js','navigation-stability.js','accounts-performance.js','gesture-back-v31.js','gesture-native-v3.js','gesture-native-v3-actions.js','gesture-live-tracking.js','interaction-system-v2.js','surface-gestures-v2.js','app-lifecycle.js','sales-defaults.js',
  'bundle-orders.js','bundle-panel.js','bundle-row-polish.js','cashflow-liabilities.js','relist-fee-integrity.js','account-detail-stability.js','cashflow-dashboard-v2.js','cashflow-movement-card-polish.js','cashflow-performance-v1509.js',
  'partner-item-navigation.js','partner-actions-v2.js','partner-statement-action.js',
  'partner-statements.js','partner-statements-accounting-v2.js','partner-statements-accounting-v3.js','partner-account-adjustment-statements.js',
  'partner-account-ui-v3.js','partner-account-ui-v4.js','partner-account-cleanup.js',
  'partner-row-menu-popover.js','item-account-adjustments.js','partner-arrangements-v2.js',
  'partner-account-finalise.js','partner-account-legacy-hero-cleanup.js','partner-account-adjustments.js','partner-account-adjustments-hardening.js','partner-payment-allocations-v2.js','partner-account-transaction-ui.js','partner-transaction-breakdown-guard.js','partner-collapse-defaults.js',
  'accounts-operations-dashboard.js','accounts-sort-polish.js','accounts-operations-compact-v2.js','partner-account-experience-v2.js','partner-page-unified-v1503.js','partners-list-transition-v1504.js','partners-loading-dwell-v1505.js','main-page-loading-motion-v1506.js','main-page-truth-gate-v1507.js','sales-loading-mask-v1508.js','sales-month-loading-v1509.js','main-kpi-count-motion-v1510.js','skeleton-truth-exclusivity-v1511.js','document-exports.js',
  'chart-polish.js','chart-motion.js','chart-finalize.js','chart-gesture-v2.js','chart-reveal.js',
  'sales-chart-sequence.js','chart-forecast-sequence.js','motion-system.js'
];
const CHILD_SET=new Set(CHILD_SCRIPTS);
const SHELL_FILES=['index.html','app.css','skeleton-motion-polish-v1512.css','manifest.webmanifest'];
const SHELL_SET=new Set(SHELL_FILES);
function buildUrl(name){return new URL('./'+name+'?v='+BUILD,self.registration.scope).href;}
function shellUrl(name){return new URL('./'+name,self.registration.scope).href;}

async function fetchAndCache(cache,url,key){
  try{
    const response=await fetch(new Request(url,{credentials:'same-origin',cache:'no-store'}));
    if(response&&response.ok){try{await cache.put(key||url,response.clone());}catch(_){}}
    return response;
  }catch(_){return null;}
}

async function warmStatic(){
  try{
    const cache=await caches.open(CACHE_NAME);
    const scriptNames=['app.js'].concat(CHILD_SCRIPTS);
    const scriptWork=scriptNames.map(async name=>{
      const url=buildUrl(name);
      const hit=await cache.match(url,{ignoreSearch:false});
      if(hit)return;
      await fetchAndCache(cache,url,url);
    });
    const shellWork=SHELL_FILES.map(async name=>{
      const url=shellUrl(name);
      const hit=await cache.match(url,{ignoreSearch:true});
      if(hit)return;
      await fetchAndCache(cache,url,url);
    });
    await Promise.allSettled(scriptWork.concat(shellWork));
  }catch(_){}
}

async function navigationResponse(request){
  const cache=await caches.open(CACHE_NAME);
  const key=shellUrl('index.html');
  const cachedPromise=cache.match(key,{ignoreSearch:true});
  const networkPromise=(async()=>{
    try{
      const response=await fetch(request);
      if(response&&response.ok){try{await cache.put(key,response.clone());}catch(_){}}
      return response;
    }catch(_){return null;}
  })();

  const first=await Promise.race([
    networkPromise.then(response=>({kind:'network',response:response})),
    new Promise(resolve=>setTimeout(()=>resolve({kind:'timeout'}),140))
  ]);
  if(first.kind==='network'&&first.response)return first.response;
  const cached=await cachedPromise;
  if(cached)return cached;
  const network=first.kind==='network'?first.response:await networkPromise;
  if(network)return network;
  return new Response('<!doctype html><title>RETRADE</title><body style="margin:0;background:#0f1724"></body>',{status:503,headers:{'Content-Type':'text/html'}});
}

async function shellAssetResponse(request,name){
  const cache=await caches.open(CACHE_NAME),key=shellUrl(name);
  const cached=await cache.match(key,{ignoreSearch:true});
  const refresh=fetchAndCache(cache,request.url,key);
  if(cached){refresh.catch(()=>{});return cached;}
  const network=await refresh;if(network)return network;
  return fetch(request);
}

async function appScriptResponse(request){
  const cache=await caches.open(CACHE_NAME),key=buildUrl('app.js');
  const network=await fetchAndCache(cache,key,key);
  if(network)return network;
  const cached=await cache.match(key,{ignoreSearch:false});
  if(cached)return cached;
  return fetch(request);
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{await warmStatic();await self.skipWaiting();})());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)));}catch(_){}
    await self.clients.claim();
    warmStatic();
  })());
});
self.addEventListener('message',event=>{
  const d=event&&event.data;if(!d||d.type!=='RT_WARM_STATIC')return;
  if(d.build&&d.build!==BUILD)return;
  if(event.waitUntil)event.waitUntil(warmStatic());else warmStatic();
});
self.addEventListener('fetch',event=>{
  const request=event.request;if(!request||request.method!=='GET')return;
  let url;try{url=new URL(request.url);}catch(_){return;}
  if(url.origin!==self.location.origin)return;
  const name=url.pathname.split('/').pop()||'';

  if(request.mode==='navigate'||request.destination==='document'){
    event.respondWith(navigationResponse(request));return;
  }
  if(SHELL_SET.has(name)){
    event.respondWith(shellAssetResponse(request,name));return;
  }
  if(request.destination!=='script')return;
  if(name==='app.js'){
    event.respondWith(appScriptResponse(request));return;
  }
  if(!CHILD_SET.has(name))return;
  event.respondWith((async()=>{
    const current=buildUrl(name);
    try{
      const cache=await caches.open(CACHE_NAME);
      const hit=await cache.match(current,{ignoreSearch:false});if(hit)return hit;
      const response=await fetchAndCache(cache,current,current);if(response)return response;
      return fetch(request);
    }catch(_){return fetch(request);}
  })());
});