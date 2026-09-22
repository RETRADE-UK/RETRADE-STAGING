/* RETRADE skeleton/data exclusivity — v1.5.21
 *
 * Hard presentation invariant for top-level loading states:
 * skeleton and real numeric data must never be visible at the same time.
 *
 * Existing page loaders still own geometry, dwell and reveal timing. This layer
 * is deliberately CSS-first so renderer timing, late DOM writes or page-specific
 * markup cannot leak a KPI/headline number through a skeleton.
 * Presentation only: no data, accounting, lifecycle, sync or persistence writes.
 */
(function(){
  'use strict';
  if(window.__rtSkeletonTruth1511)return;
  window.__rtSkeletonTruth1511=true;

  function installStyles(){
    if(document.getElementById('rt-skeleton-truth-1511-style'))return;
    var s=document.createElement('style');
    s.id='rt-skeleton-truth-1511-style';
    s.textContent='\
/* Main-page real-layout loader + Sales same-route loader. */\
.page.rt-main-loading1506 :is(\
  .kpi-value,.kpi .num,.kpi [class*="value"],\
  [class*="kpi"] .num,[class*="metric"] .num,[class*="metric"] [class*="value"],\
  [class*="summary"] .num,[class*="summary"] [class*="value"],\
  [class*="headline"] .num,[class*="headline"] [class*="value"],\
  [class*="total"] .num,[class*="total"] [class*="value"],\
  [class*="balance"] .num,[class*="balance"] [class*="value"],\
  [class*="stat"] .num,[class*="stat"] [class*="value"],\
  .rt-cash-primary-value,.rt-cash-meta-value,.rt-cash-flow-card strong,.rt-cash-stock-card strong\
),\
#p-monthly.rt-sales-route-loading1509 :is(\
  .kpi-value,.kpi .num,.kpi [class*="value"],\
  [class*="kpi"] .num,[class*="metric"] .num,[class*="summary"] .num,\
  [class*="headline"] .num,[class*="total"] .num,[class*="stat"] .num,\
  .num[class*="value"],[class*="value"].num\
){\
  color:transparent!important;\
  -webkit-text-fill-color:transparent!important;\
  text-shadow:none!important;\
  caret-color:transparent!important;\
}\
/* If a primary number escaped the scanner, make its own footprint visibly part\
   of the skeleton rather than leaving a suspicious blank or live value. */\
.page.rt-main-loading1506 :is(\
  .kpi-value,.kpi>.num,[class*="kpi"]>[class*="value"],\
  .rt-cash-primary-value,.rt-cash-meta-value\
):not(.rt-main-skel-value1506):not(.rt-sales-route-skel1509),\
#p-monthly.rt-sales-route-loading1509 :is(\
  .kpi-value,.kpi>.num,[class*="kpi"]>[class*="value"]\
):not(.rt-main-skel-value1506):not(.rt-sales-route-skel1509){\
  background:color-mix(in srgb,var(--surface2) 78%,var(--border))!important;\
  border-radius:6px!important;\
  box-shadow:none!important;\
}\
/* Dashboard cold/refresh loading follows the same truth-only rule. */\
body.rt-real-layout-loading #p-summary :is(\
  .kpi-value,.kpi .num,[class*="kpi"] .num,[class*="metric"] .num,\
  [class*="summary"] .num,[class*="headline"] .num,[class*="total"] .num,[class*="stat"] .num\
){\
  color:transparent!important;\
  -webkit-text-fill-color:transparent!important;\
  text-shadow:none!important;\
}\
@media(prefers-reduced-motion:reduce){\
  .page.rt-main-loading1506 :is(.kpi-value,.kpi .num,[class*="kpi"] .num),\
  #p-monthly.rt-sales-route-loading1509 :is(.kpi-value,.kpi .num,[class*="kpi"] .num){transition:none!important;}\
}';
    document.head.appendChild(s);
  }

  /* The loaders dispatch reveal events only after removing their loading class.
     Reasserting this invariant on those boundaries protects against a future
     component renderer adding an inline colour while loading. */
  function enforce(page){
    if(!page)return;
    var loading=page.classList.contains('rt-main-loading1506')||
      page.classList.contains('rt-sales-route-loading1509');
    page.toggleAttribute('data-rt-skeleton-exclusive1511',loading);
  }

  function installObservers(){
    Array.prototype.forEach.call(document.querySelectorAll('.page'),function(page){
      enforce(page);
      try{
        var o=new MutationObserver(function(){enforce(page);});
        o.observe(page,{attributes:true,attributeFilter:['class']});
      }catch(_){}
    });
  }

  installStyles();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installObservers,{once:true});
  else installObservers();
  console.info('[RETRADE] v1.5.21 skeleton/data exclusivity loaded');
})();