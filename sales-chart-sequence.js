/* RETRADE Sales yearly chart sequence v3.1 (v1.4.67)
 *
 * One presentation owner for the Sales yearly chart.
 *
 * Premium-motion goals:
 * - useful chart geometry is ready immediately; animation never gates data
 * - all three history series draw on one shared timeline
 * - point markers appear only after the drawing line reaches their month
 * - current-month forecast follows as a synchronized dash-by-dash second act
 * - forecast hover/touch value stays readable above chart interaction layers
 * - incidental data refreshes settle in place instead of replaying the show
 * - no perpetual requestAnimationFrame loop; browser-owned WAAPI handles paths
 * - reduced-motion settles the finished chart immediately
 *
 * No accounting, forecast calculation, sync, lifecycle or persisted data.
 */
(function(){
  'use strict';

  if(typeof _renderChartInto!=='function'){
    window.__rtSalesSequenceArmed=false;
    return;
  }

  var EASE='cubic-bezier(.22,.61,.36,1)';
  var START_DELAY=35;
  var HISTORY_MIN=480;
  var HISTORY_MAX=760;
  var HISTORY_PER_MONTH=55;
  var POINT_LAG=12;
  var FORECAST_GAP=65;
  var DASH_STEP=38;
  var DASH_MAX=360;
  var ENDPOINT_GAP=45;
  var ENDPOINT_MS=165;
  var active=null;
  var pendingBootListener=null;
  var serial=0;
  var lastAnimatedKey='';

  window.__rtSalesChartSequence=window.__rtSalesChartSequence||{};
  var diag=window.__rtSalesChartSequence;
  diag.version='3.1';
  window.__rtSalesSequenceArmed=true;

  function reduced(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }
  function visible(svg){
    if(!svg||!svg.isConnected)return false;
    var r;try{r=svg.getBoundingClientRect();}catch(_){r=null;}
    return !!(r&&r.width>80&&r.height>80);
  }
  function bootHolding(){
    var body=document.body;
    return !!(body&&body.classList.contains('rt-real-layout-loading')&&!body.classList.contains('rt-real-layout-revealing'));
  }
  function isSales(svg,opts){
    return !!(svg&&svg.id==='monthly-profitability-svg'&&opts&&opts.primaryLabel==='Net Revenue'&&opts.secondaryLabel==='Net Profit');
  }
  function routeKey(){
    var period='',view='',replay=window.__rtSalesMotionReplayToken||0;
    try{period=String(typeof MONTHLY_PERIOD!=='undefined'?MONTHLY_PERIOD:'');}catch(_){}
    try{view=String(typeof MONTHLY_VIEW!=='undefined'?MONTHLY_VIEW:'');}catch(_){}
    return period+'|'+view+'|'+String(replay);
  }
  function chartColumns(svg){
    return Array.prototype.slice.call(svg.querySelectorAll('.rt-chart-col[data-idx]')).sort(function(a,b){
      return (Number(a.getAttribute('data-idx'))||0)-(Number(b.getAttribute('data-idx'))||0);
    });
  }
  function historyPaths(svg){
    return Array.prototype.slice.call(svg.querySelectorAll('path.rt-chart-line')).filter(function(path){
      if(path.closest('.rt-chart-partial-group'))return false;
      try{return path.getTotalLength()>8;}catch(_){return false;}
    });
  }

  function installStyles(){
    ['rt-sales-sequence-v2-css','rt-sales-sequence-v3-css','rt-sales-sequence-v31-css','rt-sales-forecast-hard-gate-css','rt-line-motion-v1455'].forEach(function(id){var n=document.getElementById(id);if(n)n.remove();});
    var s=document.createElement('style');s.id='rt-sales-sequence-v31-css';
    s.textContent='\
/* Sales layout: keep the plot wide on desktop, stack before it becomes cramped, and give each viewport a deliberate chart height. */\
#p-monthly .monthly-charts-row{align-items:start!important}\
#p-monthly .monthly-profitability-card{align-self:start!important;position:relative}\
#p-monthly #monthly-profitability-svg{flex:0 0 auto!important;min-height:0!important;max-height:none!important;height:clamp(285px,26vw,350px)!important}\
@media(min-width:1040px){#p-monthly .monthly-charts-row{grid-template-columns:minmax(0,1.72fr) minmax(310px,.92fr)!important}}\
@media(max-width:1039px){\
 #p-monthly .monthly-charts-row{grid-template-columns:minmax(0,1fr)!important;gap:14px!important}\
 #p-monthly #monthly-profitability-svg{height:clamp(280px,39vw,360px)!important}\
}\
@media(max-width:700px){\
 #p-monthly .monthly-charts-row{gap:12px!important}\
 #p-monthly #monthly-profitability-svg{height:clamp(225px,62vw,280px)!important}\
}\
@media(max-width:430px){#p-monthly #monthly-profitability-svg{height:clamp(220px,68vw,255px)!important}}\
/* Sequence owns the history paths so older generic chart animations cannot leave a line hidden. */\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-history-line{opacity:1!important;visibility:visible!important;animation:none!important;transition:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence{--rt-sales-point-ms:135ms}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-history-point{opacity:0!important;visibility:hidden!important;transform:scale(.92)!important;transform-box:fill-box;transform-origin:center;animation:none!important;transition:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-history-point.rt-sales-point-on{opacity:1!important;visibility:visible!important;transform:scale(1)!important;transition:opacity var(--rt-sales-point-ms) ease-out,transform var(--rt-sales-point-ms) '+EASE+'!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-group{visibility:hidden!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence.rt-sales-forecast-stage .rt-chart-partial-group{visibility:visible!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-dash{opacity:0!important;animation:none!important;transition:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-dash.rt-sales-dash-on{opacity:1!important;transition:opacity 80ms ease-out!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-dot{opacity:0!important;visibility:hidden!important;animation:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-actual-dot{opacity:0!important;transform:scale(.94)!important;transform-box:fill-box;transform-origin:center;animation:none!important;transition:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence.rt-sales-forecast-stage .rt-sales-actual-dot{opacity:1!important;transform:scale(1)!important;transition:opacity 135ms ease-out,transform 135ms '+EASE+'!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-forecast-ring,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-forecast-label,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-range-label{opacity:0!important;visibility:hidden!important;animation:none!important;transition:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-forecast-ring{transform:scale(.94)!important;transform-box:fill-box;transform-origin:center}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence.rt-sales-endpoint-stage .rt-sales-forecast-ring,#p-monthly #monthly-profitability-svg.rt-sales-sequence.rt-sales-endpoint-stage .rt-sales-forecast-label,#p-monthly #monthly-profitability-svg.rt-sales-sequence.rt-sales-endpoint-stage .rt-sales-range-label{opacity:1!important;visibility:visible!important;transform:scale(1)!important;transition:opacity '+ENDPOINT_MS+'ms ease-out,transform '+ENDPOINT_MS+'ms '+EASE+'!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-so-far{opacity:0!important;transition:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence.rt-sales-forecast-stage .rt-chart-so-far{opacity:.72!important;transition:opacity 130ms ease-out!important}\
/* Forecast value sits in an HTML layer above SVG scrub/data labels, so it cannot be covered at Sep. */\
#p-monthly .monthly-profitability-card .rt-sales-forecast-popover{position:absolute;z-index:45;display:inline-flex;align-items:center;justify-content:center;max-width:calc(100% - 28px);padding:7px 10px;border:1px solid var(--border);border-radius:9px;background:var(--surface-1,#fff);color:var(--text-secondary);box-shadow:0 8px 24px rgba(15,23,42,.13);font-family:var(--font-body);font-size:11px;font-weight:650;line-height:1.15;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;opacity:0;visibility:hidden;transform:translateY(-3px);transition:opacity 120ms ease-out,transform 120ms '+EASE+',visibility 120ms}\
#p-monthly .monthly-profitability-card .rt-sales-forecast-popover.is-visible{opacity:1;visibility:visible;transform:translateY(0)}\
@media(max-width:600px){#p-monthly .monthly-profitability-card .rt-sales-forecast-popover{font-size:10.5px;padding:6px 9px;max-width:calc(100% - 20px)}}\
@media(prefers-reduced-motion:reduce){\
 #p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-history-point,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-dash,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-actual-dot,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-forecast-ring,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-forecast-label,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-range-label,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-dot{opacity:1!important;visibility:visible!important;transform:none!important;transition:none!important}\
 #p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-group{visibility:visible!important}\
 #p-monthly .monthly-profitability-card .rt-sales-forecast-popover{transition:none}\
}\
';
    document.head.appendChild(s);
  }
  installStyles();

  function addTimer(session,fn,delay){
    var id=setTimeout(function(){
      var i=session.timers.indexOf(id);if(i>=0)session.timers.splice(i,1);
      if(!session.cancelled)fn();
    },Math.max(0,delay||0));
    session.timers.push(id);return id;
  }
  function cancelPendingBoot(){
    if(!pendingBootListener)return;
    try{window.removeEventListener('retrade:boot-reveal',pendingBootListener);}catch(_){}
    pendingBootListener=null;
  }
  function cancel(session){
    if(!session)return;
    session.cancelled=true;
    (session.timers||[]).forEach(clearTimeout);session.timers=[];
    (session.animations||[]).forEach(function(a){try{a.cancel();}catch(_){}});session.animations=[];
  }
  function cleanupPath(path){
    if(!path||!path.isConnected)return;
    path.style.removeProperty('stroke-dasharray');
    path.style.removeProperty('stroke-dashoffset');
  }
  function settle(svg){
    if(!svg)return;
    svg.classList.add('rt-sales-sequence','rt-sales-forecast-stage','rt-sales-endpoint-stage','rt-sales-sequence-complete');
    svg.classList.remove('rt-sales-history-stage');
    historyPaths(svg).forEach(function(path){
      path.classList.add('rt-sales-history-line');
      try{path.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
      cleanupPath(path);
    });
    Array.prototype.forEach.call(svg.querySelectorAll('.rt-sales-history-point'),function(c){c.classList.add('rt-sales-point-on');});
    Array.prototype.forEach.call(svg.querySelectorAll('.rt-chart-partial-dash'),function(d){d.classList.add('rt-sales-dash-on');});
    var rings=svg.querySelectorAll('.rt-sales-forecast-ring');
    if(!rings.length){Array.prototype.forEach.call(svg.querySelectorAll('.rt-chart-partial-dot'),function(d){d.style.visibility='visible';d.style.opacity='1';});}
  }
  function primePath(path){
    if(!path||!path.isConnected)return;
    path.classList.add('rt-sales-history-line');
    try{path.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
    var len=0;try{len=path.getTotalLength();}catch(_){len=0;}
    if(!(len>8))return;
    path.style.strokeDasharray=len.toFixed(2)+'px '+len.toFixed(2)+'px';
    path.style.strokeDashoffset=len.toFixed(2)+'px';
  }
  function prepare(svg){
    svg.classList.add('rt-sales-sequence','rt-sales-history-stage');
    svg.classList.remove('rt-sales-forecast-stage','rt-sales-endpoint-stage','rt-sales-sequence-complete');
    var columns=chartColumns(svg);
    var partial=svg.querySelector('.rt-chart-partial-group');
    var historyColumns=partial&&columns.length>1?columns.slice(0,-1):columns.slice();
    Array.prototype.forEach.call(svg.querySelectorAll('.rt-sales-history-line'),function(path){path.classList.remove('rt-sales-history-line');});
    var paths=historyPaths(svg);paths.forEach(primePath);
    columns.forEach(function(col,idx){
      Array.prototype.forEach.call(col.querySelectorAll('circle'),function(c){
        c.classList.remove('rt-sales-history-point','rt-sales-point-on');
        if(idx<historyColumns.length&&!c.classList.contains('rt-chart-partial-dot'))c.classList.add('rt-sales-history-point');
      });
    });
    Array.prototype.forEach.call(svg.querySelectorAll('.rt-chart-partial-dash'),function(d){d.classList.remove('rt-sales-dash-on');});
    return {columns:columns,historyColumns:historyColumns,paths:paths,dashes:Array.prototype.slice.call(svg.querySelectorAll('.rt-chart-partial-dash'))};
  }
  function animatePath(session,path,duration,delay){
    var len=0;try{len=path.getTotalLength();}catch(_){len=0;}
    if(!(len>8))return;
    try{path.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
    path.style.strokeDasharray=len.toFixed(2)+'px '+len.toFixed(2)+'px';
    path.style.strokeDashoffset=len.toFixed(2)+'px';
    if(typeof path.animate!=='function'){
      addTimer(session,function(){path.style.strokeDashoffset='0px';cleanupPath(path);},delay+duration);
      return;
    }
    try{
      var a=path.animate([{strokeDashoffset:len.toFixed(2)+'px'},{strokeDashoffset:'0px'}],{duration:duration,delay:delay,easing:EASE,fill:'forwards'});
      session.animations.push(a);
      a.onfinish=function(){
        path.style.strokeDashoffset='0px';cleanupPath(path);
        var i=session.animations.indexOf(a);if(i>=0)session.animations.splice(i,1);
        try{a.cancel();}catch(_){}
      };
    }catch(_){addTimer(session,function(){path.style.strokeDashoffset='0px';cleanupPath(path);},delay+duration);}
  }

  function clamp01(v){return Math.max(0,Math.min(1,v));}
  function bezierCoord(t,p1,p2){
    var mt=1-t;
    return 3*mt*mt*t*p1+3*mt*t*t*p2+t*t*t;
  }
  function easeTimeForProgress(progress){
    progress=clamp01(progress);
    if(progress<=0)return 0;
    if(progress>=1)return 1;
    var lo=0,hi=1,mid=0;
    /* Find the cubic-bezier parameter that produces the requested eased output,
       then map it back to timeline time through the bezier x coordinate. */
    for(var i=0;i<16;i++){
      mid=(lo+hi)/2;
      if(bezierCoord(mid,.61,1)<progress)lo=mid;else hi=mid;
    }
    return clamp01(bezierCoord((lo+hi)/2,.22,.36));
  }
  function columnX(col){
    if(!col)return NaN;
    var c=col.querySelector('circle.rt-sales-history-point')||col.querySelector('circle');
    if(c){var cx=parseFloat(c.getAttribute('cx'));if(isFinite(cx))return cx;}
    try{var b=col.getBBox();return b.x+b.width/2;}catch(_){return NaN;}
  }
  function pathProgressAtX(path,x){
    var total=0;try{total=path.getTotalLength();}catch(_){total=0;}
    if(!(total>8)||!isFinite(x))return NaN;
    var start,end;try{start=path.getPointAtLength(0);end=path.getPointAtLength(total);}catch(_){return NaN;}
    if(!start||!end)return NaN;
    if(x<=start.x)return 0;
    if(x>=end.x)return 1;
    var lo=0,hi=total;
    for(var i=0;i<15;i++){
      var mid=(lo+hi)/2,pt;
      try{pt=path.getPointAtLength(mid);}catch(_){return NaN;}
      if(pt.x<x)lo=mid;else hi=mid;
    }
    return clamp01(((lo+hi)/2)/total);
  }
  function revealTimeRatio(paths,col,fallback){
    var x=columnX(col),latest=0,found=false;
    paths.forEach(function(path){
      var p=pathProgressAtX(path,x);
      if(!isFinite(p))return;
      found=true;
      latest=Math.max(latest,easeTimeForProgress(p));
    });
    return found?latest:clamp01(fallback);
  }

  function dashX(el){
    if(!el)return NaN;
    var x1=parseFloat(el.getAttribute('x1')),x2=parseFloat(el.getAttribute('x2'));
    if(isFinite(x1)&&isFinite(x2))return (x1+x2)/2;
    var cx=parseFloat(el.getAttribute('cx'));if(isFinite(cx))return cx;
    try{var b=el.getBBox();return b.x+b.width/2;}catch(_){return NaN;}
  }
  function groupDashes(dashes){
    var items=dashes.map(function(el,index){return {el:el,x:dashX(el),index:index};});
    items.sort(function(a,b){
      if(!isFinite(a.x)&&!isFinite(b.x))return a.index-b.index;
      if(!isFinite(a.x))return 1;if(!isFinite(b.x))return -1;
      return a.x-b.x||a.index-b.index;
    });
    var groups=[];
    items.forEach(function(item){
      var last=groups.length?groups[groups.length-1]:null;
      if(last&&isFinite(item.x)&&isFinite(last.x)&&Math.abs(item.x-last.x)<=2.5){last.items.push(item.el);last.x=(last.x+item.x)/2;}
      else groups.push({x:item.x,items:[item.el]});
    });
    return groups;
  }

  function svgPointX(svg,clientX){
    var rect;try{rect=svg.getBoundingClientRect();}catch(_){rect=null;}
    if(!rect||!rect.width)return NaN;
    var vb=svg.viewBox&&svg.viewBox.baseVal;
    var vx=vb&&vb.width?vb.x:0,vw=vb&&vb.width?vb.width:(parseFloat(svg.getAttribute('width'))||rect.width);
    return vx+((clientX-rect.left)/rect.width)*vw;
  }
  function installForecastPopover(svg){
    if(!svg||!svg.isConnected)return;
    var card=svg.closest('.monthly-profitability-card')||svg.parentElement;
    if(!card)return;

    if(card.__rtSalesForecastOverlayCleanup){try{card.__rtSalesForecastOverlayCleanup();}catch(_){}card.__rtSalesForecastOverlayCleanup=null;}

    var oldBubble=svg.querySelector('.rt-sales-hover-forecast');
    var text=oldBubble&&oldBubble.querySelector('text');
    var label=text?String(text.textContent||'').trim():'';
    var rings=Array.prototype.slice.call(svg.querySelectorAll('.rt-sales-forecast-ring'));
    if(!label&&rings.length){
      var title=rings[0].querySelector('title');
      if(title)label=String(title.textContent||'').trim();
    }
    if(!label||!rings.length)return;

    if(svg.__rtForecastHoverCleanup){try{svg.__rtForecastHoverCleanup();}catch(_){}svg.__rtForecastHoverCleanup=null;}
    if(oldBubble)oldBubble.remove();

    var x=parseFloat(rings[0].getAttribute('cx'));
    if(!isFinite(x))return;
    var pop=document.createElement('div');
    pop.className='rt-sales-forecast-popover';
    pop.setAttribute('role','status');
    pop.setAttribute('aria-live','polite');
    pop.textContent=label;
    card.appendChild(pop);

    var hideTimer=0,ro=null;
    function position(){
      if(!pop.isConnected||!svg.isConnected||!card.isConnected)return;
      var cr=card.getBoundingClientRect(),sr=svg.getBoundingClientRect();
      var top=Math.max(10,sr.top-cr.top+8);
      var right=Math.max(10,cr.right-sr.right+10);
      pop.style.top=Math.round(top)+'px';
      pop.style.right=Math.round(right)+'px';
    }
    function threshold(){
      var vb=svg.viewBox&&svg.viewBox.baseVal;
      var w=vb&&vb.width?vb.width:(parseFloat(svg.getAttribute('width'))||600);
      return Math.max(34,Math.min(60,w*.085));
    }
    function near(clientX){var px=svgPointX(svg,clientX);return isFinite(px)&&Math.abs(px-x)<=threshold();}
    function clearHide(){if(hideTimer){clearTimeout(hideTimer);hideTimer=0;}}
    function show(autoHide){
      clearHide();position();pop.classList.add('is-visible');
      if(autoHide)hideTimer=setTimeout(function(){hideTimer=0;pop.classList.remove('is-visible');},1800);
    }
    function hide(){clearHide();pop.classList.remove('is-visible');}
    function onMove(e){
      if(!e||e.pointerType!=='mouse'||!isFinite(e.clientX))return;
      if(near(e.clientX))show(false);else hide();
    }
    function onDownCapture(e){
      if(!e||!isFinite(e.clientX)||!near(e.clientX))return;
      show(e.pointerType!=='mouse');
    }
    function onLeave(e){if(!e||e.pointerType==='mouse')hide();}
    function onResize(){position();}

    svg.addEventListener('pointermove',onMove,{passive:true});
    svg.addEventListener('pointerleave',onLeave,{passive:true});
    card.addEventListener('pointerdown',onDownCapture,true);
    window.addEventListener('resize',onResize,{passive:true});
    if(typeof ResizeObserver==='function'){
      try{ro=new ResizeObserver(onResize);ro.observe(card);ro.observe(svg);}catch(_){ro=null;}
    }
    requestAnimationFrame(position);

    card.__rtSalesForecastOverlayCleanup=function(){
      clearHide();
      svg.removeEventListener('pointermove',onMove);
      svg.removeEventListener('pointerleave',onLeave);
      card.removeEventListener('pointerdown',onDownCapture,true);
      window.removeEventListener('resize',onResize);
      if(ro){try{ro.disconnect();}catch(_){}ro=null;}
      if(pop&&pop.parentNode)pop.parentNode.removeChild(pop);
    };
  }

  function run(svg,key){
    if(!svg||!svg.isConnected)return;
    cancelPendingBoot();
    cancel(active);
    var session=active={id:++serial,key:key,cancelled:false,timers:[],animations:[]};
    lastAnimatedKey=key;
    var state=prepare(svg);
    installForecastPopover(svg);
    if(reduced()||!visible(svg)){settle(svg);return;}

    var points=Math.max(1,state.historyColumns.length);
    var historyMs=Math.max(HISTORY_MIN,Math.min(HISTORY_MAX,Math.max(1,points-1)*HISTORY_PER_MONTH));
    state.paths.forEach(function(path){animatePath(session,path,historyMs,START_DELAY);});

    state.historyColumns.forEach(function(col,index){
      var fallback=points<=1?0:index/(points-1);
      var ratio=revealTimeRatio(state.paths,col,fallback);
      addTimer(session,function(){
        Array.prototype.forEach.call(col.querySelectorAll('circle.rt-sales-history-point'),function(c){c.classList.add('rt-sales-point-on');});
      },START_DELAY+historyMs*ratio+POINT_LAG);
    });

    var forecastStart=START_DELAY+historyMs+FORECAST_GAP;
    addTimer(session,function(){svg.classList.remove('rt-sales-history-stage');svg.classList.add('rt-sales-forecast-stage');},forecastStart);

    var dashGroups=groupDashes(state.dashes);
    var dashCount=state.dashes.length;
    var dashTotal=dashGroups.length?Math.min(DASH_MAX,Math.max(DASH_STEP,(dashGroups.length-1)*DASH_STEP)):0;
    if(dashGroups.length){
      var step=dashGroups.length<=1?0:dashTotal/(dashGroups.length-1);
      dashGroups.forEach(function(group,index){
        addTimer(session,function(){group.items.forEach(function(dash){dash.classList.add('rt-sales-dash-on');});},forecastStart+index*step);
      });
    }

    var endpointStart=forecastStart+dashTotal+ENDPOINT_GAP;
    addTimer(session,function(){svg.classList.add('rt-sales-endpoint-stage');},endpointStart);
    addTimer(session,function(){settle(svg);diag.lastTotalMs=endpointStart+ENDPOINT_MS;},endpointStart+ENDPOINT_MS+20);

    diag.historyMs=historyMs;
    diag.forecastMs=dashTotal;
    diag.points=points;
    diag.paths=state.paths.length;
    diag.dashes=dashCount;
    diag.dashGroups=dashGroups.length;
    diag.totalMs=endpointStart+ENDPOINT_MS;
  }

  function arm(svg,key){
    if(!svg||!svg.isConnected)return;
    cancelPendingBoot();
    installForecastPopover(svg);
    if(key===lastAnimatedKey){cancel(active);settle(svg);return;}
    prepare(svg);
    if(reduced()){settle(svg);lastAnimatedKey=key;return;}
    if(bootHolding()){
      pendingBootListener=function(){
        window.removeEventListener('retrade:boot-reveal',pendingBootListener);
        pendingBootListener=null;
        requestAnimationFrame(function(){run(svg,key);});
      };
      window.addEventListener('retrade:boot-reveal',pendingBootListener,{once:true});
      return;
    }
    requestAnimationFrame(function(){run(svg,key);});
  }

  var renderBeforeSequence=_renderChartInto;
  _renderChartInto=function(svgEl,labels,revData,profitData,handlers,opts){
    var out=renderBeforeSequence.apply(this,arguments);
    if(isSales(svgEl,opts))arm(svgEl,routeKey());
    return out;
  };

  /* The first hydrated render can precede this late presentation layer. Enhance
     an already-present visible Sales chart once; never hold the app for it. */
  requestAnimationFrame(function(){
    try{
      var svg=document.getElementById('monthly-profitability-svg');
      if(svg&&visible(svg))arm(svg,routeKey());
    }catch(_){}
  });
})();
