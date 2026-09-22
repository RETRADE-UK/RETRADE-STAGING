/* RETRADE interactive back handoff v3.1.0
 *
 * Back navigation only. This layer loads before gesture-native-v3 and owns the
 * left-edge contact so the older back recogniser never sees that pointer.
 *
 * Key rule: on commit, route ownership changes immediately. The outgoing page
 * is converted to a pointerless visual clone that finishes sliding away while
 * the real previous page is already active underneath. This prevents the app
 * becoming stuck with the old route translated almost completely off-screen.
 */
(function(){
  'use strict';

  var VERSION='3.1.0';
  var EDGE_W=28;
  var COMMIT_RATIO=.24;
  var COMMIT_MIN=72;
  var COMMIT_MAX=112;
  var FLICK_MIN=42;
  var FLICK_V=.50;
  var VELOCITY_WINDOW=105;
  var SPRING='cubic-bezier(.2,.82,.24,1)';

  var edge=null;
  var g=null;
  var routeStack=[];
  var lastPage='';
  var routeTimer=0;

  function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function touch(e){return e.pointerType==='touch'||e.pointerType==='pen';}
  function reduce(){try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(_){return false;}}
  function activePage(){return document.querySelector('.page.on');}
  function visible(el){
    if(!el)return false;
    try{var r=el.getBoundingClientRect(),cs=getComputedStyle(el);return !!(r.width&&r.height&&cs.display!=='none'&&cs.visibility!=='hidden');}catch(_){return false;}
  }
  function sample(state,x,t){
    state.samples.push({x:x,t:t});
    var cut=t-VELOCITY_WINDOW;
    while(state.samples.length>2&&state.samples[0].t<cut)state.samples.shift();
  }
  function velocity(state,x,t){
    sample(state,x,t);
    if(state.samples.length<2)return 0;
    var a=state.samples[0],b=state.samples[state.samples.length-1];
    return (b.x-a.x)/Math.max(1,b.t-a.t);
  }
  function threshold(){return Math.max(COMMIT_MIN,Math.min(COMMIT_MAX,innerWidth*COMMIT_RATIO));}

  function installStyles(){
    var old=document.getElementById('rt-back-v31-css');if(old)old.remove();
    var s=document.createElement('style');s.id='rt-back-v31-css';
    s.textContent=[
      '#rt-v31-back-edge{position:fixed;left:0;top:calc(50px + env(safe-area-inset-top,0px));bottom:calc(62px + env(safe-area-inset-bottom,0px));width:'+EDGE_W+'px;z-index:11920;pointer-events:none;touch-action:none;-webkit-user-select:none;user-select:none;background:transparent}',
      '#rt-v31-back-edge.on{pointer-events:auto}',
      'html.rt-v31-back-lock,html.rt-v31-back-lock body{overscroll-behavior:none!important}',
      'html body .page.on.rt-v31-back-current{animation:none!important;transition:none!important;position:relative;z-index:184;will-change:transform,box-shadow;background:var(--bg);box-shadow:-18px 0 36px rgba(0,0,0,.14)}',
      '.rt-v31-preview-shell{position:fixed;overflow:hidden;pointer-events:none;z-index:183;background:var(--bg);contain:layout paint style}',
      'html body .rt-v31-preview-shell>.page.rt-v31-preview{display:block!important;visibility:visible!important;animation:none!important;transition:none!important;pointer-events:none!important;margin:0!important;opacity:1!important;will-change:transform,opacity}',
      '.rt-v31-outgoing-shell{position:fixed;overflow:hidden;pointer-events:none!important;z-index:11910;background:var(--bg);contain:layout paint style}',
      'html body .rt-v31-outgoing-shell>.page.rt-v31-outgoing{display:block!important;visibility:visible!important;animation:none!important;pointer-events:none!important;margin:0!important;will-change:transform,box-shadow;box-shadow:-18px 0 36px rgba(0,0,0,.14)}',
      'html body .rt-v31-outgoing-shell.settling>.page.rt-v31-outgoing{transition:transform 175ms '+SPRING+'!important}',
      'html body .page.rt-v31-back-cancel{transition:transform 185ms '+SPRING+',box-shadow 170ms ease-out!important}',
      '@media(prefers-reduced-motion:reduce){html body .rt-v31-outgoing-shell.settling>.page.rt-v31-outgoing,html body .page.rt-v31-back-cancel{transition:none!important}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  installStyles();

  function recordRoute(){
    routeTimer=0;
    var p=activePage();if(!p||!p.id)return;
    if(p.id===lastPage)return;
    routeStack.push(p.id);if(routeStack.length>18)routeStack.shift();lastPage=p.id;
    syncEdge();
  }
  function scheduleRoute(){if(!routeTimer)routeTimer=setTimeout(recordRoute,0);}
  try{new MutationObserver(scheduleRoute).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});}catch(_){}

  function prevPage(current){
    var stack=(window.__rtInteractionSystem&&window.__rtInteractionSystem.pageStack)||routeStack;
    var idx=current&&current.id?stack.lastIndexOf(current.id):-1;
    if(idx<1)return null;
    return document.getElementById(stack[idx-1])||null;
  }

  function target(){
    var page=activePage();if(!page)return null;
    var prev=prevPage(page);
    var btns=page.querySelectorAll('.ip-back,button[onclick*="exitItemPage"],button[onclick*="backToMonthlyGrid"],button[onclick*="backToAccountsList"],button[onclick*="backTo"],button[aria-label^="Back" i]');
    var btn=Array.prototype.find.call(btns,function(b){return visible(b)&&!b.disabled;});
    if(btn)return {page:page,prev:prev,run:function(){btn.click();}};
    try{if(page.id==='p-item'&&typeof exitItemPage==='function')return {page:page,prev:prev,run:function(){exitItemPage();}};}catch(_){}
    try{if(page.id==='p-monthly'&&typeof MONTHLY_VIEW!=='undefined'&&MONTHLY_VIEW==='detail'&&typeof backToMonthlyGrid==='function')return {page:page,prev:null,run:function(){backToMonthlyGrid();}};}catch(_){}
    return null;
  }

  function ensureEdge(){
    if(edge&&edge.isConnected)return edge;
    edge=document.createElement('div');edge.id='rt-v31-back-edge';edge.setAttribute('aria-hidden','true');document.body.appendChild(edge);return edge;
  }
  function syncEdge(){ensureEdge().classList.toggle('on',!!target());}

  function makePreview(state){
    var cur=state.target.page,prev=state.target.prev;if(!cur)return;
    cur.classList.add('rt-v31-back-current');
    if(!prev||prev===cur)return;
    var rect=cur.getBoundingClientRect();
    var shell=document.createElement('div');shell.className='rt-v31-preview-shell';
    shell.style.left=rect.left+'px';shell.style.top=rect.top+'px';shell.style.width=rect.width+'px';shell.style.height=Math.max(1,innerHeight-rect.top)+'px';
    var clone=prev.cloneNode(true);clone.classList.add('rt-v31-preview','on');try{clone.inert=true;}catch(_){}
    clone.style.width=rect.width+'px';clone.style.minHeight=Math.max(rect.height,innerHeight-rect.top)+'px';clone.style.transform='translate3d(-14%,0,0)';clone.style.opacity='.94';
    shell.appendChild(clone);document.body.appendChild(shell);state.previewShell=shell;state.preview=clone;
  }

  function move(state,x){
    x=clamp(x,0,innerWidth);state.lastDx=x;
    var page=state.target.page;if(!page)return;
    page.style.transform='translate3d('+x.toFixed(1)+'px,0,0)';
    if(state.preview){var p=clamp(x/innerWidth,0,1);state.preview.style.transform='translate3d('+(-14+14*p).toFixed(2)+'%,0,0)';state.preview.style.opacity=String(.94+.06*p);}
  }

  function clearDragVisual(state){
    if(state.previewShell&&state.previewShell.parentNode)state.previewShell.remove();
    var page=state.target&&state.target.page;
    if(page){page.classList.remove('rt-v31-back-current','rt-v31-back-cancel');page.style.removeProperty('transform');page.style.removeProperty('transition');}
  }

  function cancel(state){
    var page=state.target.page;if(!page)return clearDragVisual(state);
    page.classList.add('rt-v31-back-cancel');page.style.transform='translate3d(0,0,0)';
    if(state.preview){state.preview.style.transform='translate3d(-14%,0,0)';state.preview.style.opacity='.94';}
    setTimeout(function(){clearDragVisual(state);syncEdge();},reduce()?0:190);
  }

  function outgoingShell(state){
    var page=state.target.page;if(!page)return null;
    var baseRect=page.getBoundingClientRect();
    /* getBoundingClientRect includes the live translate. Recover the unshifted left. */
    var left=baseRect.left-(state.lastDx||0);
    var shell=document.createElement('div');shell.className='rt-v31-outgoing-shell';
    shell.style.left=left+'px';shell.style.top=baseRect.top+'px';shell.style.width=baseRect.width+'px';shell.style.height=Math.max(1,innerHeight-baseRect.top)+'px';
    var clone=page.cloneNode(true);clone.classList.remove('rt-v31-back-current','rt-v31-back-cancel');clone.classList.add('rt-v31-outgoing','on');try{clone.inert=true;}catch(_){}
    clone.style.width=baseRect.width+'px';clone.style.minHeight=Math.max(baseRect.height,innerHeight-baseRect.top)+'px';clone.style.transform='translate3d('+(state.lastDx||0).toFixed(1)+'px,0,0)';
    shell.appendChild(clone);document.body.appendChild(shell);return {shell:shell,clone:clone};
  }

  function commit(state,v){
    /* Preserve the outgoing visual BEFORE route mutation hides/re-renders it. */
    var outgoing=outgoingShell(state);

    /* The preview is only a visual stand-in. Route ownership changes now, not
       after the animation. The real previous page becomes active immediately. */
    if(state.previewShell&&state.previewShell.parentNode)state.previewShell.remove();
    var oldPage=state.target.page;
    if(oldPage){oldPage.classList.remove('rt-v31-back-current');oldPage.style.removeProperty('transform');}

    try{state.target.run();}catch(err){console.warn('[RETRADE] atomic back handoff failed',err);if(outgoing&&outgoing.shell)outgoing.shell.remove();syncEdge();return;}

    document.documentElement.classList.remove('rt-v31-back-lock');
    syncEdge();

    if(!outgoing)return;
    if(reduce()){outgoing.shell.remove();return;}
    requestAnimationFrame(function(){
      outgoing.shell.classList.add('settling');
      outgoing.clone.style.transform='translate3d('+innerWidth+'px,0,0)';
      setTimeout(function(){if(outgoing.shell&&outgoing.shell.parentNode)outgoing.shell.remove();syncEdge();},185);
    });
  }

  window.addEventListener('pointerdown',function(e){
    if(!touch(e)||e.isPrimary===false||g||!e.target||e.target.id!=='rt-v31-back-edge')return;
    var t=target();if(!t)return;
    g={id:e.pointerId,x0:e.clientX,y0:e.clientY,lastDx:0,target:t,samples:[{x:e.clientX,t:now()}]};
    document.documentElement.classList.add('rt-v31-back-lock');makePreview(g);
    e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();
  },true);

  window.addEventListener('pointermove',function(e){
    if(!g||e.pointerId!==g.id)return;
    sample(g,e.clientX,now());move(g,Math.max(0,e.clientX-g.x0));
    e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();
  },{capture:true,passive:false});

  function finish(e,cancelled){
    if(!g||e.pointerId!==g.id)return;
    var state=g;g=null;
    var dx=cancelled?(state.lastDx||0):Math.max(0,e.clientX-state.x0);
    var v=cancelled?0:Math.max(0,velocity(state,e.clientX,now()));
    var shouldCommit=dx>=threshold()||(dx>=FLICK_MIN&&v>=FLICK_V);
    if(shouldCommit)commit(state,v);else{document.documentElement.classList.remove('rt-v31-back-lock');cancel(state);}
    e.stopImmediatePropagation();if(!cancelled&&e.cancelable)e.preventDefault();
  }
  window.addEventListener('pointerup',function(e){finish(e,false);},{capture:true,passive:false});
  window.addEventListener('pointercancel',function(e){finish(e,true);},true);
  window.addEventListener('touchmove',function(e){if(g&&e.cancelable)e.preventDefault();},{capture:true,passive:false});

  window.addEventListener('resize',syncEdge,{passive:true});
  setTimeout(function(){recordRoute();syncEdge();},80);

  window.__rtBackV31={version:VERSION,syncEdge:syncEdge,threshold:threshold};
})();
