/* RETRADE app entrypoint — ordered runtime loader.
 *
 * Cold-start is intentionally staged:
 *   1) launch coordinator + production core
 *   2) give the browser one real paint opportunity
 *   3) load feature/presentation refinements in deterministic order
 *   4) release the boot skeleton only after the final motion layer is installed
 *
 * This keeps the large core authoritative while avoiding a long back-to-back
 * chain of secondary JavaScript evaluation before the first useful frame.
 */
(function(){
  'use strict';
  var assets=window.RT_ASSETS;
  if(!assets){document.documentElement.classList.remove('rt-launch-sealed','rt-app-cold');document.body.innerHTML='<main style="padding:24px;font-family:system-ui"><h1>RETRADE</h1><p>Startup files could not load.</p><button onclick="location.reload()">Try again</button></main>';return;}
  var v=assets.build;
  window.__rtBuildId=v;
  var motionReady=false;

  window.__rtMotionStackReady=false;
  document.documentElement.classList.add('rt-app-cold','rt-motion-prep');

  if(!document.getElementById('rt-skeleton-motion-polish-1512')){
    var skelCss=document.createElement('link');skelCss.id='rt-skeleton-motion-polish-1512';skelCss.rel='stylesheet';skelCss.href='./assets/styles/loading.css?v='+v;document.head.appendChild(skelCss);
  }

  if(!document.getElementById('rt-motion-preflight')){
    var pre=document.createElement('style');pre.id='rt-motion-preflight';
    pre.textContent='html.rt-motion-prep #monthly-profitability-svg{opacity:0!important}#monthly-profitability-svg{transition:opacity 120ms cubic-bezier(.22,.61,.36,1)}@media(prefers-reduced-motion:reduce){html.rt-motion-prep #monthly-profitability-svg{opacity:1!important}#monthly-profitability-svg{transition:none!important}}';
    document.head.appendChild(pre);
  }

  /* Keep the Sales chart at its final responsive dimensions from first paint so
     production gets the same zero-shift desktop/tablet/mobile handoff as staging. */
  if(!document.getElementById('rt-sales-layout-preflight')){
    var salesPre=document.createElement('style');salesPre.id='rt-sales-layout-preflight';
    salesPre.textContent='\
#p-monthly .monthly-charts-row{align-items:start!important}\
#p-monthly .monthly-profitability-card{align-self:start!important;position:relative}\
#p-monthly #monthly-profitability-svg{flex:0 0 auto!important;min-height:0!important;max-height:none!important;height:clamp(285px,26vw,350px)!important}\
@media(min-width:861px){#p-monthly .monthly-charts-row{grid-template-columns:minmax(0,1.72fr) minmax(310px,.92fr)!important}}\
@media(max-width:860px){#p-monthly .monthly-charts-row{grid-template-columns:minmax(0,1fr)!important;gap:14px!important}#p-monthly #monthly-profitability-svg{height:clamp(280px,39vw,360px)!important}}\
@media(max-width:700px){#p-monthly .monthly-charts-row{gap:12px!important}#p-monthly #monthly-profitability-svg{height:clamp(225px,62vw,280px)!important}}\
@media(max-width:430px){#p-monthly #monthly-profitability-svg{height:clamp(220px,68vw,255px)!important}}';
    document.head.appendChild(salesPre);
  }

  function markMotionReady(reason){
    if(motionReady)return;
    motionReady=true;
    window.__rtMotionStackReady=true;
    document.documentElement.classList.remove('rt-motion-prep');
    try{window.dispatchEvent(new CustomEvent('retrade:motion-ready',{detail:{reason:reason||'ready'}}));}catch(_){}
  }

  function append(src,priority,onload,onerror){
    var s=document.createElement('script');
    s.src=src+'?v='+v;
    s.async=false;
    try{s.fetchPriority=priority||'auto';}catch(_){}
    if(onload)s.onload=onload;
    s.onerror=function(){
      console.error('[RETRADE] startup script failed:',src);
      if(src==='./src/core/application.js'&&typeof window.__rtLaunchFailed==='function')window.__rtLaunchFailed();
      if(src==='./src/platform/launch.js')document.documentElement.classList.remove('rt-app-cold');
      if(src==='./src/platform/interface-motion.js')markMotionReady('motion-system-error');
      if(onerror)onerror();
    };
    document.head.appendChild(s);
    return s;
  }

  function loadEnhancements(){
    /* Only presentation code needed for the first Dashboard frame is allowed to
       compete with the welcome handoff. Everything else is deferred until after
       the first reveal so iOS does not parse/evaluate dozens of unrelated
       account, export and Sales modules while animating the Dashboard. */
    var critical=assets.critical.map(function(path){return "./"+path;});
    var files=assets.deferred.map(function(path){return "./"+path;});
    function loadDeferred(){
      if(loadDeferred.started)return;
      loadDeferred.started=true;
      var index=0;
      function next(){
        if(index>=files.length){window.__rtFeaturesReady=true;return;}
        // Preserve dependency order while allowing a paint between modules.
        // Login may start a new reveal while this queue is in progress.
        if(!window.__rtLaunchSettled){setTimeout(next,180);return;}
        var run=function(){
          if(!window.__rtLaunchSettled){setTimeout(next,180);return;}
          var src=files[index++];
          append(src,'low',schedule,schedule);
        };
        if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:600});
        else setTimeout(run,32);
      }
      function schedule(){requestAnimationFrame(next);}
      schedule();
    }
    window.addEventListener('retrade:launch-settled',loadDeferred,{once:true});
    critical.forEach(function(src,index){
      append(src,index<3?'auto':'low',index===critical.length-1?function(){
        markMotionReady('critical-stack-loaded');
        if(window.__rtLaunchSettled)loadDeferred();
      }:null);
    });
  }

  append('./src/platform/launch.js','high');
  function startCore(){
    function boot(){append('./'+assets.core,'high',function(){
    try{if(typeof window.__rtInstallLaunchCoreHooks==='function')window.__rtInstallLaunchCoreHooks();}catch(_){}
    /* Cold start prioritises spatial stability over an intermediate legacy/core
       paint. Queue all presentation/layout owners immediately; the launch gate
       keeps the single real-layout skeleton visible until they have settled. */
    loadEnhancements();
    });}
    function bindingAt(index){
      if(index===assets.bindings.length){
        if(assets.environment==='staging'&&!window.__RETRADE_STAGING__){window.__rtLaunchFailed();return;}
        boot();return;
      }
      append('./'+assets.bindings[index],'high',function(){bindingAt(index+1);},function(){window.__rtLaunchFailed();});
    }
    bindingAt(0);
  }
  /* Fetch the large core while the shield moves, but evaluate it after the
     shield/wordmark choreography. Parsing 1.6 MB on the same main thread as
     that animation can compete for its frames on desktop hard refresh. */
  var corePreload=document.createElement('link');
  corePreload.rel='preload';corePreload.as='script';corePreload.href='./src/core/application.js?v='+v;
  document.head.appendChild(corePreload);
  var elapsed=performance.now()-(window.__rtLaunchSourceAt||0);
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(startCore,reduce?0:Math.max(0,1750-elapsed));
})();
