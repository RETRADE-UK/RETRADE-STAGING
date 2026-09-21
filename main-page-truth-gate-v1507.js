/* RETRADE main-page truth-only paint gate — v1.5.07
 *
 * Prevents intermediate renderer states (zero/default/stale/partially hydrated
 * values) from ever painting on top-level pages. The target page is hidden
 * before its renderer executes and is only released once the real-layout
 * loading layer has masked its dynamic content. Presentation only: no data,
 * accounting, lifecycle, sync or persistence writes.
 */
(function(){
  'use strict';
  if(window.__rtMainTruthGate1507)return;
  window.__rtMainTruthGate1507=true;

  var topLevel=new Set(['summary','stock','expenses','cash','returns','scrapped','activity','tax','data','runs']);
  var serial=0;

  function pageFor(name){return document.getElementById('p-'+String(name||''));}
  function active(){return document.querySelector('.page.on');}
  function guardedName(name){return topLevel.has(String(name||''));}

  function installStyle(){
    if(document.getElementById('rt-main-truth-gate-1507-style'))return;
    var s=document.createElement('style');
    s.id='rt-main-truth-gate-1507-style';
    s.textContent='\
      .page.rt-truth-preparing1507{visibility:hidden!important;}\
      @media(prefers-reduced-motion:reduce){.page.rt-truth-preparing1507{transition:none!important;}}\
    ';
    document.head.appendChild(s);
  }

  function skeletonOwns(page){
    if(!page)return false;
    if(page.id==='p-accounts'){
      return page.classList.contains('rt-partners-dwell1505')||
             !!page.querySelector('.rt-partners-dwell-shell1505,.rt-partners-shell1504');
    }
    if(page.id==='p-summary'){
      var b=document.body;
      return !!(b&&(b.classList.contains('rt-real-layout-loading')||b.classList.contains('rt-real-layout-revealing')));
    }
    return page.classList.contains('rt-main-loading1506');
  }

  function gate(page){
    if(!page)return 0;
    var token=++serial;
    page.classList.add('rt-truth-preparing1507');
    page.setAttribute('data-rt-truth-gate','1');
    return token;
  }

  function releaseWhenMasked(page,token){
    var started=(performance&&performance.now)?performance.now():Date.now();
    function tick(){
      if(token!==serial||!page||!page.isConnected)return;
      if(!page.classList.contains('on')){release(page);return;}
      if(skeletonOwns(page)){
        /* The skeleton/mask is now the visible owner. Releasing the outer gate
           here cannot expose transient values because those values are already
           covered by the in-place loading state. */
        requestAnimationFrame(function(){if(token===serial)release(page);});
        return;
      }
      var n=(performance&&performance.now)?performance.now():Date.now();
      if(n-started>420){
        /* Defensive fallback: never strand a route if a presentation enhancer
           fails. The normal path releases within one or two frames. */
        release(page);return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function release(page){
    if(!page)return;
    page.classList.remove('rt-truth-preparing1507');
    page.removeAttribute('data-rt-truth-gate');
  }

  function wrapGoToTab(){
    if(typeof window.goToTab!=='function'||window.goToTab.__rtTruthGate1507)return;
    var base=window.goToTab;
    function wrapped(name){
      if(!guardedName(name))return base.apply(this,arguments);
      var page=pageFor(name),token=gate(page),out;
      try{out=base.apply(this,arguments);}
      finally{
        page=pageFor(name)||page;
        if(page)releaseWhenMasked(page,token);
      }
      return out;
    }
    wrapped.__rtTruthGate1507=true;wrapped.__rtBase=base;
    window.goToTab=wrapped;try{goToTab=wrapped;}catch(_){}
  }

  function wrapRefresh(){
    if(typeof window.refreshActivePage!=='function'||window.refreshActivePage.__rtTruthGate1507)return;
    var base=window.refreshActivePage;
    function wrapped(){
      /* Stale-while-revalidate UI: a same-page refresh keeps the last truthful
         screen visible while the renderer updates it. Full-page truth gating is
         reserved for navigation/cold-load boundaries; otherwise a tiny mutation
         can blank the whole page for up to the defensive timeout. */
      return base.apply(this,arguments);
    }
    wrapped.__rtTruthGate1507=true;wrapped.__rtBase=base;
    window.refreshActivePage=wrapped;try{refreshActivePage=wrapped;}catch(_){}
  }

  function install(){installStyle();wrapGoToTab();wrapRefresh();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  console.info('[RETRADE] v1.5.07 main-page truth-only paint gate loaded');
})();