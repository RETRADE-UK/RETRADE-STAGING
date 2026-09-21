/* RETRADE Sales target-layout loader — v1.5.17
 *
 * Sales Yearly and Monthly share p-monthly, but no longer share an ambiguous
 * skeleton. This module owns Sales loading end-to-end:
 * - old Sales DOM is hidden only inside the transition task
 * - destination renderer runs first
 * - the actual destination DOM is then masked in place
 * - warm Yearly/Monthly views swap directly without replaying a skeleton
 */
(function(){
  'use strict';
  if(window.__rtSalesLoading1517)return;
  window.__rtSalesLoading1517=true;

  var SHOW_AFTER=105;
  var MIN_VISIBLE=440;
  var MAX_VISIBLE=1850;
  var QUIET_MS=85;
  var serial=0;
  var session=null;
  var warmViews=new Set();
  var lastView=null;
  var navDepth=0;

  function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function reduced(){try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}}
  function page(){return document.getElementById('p-monthly');}
  function active(){var p=document.querySelector('.page.on');return !!(p&&p.id==='p-monthly');}
  function view(){try{return (typeof MONTHLY_VIEW!=='undefined'&&MONTHLY_VIEW==='detail')?'detail':'yearly';}catch(_){return 'yearly';}}
  function blocking(){
    try{if(typeof _dbLoading!=='undefined'&&_dbLoading)return true;}catch(_){}
    var b=document.body,r=document.documentElement;
    if(r&&r.classList.contains('rt-app-cold'))return true;
    return !!(b&&b.classList.contains('rt-real-layout-loading')&&!b.classList.contains('rt-real-layout-revealing'));
  }
  function layoutReady(p,v){
    if(!p)return false;
    if(v==='detail')return !!p.querySelector('#month-list');
    return !!p.querySelector('.fy-section,.mcard,.monthly-charts-row,#monthly-profitability-svg');
  }

  function installStyles(){
    if(document.getElementById('rt-sales-loading-1517-style'))return;
    var s=document.createElement('style');s.id='rt-sales-loading-1517-style';
    s.textContent='\
#p-monthly.rt-sales-preparing1517{visibility:hidden!important}\
#p-monthly.rt-sales-loading1517{--rt-sales-base:var(--rt-skel-base,color-mix(in srgb,var(--surface2) 90%,var(--border) 10%));--rt-sales-sheen:var(--rt-skel-sheen,color-mix(in srgb,var(--text) 1.8%,transparent))}\
#p-monthly.rt-sales-loading1517 .rt-sales-skel1517{position:relative!important;overflow:hidden!important;color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;background:var(--rt-sales-base)!important;border-color:transparent!important;border-radius:6px!important;box-shadow:none!important;user-select:none!important;pointer-events:none!important}\
#p-monthly.rt-sales-loading1517 .rt-sales-skel1517::after,#p-monthly.rt-sales-loading1517 .monthly-profitability-card.rt-sales-chart-skel1517::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(100deg,transparent 26%,var(--rt-sales-sheen) 50%,transparent 74%);transform:translate3d(-115%,0,0);animation:rtSalesSheen1517 3.4s linear .16s infinite}\
#p-monthly.rt-sales-loading1517 .monthly-profitability-card.rt-sales-chart-skel1517{position:relative!important;overflow:hidden!important}\
#p-monthly.rt-sales-loading1517 .monthly-profitability-card.rt-sales-chart-skel1517 #monthly-profitability-svg{opacity:.045!important}\
#p-monthly.rt-sales-loading1517 button,#p-monthly.rt-sales-loading1517 input,#p-monthly.rt-sales-loading1517 select{pointer-events:none!important}\
#p-monthly.rt-sales-reveal1517 :is(.monthly-charts-row,#month-list,.fy-section,.mcard){animation:rtSalesReveal1517 180ms ease-out both}\
@keyframes rtSalesSheen1517{from{transform:translate3d(-115%,0,0)}to{transform:translate3d(115%,0,0)}}\
@keyframes rtSalesReveal1517{from{opacity:.72}to{opacity:1}}\
@media(prefers-reduced-motion:reduce){#p-monthly.rt-sales-loading1517 .rt-sales-skel1517::after,#p-monthly.rt-sales-loading1517 .monthly-profitability-card.rt-sales-chart-skel1517::after,#p-monthly.rt-sales-reveal1517 :is(.monthly-charts-row,#month-list,.fy-section,.mcard){animation:none!important}}';
    document.head.appendChild(s);
  }

  function text(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function cls(el){return String((el&&el.className&&el.className.baseVal)||el&&el.className||'').toLowerCase();}
  function numericLike(t){
    if(!t||t.length>64)return false;
    return /[£$€]\s*[+\-−]?\s*\d/.test(t)||/[+\-−]?\s*\d[\d,.]*\s*%/.test(t)||/^[+\-−]?\s*\d[\d,.]*(?:\s*(?:k|m|items?|orders?|sales?|units?))?$/i.test(t);
  }
  function eligible(el){
    if(!el||el.nodeType!==1||el.children.length)return false;
    var tag=(el.tagName||'').toLowerCase();
    if(/^(script|style|svg|path|option|input|select|textarea|button|label|h1|h2|h3)$/.test(tag))return false;
    if(el.closest('button,a,label,select,option,[role="button"],[contenteditable="true"]'))return false;
    var t=text(el),c=cls(el),pc=cls(el.parentElement);
    if(!t||t.length>90)return false;
    if(el.closest('#month-list'))return true;
    if(el.closest('.mcard')&&/(?:mval|msub|value|stat|count|total)/.test(c+' '+pc))return true;
    if(el.closest('.fy-section')&&/(?:fy-stat-hide|mval|msub|value|stat|count|total)/.test(c+' '+pc))return true;
    if(numericLike(t))return true;
    return /(?:sale|order|revenue|profit|margin|metric|kpi|stat|summary|total|amount|value)/.test(c+' '+pc)&&t.length<56;
  }

  function markOne(el,s){
    if(!eligible(el)||el.dataset.rtSalesSkel1517==='1')return;
    el.dataset.rtSalesSkel1517='1';el.classList.add('rt-sales-skel1517');s.marked.push(el);
  }
  function mark(p,s){
    if(!p||!s||s.ended)return;
    p.querySelectorAll('*').forEach(function(el){markOne(el,s);});
    var card=p.querySelector('.monthly-profitability-card');
    if(card&&!card.classList.contains('rt-sales-chart-skel1517')){card.classList.add('rt-sales-chart-skel1517');s.chart=card;}
  }
  function clearMarks(s){
    (s.marked||[]).forEach(function(el){if(el){el.classList.remove('rt-sales-skel1517');delete el.dataset.rtSalesSkel1517;}});
    s.marked=[];
    if(s.chart)s.chart.classList.remove('rt-sales-chart-skel1517');
    s.chart=null;
  }

  function direct(p,v){
    if(!p)return;
    p.classList.remove('rt-sales-preparing1517','rt-sales-loading1517');
    p.removeAttribute('aria-busy');p.removeAttribute('data-rt-sales-layout1517');
    warmViews.add(v);lastView=v;
  }

  function finish(s,animate){
    if(!s||s.ended)return;s.ended=true;
    if(s.observer){try{s.observer.disconnect();}catch(_){}s.observer=null;}
    if(s.timer){clearTimeout(s.timer);s.timer=0;}
    var p=s.page;
    if(p){
      p.classList.remove('rt-sales-preparing1517','rt-sales-loading1517');
      p.removeAttribute('aria-busy');p.removeAttribute('data-rt-sales-layout1517');
      clearMarks(s);
      warmViews.add(s.view);lastView=s.view;
      if(animate&&!reduced()){
        p.classList.add('rt-sales-reveal1517');
        setTimeout(function(){if(p)p.classList.remove('rt-sales-reveal1517');},220);
      }
    }
    if(session===s)session=null;
    try{window.dispatchEvent(new CustomEvent('retrade:sales-ready',{detail:{view:s.view,elapsed:now()-s.started}}));}catch(_){}
  }

  function visibleCheck(s){
    if(!s||s.ended)return;
    if(!s.page||!s.page.classList.contains('on')){finish(s,false);return;}
    var t=now(),shown=t-s.shownAt,quiet=t-s.lastMutation;
    if(shown>=MIN_VISIBLE&&layoutReady(s.page,s.view)&&!blocking()&&quiet>=QUIET_MS){finish(s,true);return;}
    if(shown>=MAX_VISIBLE){finish(s,true);return;}
    s.timer=setTimeout(function(){visibleCheck(s);},70);
  }

  function show(s){
    if(!s||s.ended||s.visible)return;
    s.visible=true;s.shownAt=now();s.lastMutation=s.shownAt;
    var p=s.page;
    p.classList.add('rt-sales-loading1517');
    p.classList.remove('rt-sales-preparing1517');
    p.setAttribute('data-rt-sales-layout1517',s.view);
    p.setAttribute('aria-busy','true');
    mark(p,s);
    try{
      s.observer=new MutationObserver(function(muts){
        if(s.ended)return;
        s.lastMutation=now();
        muts.forEach(function(m){
          if(m.type==='characterData'&&m.target&&m.target.parentElement)markOne(m.target.parentElement,s);
          Array.prototype.forEach.call(m.addedNodes||[],function(n){if(n.nodeType===1)mark(p,s);});
        });
        mark(p,s);
      });
      s.observer.observe(p,{subtree:true,childList:true,characterData:true});
    }catch(_){}
    visibleCheck(s);
  }

  function wait(s){
    if(!s||s.ended)return;
    var p=s.page;
    if(!p||!p.classList.contains('on')){finish(s,false);return;}
    var elapsed=now()-s.started;
    if(layoutReady(p,s.view)){
      if(!blocking()&&elapsed<SHOW_AFTER){direct(p,s.view);s.ended=true;if(session===s)session=null;return;}
      if(elapsed>=SHOW_AFTER){show(s);return;}
    }
    if(elapsed>MAX_VISIBLE){direct(p,s.view);s.ended=true;if(session===s)session=null;return;}
    requestAnimationFrame(function(){wait(s);});
  }

  function begin(v,reason){
    var p=page();if(!p||!p.classList.contains('on'))return null;
    if(warmViews.has(v)){direct(p,v);return null;}
    if(session)finish(session,false);
    var s=session={id:++serial,page:p,view:v,reason:reason||'sales',started:now(),shownAt:0,lastMutation:0,visible:false,ended:false,marked:[],chart:null,observer:null,timer:0};
    p.classList.add('rt-sales-preparing1517');
    requestAnimationFrame(function(){wait(s);});
    return s;
  }

  function wrapRender(name){
    var base=window[name];
    if(typeof base!=='function'||base.__rtSales1517)return;
    function wrapped(){
      if(navDepth)return base.apply(this,arguments);
      var target=view(),cold=active()&&target!==lastView&&!warmViews.has(target),p=page();
      if(cold&&p)p.classList.add('rt-sales-preparing1517');
      var out=base.apply(this,arguments);
      target=view();
      if(cold)begin(target,name);
      else if(active()&&layoutReady(page(),target)&&!blocking()){warmViews.add(target);lastView=target;}
      return out;
    }
    wrapped.__rtSales1517=true;wrapped.__rtBase=base;
    window[name]=wrapped;try{eval(name+'=wrapped');}catch(_){}
  }

  function wrapNav(){
    var base=window.goToTab;
    if(typeof base!=='function'||base.__rtSalesNav1517)return;
    function wrapped(name){
      if(name!=='monthly')return base.apply(this,arguments);
      var p=page();if(p)p.classList.add('rt-sales-preparing1517');
      navDepth++;
      var out;
      try{out=base.apply(this,arguments);}
      finally{navDepth--;}
      var target=view();p=page();
      if(warmViews.has(target)){direct(p,target);}
      else begin(target,'nav');
      return out;
    }
    wrapped.__rtSalesNav1517=true;wrapped.__rtBase=base;
    window.goToTab=wrapped;try{goToTab=wrapped;}catch(_){}
  }

  function start(){
    installStyles();
    lastView=view();
    var p=page();
    if(active()&&layoutReady(p,lastView)&&!blocking())warmViews.add(lastView);
    wrapRender('renderMonth');wrapRender('renderMonthlyGrid');wrapRender('renderMonthlyPage');wrapNav();
    if(active()&&!warmViews.has(lastView))begin(lastView,'initial');
    window.__rtMarkSalesCold1517=function(v){
      if(v==='detail'||v==='yearly')warmViews.delete(v);else warmViews.clear();
    };
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.5.17 Sales exact-target single-owner loader loaded');
})();