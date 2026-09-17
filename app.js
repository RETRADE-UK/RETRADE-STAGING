/* RETRADE app entrypoint.
 *
 * Cold-start is intentionally staged:
 *   1) launch coordinator + production core
 *   2) give the browser one real paint opportunity
 *   3) load feature/presentation refinements in deterministic order
 *   4) let presentation layers enhance the already-usable app when ready
 *
 * Data/render readiness owns the loading handoff. Motion is progressive
 * enhancement and must never sit on the critical path to usable UI.
 */
(function(){
  'use strict';
  var v='20260917-v3110';
  var motionReady=false;
  var motionFallbackTimer=0;

  window.__rtMotionStackReady=false;
  document.documentElement.classList.add('rt-app-cold','rt-motion-prep');

  (function installMotionTokens(){
    if(document.getElementById('rt-motion-token-preflight'))return;
    var s=document.createElement('style');s.id='rt-motion-token-preflight';
    s.textContent=':root{--ease-spring:cubic-bezier(.22,.61,.36,1);--dur-draw:580ms;--dur-donut-sweep:420ms;--dur-bounce:160ms;}';
    document.head.appendChild(s);
  })();

  /* This lands before app-core paints the Sales chart, so its responsive box is
     correct on first render rather than changing size when late enhancements load. */
  (function installSalesLayoutPreflight(){
    if(document.getElementById('rt-sales-layout-preflight'))return;
    var s=document.createElement('style');s.id='rt-sales-layout-preflight';
    s.textContent='\
#p-monthly .monthly-charts-row{align-items:start!important}\
#p-monthly .monthly-profitability-card{align-self:start!important;position:relative}\
#p-monthly #monthly-profitability-svg{flex:0 0 auto!important;min-height:0!important;max-height:none!important;height:clamp(285px,26vw,350px)!important}\
@media(min-width:861px){#p-monthly .monthly-charts-row{grid-template-columns:minmax(0,1.72fr) minmax(310px,.92fr)!important}}\
@media(max-width:860px){#p-monthly .monthly-charts-row{grid-template-columns:minmax(0,1fr)!important;gap:14px!important}#p-monthly #monthly-profitability-svg{height:clamp(280px,39vw,360px)!important}}\
@media(max-width:700px){#p-monthly .monthly-charts-row{gap:12px!important}#p-monthly #monthly-profitability-svg{height:clamp(225px,62vw,280px)!important}}\
@media(max-width:430px){#p-monthly #monthly-profitability-svg{height:clamp(220px,68vw,255px)!important}}';
    document.head.appendChild(s);
  })();

  function markMotionReady(reason){
    if(motionReady)return;
    motionReady=true;
    window.__rtMotionStackReady=true;
    if(motionFallbackTimer){clearTimeout(motionFallbackTimer);motionFallbackTimer=0;}
    document.documentElement.classList.remove('rt-motion-prep');
    try{window.dispatchEvent(new CustomEvent('retrade:motion-ready',{detail:{reason:reason||'ready'}}));}catch(_){}
  }

  motionFallbackTimer=setTimeout(function(){motionFallbackTimer=0;markMotionReady('fallback');},2200);
  setTimeout(function(){
    if(!document.body||!document.body.classList.contains('rt-real-layout-loading'))document.documentElement.classList.remove('rt-app-cold');
  },5000);

  function append(src,priority,onload){
    var s=document.createElement('script');
    s.src=src+'?v='+v;
    s.async=false;
    try{s.fetchPriority=priority||'auto';}catch(_){}
    if(onload)s.onload=onload;
    s.onerror=function(){
      console.error('[RETRADE] startup script failed:',src);
      if(src==='./launch-experience.js')document.documentElement.classList.remove('rt-app-cold');
      if(src==='./motion-system.js')markMotionReady('motion-system-error');
    };
    document.head.appendChild(s);
    return s;
  }

  function loadEnhancements(){
    var files=[
      './performance-system.js',
      './navigation-stability.js',
      './accounts-performance.js',
      './gesture-back-v31.js',
      './gesture-native-v3.js',
      './gesture-native-v3-actions.js',
      './gesture-live-tracking.js',
      './interaction-system-v2.js',
      './surface-gestures-v2.js',
      './sales-defaults.js',
      './bundle-orders.js',
      './bundle-panel.js',
      './bundle-row-polish.js',
      './cashflow-liabilities.js',
      './relist-fee-integrity.js',
      './account-detail-stability.js',
      './partner-item-navigation.js',
      './item-account-adjustments.js',
      './chart-polish.js',
      './chart-motion.js',
      './chart-finalize.js',
      './chart-gesture-v2.js',
      './chart-reveal.js',
      './sales-chart-sequence.js',
      './chart-forecast-sequence.js',
      './motion-system.js'
    ];
    files.forEach(function(src,index){
      append(src,index<9?'auto':'low',index===files.length-1?function(){markMotionReady('stack-loaded');}:null);
    });
  }

  append('./launch-experience.js','high');
  append('./staging-supabase.js','high',function(){
    append('./app-core.js','high',function(){
      try{if(typeof window.__rtInstallLaunchCoreHooks==='function')window.__rtInstallLaunchCoreHooks();}catch(_){}
      append('./staging-dev-auth.js','high');
      requestAnimationFrame(function(){loadEnhancements();});
    });
  });
})();