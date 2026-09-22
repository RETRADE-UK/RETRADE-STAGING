/* RETRADE chart gesture arbitration v2.0.0
 *
 * app-core owns the chart rendering and the actual scrub UI. This layer only
 * changes when those existing handlers are allowed to start:
 * - tap: remains a native column click/drill
 * - vertical movement: page scroll wins
 * - clear horizontal movement: chart scrub locks and owns the pointer
 * - ~500 ms hold within slop: chart scrub activates in place
 *
 * This reuses svg.__scrubHandlers, so there is no duplicate chart calculation
 * or tooltip implementation to drift away from app-core.
 */
(function(){
  'use strict';
  var VERSION='2.0.0';
  var LOCK=11,DOM=1.24,VERT=1.10,HOLD_MS=500,HOLD_SLOP=10;
  var active=null,holdTimer=0,scanTimer=0;

  function touch(e){return e.pointerType==='touch'||e.pointerType==='pen';}
  function clearHold(){if(holdTimer){clearTimeout(holdTimer);holdTimer=0;}}
  function proxyDown(s){return {pointerType:s.pointerType,pointerId:s.id,clientX:s.x0,clientY:s.y0};}
  function handlers(svg){return svg&&svg.__rtChartGestureCore||null;}
  function startCore(s){
    if(s.started)return true;
    var h=handlers(s.svg);if(!h||typeof h.down!=='function')return false;
    try{h.down(proxyDown(s));s.started=true;}catch(err){console.warn('[RETRADE] chart scrub start failed',err);return false;}
    return true;
  }
  function forceScrubState(s){
    var h=handlers(s.svg);if(!h||typeof h.move!=='function')return;
    // app-core distinguishes tap from scrub using its own movement flag. Mark
    // the held interaction as a scrub, then return the indicator to the exact
    // held location so there is no visible seven-pixel jump.
    try{
      h.move({pointerId:s.id,pointerType:s.pointerType,clientX:s.x0+7,clientY:s.y0,buttons:1,preventDefault:function(){}});
      h.move({pointerId:s.id,pointerType:s.pointerType,clientX:s.x0,clientY:s.y0,buttons:1,preventDefault:function(){}});
    }catch(_){}
  }
  function endActive(cancel){
    clearHold();var s=active;active=null;if(!s||!s.started)return;
    var h=handlers(s.svg);if(!h)return;
    try{if(cancel&&h.cancel)h.cancel();}catch(_){}
  }

  function installStyle(){
    if(document.getElementById('rt-chart-gesture-v2-css'))return;
    var st=document.createElement('style');st.id='rt-chart-gesture-v2-css';
    st.textContent='.rt-chart-gesture-v2{touch-action:pan-y pinch-zoom!important;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}';
    document.head.appendChild(st);
  }
  installStyle();

  function patch(svg){
    if(!svg||!svg.__scrubHandlers)return;
    // app-core refreshes __scrubHandlers on rerender. Always point at the latest
    // closures, while installing the capture arbitration listeners only once.
    svg.__rtChartGestureCore=svg.__scrubHandlers;
    svg.classList.add('rt-chart-gesture-v2');
    if(svg.__rtChartGestureV2Installed)return;
    svg.__rtChartGestureV2Installed=true;

    svg.addEventListener('pointerdown',function(e){
      if(!touch(e)||e.isPrimary===false||active)return;
      clearHold();active={svg:svg,id:e.pointerId,pointerType:e.pointerType,x0:e.clientX,y0:e.clientY,mode:'pending',started:false,held:false};
      var s=active;
      holdTimer=setTimeout(function(){
        if(active!==s||s.mode!=='pending')return;
        s.mode='locked';s.held=true;
        if(startCore(s))forceScrubState(s);
      },HOLD_MS);
      // Do not allow app-core's immediate pointerdown scrub to start. A tap is
      // intentionally deferred to the normal click that follows pointer-up.
      e.stopImmediatePropagation();
    },true);

    svg.addEventListener('pointermove',function(e){
      if(!active||active.svg!==svg||e.pointerId!==active.id)return;
      var s=active,dx=e.clientX-s.x0,dy=e.clientY-s.y0,ax=Math.abs(dx),ay=Math.abs(dy);
      if(s.mode==='pending'){
        if(ax<HOLD_SLOP&&ay<HOLD_SLOP)return;
        clearHold();
        if(ay>=LOCK&&ay>ax*VERT){active=null;return;}
        if(ax>=LOCK&&ax>ay*DOM){s.mode='locked';if(!startCore(s)){active=null;return;}}
        else return;
      }
      if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();
      var h=handlers(svg);try{if(h&&h.move)h.move(e);}catch(_){}
    },{capture:true,passive:false});

    svg.addEventListener('pointerup',function(e){
      if(!active||active.svg!==svg||e.pointerId!==active.id)return;
      clearHold();var s=active;active=null;
      if(s.mode!=='locked'||!s.started)return; // native click/drill remains intact
      if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();
      var h=handlers(svg);try{if(h&&h.up)h.up(e);}catch(_){}
    },{capture:true,passive:false});

    svg.addEventListener('pointercancel',function(e){
      if(!active||active.svg!==svg||e.pointerId!==active.id)return;
      var s=active;active=null;clearHold();
      if(!s.started)return;
      e.stopImmediatePropagation();var h=handlers(svg);try{if(h&&h.cancel)h.cancel();}catch(_){}
    },true);
  }

  function scan(){
    scanTimer=0;document.querySelectorAll('svg').forEach(function(svg){if(svg.__scrubHandlers)patch(svg);});
  }
  function schedule(){if(scanTimer)return;scanTimer=setTimeout(scan,0);}
  scan();
  try{new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});}catch(_){}
  window.addEventListener('retrade:motion-ready',schedule);

  window.__rtChartGestures={version:VERSION,rescan:scan,cancel:function(){endActive(true);}};
})();
