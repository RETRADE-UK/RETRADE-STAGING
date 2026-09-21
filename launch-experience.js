/* RETRADE cold-start / wake coordinator v1.5.34
 *
 * Launch principle: the real responsive application renders underneath its own
 * loading state and is only revealed when BOTH contracts are true:
 *   1) the cloud/database load has finished and the final page render returned;
 *   2) the presentation/motion stack is installed and ready to start.
 *
 * This prevents a first-load flash of zero/default values and prevents chart
 * animation from running underneath the skeleton before the user can see it.
 * No accounting, lifecycle, sync writes, auth state, forecast maths or Supabase
 * schema/data is changed by this file.
 */
(function(){
  'use strict';

  var VERSION=String(window.__rtBuildId||'20260921-v1534');
  var root=document.documentElement;
  var t0=(window.performance&&performance.now)?performance.now():Date.now();
  var bodyObserver=null;
  var longTimer=0;
  var releaseTimer=0;
  var loadingSeen=false;
  var revealingSeen=false;
  var readySeen=false;
  var lastLoading=false;
  var lastRevealing=false;
  var warmScheduled=false;
  var brandEl=null,brandShownAt=0,brandTimer=0,finishRequested=false,skeletonVisibleAt=0;
  var BRAND_MIN_MS=300,BRAND_TO_SKELETON_MS=420,BRAND_FADE_MS=160,SKELETON_MIN_MS=220;

  root.classList.add('rt-app-cold');

  var perf=window.__rtLaunchPerf=window.__rtLaunchPerf||{};
  perf.version=VERSION;
  perf.startedAt=t0;
  perf.shellAt=null;
  perf.revealAt=null;
  perf.readyAt=null;
  perf.fcp=null;
  perf.longTasks=0;
  perf.longTaskMs=0;
  perf.loaderLongPhase=false;
  perf.bootHoldPatched=false;
  perf.finishRequestedAt=null;
  perf.finishReleasedAt=null;
  perf.dataReadyAt=null;
  perf.motionReadyAt=null;
  perf.bootQuietWaitMs=0;
  perf.bootQuietRetries=0;
  perf.brandShownAt=null;perf.brandDismissedAt=null;perf.brandHandoff=null;perf.skeletonVisibleAt=null;

  function stamp(){return ((window.performance&&performance.now)?performance.now():Date.now())-t0;}
  function clock(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }

  function installStyles(){
    var old=document.getElementById('rt-launch-experience-css');if(old)old.remove();
    var s=document.createElement('style');s.id='rt-launch-experience-css';
    s.textContent='\
@keyframes rtWakeSheen{0%{background-position:185% 0}100%{background-position:-85% 0}}\
@keyframes rtWakePulse{from{opacity:.48}to{opacity:.76}}\
html.rt-app-cold .page.on{animation:none!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-label-loading{color:inherit!important;text-shadow:inherit!important;background:none!important;overflow:visible!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-label-loading::after{display:none!important;animation:none!important;}\
/* Cold start keeps the core real-layout skeleton styling continuous from first paint. */\
/* Cold boot uses the same local reveal philosophy as normal navigation: no whole-page translate. */\
body.rt-launch-waking.rt-real-layout-revealing .page.on{animation:none!important;transform:none!important;}\
body.rt-launch-waking.rt-real-layout-revealing .rt-loading-overlay-exit{transition:opacity 150ms cubic-bezier(.22,.61,.36,1)!important;}\
html.rt-app-cold #fab-dial,html.rt-app-cold #search-fab{transition:none!important;}\
@media(prefers-reduced-motion:reduce){\
 html.rt-app-cold body.rt-real-layout-loading .rt-data-loading,html.rt-app-cold body.rt-real-layout-loading .rt-loading-line,html.rt-app-cold body.rt-real-layout-loading .rt-chart-loading::after,html.rt-app-cold body.rt-real-layout-loading .cat-donut-chart::before,html.rt-app-cold body.rt-real-layout-loading .cat-donut-legend::before{animation:none!important;}\
 body.rt-launch-waking.rt-real-layout-revealing .page.on{animation:none!important;transform:none!important;opacity:1!important;}\
 body.rt-launch-waking.rt-real-layout-revealing .rt-loading-overlay-exit{transition:none!important;opacity:0!important;}\
}\
';
    document.head.appendChild(s);
  }
  installStyles();
  installBrandStyles();
  if(document.body)createBrand();else document.addEventListener('DOMContentLoaded',createBrand,{once:true});

  function installBrandStyles(){
    if(document.getElementById('rt-launch-brand-style'))return;
    var s=document.createElement('style');s.id='rt-launch-brand-style';
    s.textContent='\
#rt-launch-brand{position:fixed;inset:0;z-index:13050;display:grid;place-items:center;background:var(--bg);opacity:1;pointer-events:auto;transition:opacity 160ms ease-out;contain:strict}\
#rt-launch-brand.rt-launch-brand-out{opacity:0;pointer-events:none}\
#rt-launch-brand .rt-launch-lockup{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;opacity:0;animation:rtLaunchLockupIn1534 180ms ease-out 35ms both}\
#rt-launch-brand .rt-launch-mark{display:block;width:72px;height:84px}\
#rt-launch-brand .rt-launch-word{font-family:var(--font-body);font-size:25px;font-weight:900;font-style:italic;letter-spacing:.035em;line-height:1;color:var(--text-primary);white-space:nowrap}\
#rt-launch-brand .rt-launch-word span{color:var(--brand)}\
@keyframes rtLaunchLockupIn1534{from{opacity:0}to{opacity:1}}\
@media(max-width:600px){#rt-launch-brand .rt-launch-mark{width:64px;height:75px}#rt-launch-brand .rt-launch-word{font-size:22px}}\
@media(prefers-reduced-motion:reduce){#rt-launch-brand{transition:none!important}#rt-launch-brand .rt-launch-lockup{animation:none!important;opacity:1!important}}';
    document.head.appendChild(s);
  }
  function createBrand(){
    if(brandEl)return;
    if(!document.body)return;
    var existing=document.getElementById('rt-launch-brand');
    if(existing){
      brandEl=existing;
      brandShownAt=clock();
      perf.brandShownAt=perf.brandShownAt==null?stamp():perf.brandShownAt;
      return;
    }
    brandEl=document.createElement('div');brandEl.id='rt-launch-brand';brandEl.setAttribute('aria-hidden','true');
    brandEl.innerHTML='<div class="rt-launch-lockup"><svg class="rt-launch-mark" viewBox="0 0 811 946" aria-hidden="true"><use href="#rt-mark"></use></svg><div class="rt-launch-word">RE<span>TRADE</span></div></div>';
    document.body.appendChild(brandEl);brandShownAt=clock();perf.brandShownAt=stamp();
  }
  function removeBrand(mode){
    if(!brandEl)return;if(brandTimer){clearTimeout(brandTimer);brandTimer=0;}
    var el=brandEl;brandEl=null;perf.brandHandoff=mode||'content';perf.brandDismissedAt=stamp();
    if(mode==='skeleton'){
      skeletonVisibleAt=clock()+BRAND_FADE_MS;
      perf.skeletonVisibleAt=stamp()+BRAND_FADE_MS;
    }
    if(reducedMotion()){if(el.parentNode)el.remove();return;}
    el.classList.add('rt-launch-brand-out');setTimeout(function(){if(el&&el.parentNode)el.remove();},BRAND_FADE_MS+40);
  }
  function scheduleBrandToSkeleton(){
    if(brandTimer)clearTimeout(brandTimer);
    var remaining=brandShownAt?Math.max(0,(brandShownAt+BRAND_TO_SKELETON_MS)-clock()):BRAND_TO_SKELETON_MS;
    brandTimer=setTimeout(function(){brandTimer=0;var b=document.body;if(b&&b.classList.contains('rt-real-layout-loading'))removeBrand('skeleton');},remaining);
  }
  function authVisible(){
    var el=document.getElementById('auth-overlay');if(!el)return false;
    try{return getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';}catch(_){return el.style.display!=='none';}
  }

  try{
    if('PerformanceObserver' in window){
      try{
        var paintObserver=new PerformanceObserver(function(list){
          list.getEntries().forEach(function(e){if(e.name==='first-contentful-paint'&&perf.fcp==null)perf.fcp=e.startTime;});
        });
        paintObserver.observe({type:'paint',buffered:true});
      }catch(_){}
      try{
        var longObserver=new PerformanceObserver(function(list){
          if(readySeen)return;
          list.getEntries().forEach(function(e){perf.longTasks++;perf.longTaskMs+=Number(e.duration)||0;});
        });
        longObserver.observe({type:'longtask',buffered:true});
      }catch(_){}
    }
  }catch(_){}

  function clearLongTimer(){if(longTimer){clearTimeout(longTimer);longTimer=0;}}
  function scheduleStaticWarm(){
    if(warmScheduled)return;warmScheduled=true;
    var run=function(){
      try{
        if(!('serviceWorker' in navigator))return;
        navigator.serviceWorker.ready.then(function(reg){
          try{if(reg&&reg.active)reg.active.postMessage({type:'RT_WARM_STATIC',build:window.__rtBuildId||VERSION});}catch(_){}
        }).catch(function(){});
      }catch(_){}
    };
    try{
      if('requestIdleCallback' in window){requestIdleCallback(run,{timeout:1800});return;}
    }catch(_){}
    setTimeout(run,850);
  }
  function beginLoading(body){
    if(loadingSeen)return;
    loadingSeen=true;perf.shellAt=stamp();body.classList.add('rt-launch-shell');
    createBrand();scheduleBrandToSkeleton();
    clearLongTimer();
  }
  function beginReveal(body){
    if(revealingSeen)return;
    revealingSeen=true;perf.revealAt=stamp();clearLongTimer();
    body.classList.remove('rt-launch-long');body.classList.add('rt-launch-waking');
    removeBrand('content');
    // Motion owners arm while hidden and start from zero exactly as the real
    // loading surface begins its handoff. This event is boot-only.
    try{window.dispatchEvent(new CustomEvent('retrade:boot-reveal',{detail:{at:perf.revealAt}}));}catch(_){}
  }
  function finishWake(body){
    if(readySeen)return;
    readySeen=true;perf.readyAt=stamp();clearLongTimer();body.classList.remove('rt-launch-long','rt-launch-shell');removeBrand('content');
    if(releaseTimer)clearTimeout(releaseTimer);
    releaseTimer=setTimeout(function(){
      body.classList.remove('rt-launch-waking');root.classList.remove('rt-app-cold');root.classList.add('rt-app-awake');releaseTimer=0;scheduleStaticWarm();
    },reducedMotion()?0:235);
  }
  function inspectBody(body){
    if(!body)return;
    var loading=body.classList.contains('rt-real-layout-loading');
    var revealing=body.classList.contains('rt-real-layout-revealing');
    if(loading&&!lastLoading)beginLoading(body);
    if(revealing&&!lastRevealing)beginReveal(body);
    if(!loading&&lastLoading)finishWake(body);
    lastLoading=loading;lastRevealing=revealing;
  }
  function observeBody(){
    var body=document.body;
    if(!body){requestAnimationFrame(observeBody);return;}
    inspectBody(body);
    try{bodyObserver=new MutationObserver(function(){inspectBody(body);});bodyObserver.observe(body,{attributes:true,attributeFilter:['class']});}catch(_){}
    var auth=document.getElementById('auth-overlay');
    if(auth){try{var ao=new MutationObserver(function(){if(!loadingSeen&&authVisible()){removeBrand('auth');root.classList.remove('rt-app-cold');root.classList.add('rt-app-awake');try{ao.disconnect();}catch(_){}}});ao.observe(auth,{attributes:true,attributeFilter:['style','class']});if(authVisible()){removeBrand('auth');root.classList.remove('rt-app-cold');root.classList.add('rt-app-awake');}}catch(_){}}
    setTimeout(function(){if(!loadingSeen&&!readySeen){readySeen=true;removeBrand('fallback');root.classList.remove('rt-app-cold');root.classList.add('rt-app-awake');scheduleStaticWarm();}},4200);
  }
  observeBody();

  function dataLoadFinished(){
    try{
      if(typeof _dbLoading!=='undefined'&&_dbLoading)return false;
    }catch(_){}
    return true;
  }
  function motionStackReady(){
    try{
      if(window.__rtMotionStackReady===false)return false;
      if(root.classList.contains('rt-motion-prep'))return false;
    }catch(_){}
    return true;
  }

  /* Cold start now follows the same contract as route loading:
     one visible skeleton remains authoritative until data, presentation code and
     the final active-page DOM have all settled. */
  window.__rtInstallLaunchCoreHooks=function(){
    try{
      if(typeof finishRealLayoutLoading!=='function')return false;
      if(finishRealLayoutLoading.__rtWakeWrapped)return true;

      var baseFinish=finishRealLayoutLoading;
      var pending=null;
      var released=false;
      var releaseScheduled=false;
      var retryTimer=0;
      var quietObserver=null;
      var quietPage=null;
      var quietStartedAt=0;
      var lastMutationAt=(window.performance&&performance.now)?performance.now():Date.now();
      var QUIET_MS=110;
      var MAX_QUIET_WAIT=1800;

      function absNow(){return (window.performance&&performance.now)?performance.now():Date.now();}
      function clearRetry(){if(retryTimer){clearTimeout(retryTimer);retryTimer=0;}}
      function disconnectQuiet(){if(quietObserver){try{quietObserver.disconnect();}catch(_){}quietObserver=null;}quietPage=null;}

      function armQuietObserver(){
        var page=document.querySelector('.page.on');
        if(page===quietPage&&quietObserver)return;
        disconnectQuiet();
        quietPage=page||null;
        lastMutationAt=absNow();
        if(!quietPage)return;
        try{
          quietObserver=new MutationObserver(function(muts){
            for(var i=0;i<muts.length;i++){
              var m=muts[i];
              if(m.type==='characterData'||
                 (m.type==='childList'&&((m.addedNodes&&m.addedNodes.length)||(m.removedNodes&&m.removedNodes.length)))||
                 m.type==='attributes'){
                lastMutationAt=absNow();
                break;
              }
            }
          });
          quietObserver.observe(quietPage,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','aria-busy']});
        }catch(_){}
      }

      function domQuiet(){
        armQuietObserver();
        if(!quietStartedAt)quietStartedAt=absNow();
        var waited=absNow()-quietStartedAt;
        var quiet=absNow()-lastMutationAt>=QUIET_MS;
        if(!quiet&&waited<MAX_QUIET_WAIT)return false;
        perf.bootQuietWaitMs=Math.max(0,waited);
        return true;
      }

      function callBase(req){
        if(!req||released)return;
        released=true;pending=null;releaseScheduled=false;clearRetry();disconnectQuiet();
        try{
          if(typeof _realLayoutLoadingStartedAt!=='undefined'&&_realLayoutLoadingStartedAt){
            var n=absNow(),elapsed=Math.max(0,n-_realLayoutLoadingStartedAt);
            var desiredRemaining=Math.max(0,90-elapsed);
            _realLayoutLoadingStartedAt=n-(440-desiredRemaining);
          }
        }catch(_){}
        perf.finishReleasedAt=stamp();
        removeBrand('content');
        return baseFinish.apply(req.ctx,req.args);
      }

      function queueCheck(delay){
        if(released||!pending||retryTimer)return;
        retryTimer=setTimeout(function(){
          retryTimer=0;
          perf.bootQuietRetries++;
          afterCurrentTask();
        },delay||48);
      }

      function schedulePaintStableRelease(){
        if(releaseScheduled||released||!pending)return;
        if(!dataLoadFinished()||!motionStackReady()||!domQuiet()){
          queueCheck(48);
          return;
        }
        var brandRemaining=brandEl&&brandShownAt?Math.max(0,(brandShownAt+BRAND_MIN_MS)-absNow()):0;
        if(brandRemaining>0){queueCheck(Math.min(60,Math.max(16,brandRemaining)));return;}
        var skeletonRemaining=skeletonVisibleAt?Math.max(0,(skeletonVisibleAt+SKELETON_MIN_MS)-absNow()):0;
        if(skeletonRemaining>0){queueCheck(Math.min(60,Math.max(16,skeletonRemaining)));return;}
        releaseScheduled=true;
        perf.dataReadyAt=perf.dataReadyAt==null?stamp():perf.dataReadyAt;
        perf.motionReadyAt=perf.motionReadyAt==null?stamp():perf.motionReadyAt;
        var req=pending;
        requestAnimationFrame(function(){
          requestAnimationFrame(function(){
            if(released)return;
            if(!dataLoadFinished()||!motionStackReady()||!domQuiet()){
              releaseScheduled=false;queueCheck(48);return;
            }
            callBase(req);
          });
        });
      }

      function afterCurrentTask(){
        if(released||!pending)return;
        if(dataLoadFinished())perf.dataReadyAt=perf.dataReadyAt==null?stamp():perf.dataReadyAt;
        schedulePaintStableRelease();
      }

      var wrapped=function(){
        if(released)return baseFinish.apply(this,arguments);
        pending={ctx:this,args:Array.prototype.slice.call(arguments)};
        finishRequested=true;
        perf.finishRequestedAt=perf.finishRequestedAt==null?stamp():perf.finishRequestedAt;
        quietStartedAt=0;armQuietObserver();
        Promise.resolve().then(afterCurrentTask);
      };
      wrapped.__rtWakeWrapped=true;
      finishRealLayoutLoading=wrapped;
      perf.bootHoldPatched=true;

      window.addEventListener('retrade:motion-ready',function(){
        perf.motionReadyAt=perf.motionReadyAt==null?stamp():perf.motionReadyAt;
        Promise.resolve().then(afterCurrentTask);
      });
      window.addEventListener('retrade:data-ready',afterCurrentTask);
      window.addEventListener('pageshow',afterCurrentTask);
      document.addEventListener('visibilitychange',function(){if(!document.hidden)afterCurrentTask();});
      return true;
    }catch(_){return false;}
  };
})();
