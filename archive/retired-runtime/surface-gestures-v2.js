/* RETRADE surface gestures v2.0.0
 * Replaces the legacy touch-only slide-panel and more-sheet recognizers with
 * pointer-owned gestures. The legacy listeners remain in app-core for rollback,
 * but capture-phase touch guards below stop them starting on supported surfaces.
 */
(function(){
  'use strict';
  var VERSION='2.0.0';
  var LOCK=11,DOM=1.22,VERT=1.08,WINDOW_MS=110;
  var EASE='cubic-bezier(.2,.82,.24,1)';
  var g=null,suppressUntil=0;

  function isTouch(e){return e.pointerType==='touch'||e.pointerType==='pen';}
  function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function interactive(t){return !!(t&&t.closest&&t.closest('input,textarea,select,a,[contenteditable="true"],[data-no-gesture]'));}
  function sample(state,v,t){
    state.samples.push({v:v,t:t});var cut=t-WINDOW_MS;
    while(state.samples.length>2&&state.samples[0].t<cut)state.samples.shift();
  }
  function velocity(state,v,t){sample(state,v,t);if(state.samples.length<2)return 0;var a=state.samples[0],b=state.samples[state.samples.length-1];return (b.v-a.v)/Math.max(1,b.t-a.t);}
  function capture(state,e){if(state.captured)return;try{document.documentElement.setPointerCapture(e.pointerId);state.captured=true;}catch(_){}}
  function release(state){if(!state||!state.captured)return;try{if(document.documentElement.hasPointerCapture(state.id))document.documentElement.releasePointerCapture(state.id);}catch(_){}state.captured=false;}
  function reduce(){try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(_){return false;}}

  function style(){
    if(document.getElementById('rt-surface-gesture-css'))return;
    var s=document.createElement('style');s.id='rt-surface-gesture-css';s.textContent=[
      '.rt-gesture-row>.rt-swipe-actions{z-index:0!important}',
      '.rt-gesture-row>*:not(.rt-swipe-actions){position:relative;z-index:1}',
      '#slide-panel.rt-surface-dragging,#more-sheet.rt-surface-dragging{transition:none!important;will-change:transform}',
      '#slide-panel.rt-surface-settling,#more-sheet.rt-surface-settling{transition:transform 220ms '+EASE+'!important}',
      '#more-sheet.rt-surface-dragging{overscroll-behavior:contain}',
      '@media(prefers-reduced-motion:reduce){#slide-panel.rt-surface-settling,#more-sheet.rt-surface-settling{transition:none!important}}'
    ].join('\n');document.head.appendChild(s);
  }
  style();

  // Stop the old app-core touch recognizers at the window boundary. Pointer
  // events below become the sole owner of these two surfaces.
  window.addEventListener('touchstart',function(e){
    var t=e.target;if(!t||!t.closest)return;
    var panel=t.closest('#slide-panel');if(panel&&panel.classList.contains('on')){e.stopPropagation();return;}
    var sheet=t.closest('#more-sheet');if(sheet&&sheet._msOpen){e.stopPropagation();}
  },{capture:true,passive:true});

  function beginPanel(e,panel){
    var t=now();g={kind:'panel',id:e.pointerId,el:panel,x0:e.clientX,y0:e.clientY,mode:'pending',captured:false,samples:[{v:e.clientX,t:t}]};
  }
  function beginSheet(e,sheet){
    var t=now();g={kind:'sheet',id:e.pointerId,el:sheet,x0:e.clientX,y0:e.clientY,mode:'pending',captured:false,samples:[{v:e.clientY,t:t}]};
  }
  window.addEventListener('pointerdown',function(e){
    if(g||!isTouch(e)||e.isPrimary===false||e.clientX<=24)return;
    var t=e.target;if(!t||!t.closest)return;
    var sheet=t.closest('#more-sheet');
    if(sheet&&sheet._msOpen&&sheet.scrollTop<=1&&!interactive(t)){beginSheet(e,sheet);return;}
    // Buttons in the more sheet are intentionally allowed: a stationary pointer
    // remains a tap; only a clear downward drag claims the gesture.
    if(sheet&&sheet._msOpen&&sheet.scrollTop<=1){beginSheet(e,sheet);return;}
    var panel=t.closest('#slide-panel');
    if(panel&&panel.classList.contains('on')&&!interactive(t)&&!t.closest('.rt-gesture-row'))beginPanel(e,panel);
  },true);

  window.addEventListener('pointermove',function(e){
    if(!g||e.pointerId!==g.id)return;
    var state=g,t=now(),dx=e.clientX-state.x0,dy=e.clientY-state.y0,ax=Math.abs(dx),ay=Math.abs(dy);
    sample(state,state.kind==='panel'?e.clientX:e.clientY,t);
    if(state.mode==='pending'){
      if(ax<LOCK&&ay<LOCK)return;
      if(state.kind==='panel'){
        if(dx<=0||(ay>=LOCK&&ay>ax*VERT)){g=null;return;}
        if(ax>=LOCK&&ax>ay*DOM){state.mode='locked';capture(state,e);state.el.classList.add('rt-surface-dragging');suppressUntil=Date.now()+450;}else return;
      }else{
        if(dy<=0||(ax>=LOCK&&ax>ay*VERT)){g=null;return;}
        if(ay>=LOCK&&ay>ax*DOM){state.mode='locked';capture(state,e);state.el.classList.add('rt-surface-dragging');suppressUntil=Date.now()+450;}else return;
      }
    }
    if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();
    if(state.kind==='panel'){
      var pw=Math.max(1,state.el.getBoundingClientRect().width),px=clamp(dx,0,pw);state.el.style.transform='translate3d('+px.toFixed(1)+'px,0,0)';
    }else{
      var sh=Math.max(1,state.el.getBoundingClientRect().height),py=clamp(dy,0,sh);state.el.style.transform='translate3d(0,'+py.toFixed(1)+'px,0)';
    }
  },{capture:true,passive:false});

  function settle(state,commit,v){
    var el=state.el;if(!el)return;
    el.classList.remove('rt-surface-dragging');el.classList.add('rt-surface-settling');
    if(state.kind==='panel')el.style.transform=commit?'translate3d(100%,0,0)':'translate3d(0,0,0)';
    else el.style.transform=commit?'translate3d(0,100%,0)':'translate3d(0,0,0)';
    var ms=reduce()?0:Math.max(145,Math.min(220,205-Math.abs(v||0)*32));
    setTimeout(function(){
      el.classList.remove('rt-surface-settling');el.style.removeProperty('transform');
      if(!commit)return;
      try{if(state.kind==='panel'&&typeof closePanel==='function')closePanel();else if(state.kind==='sheet'&&typeof closeMoreSheet==='function')closeMoreSheet();}catch(err){console.warn('[RETRADE] surface dismiss failed',err);}
    },ms);
  }

  window.addEventListener('pointerup',function(e){
    if(!g||e.pointerId!==g.id)return;
    var state=g;g=null;if(state.mode!=='locked'){release(state);return;}
    if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();
    var t=now(),delta=state.kind==='panel'?Math.max(0,e.clientX-state.x0):Math.max(0,e.clientY-state.y0),v=Math.max(0,velocity(state,state.kind==='panel'?e.clientX:e.clientY,t));
    var size=state.kind==='panel'?Math.max(1,state.el.getBoundingClientRect().width):Math.max(1,state.el.getBoundingClientRect().height);
    var ratio=state.kind==='panel'?0.32:0.28;
    var flickMin=state.kind==='panel'?62:54;
    var flickV=state.kind==='panel'?0.70:0.64;
    var commit=delta>=size*ratio||(delta>=flickMin&&v>=flickV);suppressUntil=Date.now()+360;release(state);settle(state,commit,v);
  },{capture:true,passive:false});
  window.addEventListener('pointercancel',function(e){if(!g||e.pointerId!==g.id)return;var state=g;g=null;release(state);settle(state,false,0);suppressUntil=Date.now()+240;},true);
  window.addEventListener('lostpointercapture',function(e){if(g&&e.pointerId===g.id&&g.mode==='locked')g.captured=false;},true);
  window.addEventListener('click',function(e){if(Date.now()<suppressUntil&&(e.target.closest&&e.target.closest('#slide-panel,#more-sheet'))){e.preventDefault();e.stopImmediatePropagation();}},true);

  window.__rtSurfaceGestures={version:VERSION,cancel:function(){if(g){var state=g;g=null;release(state);settle(state,false,0);}}};
})();
