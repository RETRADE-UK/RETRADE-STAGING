/* RETRADE global motion coherence v1.4.68
 * Presentation-only layer loaded last.
 *
 * Motion language:
 * - acknowledgement is immediate; travel is short and composited
 * - finished route/filter content settles with a short opacity transition
 *   without translating pages, delaying input or replaying on background updates
 * - sheets, confirmations, charts and explicit component state changes may move
 *   when that motion explains what changed
 * - reduced-motion remains a first-class path
 *
 * No accounting, sync, lifecycle, forecast maths or persisted data is touched.
 */
(function(){
  'use strict';

  var EASE='cubic-bezier(.22,.61,.36,1)';

  function installStyles(){
    ['rt-global-motion-v1447','rt-global-motion-v1455','rt-global-motion-v1466','rt-global-motion-v1467','rt-global-motion-v1468'].forEach(function(id){
      var old=document.getElementById(id);if(old)old.remove();
    });
    var s=document.createElement('style');
    s.id='rt-global-motion-v1468';
    s.textContent=[
      ':root{--rt-motion-ease:'+EASE+';--rt-motion-fast:135ms;--rt-motion-med:190ms;}',
      '@keyframes rtSurfaceEnterV1468{from{opacity:.88;transform:translate3d(0,3px,0)}to{opacity:1;transform:translate3d(0,0,0)}}',
      '@keyframes rtOverlayInV1468{from{opacity:0}to{opacity:1}}',
      '@keyframes rtConfirmInV1468{from{opacity:0;transform:translate3d(0,3px,0) scale(.995)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}',
      // Route activation is intentionally static. This prevents the same page
      // from appearing to reload whenever its .on class is restored.
      '.page.on:not(.rt-boot-noanim){animation:none!important;}',
      '#panel-content{animation:rtSurfaceEnterV1468 155ms var(--rt-motion-ease) both!important;}',
      '.slide-panel{transition:transform 220ms var(--rt-motion-ease)!important;}',
      '#more-sheet{transition:transform 220ms var(--rt-motion-ease)!important;}',
      '.country-panel{transition:opacity 135ms ease-out,transform 185ms var(--rt-motion-ease)!important;}',
      '#confirm-modal.open{animation:rtOverlayInV1468 125ms ease-out both!important;}',
      '#confirm-modal.open .confirm-box{animation:rtConfirmInV1468 180ms var(--rt-motion-ease) both!important;}',
      '.fab-dial-item{transition:opacity 130ms ease-out,transform 180ms var(--rt-motion-ease)!important;}',
      '#fab-dial,#search-fab{transition-property:opacity,scale,transform,bottom!important;transition-duration:130ms,175ms,175ms,175ms!important;transition-timing-function:ease-out,var(--rt-motion-ease),var(--rt-motion-ease),var(--rt-motion-ease)!important;}',
      '#fab-dial.rt-fab-motion-hidden,#search-fab.rt-fab-motion-hidden{opacity:0!important;pointer-events:none!important;}',
      '.tab,.bnt,.nav-more-btn,.more-sheet-row{transition-property:color,background-color,opacity!important;transition-duration:120ms!important;transition-timing-function:ease-out!important;}',
      '.tab svg,.bnt svg,.nav-more-btn svg{transition:transform 140ms var(--rt-motion-ease),color 120ms ease-out!important;}',
      '.tab.on svg,.bnt.on svg{transform:translateY(-1px);}',
      '#p-monthly .mf-fill{transition-duration:340ms!important;transition-delay:0ms!important;}',
      '@media(prefers-reduced-motion:reduce){',
      ' #panel-content,#confirm-modal.open,#confirm-modal.open .confirm-box{animation:none!important;}',
      ' .slide-panel,#more-sheet,.country-panel,.fab-dial-item,#fab-dial,#search-fab,.tab,.bnt,.nav-more-btn,.more-sheet-row,.tab svg,.bnt svg,.nav-more-btn svg,#p-monthly .mf-fill{transition:none!important;}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }
  installStyles();

  // Explicit render completion only: no subtree observers or layout reads.
  // Cancel on quick repeated choices so transitions never form a queue.
  var activeMotion=new WeakMap();
  var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  window._animateWorkspaceChange=function(root){
    if(!root||!root.isConnected||reduceMotion.matches||!root.closest('.page.on'))return;
    var targets=root.classList.contains('page')?Array.prototype.filter.call(root.children,function(el){
      return !el.matches('.page-header,.rt-route-skeleton,script,style');
    }):[root];
    targets.slice(0,8).forEach(function(el){
      var previous=activeMotion.get(el);if(previous)previous.cancel();
      if(!el.animate)return;
      var animation=el.animate([{opacity:.82},{opacity:1}],{duration:180,easing:EASE});
      activeMotion.set(el,animation);
      animation.onfinish=function(){activeMotion.delete(el);};
    });
  };
  reduceMotion.addEventListener('change',function(e){
    if(e.matches)document.querySelectorAll('.page').forEach(function(page){page.getAnimations({subtree:true}).forEach(function(a){a.cancel();});});
  });

  // Core navigation is the sole owner of FAB visibility and accessibility.

  /* Only page containers can change the active route. Watching every class
     mutation under <html> meant chips, dropdowns, chart classes and row state
     all woke this observer even though the active page had not changed. */
  try{
    var lastPage=(document.querySelector('.page.on')||{id:''}).id;
    function pageChanged(){
      var current=(document.querySelector('.page.on')||{id:''}).id;
      if(current===lastPage)return;
      lastPage=current;
      try{if(typeof _syncFabVisibility==='function')_syncFabVisibility();}catch(_){}
    }
    var obs=new MutationObserver(pageChanged);
    Array.prototype.forEach.call(document.querySelectorAll('.page'),function(page){
      obs.observe(page,{attributes:true,attributeFilter:['class']});
    });
  }catch(_){}
})();
