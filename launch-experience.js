/* RETRADE launch experience — v1.5.20
 *
 * Premium startup pipeline:
 *   brand plate -> (only if the wait is real) exact-layout skeleton -> truth reveal
 *
 * The branded plate covers cold-start initialization. If hydration is quick it
 * dissolves directly into truthful content, so users never see a 100 ms skeleton
 * flash. If hydration is slower it hands off once to the real component skeleton.
 * The final reveal waits briefly for the motion stack, guaranteeing first-load
 * Dashboard/Sales chart motion is installed before the masks leave.
 */
(function(){
  'use strict';

  var VERSION=String(window.__rtBuildId||'20260921-v1520');
  var BRAND_MIN_MS=420;
  var BRAND_TO_SKELETON_MS=560;
  var BRAND_FADE_MS=180;
  var MOTION_WAIT_MAX_MS=900;

  var root=document.documentElement;
  var t0=(window.performance&&performance.now)?performance.now():Date.now();
  var bodyObserver=null;
  var loadingSeen=false;
  var revealingSeen=false;
  var readySeen=false;
  var lastLoading=false;
  var lastRevealing=false;
  var warmScheduled=false;
  var brandEl=null;
  var brandShownAt=0;
  var brandTimer=0;
  var finishRequested=false;
  var motionReady=!!window.__rtMotionStackReady;

  root.classList.add('rt-app-cold');

  var perf=window.__rtLaunchPerf=window.__rtLaunchPerf||{};
  perf.version=VERSION;perf.startedAt=t0;perf.shellAt=null;perf.revealAt=null;perf.readyAt=null;
  perf.fcp=null;perf.longTasks=0;perf.longTaskMs=0;perf.loaderLongPhase=false;
  perf.bootHoldPatched=false;perf.finishRequestedAt=null;perf.finishReleasedAt=null;
  perf.dataReadyAt=null;perf.motionReadyAt=null;perf.dataReadyRetries=0;perf.dataReadyWaitMs=0;
  perf.brandShownAt=null;perf.brandDismissedAt=null;perf.brandHandoff=null;

  function stamp(){return ((window.performance&&performance.now)?performance.now():Date.now())-t0;}
  function clock(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function reduced(){try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}}

  function installStyles(){
    var old=document.getElementById('rt-launch-experience-css');if(old)old.remove();
    var s=document.createElement('style');s.id='rt-launch-experience-css';
    s.textContent='\
html.rt-app-cold .page.on{animation:none!important}\
#rt-launch-brand{position:fixed;inset:0;z-index:13050;display:grid;place-items:center;background:var(--bg);opacity:1;pointer-events:auto;transition:opacity '+BRAND_FADE_MS+'ms ease-out;contain:strict}\
#rt-launch-brand.rt-launch-brand-out{opacity:0;pointer-events:none}\
#rt-launch-brand .rt-launch-lockup{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;opacity:0;animation:rtLaunchLockupIn 180ms ease-out 35ms both}\
#rt-launch-brand .rt-launch-mark{display:block;width:72px;height:84px}\
#rt-launch-brand .rt-launch-word{font-family:var(--font-body);font-size:25px;font-weight:900;font-style:italic;letter-spacing:.035em;line-height:1;color:var(--text-primary);white-space:nowrap}\
#rt-launch-brand .rt-launch-word span{color:var(--brand)}\
@keyframes rtLaunchLockupIn{from{opacity:0}to{opacity:1}}\
body.rt-launch-waking.rt-real-layout-revealing .rt-data-reveal,body.rt-launch-waking.rt-real-layout-revealing .rt-chart-reveal{filter:none!important;transform:none!important}\
html.rt-app-cold #fab-dial,html.rt-app-cold #search-fab{transition:none!important}\
@media(max-width:600px){#rt-launch-brand .rt-launch-mark{width:64px;height:75px}#rt-launch-brand .rt-launch-word{font-size:22px;letter-spacing:.03em}}\
@media(prefers-reduced-motion:reduce){#rt-launch-brand{transition:none!important}#rt-launch-brand .rt-launch-lockup{animation:none!important;opacity:1!important}html.rt-app-cold .page.on{animation:none!important}}';
    document.head.appendChild(s);
  }
  installStyles();

  function createBrand(){
    if(brandEl||!document.body)return;
    brandEl=document.createElement('div');
    brandEl.id='rt-launch-brand';
    brandEl.setAttribute('aria-hidden','true');
    brandEl.innerHTML='<div class="rt-launch-lockup"><svg class="rt-launch-mark" viewBox="0 0 811 946" aria-hidden="true"><use href="#rt-mark"></use></svg><div class="rt-launch-word">RE<span>TRADE</span></div></div>';
    document.body.appendChild(brandEl);
    brandShownAt=clock();perf.brandShownAt=stamp();
    document.body.classList.add('rt-brand-launching');
  }

  function removeBrand(mode){
    if(!brandEl)return;
    if(brandTimer){clearTimeout(brandTimer);brandTimer=0;}
    var el=brandEl;brandEl=null;
    perf.brandHandoff=mode||'content';perf.brandDismissedAt=stamp();
    document.body.classList.remove('rt-brand-launching');
    if(reduced()){if(el.parentNode)el.remove();return;}
    el.classList.add('rt-launch-brand-out');
    setTimeout(function(){if(el&&el.parentNode)el.remove();},BRAND_FADE_MS+40);
  }

  function scheduleBrandToSkeleton(){
    if(brandTimer)clearTimeout(brandTimer);
    brandTimer=setTimeout(function(){
      brandTimer=0;
      var b=document.body;
      // If hydration has already finished, keep the clean brand plate until the
      // final content reveal instead of flashing a skeleton for a few frames.
      if(!finishRequested&&b&&b.classList.contains('rt-real-layout-loading'))removeBrand('skeleton');
    },BRAND_TO_SKELETON_MS);
  }

  try{
    if('PerformanceObserver' in window){
      try{
        var po=new PerformanceObserver(function(list){list.getEntries().forEach(function(e){if(e.name==='first-contentful-paint'&&perf.fcp==null)perf.fcp=e.startTime;});});
        po.observe({type:'paint',buffered:true});
      }catch(_){}
      try{
        var lo=new PerformanceObserver(function(list){if(readySeen)return;list.getEntries().forEach(function(e){perf.longTasks++;perf.longTaskMs+=Number(e.duration)||0;});});
        lo.observe({type:'longtask',buffered:true});
      }catch(_){}
    }
  }catch(_){}

  function scheduleStaticWarm(){
    if(warmScheduled)return;warmScheduled=true;
    var run=function(){
      try{
        if(!('serviceWorker' in navigator))return;
        navigator.serviceWorker.ready.then(function(reg){
          try{var target=navigator.serviceWorker.controller||(reg&&reg.active);if(target)target.postMessage({type:'RT_WARM_STATIC',build:VERSION});}catch(_){}
        }).catch(function(){});
      }catch(_){}
    };
    try{if('requestIdleCallback' in window){requestIdleCallback(run,{timeout:1800});return;}}catch(_){}
    setTimeout(run,850);
  }

  function beginLoading(body){
    if(loadingSeen)return;
    loadingSeen=true;perf.shellAt=stamp();
    body.classList.add('rt-launch-shell');
    createBrand();scheduleBrandToSkeleton();
  }
  function beginReveal(body){
    if(revealingSeen)return;
    revealingSeen=true;perf.revealAt=stamp();
    body.classList.add('rt-launch-waking');
    removeBrand('content');
    try{window.dispatchEvent(new CustomEvent('retrade:boot-reveal',{detail:{at:perf.revealAt}}));}catch(_){}
  }
  function finishWake(body){
    if(readySeen)return;
    readySeen=true;perf.readyAt=stamp();
    body.classList.remove('rt-launch-shell');
    removeBrand('content');
    setTimeout(function(){
      body.classList.remove('rt-launch-waking');
      root.classList.remove('rt-app-cold','rt-motion-prep');
      root.classList.add('rt-app-awake');
      scheduleStaticWarm();
    },reduced()?0:220);
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
    setTimeout(function(){
      if(!loadingSeen&&!readySeen){
        readySeen=true;removeBrand('fallback');root.classList.remove('rt-app-cold','rt-motion-prep');root.classList.add('rt-app-awake');scheduleStaticWarm();
      }
    },5000);
  }
  observeBody();

  function dataLoadFinished(){try{if(typeof _dbLoading!=='undefined'&&_dbLoading)return false;}catch(_){}return true;}

  window.__rtInstallLaunchCoreHooks=function(){
    try{
      if(typeof finishRealLayoutLoading!=='function')return false;
      if(finishRealLayoutLoading.__rtWakeWrapped)return true;

      var baseFinish=finishRealLayoutLoading;
      var pending=null,releaseScheduled=false,released=false,readinessTimer=0;
      var readinessWaitStartedAt=0,motionWaitStartedAt=0;

      function clearTimer(){if(readinessTimer){clearTimeout(readinessTimer);readinessTimer=0;}}
      function callBase(req){
        if(!req||released)return;
        released=true;pending=null;releaseScheduled=false;clearTimer();
        if(readinessWaitStartedAt)perf.dataReadyWaitMs=Math.max(0,stamp()-readinessWaitStartedAt);
        perf.finishReleasedAt=stamp();
        return baseFinish.apply(req.ctx,req.args);
      }
      function queueCheck(delay){
        if(released||!pending||readinessTimer)return;
        if(!readinessWaitStartedAt)readinessWaitStartedAt=stamp();
        readinessTimer=setTimeout(function(){readinessTimer=0;perf.dataReadyRetries++;afterCurrentTask();},delay==null?48:delay);
      }
      function releaseWhenStable(){
        if(released||releaseScheduled||!pending)return;
        if(!dataLoadFinished()){queueCheck(56);return;}
        perf.dataReadyAt=perf.dataReadyAt==null?stamp():perf.dataReadyAt;
        if(!motionReady){
          if(!motionWaitStartedAt)motionWaitStartedAt=clock();
          if(clock()-motionWaitStartedAt<MOTION_WAIT_MAX_MS){queueCheck(38);return;}
        }

        var minRemaining=brandEl?Math.max(0,(brandShownAt+BRAND_MIN_MS)-clock()):0;
        releaseScheduled=true;
        setTimeout(function(){
          requestAnimationFrame(function(){requestAnimationFrame(function(){
            releaseScheduled=false;
            if(released||!pending)return;
            if(!dataLoadFinished()){queueCheck(40);return;}
            if(!motionReady&&motionWaitStartedAt&&clock()-motionWaitStartedAt<MOTION_WAIT_MAX_MS){queueCheck(38);return;}
            callBase(pending);
          });});
        },minRemaining);
      }
      function afterCurrentTask(){if(!released&&pending)releaseWhenStable();}

      var wrapped=function(){
        if(released)return baseFinish.apply(this,arguments);
        pending={ctx:this,args:Array.prototype.slice.call(arguments)};
        finishRequested=true;
        perf.finishRequestedAt=perf.finishRequestedAt==null?stamp():perf.finishRequestedAt;
        Promise.resolve().then(afterCurrentTask);
      };
      wrapped.__rtWakeWrapped=true;wrapped.__rtBase=baseFinish;
      finishRealLayoutLoading=wrapped;
      perf.bootHoldPatched=true;

      window.addEventListener('pageshow',afterCurrentTask);
      document.addEventListener('visibilitychange',function(){if(!document.hidden)afterCurrentTask();});
      window.addEventListener('retrade:data-ready',afterCurrentTask);
      window.addEventListener('retrade:motion-ready',function(){
        motionReady=true;perf.motionReadyAt=perf.motionReadyAt==null?stamp():perf.motionReadyAt;afterCurrentTask();
      });
      return true;
    }catch(_){return false;}
  };
})();