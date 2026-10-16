/* RETRADE chart final presentation pass v1.4.44
 * Loaded after src/features/charts/motion.js.
 *
 * Small visual corrections only:
 * - Current FY keeps the dashboard current-month forecast shell; other dashboard ranges stay actual-only.
 * - Current FY actuals and month-end forecast share one hover/touch readout.
 * - 30-day daily bars keep extra breathing room and quieter outlines on small screens.
 * - Refund legend remains a true event dot.
 * - Sales actuals and forecast share the contained readout; dotted projections and hollow endpoints remain.
 *
 * Accounting, sync, inventory lifecycle and persisted data are untouched.
 */
(function(){
  'use strict';

  if(typeof _renderChartInto!=='function')return;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function periodKey(){
    try{if(typeof SUMMARY_PERIOD!=='undefined')return String(SUMMARY_PERIOD||'').toLowerCase();}catch(_){}
    return '';
  }
  function selectedSummaryText(){
    var el=document.getElementById('summary-period-select')||document.querySelector('#p-summary select.period-select-inline,#p-summary select');
    if(!el)return '';
    try{return String(el.options[el.selectedIndex].text||'').toLowerCase();}catch(_){return '';}
  }
  function isCurrentFY(){
    var p=periodKey().replace(/[\s_-]+/g,'');
    if(p==='fy'||p==='currentfy'||p==='fiscalyear'||p==='currentfiscalyear'||p==='financialyear'||p==='currentfinancialyear')return true;
    return /\bcurrent\s+fy\b|\bcurrent\s+fiscal\s+year\b|\bcurrent\s+financial\s+year\b/.test(selectedSummaryText());
  }
  function isLast30Days(){
    var p=periodKey().replace(/[\s_-]+/g,'');
    if(p==='30d'||p==='30days'||p==='last30d'||p==='last30days')return true;
    return /last\s+30\s+days/.test(selectedSummaryText());
  }
  function isDashboardBars(opts){
    return !!(opts&&opts.primaryBars&&opts.secondaryBarsInPrimary&&opts.primaryLabel==='Gross Revenue'&&opts.secondaryLabel==='Gross Profit');
  }
  function isSalesChart(svgEl,opts){
    return !!(svgEl&&svgEl.id==='monthly-profitability-svg'&&opts&&opts.primaryLabel==='Net Revenue'&&opts.secondaryLabel==='Net Profit');
  }

  function installStyles(){
    var ids=['rt-chart-finalize-v1442','rt-chart-finalize-v1443','rt-chart-finalize-v1444'];
    ids.forEach(function(id){var old=document.getElementById(id);if(old)old.remove();});
    var s=document.createElement('style');s.id='rt-chart-finalize-v1444';
    s.textContent='\
/* Refunds are discrete events: keep the legend language identical to the chart. */\
#p-summary .summary-chart-legend .rt-refund-legend-dot,\
#p-summary .summary-chart-legend .legend-event-mark,\
#p-summary .summary-chart-legend .legend-dot--refund{\
 display:inline-block!important;width:7px!important;height:7px!important;min-width:7px!important;min-height:7px!important;\
 padding:0!important;border:0!important;border-top:0!important;border-radius:50%!important;\
 background:var(--red)!important;background-color:var(--red)!important;box-shadow:inset 0 0 0 4px var(--red)!important;\
 opacity:.92!important;transform:none!important;box-sizing:border-box!important;\
}\
/* Dense daily view: preserve the blue/green hierarchy without the outlines touching visually. */\
#p-summary svg.rt-dense-daily-bars .rt-chart-primary-bar:not(.rt-chart-profit-bar){stroke-width:.65!important;stroke-opacity:.52!important;}\
#p-summary svg.rt-dense-daily-bars .rt-chart-profit-bar{stroke-width:.5!important;stroke-opacity:.44!important;}\
/* Forecast labels stay out of the plot until the user asks for them. */\
#p-summary .rt-chart-forecast-label{display:none!important;}\
/* Sales projection: dotted continuation + hollow destination points do the visual work. */\
#p-monthly .rt-sales-forecast-layer .rt-sales-actual-dot{display:none!important;}';
    document.head.appendChild(s);
  }

  function fixRefundLegend(){
    var items=document.querySelectorAll('#p-summary .summary-chart-legend .legend-item');
    Array.prototype.forEach.call(items,function(item){
      if(!/refund/i.test(String(item.textContent||'')))return;
      var marker=item.firstElementChild;
      if(marker)marker.classList.add('rt-refund-legend-dot');
    });
  }

  function shrinkAroundCentre(rect,factor,minWidth){
    if(!rect)return;
    var w=num(rect.getAttribute('width')),x=num(rect.getAttribute('x'));
    if(w<=0)return;
    var nw=Math.max(minWidth,w*factor);
    if(nw>=w-.05)return;
    rect.setAttribute('x',(x+(w-nw)/2).toFixed(2));
    rect.setAttribute('width',nw.toFixed(2));
    var rx=num(rect.getAttribute('rx'));
    if(rx>0)rect.setAttribute('rx',Math.min(rx,nw*.18).toFixed(2));
  }

  function tuneDenseDailyBars(svgEl,active){
    if(!svgEl)return;
    svgEl.classList.toggle('rt-dense-daily-bars',!!active);
    if(!active)return;
    Array.prototype.forEach.call(svgEl.querySelectorAll('.rt-chart-primary-bar:not(.rt-chart-profit-bar)'),function(rect){
      shrinkAroundCentre(rect,.80,7.8);
    });
    Array.prototype.forEach.call(svgEl.querySelectorAll('.rt-chart-profit-bar'),function(rect){
      shrinkAroundCentre(rect,.78,4.8);
    });
  }

  function cleanDashboardForecast(svgEl){
    if(!svgEl)return;
    // Dashboard actuals and the numeric forecast share the HTML scrub readout.
    // A separate SVG label can be covered by that readout or clipped by the card.
    Array.prototype.forEach.call(svgEl.querySelectorAll('.rt-chart-forecast-label,.rt-dashboard-hover-forecast'),function(el){el.remove();});
  }

  function cleanSalesForecast(svgEl){
    if(!svgEl)return;
    // The shared HTML card is the sole readout for both mouse and touch.
    Array.prototype.forEach.call(svgEl.querySelectorAll('.rt-sales-actual-dot,.rt-sales-forecast-label,.rt-sales-range-label,.rt-sales-hover-forecast,.rt-sales-forecast-layer title,.rt-chart-col title'),function(el){el.remove();});
  }

  function withForecastSignal(fn){
    var changed=false,previous;
    try{
      if(typeof SUMMARY_PERIOD!=='undefined'){
        previous=SUMMARY_PERIOD;
        SUMMARY_PERIOD='cy';
        changed=true;
      }
    }catch(_){}
    try{return fn();}
    finally{
      if(changed){try{SUMMARY_PERIOD=previous;}catch(_){} }
    }
  }

  installStyles();
  fixRefundLegend();

  var _renderBeforeFinalize=_renderChartInto;
  _renderChartInto=function(svgEl,labels,revData,profitData,handlers,opts){
    var dashboard=isDashboardBars(opts);
    if(dashboard){
      var fy=isCurrentFY(),dense30=isLast30Days(),nextOpts=Object.assign({},opts),out;
      if(fy){
        /* chart-polish uses current_fy to project the remainder of September;
           chart-motion currently keys forecast permission from the CY signal,
           so the signal is scoped to this render only. */
        nextOpts.partialLast=true;
        nextOpts.drawKey='current_fy';
        out=withForecastSignal(function(){
          return _renderBeforeFinalize.call(this,svgEl,labels,revData,profitData,handlers,nextOpts);
        }.bind(this));
        cleanDashboardForecast(svgEl);
      }else{
        nextOpts.partialLast=false;
        out=_renderBeforeFinalize.call(this,svgEl,labels,revData,profitData,handlers,nextOpts);
      }
      tuneDenseDailyBars(svgEl,dense30&&labels&&labels.length>=24);
      fixRefundLegend();
      return out;
    }

    var result=_renderBeforeFinalize.apply(this,arguments);
    if(isSalesChart(svgEl,opts))cleanSalesForecast(svgEl);
    return result;
  };

  /* Handles the rare case where a chart was rendered immediately before this final layer loaded. */
  requestAnimationFrame(function(){
    fixRefundLegend();
    var sales=document.getElementById('monthly-profitability-svg');if(sales)cleanSalesForecast(sales);
    var dash=document.getElementById('summary-chart-svg-mobile')||document.getElementById('summary-chart-svg');if(dash&&isCurrentFY())cleanDashboardForecast(dash);
  });
})();
