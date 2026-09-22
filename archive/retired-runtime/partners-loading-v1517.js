/* RETRADE Partners real-layout loader — v1.5.17
 *
 * One loading owner for the Partners list (v1.5.18 hardening).
 * - never renders a second imitation Partners page
 * - waits for the compact final DOM, then masks that exact geometry
 * - skips the skeleton entirely when the final layout resolves quickly
 * - once visible, keeps one calm skeleton long enough to avoid a flash
 * - warm renders keep the truthful screen visible and update in place
 */
(function(){
  'use strict';
  if(window.__rtPartnersLoading1517)return;
  window.__rtPartnersLoading1517=true;

  var SHOW_AFTER=110;
  var MIN_VISIBLE=520;
  var MAX_VISIBLE=1900;
  var QUIET_MS=90;
  var serial=0;
  var warm=false;
  var session=null;
  var navDepth=0;

  function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function reduced(){try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}}
  function page(){return document.getElementById('p-accounts');}
  function accountsCount(){try{return Array.isArray(_accounts)?_accounts.length:0;}catch(_){return 0;}}
  function blocking(){
    try{if(typeof _dbLoading!=='undefined'&&_dbLoading)return true;}catch(_){}
    var b=document.body,r=document.documentElement;
    if(r&&r.classList.contains('rt-app-cold'))return true;
    return !!(b&&b.classList.contains('rt-real-layout-loading')&&!b.classList.contains('rt-real-layout-revealing'));
  }
  function layoutReady(p){
    if(!p)return false;
    var strip=p.querySelector('.rt-acct-compact-strip');
    var controls=p.querySelector('.rt-acct-op-controls.rt-acct-compact-controls');
    var list=p.querySelector('.rt-acct-op-list');
    if(!strip||!controls||!list)return false;
    var rows=list.querySelectorAll('.rt-acct-op-row[data-account-id]');
    if(accountsCount()>0&&rows.length===0)return false;
    for(var i=0;i<rows.length;i++){
      if(!rows[i].querySelector('.rt-acct-snapshot-name')||!rows[i].querySelector('.rt-acct-op-money'))return false;
    }
    return true;
  }

  function installStyles(){
    if(document.getElementById('rt-partners-loading-1517-style'))return;
    var s=document.createElement('style');s.id='rt-partners-loading-1517-style';
    s.textContent='\
#p-accounts.rt-partners-preparing1517{visibility:hidden!important}\
#p-accounts.rt-partners-loading1517{--rt-partner-base:var(--rt-skel-base,color-mix(in srgb,var(--surface2) 90%,var(--border) 10%));--rt-partner-sheen:var(--rt-skel-sheen,color-mix(in srgb,var(--text) 1.8%,transparent))}\
#p-accounts.rt-partners-loading1517 .rt-partner-skel1517{position:relative!important;display:block!important;overflow:hidden!important;color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;background:var(--rt-partner-base)!important;border-color:transparent!important;box-shadow:none!important;user-select:none!important;pointer-events:none!important}\
#p-accounts.rt-partners-loading1517 .rt-partner-skel1517::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(100deg,transparent 26%,var(--rt-partner-sheen) 50%,transparent 74%);transform:translate3d(-115%,0,0);animation:rtPartnerSheen1517 3.4s linear .16s infinite}\
#p-accounts.rt-partners-loading1517 [data-rt-partner-kind="total"]{width:92px!important;height:23px!important;border-radius:7px!important;justify-self:end!important}\
#p-accounts.rt-partners-loading1517 [data-rt-partner-kind="name"]{width:min(68%,250px)!important;height:16px!important;border-radius:6px!important}\
#p-accounts.rt-partners-loading1517 [data-rt-partner-kind="badge"]{display:inline-block!important;width:72px!important;height:17px!important;border-radius:999px!important;padding:0!important;font-size:0!important;flex:0 0 72px!important}\
#p-accounts.rt-partners-loading1517 [data-rt-partner-kind="term"]{display:inline-block!important;width:86px!important;height:11px!important;border-radius:5px!important;flex:0 0 86px!important}\
#p-accounts.rt-partners-loading1517 [data-rt-partner-kind="money"]{width:76px!important;height:17px!important;border-radius:6px!important;align-self:flex-end!important}\
#p-accounts.rt-partners-loading1517 [data-rt-partner-kind="status"]{width:94px!important;height:11px!important;border-radius:5px!important;align-self:flex-end!important}\
#p-accounts.rt-partners-loading1517 .rt-acct-op-arrow{opacity:.36!important}\
#p-accounts.rt-partners-loading1517 .rt-acct-op-controls button,#p-accounts.rt-partners-loading1517 .rt-acct-op-controls input{pointer-events:none!important}\
#p-accounts.rt-partners-reveal1517 :is(.rt-acct-compact-strip,.rt-acct-op-controls,.rt-acct-op-row[data-account-id]){animation:rtPartnerReveal1517 180ms ease-out both}\
@keyframes rtPartnerSheen1517{from{transform:translate3d(-115%,0,0)}to{transform:translate3d(115%,0,0)}}\
@keyframes rtPartnerReveal1517{from{opacity:.72}to{opacity:1}}\
@media(prefers-reduced-motion:reduce){#p-accounts.rt-partners-loading1517 .rt-partner-skel1517::after,#p-accounts.rt-partners-reveal1517 :is(.rt-acct-compact-strip,.rt-acct-op-controls,.rt-acct-op-row[data-account-id]){animation:none!important}}';
    document.head.appendChild(s);
  }

  function cleanupLegacy(p){
    if(!p)return;
    p.classList.remove('rt-partners-preparing1504','rt-partners-dwell1505','rt-partners-reveal1506');
    p.querySelectorAll('.rt-partners-shell1504,.rt-partners-dwell-shell1505').forEach(function(el){el.remove();});
  }

  function apply(el,kind,s){
    if(!el||el.dataset.rtPartnerSkel1517==='1')return;
    var t=String(el.textContent||'').trim();
    if(!t&&kind!=='total'&&kind!=='money')return;
    el.dataset.rtPartnerSkel1517='1';
    el.dataset.rtPartnerKind=kind;
    el.classList.add('rt-partner-skel1517');
    s.marked.push(el);
  }

  function mark(p,s){
    if(!p||!s||s.ended)return;
    p.querySelectorAll('.rt-acct-compact-strip>strong').forEach(function(el){apply(el,'total',s);});
    p.querySelectorAll('.rt-acct-snapshot-name').forEach(function(el){apply(el,'name',s);});
    p.querySelectorAll('.rt-acct-op-badge').forEach(function(el){apply(el,'badge',s);});
    p.querySelectorAll('.rt-acct-snapshot-term').forEach(function(el){apply(el,'term',s);});
    p.querySelectorAll('.rt-acct-op-money strong').forEach(function(el){apply(el,'money',s);});
    p.querySelectorAll('.rt-acct-op-money span').forEach(function(el){apply(el,'status',s);});
  }

  function clearMarks(s){
    (s.marked||[]).forEach(function(el){
      if(!el)return;
      el.classList.remove('rt-partner-skel1517');
      delete el.dataset.rtPartnerSkel1517;
      delete el.dataset.rtPartnerKind;
    });
    s.marked=[];
  }

  function revealDirect(p){
    if(!p)return;
    p.classList.remove('rt-partners-preparing1517','rt-partners-loading1517');
    p.removeAttribute('aria-busy');
    warm=true;
    p.setAttribute('data-rt-partners-warm1517','1');
  }

  function abandon(s){
    if(!s||s.ended)return;s.ended=true;
    if(s.observer){try{s.observer.disconnect();}catch(_){}s.observer=null;}
    if(s.timer){clearTimeout(s.timer);s.timer=0;}
    var p=s.page;
    if(p){
      p.classList.remove('rt-partners-preparing1517','rt-partners-loading1517');
      p.removeAttribute('aria-busy');
      clearMarks(s);
    }
    if(session===s)session=null;
  }

  function finish(s,animate){
    if(!s||s.ended)return;s.ended=true;
    if(s.observer){try{s.observer.disconnect();}catch(_){}s.observer=null;}
    if(s.timer){clearTimeout(s.timer);s.timer=0;}
    var p=s.page;
    if(p){
      p.classList.remove('rt-partners-preparing1517','rt-partners-loading1517');
      p.removeAttribute('aria-busy');
      clearMarks(s);
      warm=true;p.setAttribute('data-rt-partners-warm1517','1');
      if(animate&&!reduced()){
        p.classList.add('rt-partners-reveal1517');
        setTimeout(function(){if(p)p.classList.remove('rt-partners-reveal1517');},220);
      }
    }
    if(session===s)session=null;
  }

  function visibleCheck(s){
    if(!s||s.ended)return;
    if(!s.page||!s.page.classList.contains('on')){abandon(s);return;}
    var t=now(),shown=t-s.shownAt,quiet=t-s.lastMutation;
    if(shown>=MIN_VISIBLE&&layoutReady(s.page)&&!blocking()&&quiet>=QUIET_MS){finish(s,true);return;}
    if(shown>=MAX_VISIBLE){finish(s,true);return;}
    s.timer=setTimeout(function(){visibleCheck(s);},70);
  }

  function showSkeleton(s){
    if(!s||s.ended||s.visible)return;
    s.visible=true;s.shownAt=now();s.lastMutation=s.shownAt;
    var p=s.page;
    cleanupLegacy(p);
    p.classList.add('rt-partners-loading1517');
    p.classList.remove('rt-partners-preparing1517');
    p.setAttribute('aria-busy','true');
    mark(p,s);
    try{
      s.observer=new MutationObserver(function(muts){
        if(s.ended)return;
        s.lastMutation=now();
        muts.forEach(function(m){
          Array.prototype.forEach.call(m.addedNodes||[],function(n){if(n.nodeType===1)mark(p,s);});
        });
        mark(p,s);
      });
      s.observer.observe(p,{subtree:true,childList:true,characterData:true});
    }catch(_){}
    visibleCheck(s);
  }

  function waitForLayout(s){
    if(!s||s.ended)return;
    var p=s.page;
    var elapsed=now()-s.started;
    if(!p||!p.classList.contains('on')){
      if(elapsed<700){requestAnimationFrame(function(){waitForLayout(s);});return;}
      abandon(s);return;
    }
    if(layoutReady(p)){
      if(!blocking()&&elapsed<SHOW_AFTER){revealDirect(p);s.ended=true;if(session===s)session=null;return;}
      if(elapsed>=SHOW_AFTER){showSkeleton(s);return;}
    }
    if(elapsed>MAX_VISIBLE){revealDirect(p);s.ended=true;if(session===s)session=null;return;}
    requestAnimationFrame(function(){waitForLayout(s);});
  }

  function beginCold(p,reason){
    if(!p||warm)return null;
    if(session)abandon(session);
    cleanupLegacy(p);
    var s=session={id:++serial,page:p,reason:reason||'partners',started:now(),shownAt:0,lastMutation:0,visible:false,ended:false,marked:[],observer:null,timer:0};
    p.classList.add('rt-partners-preparing1517');
    requestAnimationFrame(function(){waitForLayout(s);});
    return s;
  }

  function wrapRenderer(){
    var current=window.renderAccountsPage;
    if(typeof current!=='function'||current.__rtPartners1517)return;
    function wrapped(){
      if(navDepth)return current.apply(this,arguments);
      var p=page(),cold=!warm;
      if(cold&&p){cleanupLegacy(p);p.classList.add('rt-partners-preparing1517');}
      var out=current.apply(this,arguments);
      p=page();
      if(cold&&p)beginCold(p,'render');
      return out;
    }
    wrapped.__rtPartners1517=true;wrapped.__rtBase=current;
    window.renderAccountsPage=wrapped;try{renderAccountsPage=wrapped;}catch(_){}
  }

  function wrapNav(){
    var base=window.goToTab;
    if(typeof base!=='function'||base.__rtPartnersNav1518)return;
    function wrapped(name){
      if(name!=='accounts')return base.apply(this,arguments);
      var p=page();
      if(!warm&&p){cleanupLegacy(p);p.classList.add('rt-partners-preparing1517');}
      navDepth++;
      var out;
      try{out=base.apply(this,arguments);}
      finally{navDepth--;}
      p=page();
      if(warm){if(p)p.classList.remove('rt-partners-preparing1517');return out;}
      if(p)beginCold(p,'nav');
      return out;
    }
    wrapped.__rtPartnersNav1518=true;wrapped.__rtBase=base;
    window.goToTab=wrapped;try{goToTab=wrapped;}catch(_){}
  }

  function start(){
    installStyles();
    var p=page();cleanupLegacy(p);
    wrapRenderer();wrapNav();
    p=page();
    if(p&&p.classList.contains('on')){
      if(layoutReady(p)&&!blocking())revealDirect(p);
      else beginCold(p,'initial');
    }
    window.__rtMarkPartnersCold1517=function(){
      warm=false;var pg=page();if(pg)pg.removeAttribute('data-rt-partners-warm1517');
    };
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.5.18 Partners single-owner real-layout loader loaded');
})();