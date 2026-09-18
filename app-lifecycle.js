/* RETRADE PWA lifecycle / resume coordinator v1.4.91
 * Keeps an already-booted app visually alive across iOS suspend/resume and
 * asks the service worker to keep the current shell/scripts warm.
 *
 * This is presentation/cache coordination only. It never mutates business data,
 * accounting state, auth state or sync state.
 */
(function(){
  'use strict';
  if(window.__rtLifecycle1491)return;
  window.__rtLifecycle1491=true;

  var root=document.documentElement;
  var hiddenAt=0;
  var resumeTimer=0;
  var warmTimer=0;

  function now(){return Date.now();}
  function build(){return String(window.__rtBuildId||'');}
  function body(){return document.body||null;}
  function genuineBootInProgress(){
    var b=body();
    return !!(b&&b.classList.contains('rt-real-layout-loading'));
  }
  function hasBooted(){
    return root.classList.contains('rt-app-awake')||(!root.classList.contains('rt-app-cold')&&document.readyState==='complete');
  }

  function warmSoon(delay){
    if(warmTimer)clearTimeout(warmTimer);
    warmTimer=setTimeout(function(){
      warmTimer=0;
      try{
        if(!('serviceWorker' in navigator))return;
        navigator.serviceWorker.ready.then(function(reg){
          var target=(navigator.serviceWorker.controller)||(reg&&reg.active);
          if(target)target.postMessage({type:'RT_WARM_STATIC',build:build()});
        }).catch(function(){});
      }catch(_){}
    },Math.max(0,Number(delay)||0));
  }

  function refreshChrome(){
    try{if(typeof handleNavResize==='function')handleNavResize();}catch(_){}
    try{if(typeof _syncFabVisibility==='function')_syncFabVisibility();}catch(_){}
  }

  function fastResume(reason){
    if(genuineBootInProgress()||!hasBooted()){
      warmSoon(120);
      return;
    }
    var b=body();if(!b)return;

    /* These classes are boot-only visual choreography. If WebKit restores an
       in-memory page while one was left behind, keeping it can leave a dark
       compositing frame until the next render. The real active page stays put. */
    root.classList.remove('rt-app-cold','rt-motion-prep');
    root.classList.add('rt-app-awake','rt-resume-fast');
    b.classList.remove('rt-launch-long','rt-launch-shell','rt-launch-waking');
    b.setAttribute('data-rt-resume-reason',String(reason||'resume'));

    requestAnimationFrame(function(){
      refreshChrome();
      requestAnimationFrame(function(){
        root.classList.remove('rt-resume-fast');
        b.removeAttribute('data-rt-resume-reason');
      });
    });
    warmSoon(30);

    if(resumeTimer)clearTimeout(resumeTimer);
    resumeTimer=setTimeout(function(){root.classList.remove('rt-resume-fast');},500);
  }

  function installStyle(){
    if(document.getElementById('rt-lifecycle-style'))return;
    var s=document.createElement('style');s.id='rt-lifecycle-style';
    s.textContent='\
      html.rt-resume-fast,html.rt-resume-fast body{background:var(--bg)!important;}\
      html.rt-resume-fast .page.on{opacity:1!important;visibility:visible!important;transform:none!important;animation:none!important;transition:none!important;}\
      html.rt-resume-fast #bottom-nav,html.rt-resume-fast .bottom-nav,html.rt-resume-fast #fab-dial,html.rt-resume-fast #search-fab{opacity:1!important;visibility:visible!important;animation:none!important;transition:none!important;}\
    ';
    document.head.appendChild(s);
  }

  function onVisibility(){
    if(document.visibilityState==='hidden'){
      hiddenAt=now();
      return;
    }
    var slept=hiddenAt?now()-hiddenAt:0;
    hiddenAt=0;
    fastResume(slept>1500?'foreground':'visible');
  }

  installStyle();
  document.addEventListener('visibilitychange',onVisibility,{passive:true});
  window.addEventListener('pageshow',function(ev){
    if(ev&&ev.persisted)fastResume('pageshow-cache');
    else warmSoon(250);
  },{passive:true});
  window.addEventListener('focus',function(){
    if(hiddenAt||document.visibilityState==='visible')fastResume('focus');
  },{passive:true});
  window.addEventListener('pagehide',function(){hiddenAt=now();},{passive:true});
  window.addEventListener('retrade:motion-ready',function(){warmSoon(180);},{once:true});
  warmSoon(600);

  console.info('[RETRADE] v1.4.91 PWA lifecycle/resume coordinator loaded');
})();