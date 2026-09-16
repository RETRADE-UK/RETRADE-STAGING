// RETRADE service worker — immutable child-script cache v20260916-v3104.
//
// Startup rule: NEVER bulk-fetch the application again while the first page is
// already trying to launch. The old install handler fetched every child script
// in parallel during first load, creating avoidable network/cache contention.
//
// This worker now:
// - installs/claims immediately without a preload burst;
// - cache-first serves exact-build child scripts once cached;
// - runtime-caches a miss after serving it;
// - accepts RT_WARM_STATIC only after the live app says its wake-up is complete.
//
// Navigation HTML, app.js, CSS, Supabase/auth/data and cross-origin requests
// remain network-owned. A new build can never receive an older cached script.
const BUILD='20260916-v3104';
const CACHE_PREFIX='retrade-static-';
const CACHE_NAME=CACHE_PREFIX+BUILD;
const CHILD_SCRIPTS=[
  'launch-experience.js',
  'app-core.js',
  'performance-system.js',
  'navigation-stability.js',
  'accounts-performance.js',
  'gesture-back-v31.js',
  'gesture-native-v3.js',
  'gesture-native-v3-actions.js',
  'gesture-live-tracking.js',
  'interaction-system-v2.js',
  'surface-gestures-v2.js',
  'sales-defaults.js',
  'bundle-orders.js',
  'bundle-panel.js',
  'bundle-row-polish.js',
  'cashflow-liabilities.js',
  'account-detail-stability.js',
  'partner-item-navigation.js',
  'item-account-adjustments.js',
  'chart-polish.js',
  'chart-motion.js',
  'chart-finalize.js',
  'chart-gesture-v2.js',
  'chart-reveal.js',
  'sales-chart-sequence.js',
  'chart-forecast-sequence.js',
  'motion-system.js'
];
const CHILD_SET=new Set(CHILD_SCRIPTS);

function buildUrl(name){return new URL('./'+name+'?v='+BUILD,self.registration.scope).href;}

async function warmStatic(){
  try{
    const cache=await caches.open(CACHE_NAME);
    await Promise.allSettled(CHILD_SCRIPTS.map(async name=>{
      const url=buildUrl(name);
      const hit=await cache.match(url,{ignoreSearch:false});
      if(hit)return;
      try{
        const response=await fetch(new Request(url,{credentials:'same-origin',cache:'default'}));
        if(response&&response.ok)await cache.put(url,response.clone());
      }catch(_){/* Warm-up is opportunistic; launch/network remains authoritative. */}
    }));
  }catch(_){/* Cache API failure must never affect the app. */}
}

self.addEventListener('install',event=>{
  /* No app-script fetches here: first launch gets the network to itself. */
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)));
    }catch(_){}
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  const d=event&&event.data;
  if(!d||d.type!=='RT_WARM_STATIC')return;
  /* The wake coordinator can be one child-build behind the controlling worker
     during an upgrade. Warm the worker's own immutable BUILD either way. */
  if(event.waitUntil)event.waitUntil(warmStatic());
  else warmStatic();
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(!request||request.method!=='GET')return;

  let url;
  try{url=new URL(request.url);}catch(_){return;}
  if(url.origin!==self.location.origin)return;
  if(request.destination!=='script')return;
  if(url.searchParams.get('v')!==BUILD)return;

  const name=url.pathname.split('/').pop()||'';
  if(!CHILD_SET.has(name))return;

  event.respondWith((async()=>{
    try{
      const cache=await caches.open(CACHE_NAME);
      const hit=await cache.match(request,{ignoreSearch:false});
      if(hit)return hit;
      const response=await fetch(request);
      if(response&&response.ok){try{await cache.put(request,response.clone());}catch(_){}}
      return response;
    }catch(_){
      return fetch(request);
    }
  })());
});
