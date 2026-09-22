/* RETRADE native gesture layer v3.0.0
 *
 * Owns the two high-value touch interactions on mobile:
 *   edge-right  -> interactive back
 *   item row    -> right primary / left delete / hold more
 *
 * v2 remains loaded behind this layer for desktop and non-item generic rows.
 * When v3 claims a pointer it stops propagation at window capture, so only one
 * recogniser can own that contact.
 */
(function(){
  'use strict';

  var VERSION='3.0.0';
  var ROW='.item-row:not(.joblot-row)';
  var LOCK=6;
  var DOM=1.08;
  var HOLD_MS=500;
  var HOLD_SLOP=9;
  var REVEAL=84;
  var PRIMARY_RATIO=.43;
  var PRIMARY_MIN=142;
  var DELETE_RATIO=.68;
  var DELETE_MIN=220;
  var BACK_RATIO=.26;
  var BACK_MIN=78;
  var BACK_MAX=122;
  var BACK_FLICK_MIN=46;
  var BACK_FLICK_V=.52;
  var VELOCITY_WINDOW=105;
  var SPRING='cubic-bezier(.2,.82,.24,1)';

  var g=null;
  var holdTimer=0;
  var suppressClickUntil=0;
  var edge=null;
  var routeTimer=0;
  var routeStack=[];
  var lastPage='';
  var contextDrag=null;
  var contextRaf=0;

  function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function touch(e){return e.pointerType==='touch'||e.pointerType==='pen';}
  function clean(s){return String(s||'').replace(/\s+/g,' ').trim();}
  function interactive(t){return !!(t&&t.closest&&t.closest('button,input,select,textarea,a,[contenteditable="true"],[data-no-gesture],.rt-swipe-actions'));}
  function reduce(){try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(_){return false;}}
  function clearHold(){if(holdTimer){clearTimeout(holdTimer);holdTimer=0;}}
  function sample(state,x,t){
    if(!state.samples)state.samples=[];
    state.samples.push({x:x,t:t});
    var cut=t-VELOCITY_WINDOW;
    while(state.samples.length>2&&state.samples[0].t<cut)state.samples.shift();
  }
  function velocity(state,x,t){
    sample(state,x,t);
    if(!state.samples||state.samples.length<2)return 0;
    var a=state.samples[0],b=state.samples[state.samples.length-1];
    return (b.x-a.x)/Math.max(1,b.t-a.t);
  }
  function iconHtml(name){
    try{if(typeof icon==='function')return icon(name,19);}catch(_){}
    if(name==='trash')return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 7h16M9 3h6l1 4H8l1-4Zm-2 4 1 14h8l1-14"/></svg>';
    if(name==='sold')return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 12 12 20 4 12V4h8l8 8Z"/><circle cx="9" cy="9" r="1"/></svg>';
    if(name==='relist')return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15m0 5v-5h5"/></svg>';
    if(name==='return')return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m9 14-4-4 4-4M5 10h9a5 5 0 0 1 5 5v3"/></svg>';
    return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>';
  }

  function installStyles(){
    var old=document.getElementById('rt-native-gestures-v3-css');if(old)old.remove();
    var s=document.createElement('style');s.id='rt-native-gestures-v3-css';
    s.textContent=[
      '#rt-v3-back-edge{position:fixed;left:0;top:calc(50px + env(safe-area-inset-top,0px));bottom:calc(62px + env(safe-area-inset-bottom,0px));width:26px;z-index:11850;pointer-events:none;touch-action:none;-webkit-user-select:none;user-select:none;background:transparent}',
      '#rt-v3-back-edge.on{pointer-events:auto}',
      'html.rt-v3-gesture-lock,html.rt-v3-gesture-lock body{overscroll-behavior:none!important}',
      'html body .rt-v3-row{touch-action:pan-y pinch-zoom!important;position:relative!important;overflow:hidden!important;isolation:isolate;--rt-v3-x:0px}',
      'html body .rt-v3-row>.rt-v3-rail{position:absolute;inset:0;z-index:0;border-radius:inherit;overflow:hidden;pointer-events:none}',
      'html body .rt-v3-row>.rt-v3-rail>.rt-v3-action{position:absolute;top:0;bottom:0;width:100%;display:flex;align-items:center;gap:8px;padding:0 20px;border:0;font:750 12px/1 var(--font-body);opacity:0;transition:opacity 90ms ease-out;pointer-events:none}',
      '.rt-v3-action.leading{left:0;justify-content:flex-start;background:var(--accent);color:#111}',
      '.rt-v3-action.trailing{right:0;justify-content:flex-end;background:var(--red);color:#fff}',
      '.rt-v3-action .rt-v3-release{font-size:10px;opacity:.78;font-weight:650}',
      'html body .rt-v3-row>*:not(.rt-v3-rail):not(.rt-swipe-actions){position:relative;z-index:1;translate:var(--rt-v3-x) 0;transition:translate 205ms '+SPRING+',opacity 90ms ease-out!important;will-change:translate}',
      'html body .rt-v3-row.rt-v3-dragging>*:not(.rt-v3-rail):not(.rt-swipe-actions){transition:none!important}',
      'html body .rt-v3-row.rt-v3-dragging:active{transform:none!important;scale:1!important}',
      'html body .rt-v3-row.rt-v3-ready-delete>.rt-v3-rail>.trailing,html body .rt-v3-row.rt-v3-ready-primary>.rt-v3-rail>.leading{filter:brightness(1.06)}',
      'html body .page.on.rt-v3-back-current{animation:none!important;transition:none!important;position:relative;z-index:181;will-change:transform,box-shadow;background:var(--bg)}',
      'html body .page.on.rt-v3-back-current.rt-v3-back-locked{box-shadow:-18px 0 36px rgba(0,0,0,.14)}',
      '.rt-v3-back-preview-shell{position:fixed;overflow:hidden;pointer-events:none;z-index:180;background:var(--bg);contain:layout paint style}',
      'html body .rt-v3-back-preview-shell>.page.rt-v3-back-preview{display:block!important;visibility:visible!important;animation:none!important;transition:none!important;pointer-events:none!important;margin:0!important;opacity:1!important;will-change:transform,opacity}',
      'html body .page.rt-v3-back-settling,.rt-v3-back-preview-shell.rt-v3-back-settling>.page{transition:transform 205ms '+SPRING+',opacity 175ms ease-out,box-shadow 175ms ease-out!important}',
      '#rt-gesture-context.rt-v3-context-dragging{transition:none!important;will-change:transform}',
      '#rt-gesture-context.rt-v3-context-settling{transition:transform 205ms '+SPRING+',opacity 175ms ease-out!important}',
      '#rt-gesture-context .rt-context-handle,#rt-gesture-context .rt-context-title{touch-action:none}',
      '@media(hover:none) and (pointer:coarse){.item-row .ddwrap{display:none!important}.item-row .ddbtn{display:none!important}}',
      '@media(prefers-reduced-motion:reduce){html body .rt-v3-row>*:not(.rt-v3-rail):not(.rt-swipe-actions),html body .page.rt-v3-back-settling,.rt-v3-back-preview-shell.rt-v3-back-settling>.page,#rt-gesture-context.rt-v3-context-settling{transition:none!important}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  installStyles();

  function parseInfo(row){
    if(!row)return null;
    var id='',month='';
    var dd=row.querySelector('.ddwrap[id^="dd-"],[id^="dd-"]');
    if(dd&&dd.id.indexOf('dd-')===0)id=dd.id.slice(3);
    var code=String(row.getAttribute('onclick')||'');
    var m=code.match(/openItemPage\(['\"]([^'\"]+)['\"],['\"]([^'\"]+)['\"]/);
    if(m){month=m[1];if(!id)id=m[2];}
    var rec=null;
    try{if(id&&typeof _findItemRecordById==='function')rec=_findItemRecordById(id);}catch(_){}
    if(rec)return {id:id,month:rec.month||month,item:rec.item};
    try{if(id&&month&&typeof DB!=='undefined'){var item=(DB[month]||[]).find(function(x){return x.id===id;});if(item)return {id:id,month:month,item:item};}}catch(_){}
    return null;
  }
  function itemState(info){
    if(!info||!info.item)return '';
    try{if(typeof _itemLifecycleState==='function')return _itemLifecycleState(info.item);}catch(_){}
    var i=info.item;
    if(i.isReturned)return 'returned';
    if(i.dateSold||i.resaleSalePrice)return 'sold';
    return i.state==='sourced'?'sourced':'listed';
  }
  function primary(info){
    var state=itemState(info),m=info.month,id=info.id;
    if(state==='sourced'&&typeof openListFromSourced==='function')return {label:'List Item',icon:'list',run:function(){openListFromSourced(m,id);}};
    if(state==='listed'&&typeof markSold==='function')return {label:'Mark Sold',icon:'sold',run:function(){markSold(m,id);}};
    if(state==='sold'&&typeof openReturn==='function')return {label:'Log Return',icon:'return',run:function(){openReturn(m,id);}};
    if(state==='returned'&&typeof openRelist==='function')return {label:'Relist',icon:'relist',run:function(){openRelist(m,id);}};
    return null;
  }
  function deletion(info){
    if(!info||typeof deleteItem!=='function')return null;
    return {label:'Delete',icon:'trash',run:function(){deleteItem(info.month,info.id);}};
  }
  function ensureRail(row,p,d){
    row.classList.add('rt-v3-row');
    var old=row.querySelector(':scope > .rt-v3-rail');if(old)old.remove();
    var rail=document.createElement('div');rail.className='rt-v3-rail';
    function add(a,side){
      if(!a)return null;
      var b=document.createElement('div');b.className='rt-v3-action '+side;
      b.innerHTML=iconHtml(a.icon)+'<span>'+a.label+'</span><span class="rt-v3-release"></span>';
      rail.appendChild(b);return b;
    }
    var lead=add(p,'leading'),trail=add(d,'trailing');row.appendChild(rail);
    return {rail:rail,lead:lead,trail:trail};
  }
  function setRowX(state,x){
    var row=state.row,w=Math.max(1,row.getBoundingClientRect().width),abs=Math.abs(x);
    if(x>0&&!state.primary)x=0;if(x<0&&!state.del)x=0;
    var edge=w-8;if(abs>edge)x=(x<0?-1:1)*(edge+(abs-edge)*.12);
    row.style.setProperty('--rt-v3-x',x.toFixed(1)+'px');
    state.lastDx=x;
    if(state.rail.lead)state.rail.lead.style.opacity=String(clamp(x/REVEAL,0,1));
    if(state.rail.trail)state.rail.trail.style.opacity=String(clamp((-x)/REVEAL,0,1));
    var pReady=!!(state.primary&&x>=Math.max(PRIMARY_MIN,w*PRIMARY_RATIO));
    var dReady=!!(state.del&&-x>=Math.max(DELETE_MIN,w*DELETE_RATIO));
    row.classList.toggle('rt-v3-ready-primary',pReady);row.classList.toggle('rt-v3-ready-delete',dReady);
    if(state.rail.lead){var n=state.rail.lead.querySelector('.rt-v3-release');if(n)n.textContent=pReady?'Release':'';}
    if(state.rail.trail){var q=state.rail.trail.querySelector('.rt-v3-release');if(q)q.textContent=dReady?'Release to delete':'';}
    if((pReady||dReady)!==state.ready){state.ready=pReady||dReady;try{if(state.ready&&navigator.vibrate)navigator.vibrate(7);}catch(_){}}
  }
  function settleRow(state,mode){
    var row=state.row;if(!row)return;
    row.classList.remove('rt-v3-dragging','rt-v3-ready-primary','rt-v3-ready-delete');
    if(mode==='leading')row.style.setProperty('--rt-v3-x',REVEAL+'px');
    else if(mode==='trailing')row.style.setProperty('--rt-v3-x',(-REVEAL)+'px');
    else row.style.setProperty('--rt-v3-x','0px');
    if(mode==='leading'&&state.rail.lead){state.rail.lead.style.opacity='1';state.rail.lead.style.pointerEvents='auto';}
    if(mode==='trailing'&&state.rail.trail){state.rail.trail.style.opacity='1';state.rail.trail.style.pointerEvents='auto';}
  }
  function finishRow(state,dx,cancelled){
    var row=state.row,w=Math.max(1,row.getBoundingClientRect().width),abs=Math.abs(dx);
    var pCommit=state.primary&&dx>=Math.max(PRIMARY_MIN,w*PRIMARY_RATIO);
    var dCommit=state.del&&-dx>=Math.max(DELETE_MIN,w*DELETE_RATIO);
    if(pCommit){
      row.classList.remove('rt-v3-dragging');row.style.setProperty('--rt-v3-x',w+'px');suppressClickUntil=Date.now()+650;
      setTimeout(function(){settleRow(state,'closed');try{state.primary.run();}catch(e){console.warn('[RETRADE] primary swipe failed',e);}},reduce()?0:115);return;
    }
    if(dCommit){
      row.classList.remove('rt-v3-dragging');row.style.setProperty('--rt-v3-x',(-w)+'px');suppressClickUntil=Date.now()+750;
      setTimeout(function(){settleRow(state,'closed');try{state.del.run();}catch(e){console.warn('[RETRADE] delete swipe failed',e);}},reduce()?0:135);return;
    }
    if(abs>=58){settleRow(state,dx>0?'leading':'trailing');suppressClickUntil=Date.now()+420;}
    else settleRow(state,'closed');
  }

  function activePage(){return document.querySelector('.page.on');}
  function recordRoute(){
    routeTimer=0;var p=activePage();if(!p||!p.id)return;
    if(p.id===lastPage)return;
    routeStack.push(p.id);if(routeStack.length>16)routeStack.shift();lastPage=p.id;syncEdge();
  }
  function scheduleRoute(){if(!routeTimer)routeTimer=setTimeout(recordRoute,0);}
  try{new MutationObserver(scheduleRoute).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});}catch(_){}
  setTimeout(recordRoute,0);

  function prevPage(current){
    var stack=(window.__rtInteractionSystem&&window.__rtInteractionSystem.pageStack)||routeStack;
    var idx=current&&current.id?stack.lastIndexOf(current.id):-1;
    if(idx<1)return null;
    return document.getElementById(stack[idx-1])||null;
  }
  function visible(el){if(!el)return false;try{var r=el.getBoundingClientRect(),cs=getComputedStyle(el);return !!(r.width&&r.height&&cs.display!=='none'&&cs.visibility!=='hidden');}catch(_){return false;}}
  function backTarget(){
    if(document.getElementById('rt-gesture-context')&&document.getElementById('rt-gesture-context').classList.contains('on'))return {page:null,prev:null,run:function(){try{window.__rtInteractionSystem.closeContext();}catch(_){}}};
    var page=activePage();if(!page)return null;
    var prev=prevPage(page);
    var btns=page.querySelectorAll('.ip-back,button[onclick*="exitItemPage"],button[onclick*="backToMonthlyGrid"],button[onclick*="backToAccountsList"],button[onclick*="backTo"],button[aria-label^="Back" i]');
    var btn=Array.prototype.find.call(btns,function(b){return visible(b)&&!b.disabled;});
    if(btn)return {page:page,prev:prev,run:function(){try{btn.click();}catch(_){}}};
    try{if(page.id==='p-item'&&typeof exitItemPage==='function')return {page:page,prev:prev,run:function(){exitItemPage();}};}catch(_){}
    try{if(page.id==='p-monthly'&&typeof MONTHLY_VIEW!=='undefined'&&MONTHLY_VIEW==='detail'&&typeof backToMonthlyGrid==='function')return {page:page,prev:null,run:function(){backToMonthlyGrid();}};}catch(_){}
    return null;
  }
  function ensureEdge(){
    if(edge&&edge.isConnected)return edge;
    edge=document.createElement('div');edge.id='rt-v3-back-edge';edge.setAttribute('aria-hidden','true');document.body.appendChild(edge);return edge;
  }
  function syncEdge(){var e=ensureEdge();e.classList.toggle('on',!!backTarget());}
  function makePreview(state){
    var cur=state.target.page,prev=state.target.prev;if(!cur)return;
    cur.classList.add('rt-v3-back-current');
    if(!prev||prev===cur)return;
    var rect=cur.getBoundingClientRect(),shell=document.createElement('div');shell.className='rt-v3-back-preview-shell';
    shell.style.left=rect.left+'px';shell.style.top=rect.top+'px';shell.style.width=rect.width+'px';shell.style.height=Math.max(1,innerHeight-rect.top)+'px';
    var clone=prev.cloneNode(true);clone.classList.add('rt-v3-back-preview','on');try{clone.inert=true;}catch(_){}
    clone.style.width=rect.width+'px';clone.style.minHeight=Math.max(rect.height,innerHeight-rect.top)+'px';clone.style.transform='translate3d(-14%,0,0)';clone.style.opacity='.94';
    shell.appendChild(clone);document.body.appendChild(shell);state.shell=shell;state.preview=clone;
  }
  function backThreshold(){return Math.max(BACK_MIN,Math.min(BACK_MAX,innerWidth*BACK_RATIO));}
  function setBackX(state,x){
    x=clamp(x,0,innerWidth);state.lastDx=x;
    var page=state.target.page;if(!page)return;
    page.classList.add('rt-v3-back-current','rt-v3-back-locked');page.style.transform='translate3d('+x.toFixed(1)+'px,0,0)';
    if(state.preview){var p=clamp(x/innerWidth,0,1);state.preview.style.transform='translate3d('+(-14+14*p).toFixed(2)+'%,0,0)';state.preview.style.opacity=String(.94+.06*p);}
  }
  function cleanupBack(state){
    if(state.shell&&state.shell.parentNode)state.shell.remove();
    var page=state.target&&state.target.page;if(page){page.classList.remove('rt-v3-back-current','rt-v3-back-locked','rt-v3-back-settling');page.style.removeProperty('transform');}
    syncEdge();
  }
  function finishBack(state,commit,v){
    var page=state.target.page;
    if(!page){if(commit)state.target.run();cleanupBack(state);return;}
    page.classList.remove('rt-v3-back-locked');page.classList.add('rt-v3-back-settling');if(state.shell)state.shell.classList.add('rt-v3-back-settling');
    if(commit){page.style.transform='translate3d('+innerWidth+'px,0,0)';if(state.preview){state.preview.style.transform='translate3d(0,0,0)';state.preview.style.opacity='1';}}
    else{page.style.transform='translate3d(0,0,0)';if(state.preview){state.preview.style.transform='translate3d(-14%,0,0)';state.preview.style.opacity='.94';}}
    var ms=reduce()?0:(commit?Math.max(115,Math.min(185,170-Math.abs(v||0)*28)):185);
    setTimeout(function(){if(commit){try{state.target.run();}catch(e){console.warn('[RETRADE] back swipe failed',e);}}cleanupBack(state);},ms);
  }

  function lockDocument(state){state.lockedScroll=scrollY||pageYOffset||0;document.documentElement.classList.add('rt-v3-gesture-lock');}
  function unlockDocument(){document.documentElement.classList.remove('rt-v3-gesture-lock');}

  window.addEventListener('pointerdown',function(e){
    if(!touch(e)||e.isPrimary===false||g)return;
    var t=e.target;
    if(t&&t.id==='rt-v3-back-edge'){
      var bt=backTarget();if(!bt)return;
      g={kind:'back',id:e.pointerId,x0:e.clientX,y0:e.clientY,lastDx:0,mode:'locked',target:bt,samples:[{x:e.clientX,t:now()}]};
      lockDocument(g);makePreview(g);e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();return;
    }
    var row=t&&t.closest?t.closest(ROW):null;if(!row||interactive(t))return;
    var info=parseInfo(row);if(!info)return;
    var p=primary(info),d=deletion(info),rail=ensureRail(row,p,d);
    g={kind:'row',id:e.pointerId,row:row,info:info,primary:p,del:d,rail:rail,x0:e.clientX,y0:e.clientY,lastDx:0,mode:'pending',ready:false,samples:[{x:e.clientX,t:now()}]};
    row.classList.add('rt-gesture-pressing');
    clearHold();holdTimer=setTimeout(function(){
      if(!g||g.kind!=='row'||g.mode!=='pending')return;
      g.mode='hold';g.row.classList.remove('rt-gesture-pressing');suppressClickUntil=Date.now()+700;
      try{if(window.__rtInteractionSystem&&window.__rtInteractionSystem.openContextForRow)window.__rtInteractionSystem.openContextForRow(g.row);}catch(_){}
    },HOLD_MS);
    e.stopImmediatePropagation();
  },true);

  window.addEventListener('pointermove',function(e){
    if(!g||e.pointerId!==g.id)return;
    var state=g,t=now(),dx=e.clientX-state.x0,dy=e.clientY-state.y0,ax=Math.abs(dx),ay=Math.abs(dy);sample(state,e.clientX,t);
    if(state.kind==='back'){
      if(dx<0)dx=0;setBackX(state,dx);e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();return;
    }
    if(state.kind==='row'){
      if(state.mode==='hold'){e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();return;}
      if(state.mode==='pending'){
        if(ax<HOLD_SLOP&&ay<HOLD_SLOP)return;
        clearHold();state.row.classList.remove('rt-gesture-pressing');
        if(ay>=LOCK&&ay>ax*1.18){g=null;return;}
        if(ax>=LOCK&&ax>ay*DOM){state.mode='locked';state.row.classList.add('rt-v3-dragging');lockDocument(state);suppressClickUntil=Date.now()+480;}
        else return;
      }
      setRowX(state,dx);e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();
    }
  },{capture:true,passive:false});

  window.addEventListener('pointerup',function(e){
    if(!g||e.pointerId!==g.id)return;
    clearHold();var state=g;g=null,t=now();
    if(state.kind==='back'){
      var dx=Math.max(0,e.clientX-state.x0),v=Math.max(0,velocity(state,e.clientX,t));
      var commit=dx>=backThreshold()||(dx>=BACK_FLICK_MIN&&v>=BACK_FLICK_V);suppressClickUntil=Date.now()+500;unlockDocument();finishBack(state,commit,v);e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();return;
    }
    if(state.kind==='row'){
      state.row.classList.remove('rt-gesture-pressing');
      if(state.mode==='hold'){unlockDocument();return;}
      if(state.mode!=='locked')return;
      unlockDocument();finishRow(state,e.clientX-state.x0,false);e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();
    }
  },{capture:true,passive:false});

  window.addEventListener('pointercancel',function(e){
    if(!g||e.pointerId!==g.id)return;
    clearHold();var state=g;g=null;unlockDocument();
    /* iOS may cancel a pointer after browser arbitration. Once RETRADE has locked
       the horizontal gesture, use the last physical distance instead of snapping
       the UI back to zero. */
    if(state.kind==='back'){
      var commit=(state.lastDx||0)>=backThreshold();finishBack(state,commit,0);suppressClickUntil=Date.now()+450;
    }else if(state.kind==='row'){
      state.row.classList.remove('rt-gesture-pressing');if(state.mode==='locked')finishRow(state,state.lastDx||0,true);else settleRow(state,'closed');
    }
    e.stopImmediatePropagation();
  },true);

  window.addEventListener('click',function(e){
    if(Date.now()<suppressClickUntil&&e.target&&e.target.closest&&e.target.closest(ROW)){e.preventDefault();e.stopImmediatePropagation();}
  },true);

  /* Hard scroll lock only after a horizontal gesture has won. Ordinary vertical
     scrolling from a row remains native while intent is pending. */
  window.addEventListener('touchmove',function(e){if(g&&(g.kind==='back'||(g.kind==='row'&&g.mode==='locked'))){if(e.cancelable)e.preventDefault();}}, {capture:true,passive:false});

  /* Long-press context menu: drag the handle/header down to dismiss. */
  window.addEventListener('pointerdown',function(e){
    if(!touch(e)||contextDrag)return;var sheet=e.target&&e.target.closest?e.target.closest('#rt-gesture-context.on'):null;if(!sheet)return;
    var rect=sheet.getBoundingClientRect();if(e.clientY>rect.top+58&&!e.target.closest('.rt-context-handle,.rt-context-title'))return;
    contextDrag={id:e.pointerId,sheet:sheet,y0:e.clientY,y:e.clientY,lastY:e.clientY,t0:now(),samples:[{x:e.clientY,t:now()}]};e.stopImmediatePropagation();
  },true);
  window.addEventListener('pointermove',function(e){
    if(!contextDrag||e.pointerId!==contextDrag.id)return;var d=contextDrag;d.y=e.clientY;sample(d,e.clientY,now());var dy=Math.max(0,e.clientY-d.y0);
    if(dy<4)return;d.sheet.classList.add('rt-v3-context-dragging');d.sheet.style.transform='translate3d(0,'+dy.toFixed(1)+'px,0) scale(1)';var bd=document.getElementById('rt-gesture-context-backdrop');if(bd)bd.style.opacity=String(clamp(1-dy/260,.18,1));e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();
  },{capture:true,passive:false});
  function settleContext(d,close){
    if(!d||!d.sheet)return;var bd=document.getElementById('rt-gesture-context-backdrop');d.sheet.classList.remove('rt-v3-context-dragging');d.sheet.classList.add('rt-v3-context-settling');
    if(close){d.sheet.style.transform='translate3d(0,110%,0) scale(.99)';if(bd)bd.style.opacity='0';setTimeout(function(){try{window.__rtInteractionSystem.closeContext();}catch(_){}d.sheet.classList.remove('rt-v3-context-settling');d.sheet.style.removeProperty('transform');if(bd)bd.style.removeProperty('opacity');},reduce()?0:170);}
    else{d.sheet.style.transform='translate3d(0,0,0) scale(1)';if(bd)bd.style.opacity='1';setTimeout(function(){d.sheet.classList.remove('rt-v3-context-settling');d.sheet.style.removeProperty('transform');if(bd)bd.style.removeProperty('opacity');},reduce()?0:205);}
  }
  window.addEventListener('pointerup',function(e){
    if(!contextDrag||e.pointerId!==contextDrag.id)return;var d=contextDrag;contextDrag=null;var dy=Math.max(0,e.clientY-d.y0),v=Math.max(0,velocity(d,e.clientY,now()));settleContext(d,dy>=76||(dy>=38&&v>=.55));e.stopImmediatePropagation();
  },true);
  window.addEventListener('pointercancel',function(e){if(contextDrag&&e.pointerId===contextDrag.id){var d=contextDrag;contextDrag=null;settleContext(d,(d.y-d.y0)>=76);}},true);

  window.addEventListener('resize',syncEdge,{passive:true});
  setTimeout(syncEdge,80);

  window.__rtNativeGestures={version:VERSION,syncEdge:syncEdge,backThreshold:backThreshold};
})();
