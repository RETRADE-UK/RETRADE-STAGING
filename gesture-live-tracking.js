/* RETRADE gesture live-tracking correction v2.0.3
 *
 * This small layer deliberately loads BEFORE interaction-system-v2.js.
 * The interaction system still owns recognition, actions, thresholds and safety;
 * this layer only fixes the visual coupling between an already-recognised gesture
 * and the physical pointer position.
 *
 * Why this exists:
 * - v2.0.0 intentionally added resistance after the reveal point and capped a
 *   dragged row at 164px. On a phone that makes the finger keep travelling while
 *   the row visibly stops, which feels like the gesture has broken.
 * - the global page-enter animation uses transform with animation-fill-mode:both
 *   and !important. That can keep ownership of transform after entry has finished,
 *   preventing the interactive back gesture's inline transform from being seen.
 */
(function(){
  'use strict';

  var VERSION='2.0.3';
  var ROW_SELECTOR=[
    '.item-row',
    '.expense-item',
    '.run-history-row',
    '.ar-item-row',
    '.act-entry',
    '.cashflow-ledger-row',
    '.mcard'
  ].join(',');

  var live=null;
  var raf=0;
  var stats={moves:0,cancels:0,lastCancel:null};

  function isTouch(e){return e.pointerType==='touch'||e.pointerType==='pen';}
  function rowFromTarget(target){return target&&target.closest?target.closest(ROW_SELECTOR):null;}
  function cancelFrame(){if(raf){cancelAnimationFrame(raf);raf=0;}}

  function installStyles(){
    var old=document.getElementById('rt-gesture-live-tracking-css');if(old)old.remove();
    var s=document.createElement('style');s.id='rt-gesture-live-tracking-css';
    s.textContent=[
      /* Reserve horizontal row movement for RETRADE while leaving vertical page
         scrolling native. This is intentionally the same axis policy as v2. */
      ROW_SELECTOR+'{touch-action:pan-y!important}',

      /* The rails must sit above the row background but below the translated
         foreground content. z-index:-1 put them behind the row's own paint. */
      '.rt-gesture-row>.rt-swipe-actions{z-index:0!important}',
      '.rt-gesture-row>*:not(.rt-swipe-actions){position:relative;z-index:1}',

      /* Existing :active rules scale item rows with !important. Once swipe has
         locked, that press animation must yield completely to the drag. */
      'body .rt-gesture-row.rt-swipe-dragging:active{transform:none!important;scale:1!important}',

      /* motion-system.js is loaded later and its completed page-enter animation
         otherwise continues to own transform because it uses `both!important`.
         Higher specificity here ensures the interactive page and its preview are
         free to use their live inline transforms during back navigation. */
      'html body .page.on.rt-back-current{animation:none!important}',
      'html body .rt-back-preview-shell>.page.on.rt-back-preview{animation:none!important}',
      'html body .page.on.rt-back-current.rt-back-locked:not(.rt-back-settling){transition:none!important}',
      'html body .rt-back-preview-shell:not(.rt-back-settling)>.rt-back-preview{transition:none!important}'
    ].join('\n');
    document.head.appendChild(s);
  }
  installStyles();

  /* Register first. interaction-system-v2 is loaded immediately after this file,
     so its recogniser runs later in the same pointermove and decides whether the
     row has actually locked. We then apply the raw pointer distance on the next
     animation frame, after the recogniser's old resisted/capped value. */
  window.addEventListener('pointerdown',function(e){
    if(!isTouch(e)||e.isPrimary===false||live)return;
    var row=rowFromTarget(e.target);
    live={id:e.pointerId,row:row,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY};
  },true);

  window.addEventListener('pointermove',function(e){
    if(!live||e.pointerId!==live.id)return;
    live.x=e.clientX;live.y=e.clientY;stats.moves++;
    if(!live.row)return;
    if(raf)return;
    raf=requestAnimationFrame(function(){
      raf=0;
      var g=live;if(!g||!g.row||!g.row.isConnected)return;
      /* Do nothing until the real recogniser has resolved horizontal intent. */
      if(!g.row.classList.contains('rt-swipe-dragging'))return;

      var dx=g.x-g.x0;
      var leading=g.row.querySelector(':scope > .rt-swipe-actions .rt-swipe-action.leading');
      var trailing=g.row.querySelector(':scope > .rt-swipe-actions .rt-swipe-action.trailing');
      if(dx>0&&!leading)dx=0;
      if(dx<0&&!trailing)dx=0;

      /* 1:1 finger tracking across the useful width of the row. Only once the
         foreground is essentially off-screen do we add a tiny rubber-band so
         accidental overdrag cannot fling the surface indefinitely. */
      var width=0;try{width=g.row.getBoundingClientRect().width||0;}catch(_){}
      var edge=Math.max(1,width-10),abs=Math.abs(dx);
      if(width&&abs>edge){
        var sign=dx<0?-1:1;
        dx=sign*(edge+(abs-edge)*0.14);
      }
      g.row.style.setProperty('--rt-swipe-x',dx.toFixed(1)+'px');
    });
  },{capture:true,passive:true});

  function finish(e,cancelled){
    if(!live||e.pointerId!==live.id)return;
    if(cancelled){stats.cancels++;stats.lastCancel={x:live.x-live.x0,y:live.y-live.y0,time:Date.now()};}
    live=null;cancelFrame();
  }
  window.addEventListener('pointerup',function(e){finish(e,false);},true);
  window.addEventListener('pointercancel',function(e){finish(e,true);},true);

  window.__rtGestureLiveTracking={version:VERSION,stats:stats};
})();
