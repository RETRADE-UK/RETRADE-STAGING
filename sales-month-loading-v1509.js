/* RETRADE Sales target-layout loading + reveal — v1.5.14
 *
 * Sales Yearly/Monthly lives on the same p-monthly route. The shared top-level
 * loader only starts when the active page id changes, so same-route view changes
 * previously skipped the skeleton and reveal. This layer gives those transitions
 * the same truth-only, real-layout loading contract without touching sales data.
 */
(function(){
  'use strict';
  if(window.__rtSalesMonthLoading1509)return;
  window.__rtSalesMonthLoading1509=true;

  var MIN_MS=240;
  var serial=0;
  var session=null;
  var EASE='cubic-bezier(.22,.61,.36,1)';
  var warmViews=new Set();
  var lastView=null;

  function page(){return document.getElementById('p-monthly');}
  function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function reduced(){try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}}
  function activeSales(){var p=document.querySelector('.page.on');return !!(p&&p.id==='p-monthly');}
  function salesView(){try{return (typeof MONTHLY_VIEW!=='undefined'&&MONTHLY_VIEW==='detail')?'detail':'yearly';}catch(_){return 'yearly';}}
  function text(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function cls(el){return String((el&&el.className&&el.className.baseVal)||el&&el.className||'').toLowerCase();}
  function numericLike(t){return !!(t&&t.length<=64&&(/[£$€]\s*[+\-−]?\s*\d/.test(t)||/[+\-−]?\s*\d[\d,.]*\s*%/.test(t)||/^[+\-−]?\s*\d[\d,.]*(?:\s*(?:k|m|items?|orders?|sales?|units?))?$/i.test(t)));}
  function dataLeaf(el){
    if(!el||el.nodeType!==1||el.children.length)return false;
    var tag=(el.tagName||'').toLowerCase();
    if(/^(script|style|svg|path|option|input|select|textarea|button|label)$/.test(tag))return false;
    if(el.closest('button,a,label,select,option,[role="button"],[contenteditable="true"]'))return false;
    var t=text(el),c=cls(el),parent=cls(el.parentElement);
    if(!t||t.length>90)return false;
    if(numericLike(t))return true;
    if(el.closest('#month-list'))return true;
    /* The yearly/FY calendar has descriptive values such as "5 sold · 2 active"
       that are not a single numeric token. Mask those in-place so the calendar
       skeleton genuinely matches its own layout rather than leaking live data. */
    if(el.closest('.mcard')&&/(?:mval|msub)/.test(c))return true;
    if(el.closest('.fy-section')&&/(?:fy-stat-hide|mval|msub)/.test(c))return true;
    return /(?:sale|order|revenue|profit|margin|metric|kpi|stat|summary|total|amount|value)/.test(c+' '+parent)&&t.length<56;
  }

  function installStyles(){
    if(document.getElementById('rt-sales-month-loading-1509-style'))return;
    var s=document.createElement('style');s.id='rt-sales-month-loading-1509-style';
    s.textContent='\
#p-monthly.rt-sales-route-loading1509{--rt-sales-load-base:color-mix(in srgb,var(--surface2) 78%,var(--border));--rt-sales-load-sheen:color-mix(in srgb,var(--border) 72%,var(--surface2));}\
#p-monthly.rt-sales-route-loading1509 .rt-sales-route-skel1509{position:relative!important;color:transparent!important;text-shadow:none!important;background:var(--rt-sales-load-base)!important;border-color:transparent!important;border-radius:6px!important;overflow:hidden!important;min-height:.82em;}\
#p-monthly.rt-sales-route-loading1509 .rt-sales-route-skel1509::after,#p-monthly.rt-sales-route-loading1509 .monthly-profitability-card::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 18%,var(--rt-sales-load-sheen) 46%,transparent 74%);background-size:220% 100%;transform:translateX(-105%);animation:rtSalesRouteSheen1509 1.15s cubic-bezier(.4,0,.2,1) infinite;pointer-events:none;}\
#p-monthly.rt-sales-route-loading1509 .monthly-profitability-card{position:relative!important;overflow:hidden!important;}\
#p-monthly.rt-sales-route-loading1509 #monthly-profitability-svg{opacity:.035!important;}\
#p-monthly.rt-sales-route-loading1509 button,#p-monthly.rt-sales-route-loading1509 input,#p-monthly.rt-sales-route-loading1509 select{pointer-events:none!important;}\
@keyframes rtSalesRouteSheen1509{to{transform:translateX(105%)}}\
@keyframes rtSalesRouteReveal1509{from{opacity:.16;transform:translate3d(0,5px,0)}to{opacity:1;transform:translate3d(0,0,0)}}\
#p-monthly .rt-sales-route-reveal1509{animation:rtSalesRouteReveal1509 320ms '+EASE+' both;animation-delay:var(--rt-sales-reveal-delay,0ms);}\
#p-monthly.rt-sales-route-page-reveal1509 #month-list>*{animation:rtSalesRouteReveal1509 260ms '+EASE+' both;animation-delay:var(--rt-sales-row-delay,40ms);}\
@media(prefers-reduced-motion:reduce){#p-monthly.rt-sales-route-loading1509 .rt-sales-route-skel1509::after,#p-monthly.rt-sales-route-loading1509 .monthly-profitability-card::after{animation:none!important}#p-monthly .rt-sales-route-reveal1509,#p-monthly.rt-sales-route-page-reveal1509 #month-list>*{animation:none!important;transform:none!important;opacity:1!important}}';
    document.head.appendChild(s);
  }

  function mark(root,s){
    if(!root||!s||s.ended)return;
    var list=[];
    if(root.nodeType===1)list.push(root);
    if(root.querySelectorAll)Array.prototype.push.apply(list,root.querySelectorAll('*'));
    list.forEach(function(el){
      if(!dataLeaf(el)||el.dataset.rtSalesRouteSkel1509==='1')return;
      el.dataset.rtSalesRouteSkel1509='1';el.classList.add('rt-sales-route-skel1509');s.marked.push(el);
      var c=cls(el),pc=cls(el.parentElement);
      if(numericLike(text(el))||/(?:kpi|metric|stat|summary|total|profit|revenue|amount|value)/.test(c+' '+pc))s.primary.push(el);
    });
  }

  function finish(s){
    if(!s||s.ended)return;s.ended=true;
    if(s.observer){try{s.observer.disconnect();}catch(_){}s.observer=null;}
    var p=s.page;
    if(!p)return;
    p.classList.remove('rt-sales-route-loading1509');
    p.removeAttribute('data-rt-sales-skeleton-layout');
    /* This class is deliberately borrowed so the truth gate recognises the
       same-route Sales skeleton. Remove it only when the generic loader is not
       managing its own busy session. */
    if(p.getAttribute('data-rt-main-busy1506')!=='1')p.classList.remove('rt-main-loading1506');
    s.marked.forEach(function(el){
      if(!el||!el.isConnected)return;
      el.classList.remove('rt-sales-route-skel1509');delete el.dataset.rtSalesRouteSkel1509;
    });
    if(!reduced()){
      s.primary.filter(function(el){return el&&el.isConnected;}).slice(0,12).forEach(function(el,i){el.style.setProperty('--rt-sales-reveal-delay',Math.min(i*22,132)+'ms');el.classList.add('rt-sales-route-reveal1509');});
      p.classList.add('rt-sales-route-page-reveal1509');
      var rows=p.querySelectorAll('#month-list>*');Array.prototype.forEach.call(rows,function(el,i){el.style.setProperty('--rt-sales-row-delay',Math.min(45+i*12,150)+'ms');});
      setTimeout(function(){
        s.primary.forEach(function(el){if(el){el.classList.remove('rt-sales-route-reveal1509');el.style.removeProperty('--rt-sales-reveal-delay');}});
        p.classList.remove('rt-sales-route-page-reveal1509');Array.prototype.forEach.call(rows,function(el){el.style.removeProperty('--rt-sales-row-delay');});
      },620);
    }
    warmViews.add(s.view);lastView=s.view;
    if(session===s)session=null;
    try{window.dispatchEvent(new CustomEvent('retrade:sales-route-reveal',{detail:{elapsed:now()-s.started}}));}catch(_){}
  }

  function scheduleFinish(s){
    if(!s||s.ended)return;
    var wait=Math.max(0,MIN_MS-(now()-s.started));
    setTimeout(function(){requestAnimationFrame(function(){requestAnimationFrame(function(){finish(s);});});},wait);
  }

  function begin(reason,deferInitialMark){
    var p=page();if(!p||!p.classList.contains('on'))return null;
    if(session)finish(session);
    var view=salesView();
    var s=session={id:++serial,page:p,reason:reason||'sales',view:view,started:now(),ended:false,marked:[],primary:[],observer:null};
    p.classList.add('rt-sales-route-loading1509','rt-main-loading1506');
    p.setAttribute('data-rt-sales-skeleton-layout',view);
    /* For route/view changes, do not paint the layout we are leaving. The
       wrapped renderer will build the target DOM synchronously and mark it in
       the same task, before the browser gets a paint opportunity. */
    if(!deferInitialMark)mark(p,s);
    try{
      s.observer=new MutationObserver(function(muts){
        if(s.ended)return;
        muts.forEach(function(m){
          if(m.type==='characterData'){if(m.target&&m.target.parentElement)mark(m.target.parentElement,s);return;}
          Array.prototype.forEach.call(m.addedNodes||[],function(n){if(n.nodeType===1)mark(n,s);else if(n.parentElement)mark(n.parentElement,s);});
        });
      });
      s.observer.observe(p,{subtree:true,childList:true,characterData:true});
    }catch(_){}
    try{window.__rtSalesMotionReplayToken=(window.__rtSalesMotionReplayToken||0)+1;}catch(_){}
    return s;
  }

  function wrapRender(name){
    var base=window[name];if(typeof base!=='function'||base.__rtSalesRoute1509)return;
    function wrapped(){
      var nextView=salesView();
      var shapeChange=lastView!=null&&nextView!==lastView;
      var own=!session&&activeSales()&&shapeChange&&!warmViews.has(nextView),s=own?begin(name,true):session,out;
      try{
        out=base.apply(this,arguments);
      }finally{
        /* Re-rendering the current Sales view is a soft refresh: keep the real
           screen visible and update it in place. Only the first transition into
           a different layout gets a skeleton. */
        lastView=salesView();
        if(own&&s&&!s.ended){mark(s.page,s);scheduleFinish(s);}
      }
      return out;
    }
    wrapped.__rtSalesRoute1509=true;wrapped.__rtBase=base;window[name]=wrapped;try{eval(name+'=wrapped');}catch(_){}
  }

  function wrapNav(){
    var base=window.goToTab;if(typeof base!=='function'||base.__rtSalesSameRoute1509)return;
    function wrapped(name){
      var same=name==='monthly'&&activeSales(),out;
      /* Let the destination renderer own the skeleton. Starting here would
         skeletonise the page being left and is what caused the Monthly-shaped
         loader to flash before the Yearly/FY calendar. */
      out=base.apply(this,arguments);
      if(same&&!session){
        var v=salesView();
        if(!warmViews.has(v)){
          var s=begin('same-route-nav',false);
          if(s)scheduleFinish(s);
        }
        lastView=v;
      }
      return out;
    }
    wrapped.__rtSalesSameRoute1509=true;wrapped.__rtBase=base;window.goToTab=wrapped;try{goToTab=wrapped;}catch(_){}
  }

  function install(){installStyles();lastView=salesView();warmViews.add(lastView);wrapRender('renderMonth');wrapRender('renderMonthlyGrid');wrapRender('renderMonthlyPage');wrapNav();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  console.info('[RETRADE] v1.5.14 Sales target-layout skeleton + reveal loaded');
})();
