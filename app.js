/* RETRADE staging entrypoint — production v1.5.51 candidate + isolated gesture layer G1.
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
  var v='20260922-v1551-staging-g1';
  window.__rtBuildId=v;
  var motionReady=false;
  var motionFallbackTimer=0;

  window.__rtMotionStackReady=false;
  document.documentElement.classList.add('rt-app-cold','rt-motion-prep');

  if(!document.getElementById('rt-skeleton-motion-polish-1512')){
    var skelCss=document.createElement('link');skelCss.id='rt-skeleton-motion-polish-1512';skelCss.rel='stylesheet';skelCss.href='./skeleton-motion-polish-v1512.css?v='+v;document.head.appendChild(skelCss);
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
    if(motionFallbackTimer){clearTimeout(motionFallbackTimer);motionFallbackTimer=0;}
    document.documentElement.classList.remove('rt-motion-prep');
    try{window.dispatchEvent(new CustomEvent('retrade:motion-ready',{detail:{reason:reason||'ready'}}));}catch(_){}
  }

  motionFallbackTimer=setTimeout(function(){motionFallbackTimer=0;markMotionReady('fallback');},3000);
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

  function loadEnhancements(gestureManifest){
    /* Only presentation code needed for the first Dashboard frame is allowed to
       compete with the welcome handoff. Everything else is deferred until after
       the first reveal so iOS does not parse/evaluate dozens of unrelated
       account, export and Sales modules while animating the Dashboard. */
    var critical=[
      './performance-system.js',
      './navigation-stability.js',
      './app-lifecycle.js',
      './chart-polish.js',
      './chart-motion.js',
      './chart-finalize.js',
      './chart-reveal.js',
      './motion-system.js'
    ];
    var files=[
      
      
      
      './sales-defaults.js',
      './bundle-orders.js',
      './bundle-panel.js',
      './bundle-row-polish.js',
      './cashflow-liabilities.js',
      './relist-fee-integrity.js',
      './account-detail-stability.js',
      './cashflow-dashboard-v2.js',
      './cashflow-movement-card-polish.js',
      './cashflow-performance-v1509.js',
      './partner-item-navigation.js',
      './partner-actions-v2.js',
      './partner-statement-action.js',
      './partner-account-ui-v3.js',
      './partner-account-ui-v4.js',
      './partner-account-cleanup.js',
      './partner-row-menu-popover.js',
      './item-account-adjustments.js',
      './partner-arrangements-v2.js',
      './partner-account-finalise.js',
      './partner-account-legacy-hero-cleanup.js',
      './partner-account-adjustments.js',
      './partner-account-adjustments-hardening.js',
      './partner-payment-allocations-v2.js',
      './partner-account-transaction-ui.js',
      './partner-transaction-breakdown-guard.js',
      './partner-collapse-defaults.js',
      './accounts-operations-dashboard.js',
      './accounts-sort-polish.js',
      './accounts-operations-compact-v2.js',
      './partner-account-experience-v2.js',
      './partner-page-unified-v1503.js',
      './sales-calendar-layout-v1530.js',
      './document-exports.js',
      
      
      
      
      './sales-chart-sequence.js',
      './chart-forecast-sequence.js',
      
    ];

    /* Staging-only gesture experiments are declared in one manifest rather than
       being mixed into the production runtime list. Preserve the dependency
       positions used by the gesture prototype without changing production files. */
    gestureManifest=gestureManifest&&typeof gestureManifest==='object'?gestureManifest:{};
    var early=Array.isArray(gestureManifest.early)?gestureManifest.early:[];
    var charts=Array.isArray(gestureManifest.charts)?gestureManifest.charts:[];
    var appLifeAt=critical.indexOf('./app-lifecycle.js');
    if(appLifeAt<0)appLifeAt=2;
    if(early.length)critical.splice.apply(critical,[appLifeAt,0].concat(early));
    var chartRevealAt=critical.indexOf('./chart-reveal.js');
    if(chartRevealAt<0)chartRevealAt=critical.length-1;
    if(charts.length)critical.splice.apply(critical,[chartRevealAt,0].concat(charts));

    function loadDeferred(){
      var run=function(){
        files.forEach(function(src){append(src,'low');});
      };
      try{if('requestIdleCallback' in window){requestIdleCallback(run,{timeout:1600});return;}}catch(_){}
      setTimeout(run,650);
    }
    critical.forEach(function(src,index){
      append(src,index<3?'auto':'low',index===critical.length-1?function(){
        markMotionReady('critical-stack-loaded');
        /* Let the welcome -> Dashboard transition own the next frames. */
        setTimeout(loadDeferred,520);
      }:null);
    });
  }

  append('./launch-experience.js','high');
  append('./staging-supabase.js','high',function(){
    append('./app-core.js','high',function(){
      try{if(typeof window.__rtInstallLaunchCoreHooks==='function')window.__rtInstallLaunchCoreHooks();}catch(_){}
      append('./staging-dev-auth.js','high');
      append('./staging-gestures.js','low',function(){
        /* Cold start is otherwise identical to production. The only product
           behaviour delta is the explicit staging gesture manifest. */
        loadEnhancements(window.__rtStagingGestureManifest||{});
      });
    });
  });
})();