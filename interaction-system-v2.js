/* RETRADE interaction system v2.0.0
 *
 * Touch-first interaction layer for staging.
 *
 * Core rules:
 * - tap stays a tap: no artificial timeout after pointer-up
 * - gesture intent is resolved once; after a gesture locks it owns the pointer
 * - vertical scrolling wins while intent is ambiguous
 * - long-press is cancelled by movement outside native-like slop
 * - destructive actions can be revealed, never executed by a full swipe
 * - edge-back is an interactive page transition: the current page follows the
 *   finger while the previous page is exposed beneath it with subtle parallax
 */
(function(){
  'use strict';

  var VERSION='2.0.0';
  var ROW_SELECTOR=[
    '.item-row',
    '.expense-item',
    '.run-history-row',
    '.ar-item-row',
    '.act-entry',
    '.cashflow-ledger-row',
    '.mcard'
  ].join(',');
  var INTERACTIVE='button,input,select,textarea,a,[contenteditable="true"],[role="button"],.ddmenu,.rt-swipe-actions,[data-no-gesture]';

  var AXIS_LOCK=11;
  var AXIS_DOMINANCE=1.24;
  var VERTICAL_BIAS=1.10;
  var HOLD_MS=500;
  var HOLD_SLOP=10;
  var REVEAL_PX=78;
  var REVEAL_COMMIT_PX=54;
  var REVEAL_FLICK_PX=38;
  var REVEAL_FLICK_V=0.55;
  var FULL_COMMIT_MIN=138;
  var FULL_COMMIT_RATIO=0.40;
  var FULL_FLICK_MIN_PX=96;
  var FULL_FLICK_V=0.90;
  var MAX_DRAG=164;
  var EDGE_PX=24;
  var BACK_RATIO=0.36;
  var BACK_MIN=104;
  var BACK_MAX=188;
  var BACK_FLICK_MIN_PX=62;
  var BACK_FLICK_V=0.68;
  var VELOCITY_WINDOW_MS=110;
  var EASE='cubic-bezier(.22,.61,.36,1)';
  var SPRING='cubic-bezier(.2,.82,.24,1)';

  var gesture=null;
  var openRow=null;
  var holdTimer=0;
  var suppressClickUntil=0;
  var allowSyntheticClick=false;
  var contextOpen=false;
  var pageStack=[];
  var pageScroll=Object.create(null);
  var lastActivePageId='';
  var pendingHistoryBackId='';
  var historyObserverTimer=0;

  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }
  function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function pointerIsTouch(e){return e.pointerType==='touch'||e.pointerType==='pen';}
  function cleanText(s){return String(s||'').replace(/\s+/g,' ').trim();}
  function escapeHtml(s){var d=document.createElement('div');d.textContent=String(s||'');return d.innerHTML;}
  function visible(el){
    if(!el||!el.isConnected)return false;
    var r;try{r=el.getBoundingClientRect();}catch(_){return false;}
    var cs;try{cs=getComputedStyle(el);}catch(_){cs=null;}
    return !!(r.width&&r.height&&(!cs||cs.display!=='none')&&(!cs||cs.visibility!=='hidden'));
  }
  function isDangerButton(b){
    return !!(b&&(b.classList.contains('danger')||b.classList.contains('btn-danger')||b.classList.contains('btn-destructive')||b.classList.contains('ip-act-danger')||b.getAttribute('data-action')==='delete'||/\b(delete|remove|dispose|scrap)\b/i.test(cleanText(b.textContent))));
  }
  function iconHtml(name){
    try{if(typeof icon==='function')return icon(name,18);}catch(_){}
    if(name==='trash')return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 3h6l1 4H8l1-4Zm-2 4 1 14h8l1-14"/></svg>';
    if(name==='sold')return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 12 12 20 4 12V4h8l8 8Z"/><circle cx="9" cy="9" r="1"/></svg>';
    if(name==='relist')return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15m0 5v-5h5"/></svg>';
    if(name==='return')return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 14-4-4 4-4M5 10h9a5 5 0 0 1 5 5v3"/></svg>';
    if(name==='list')return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>';
    if(name==='undo')return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>';
    if(name==='edit')return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/></svg>';
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 18 6-6-6-6"/></svg>';
  }

  function installStyles(){
    var old=document.getElementById('rt-interaction-system-css');if(old)old.remove();
    var s=document.createElement('style');s.id='rt-interaction-system-css';
    s.textContent=[
      'html,body{overscroll-behavior-x:none}',
      ROW_SELECTOR+'{touch-action:pan-y pinch-zoom;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
      '.rt-gesture-row{position:relative!important;overflow:hidden!important;isolation:isolate;--rt-swipe-x:0px;transform-origin:50% 50%}',
      '.rt-gesture-row.rt-gesture-pressing{scale:.995;transition:scale 95ms ease-out,filter 95ms ease-out;filter:brightness(.985)}',
      '.rt-gesture-row.rt-swipe-dragging{scale:1;filter:none;transition:none!important}',
      '.rt-gesture-row>*:not(.rt-swipe-actions){translate:var(--rt-swipe-x) 0;transition:translate 205ms '+SPRING+',opacity 90ms ease-out;will-change:translate}',
      '.rt-gesture-row.rt-swipe-dragging>*:not(.rt-swipe-actions){transition:none!important}',
      '.rt-swipe-actions{position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;overflow:hidden}',
      '.rt-swipe-action{position:absolute;top:0;bottom:0;width:86px;min-width:48px;border:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font:700 11px/1.1 var(--font-body);letter-spacing:.01em;opacity:0;pointer-events:none;transition:opacity 90ms ease-out,filter 110ms ease-out,transform 110ms ease-out;user-select:none;-webkit-user-select:none}',
      '.rt-swipe-action svg{flex:none}',
      '.rt-swipe-action.leading{left:0}',
      '.rt-swipe-action.trailing{right:0}',
      '.rt-swipe-action.tone-accent{background:var(--accent);color:#111}',
      '.rt-swipe-action.tone-danger{background:var(--red);color:#fff}',
      '.rt-swipe-action.tone-undo{background:var(--purple);color:#fff}',
      '.rt-swipe-action.tone-neutral{background:var(--text-secondary);color:var(--surface)}',
      '.rt-gesture-row.rt-swipe-open-leading .rt-swipe-action.leading,.rt-gesture-row.rt-swipe-open-trailing .rt-swipe-action.trailing{opacity:1;pointer-events:auto}',
      '.rt-gesture-row.rt-swipe-committing .rt-swipe-action{filter:brightness(1.08);transform:scale(1.035)}',
      '#rt-gesture-context-backdrop{position:fixed;inset:0;z-index:11990;background:rgba(7,10,16,.34);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);opacity:0;pointer-events:none;transition:opacity 140ms ease-out}',
      '#rt-gesture-context-backdrop.on{opacity:1;pointer-events:auto}',
      '#rt-gesture-context{position:fixed;z-index:12000;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));max-width:520px;margin:0 auto;padding:7px;background:color-mix(in srgb,var(--surface) 96%,transparent);border:1px solid var(--border);border-radius:20px;box-shadow:0 18px 54px rgba(0,0,0,.28);transform:translate3d(0,18px,0) scale(.985);opacity:0;pointer-events:none;transition:transform 195ms '+SPRING+',opacity 130ms ease-out}',
      '#rt-gesture-context.on{transform:translate3d(0,0,0) scale(1);opacity:1;pointer-events:auto}',
      '.rt-context-handle{width:34px;height:4px;border-radius:999px;background:var(--border2);margin:2px auto 7px;opacity:.8}',
      '.rt-context-title{padding:6px 11px 8px;font-size:12px;font-weight:700;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.rt-context-action{width:100%;min-height:48px;padding:10px 12px;border:0;border-radius:12px;background:transparent;color:var(--text);display:flex;align-items:center;gap:11px;text-align:left;font:650 13px/1.2 var(--font-body);cursor:pointer;touch-action:manipulation}',
      '.rt-context-action:active{background:var(--surface2);scale:.992}',
      '.rt-context-action.destructive{color:var(--red)}',
      '.rt-context-action+.rt-context-action{border-top:1px solid color-mix(in srgb,var(--border) 68%,transparent)}',
      '.rt-back-preview-shell{position:fixed;overflow:hidden;pointer-events:none;z-index:176;background:var(--bg);contain:layout paint style;opacity:1}',
      '.rt-back-preview-shell>.rt-back-preview{display:block!important;visibility:visible!important;pointer-events:none!important;margin:0!important;opacity:1!important;will-change:transform,opacity}',
      '.page.rt-back-current{position:relative;z-index:177;will-change:transform,box-shadow;transform:translate3d(0,0,0);background:var(--bg)}',
      '.page.rt-back-current.rt-back-locked{box-shadow:-16px 0 34px rgba(0,0,0,.13)}',
      '.page.rt-back-current.rt-back-settling,.rt-back-preview-shell.rt-back-settling>.rt-back-preview{transition:transform 225ms '+SPRING+',opacity 190ms ease-out,box-shadow 190ms ease-out!important}',
      '@media(min-width:760px){#rt-gesture-context{left:50%;right:auto;bottom:auto;top:50%;width:min(420px,calc(100vw - 40px));margin:0;transform:translate3d(-50%,-46%,0) scale(.985)}#rt-gesture-context.on{transform:translate3d(-50%,-50%,0) scale(1)}}',
      '@media(prefers-reduced-motion:reduce){.rt-gesture-row,.rt-gesture-row>*:not(.rt-swipe-actions),#rt-gesture-context,#rt-gesture-context-backdrop,.page.rt-back-current,.rt-back-preview-shell>.rt-back-preview{transition:none!important}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  installStyles();

  function invokeSynthetic(el){
    if(!el)return;
    allowSyntheticClick=true;
    try{el.click();}catch(_){}
    setTimeout(function(){allowSyntheticClick=false;},0);
  }
  function action(label,iconName,run,opts){
    opts=opts||{};
    return {label:label,icon:iconName||'open',run:run,tone:opts.tone||'neutral',destructive:!!opts.destructive,fullSwipe:!!opts.fullSwipe&&!opts.destructive};
  }
  function rowFromTarget(target){
    if(!target||!target.closest)return null;
    var row=target.closest(ROW_SELECTOR);if(!row)return null;
    if(target.closest(INTERACTIVE)&&!target.closest('.item-row-name,.item-name,.expense-main,.act-card'))return null;
    return row;
  }
  function parseItemIdentity(row){
    if(!row||!row.classList.contains('item-row')||row.classList.contains('joblot-row'))return null;
    var id='',month='';
    var dd=row.querySelector('.ddwrap[id^="dd-"],[id^="dd-"]');
    if(dd&&dd.id.indexOf('dd-')===0)id=dd.id.slice(3);
    var code=String(row.getAttribute('onclick')||'');
    var m=code.match(/openItemPage\(['\"]([^'\"]+)['\"],['\"]([^'\"]+)['\"]/);
    if(m){month=m[1];if(!id)id=m[2];}
    var rec=null;
    try{if(id&&typeof _findItemRecordById==='function')rec=_findItemRecordById(id);}catch(_){}
    if(rec)return {id:id,month:rec.month||month,item:rec.item,row:row};
    if(id&&month){
      var item=null;try{item=(DB[month]||[]).find(function(x){return x.id===id;})||null;}catch(_){}
      return {id:id,month:month,item:item,row:row};
    }
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
  function primaryItemAction(info){
    if(!info||!info.item)return null;
    var state=itemState(info),m=info.month,id=info.id;
    if(state==='sourced'&&typeof openListFromSourced==='function')return action('List Item','list',function(){openListFromSourced(m,id);},{tone:'accent',fullSwipe:true});
    if(state==='listed'&&typeof markSold==='function')return action('Mark Sold','sold',function(){markSold(m,id);},{tone:'accent',fullSwipe:true});
    if(state==='sold'&&typeof openReturn==='function')return action('Log Return','return',function(){openReturn(m,id);},{tone:'accent',fullSwipe:true});
    if(state==='returned'&&typeof openRelist==='function')return action('Relist','relist',function(){openRelist(m,id);},{tone:'accent',fullSwipe:true});
    return null;
  }
  function deleteItemAction(info){
    if(!info||!info.id||typeof deleteItem!=='function')return null;
    return action('Delete','trash',function(){deleteItem(info.month,info.id);},{tone:'danger',destructive:true,fullSwipe:false});
  }
  function openItemAction(info){
    if(!info||!info.id||typeof openItemPage!=='function')return null;
    return action('Open Details','open',function(){var p=document.querySelector('.page.on');openItemPage(info.month,info.id,p?p.id:'p-stock');},{tone:'neutral'});
  }
  function buttonAction(button,opts){
    if(!button||button.disabled)return null;
    opts=opts||{};
    var label=cleanText(button.textContent)||opts.label||'Action';
    var destructive=isDangerButton(button);
    var iconName=destructive?'trash':(/undo|reverse/i.test(label)?'undo':(/edit/i.test(label)?'edit':'open'));
    return action(label,iconName,function(){invokeSynthetic(button);},{tone:destructive?'danger':(iconName==='undo'?'undo':(opts.tone||'neutral')),destructive:destructive,fullSwipe:!!opts.fullSwipe&&!destructive});
  }
  function rowMenuButtons(row){
    return Array.prototype.slice.call(row.querySelectorAll('.ddmenu button,.act-actions button,.expense-actions .ddmenu button')).filter(function(b){return !b.disabled;});
  }
  function genericPrimary(row){
    if(!row)return null;
    if(row.classList.contains('act-entry')){
      var itemLink=row.querySelector('.act-item-link:not(:disabled)');
      if(itemLink)return action('Open Item','open',function(){invokeSynthetic(itemLink);},{tone:'accent'});
    }
    var code=String(row.getAttribute('onclick')||'');
    if(code||typeof row.onclick==='function')return action(row.classList.contains('cashflow-ledger-row')?'Edit':'Open','open',function(){invokeSynthetic(row);},{tone:'accent'});
    var buttons=rowMenuButtons(row);
    var preferred=buttons.find(function(b){return !isDangerButton(b)&&/\b(edit|open|view|manage|list|mark sold|relist|return)\b/i.test(cleanText(b.textContent));});
    if(!preferred)preferred=buttons.find(function(b){return !isDangerButton(b);});
    return preferred?buttonAction(preferred,{tone:'accent'}):null;
  }
  function genericTrailing(row){
    if(!row)return null;
    if(row.classList.contains('act-entry')){
      var undo=row.querySelector('.act-undo:not(:disabled)');
      return undo?action('Undo','undo',function(){invokeSynthetic(undo);},{tone:'undo',fullSwipe:false}):null;
    }
    var buttons=rowMenuButtons(row);
    var danger=buttons.find(isDangerButton);
    return danger?buttonAction(danger,{fullSwipe:false}):null;
  }
  function swipeActionsForRow(row){
    var info=parseItemIdentity(row);
    if(info)return {leading:primaryItemAction(info),trailing:deleteItemAction(info),info:info};
    return {leading:genericPrimary(row),trailing:genericTrailing(row),info:null};
  }
  function itemContext(info){
    var out=[],open=openItemAction(info),primary=primaryItemAction(info),state=itemState(info);
    if(open)out.push(open);if(primary)out.push(primary);
    if(typeof editItem==='function')out.push(action('Edit','edit',function(){editItem(info.month,info.id);},{tone:'neutral'}));
    if(state==='returned'&&typeof moveReturnedToUnlisted==='function')out.push(action('Move to Unlisted','return',function(){moveReturnedToUnlisted(info.month,info.id);},{tone:'neutral'}));
    if(out.length<5&&typeof confirmDupeItem==='function')out.push(action('Duplicate','open',function(){confirmDupeItem(info.month,info.id);},{tone:'neutral'}));
    try{if(out.length<5&&typeof _canScrap==='function'&&_canScrap(info.item)&&typeof openScrapModal==='function')out.push(action('Dispose','trash',function(){openScrapModal(info.month,info.id);},{tone:'danger'}));}catch(_){}
    var del=deleteItemAction(info);if(del)out.push(del);
    return {title:(info.item&&info.item.item)||'Item actions',actions:out.slice(0,6)};
  }
  function contextActionsForRow(row){
    var info=parseItemIdentity(row);if(info)return itemContext(info);
    var out=[],lead=genericPrimary(row),trail=genericTrailing(row);
    if(lead)out.push(lead);
    if(trail&&!out.some(function(a){return a.label===trail.label;}))out.push(trail);
    rowMenuButtons(row).forEach(function(b){
      if(out.length>=6)return;
      var a=buttonAction(b);if(!a||a.destructive||out.some(function(x){return x.label===a.label;}))return;
      out.push(a);
    });
    var danger=rowMenuButtons(row).map(function(b){return buttonAction(b);}).find(function(a){return a&&a.destructive;});
    if(danger&&!out.some(function(a){return a.label===danger.label;}))out.push(danger);
    var titleEl=row.querySelector('.item-row-name,.expense-label,.rh-name,.act-title,.cashflow-ledger-row strong,.mname');
    return {title:titleEl?cleanText(titleEl.textContent):'Actions',actions:out.slice(0,6)};
  }

  function ensureRails(row,actions){
    row.classList.add('rt-gesture-row');
    var layer=row.querySelector(':scope > .rt-swipe-actions');
    if(!layer){layer=document.createElement('div');layer.className='rt-swipe-actions';row.appendChild(layer);}
    layer.innerHTML='';
    var out={layer:layer,leading:null,trailing:null};
    function add(a,side){
      if(!a)return null;
      var b=document.createElement('button');b.type='button';b.className='rt-swipe-action '+side+' tone-'+(a.tone||'neutral');
      b.innerHTML=iconHtml(a.icon)+(a.label?'<span>'+escapeHtml(a.label)+'</span>':'');b.setAttribute('aria-label',a.label||'Action');
      b.addEventListener('click',function(e){e.stopPropagation();closeRow(row,true);setTimeout(function(){a.run();},20);});
      layer.appendChild(b);return b;
    }
    out.leading=add(actions.leading,'leading');out.trailing=add(actions.trailing,'trailing');return out;
  }
  function fullCommitDistance(row){
    var w=0;try{w=row.getBoundingClientRect().width||0;}catch(_){}
    return Math.max(FULL_COMMIT_MIN,Math.min(176,w*FULL_COMMIT_RATIO||FULL_COMMIT_MIN));
  }
  function setRowOffset(row,x,rails,rawAbs,a){
    row.style.setProperty('--rt-swipe-x',x.toFixed(1)+'px');
    if(rails&&rails.leading)rails.leading.style.opacity=String(clamp(x/REVEAL_PX,0,1));
    if(rails&&rails.trailing)rails.trailing.style.opacity=String(clamp((-x)/REVEAL_PX,0,1));
    row.classList.toggle('rt-swipe-committing',!!(a&&a.fullSwipe&&!a.destructive&&rawAbs>=fullCommitDistance(row)));
  }
  function closeRow(row,immediate){
    if(!row)return;
    row.classList.remove('rt-gesture-pressing','rt-swipe-dragging','rt-swipe-open-leading','rt-swipe-open-trailing','rt-swipe-committing');
    row.style.removeProperty('scale');row.style.removeProperty('filter');
    if(immediate||reducedMotion())row.style.setProperty('--rt-swipe-x','0px');
    else requestAnimationFrame(function(){row.style.setProperty('--rt-swipe-x','0px');});
    var layer=row.querySelector(':scope > .rt-swipe-actions');
    if(layer)Array.prototype.forEach.call(layer.children,function(b){b.style.opacity='0';b.style.pointerEvents='none';});
    if(openRow===row)openRow=null;
  }
  function openRowAt(row,dir,rails){
    if(openRow&&openRow!==row)closeRow(openRow,false);
    openRow=row;row.classList.remove('rt-gesture-pressing','rt-swipe-dragging','rt-swipe-open-leading','rt-swipe-open-trailing','rt-swipe-committing');
    row.classList.add(dir==='leading'?'rt-swipe-open-leading':'rt-swipe-open-trailing');setRowOffset(row,dir==='leading'?REVEAL_PX:-REVEAL_PX,rails,0,null);
    var b=rails&&(dir==='leading'?rails.leading:rails.trailing);if(b){b.style.opacity='1';b.style.pointerEvents='auto';}
  }
  function commitSwipe(row,a,dir,rails){
    if(!a||a.destructive)return closeRow(row,false);
    suppressClickUntil=Date.now()+520;row.classList.remove('rt-gesture-pressing','rt-swipe-dragging');row.classList.add('rt-swipe-committing');
    setRowOffset(row,dir==='leading'?Math.min(122,MAX_DRAG):-Math.min(122,MAX_DRAG),rails,fullCommitDistance(row),a);
    setTimeout(function(){closeRow(row,true);try{a.run();}catch(err){console.warn('[RETRADE] gesture action failed',err);}},reducedMotion()?0:95);
  }

  function ensureContextUI(){
    var backdrop=document.getElementById('rt-gesture-context-backdrop'),sheet=document.getElementById('rt-gesture-context');
    if(!backdrop){backdrop=document.createElement('div');backdrop.id='rt-gesture-context-backdrop';document.body.appendChild(backdrop);backdrop.addEventListener('click',closeContext);}
    if(!sheet){sheet=document.createElement('div');sheet.id='rt-gesture-context';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-label','Context actions');sheet.setAttribute('aria-hidden','true');document.body.appendChild(sheet);}
    return {backdrop:backdrop,sheet:sheet};
  }
  function closeContext(){
    var ui=ensureContextUI();contextOpen=false;ui.backdrop.classList.remove('on');ui.sheet.classList.remove('on');ui.sheet.setAttribute('aria-hidden','true');
  }
  function openContext(row){
    var model=contextActionsForRow(row);if(!model.actions.length)return;
    if(openRow)closeRow(openRow,true);
    var ui=ensureContextUI();contextOpen=true;suppressClickUntil=Date.now()+680;
    row.classList.remove('rt-gesture-pressing');
    ui.sheet.innerHTML='<div class="rt-context-handle" aria-hidden="true"></div><div class="rt-context-title">'+escapeHtml(model.title)+'</div>';
    model.actions.forEach(function(a){
      var b=document.createElement('button');b.type='button';b.className='rt-context-action'+(a.destructive?' destructive':'');b.innerHTML=iconHtml(a.icon)+(a.label?'<span>'+escapeHtml(a.label)+'</span>':'');
      b.addEventListener('click',function(){closeContext();setTimeout(function(){a.run();},20);});ui.sheet.appendChild(b);
    });
    ui.sheet.setAttribute('aria-hidden','false');requestAnimationFrame(function(){ui.backdrop.classList.add('on');ui.sheet.classList.add('on');var first=ui.sheet.querySelector('button');if(first)try{first.focus({preventScroll:true});}catch(_){first.focus();}});
    try{if(navigator.vibrate)navigator.vibrate(8);}catch(_){}
  }

  function activePage(){return document.querySelector('.page.on');}
  function recordActivePage(){
    historyObserverTimer=0;
    var p=activePage();if(!p||!p.id)return;
    var id=p.id;
    if(id===lastActivePageId)return;
    if(pendingHistoryBackId&&id===pendingHistoryBackId){
      var idx=pageStack.lastIndexOf(id);
      if(idx>=0)pageStack=pageStack.slice(0,idx+1);else pageStack.push(id);
      pendingHistoryBackId='';
    }else if(pageStack[pageStack.length-1]!==id){
      pageStack.push(id);
      if(pageStack.length>14)pageStack.shift();
    }
    lastActivePageId=id;
  }
  function scheduleRecordActive(){
    if(historyObserverTimer)return;
    historyObserverTimer=setTimeout(recordActivePage,0);
  }
  recordActivePage();
  try{
    new MutationObserver(scheduleRecordActive).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  }catch(_){}
  window.addEventListener('scroll',function(){var p=activePage();if(p&&p.id)pageScroll[p.id]=window.scrollY||window.pageYOffset||0;if(openRow&&!gesture)closeRow(openRow,false);},{capture:true,passive:true});

  function previousPageElement(current){
    if(!current||!current.id)return null;
    var idx=pageStack.lastIndexOf(current.id);
    if(idx<1)return null;
    var id=pageStack[idx-1];
    return document.getElementById(id)||null;
  }
  function findBackTarget(){
    if(contextOpen)return {surface:null,run:closeContext,targetPage:null};
    var resale=document.getElementById('resale-modal'),sold=document.getElementById('sold-modal');
    if(resale&&resale.style.display==='flex'&&typeof closeResaleModal==='function')return {surface:null,run:function(){closeResaleModal();},targetPage:null};
    if(sold&&sold.style.display==='flex'&&typeof closeModal==='function')return {surface:null,run:function(){closeModal();},targetPage:null};
    var sheet=document.getElementById('more-sheet');if(sheet&&sheet._msOpen&&typeof closeMoreSheet==='function')return {surface:sheet,run:function(){closeMoreSheet();},targetPage:null};
    var panel=document.getElementById('slide-panel');if(panel&&panel.classList.contains('on')&&typeof closePanel==='function')return {surface:panel,run:function(){closePanel();},targetPage:null};
    var page=activePage();if(!page)return null;
    var prev=previousPageElement(page);
    var btns=page.querySelectorAll('.ip-back,button[onclick*="exitItemPage"],button[onclick*="backToMonthlyGrid"],button[onclick*="backToAccountsList"],button[onclick*="backTo"],button[aria-label^="Back" i]');
    var btn=Array.prototype.find.call(btns,function(b){return visible(b)&&!b.disabled;});
    if(btn)return {surface:page,run:function(){invokeSynthetic(btn);},targetPage:prev};
    try{if(page.id==='p-monthly'&&typeof MONTHLY_VIEW!=='undefined'&&MONTHLY_VIEW==='detail'&&typeof backToMonthlyGrid==='function')return {surface:page,run:function(){backToMonthlyGrid();},targetPage:null};}catch(_){}
    try{if(page.id==='p-item'&&typeof exitItemPage==='function')return {surface:page,run:function(){exitItemPage();},targetPage:prev};}catch(_){}
    return null;
  }
  function backDistance(){return Math.max(BACK_MIN,Math.min(BACK_MAX,window.innerWidth*BACK_RATIO));}
  function makeBackPreview(state){
    if(!state||!state.surface||!state.surface.classList||!state.surface.classList.contains('page'))return;
    var current=state.surface,previous=state.targetPage;
    current.classList.add('rt-back-current');
    if(!previous||previous===current)return;
    var rect=current.getBoundingClientRect();
    var shell=document.createElement('div');shell.className='rt-back-preview-shell';shell.setAttribute('aria-hidden','true');
    shell.style.left=rect.left+'px';shell.style.top=rect.top+'px';shell.style.width=rect.width+'px';shell.style.height=Math.max(1,window.innerHeight-rect.top)+'px';
    var clone=previous.cloneNode(true);clone.classList.add('rt-back-preview','on');clone.removeAttribute('aria-live');
    try{clone.inert=true;}catch(_){}
    clone.style.width=rect.width+'px';clone.style.minHeight=Math.max(rect.height,window.innerHeight-rect.top)+'px';
    clone.style.transform='translate3d(-18%,0,0)';clone.style.opacity='.92';
    shell.appendChild(clone);document.body.appendChild(shell);
    state.previewShell=shell;state.preview=clone;
  }
  function updateBackVisual(state,dx){
    if(!state||!state.surface)return;
    var max=Math.max(1,window.innerWidth),x=clamp(dx,0,max),p=clamp(x/backDistance(),0,1);
    if(state.surface.classList&&state.surface.classList.contains('page')){
      state.surface.classList.add('rt-back-current','rt-back-locked');
      state.surface.style.transform='translate3d('+x.toFixed(1)+'px,0,0)';
      if(state.preview){
        var parallax=-18+(18*clamp(x/max,0,1));
        state.preview.style.transform='translate3d('+parallax.toFixed(2)+'%,0,0)';
        state.preview.style.opacity=String(.92+.08*clamp(p,0,1));
      }
    }else if(state.surface.style){
      state.surface.style.transform='translate3d('+Math.min(x,window.innerWidth*.92).toFixed(1)+'px,0,0)';
    }
  }
  function cleanupBackVisual(state){
    if(!state)return;
    if(state.previewShell&&state.previewShell.parentNode)state.previewShell.parentNode.removeChild(state.previewShell);
    if(state.surface&&state.surface.classList){
      state.surface.classList.remove('rt-back-current','rt-back-locked','rt-back-settling');
      state.surface.style.removeProperty('transform');state.surface.style.removeProperty('box-shadow');state.surface.style.removeProperty('transition');
    }
    if(state.surface&&state.surface.style&&!state.surface.classList){state.surface.style.removeProperty('transform');}
  }
  function settleBack(state,commit,velocity){
    if(!state||!state.surface){if(commit&&state)state.run();return;}
    if(reducedMotion()){
      if(commit){if(state.targetPage&&state.targetPage.id)pendingHistoryBackId=state.targetPage.id;try{state.run();}catch(_){} }
      cleanupBackVisual(state);return;
    }
    var surface=state.surface;
    if(surface.classList&&surface.classList.contains('page')){
      surface.classList.add('rt-back-settling');
      if(state.previewShell)state.previewShell.classList.add('rt-back-settling');
      if(commit){
        surface.style.transform='translate3d('+window.innerWidth+'px,0,0)';
        if(state.preview){state.preview.style.transform='translate3d(0,0,0)';state.preview.style.opacity='1';}
      }else{
        surface.style.transform='translate3d(0,0,0)';surface.classList.remove('rt-back-locked');
        if(state.preview){state.preview.style.transform='translate3d(-18%,0,0)';state.preview.style.opacity='.92';}
      }
      var delay=commit?Math.max(145,Math.min(235,210-Math.abs(velocity||0)*38)):210;
      setTimeout(function(){
        if(commit){
          if(state.targetPage&&state.targetPage.id)pendingHistoryBackId=state.targetPage.id;
          try{state.run();}catch(err){console.warn('[RETRADE] back gesture failed',err);}
        }
        cleanupBackVisual(state);
      },delay);
    }else{
      if(commit){
        surface.style.transition='transform 180ms '+SPRING;surface.style.transform='translate3d(100vw,0,0)';
        setTimeout(function(){try{state.run();}catch(_){}cleanupBackVisual(state);},180);
      }else{
        surface.style.transition='transform 190ms '+SPRING;surface.style.transform='translate3d(0,0,0)';setTimeout(function(){cleanupBackVisual(state);},195);
      }
    }
  }

  function clearHold(){if(holdTimer){clearTimeout(holdTimer);holdTimer=0;}}
  function addVelocitySample(g,x,t){
    if(!g.samples)g.samples=[];g.samples.push({x:x,t:t});
    var cutoff=t-VELOCITY_WINDOW_MS;while(g.samples.length>2&&g.samples[0].t<cutoff)g.samples.shift();
  }
  function recentVelocity(g,endX,endT){
    addVelocitySample(g,endX,endT);if(!g.samples||g.samples.length<2)return 0;
    var first=g.samples[0],last=g.samples[g.samples.length-1],dt=Math.max(1,last.t-first.t);return (last.x-first.x)/dt;
  }
  function capturePointer(g,e){
    if(!g||g.captured)return;
    try{document.documentElement.setPointerCapture(e.pointerId);g.captured=true;}catch(_){}
  }
  function releasePointer(g){
    if(!g||!g.captured)return;
    try{if(document.documentElement.hasPointerCapture(g.id))document.documentElement.releasePointerCapture(g.id);}catch(_){}
    g.captured=false;
  }
  function cancelGesture(hard){
    clearHold();var g=gesture;gesture=null;if(!g)return;
    if(g.kind==='row'&&g.row){g.row.classList.remove('rt-gesture-pressing','rt-swipe-dragging','rt-swipe-committing');if(!g.keptOpen)closeRow(g.row,false);}
    if(g.kind==='back')settleBack(g.back,false,0);
    releasePointer(g);
    if(hard)suppressClickUntil=Date.now()+300;
  }
  function beginRowGesture(e,row){
    var actions=swipeActionsForRow(row);if(!actions.leading&&!actions.trailing)return;
    if(openRow&&openRow!==row)closeRow(openRow,true);
    var rails=ensureRails(row,actions),t=now();
    gesture={kind:'row',id:e.pointerId,row:row,actions:actions,rails:rails,x0:e.clientX,y0:e.clientY,t0:t,mode:'pending',held:false,keptOpen:false,captured:false,samples:[{x:e.clientX,t:t}]};
    row.classList.add('rt-gesture-pressing');
    clearHold();holdTimer=setTimeout(function(){
      if(!gesture||gesture.kind!=='row'||gesture.mode!=='pending')return;
      gesture.mode='hold';gesture.held=true;capturePointer(gesture,e);gesture.row.classList.remove('rt-gesture-pressing');openContext(row);
    },HOLD_MS);
  }
  function beginBackGesture(e,back){
    var t=now();gesture={kind:'back',id:e.pointerId,x0:e.clientX,y0:e.clientY,t0:t,mode:'pending',back:back,captured:false,samples:[{x:e.clientX,t:t}]};
    makeBackPreview(back);
  }

  // Window capture is deliberate. Once this layer claims a touch it runs before
  // legacy document listeners, preventing a second recognizer from restarting it.
  window.addEventListener('pointerdown',function(e){
    if(!pointerIsTouch(e)||e.isPrimary===false||contextOpen||gesture)return;
    var back=findBackTarget();
    if(back&&e.clientX<=EDGE_PX){beginBackGesture(e,back);return;}
    var row=rowFromTarget(e.target);if(row)beginRowGesture(e,row);
  },true);

  window.addEventListener('pointermove',function(e){
    if(!gesture||e.pointerId!==gesture.id)return;
    var g=gesture,t=now(),dx=e.clientX-g.x0,dy=e.clientY-g.y0,ax=Math.abs(dx),ay=Math.abs(dy);addVelocitySample(g,e.clientX,t);
    if(g.kind==='row'){
      if(g.mode==='hold'){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();return;}
      if(g.mode==='pending'){
        if(ax<HOLD_SLOP&&ay<HOLD_SLOP)return;
        clearHold();g.row.classList.remove('rt-gesture-pressing');
        if(ay>=AXIS_LOCK&&ay>ax*VERTICAL_BIAS){gesture=null;releasePointer(g);return;}
        if(ax>=AXIS_LOCK&&ax>ay*AXIS_DOMINANCE){g.mode='swipe';capturePointer(g,e);g.row.classList.add('rt-swipe-dragging');suppressClickUntil=Date.now()+450;}
        else return;
      }
      // Locked means locked: no more axis arbitration until release/cancel.
      if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();
      if(dx>0&&!g.actions.leading)dx=0;if(dx<0&&!g.actions.trailing)dx=0;
      var rawAbs=Math.abs(dx),dir=dx>=0?'leading':'trailing',a=dir==='leading'?g.actions.leading:g.actions.trailing;
      var resisted=rawAbs>REVEAL_PX?REVEAL_PX+(rawAbs-REVEAL_PX)*.46:rawAbs;
      dx=(dx<0?-1:1)*Math.min(MAX_DRAG,resisted);setRowOffset(g.row,dx,g.rails,rawAbs,a);return;
    }
    if(g.kind==='back'){
      if(g.mode==='pending'){
        if(ax<AXIS_LOCK&&ay<AXIS_LOCK)return;
        if(dx<=0||(ay>=AXIS_LOCK&&ay>ax*VERTICAL_BIAS)){var old=g;gesture=null;settleBack(old.back,false,0);return;}
        if(ax>=AXIS_LOCK&&ax>ay*AXIS_DOMINANCE){g.mode='swipe';capturePointer(g,e);suppressClickUntil=Date.now()+450;}
        else return;
      }
      if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();updateBackVisual(g.back,Math.max(0,dx));
    }
  },{capture:true,passive:false});

  window.addEventListener('pointerup',function(e){
    if(!gesture||e.pointerId!==gesture.id)return;
    clearHold();var g=gesture;gesture=null,t=now();
    if(g.kind==='row'){
      g.row.classList.remove('rt-gesture-pressing');
      if(g.mode==='hold'){suppressClickUntil=Date.now()+680;releasePointer(g);return;}
      if(g.mode!=='swipe'){releasePointer(g);return;}
      e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();
      var dx=e.clientX-g.x0,abs=Math.abs(dx),velocity=recentVelocity(g,e.clientX,t),speed=Math.abs(velocity),dir=dx>=0?'leading':'trailing',a=dir==='leading'?g.actions.leading:g.actions.trailing;
      g.row.classList.remove('rt-swipe-dragging','rt-swipe-committing');suppressClickUntil=Date.now()+460;releasePointer(g);
      var fullByDistance=a&&a.fullSwipe&&!a.destructive&&abs>=fullCommitDistance(g.row);
      var fullByFlick=a&&a.fullSwipe&&!a.destructive&&abs>=FULL_FLICK_MIN_PX&&speed>=FULL_FLICK_V;
      if(fullByDistance||fullByFlick){commitSwipe(g.row,a,dir,g.rails);return;}
      var revealByDistance=a&&abs>=REVEAL_COMMIT_PX;
      var revealByFlick=a&&abs>=REVEAL_FLICK_PX&&speed>=REVEAL_FLICK_V;
      if(revealByDistance||revealByFlick){g.keptOpen=true;openRowAt(g.row,dir,g.rails);return;}
      closeRow(g.row,false);return;
    }
    if(g.kind==='back'){
      if(g.mode!=='swipe'){settleBack(g.back,false,0);releasePointer(g);return;}
      e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();
      var bdx=Math.max(0,e.clientX-g.x0),bvel=Math.max(0,recentVelocity(g,e.clientX,t));
      var commit=bdx>=backDistance()||(bdx>=BACK_FLICK_MIN_PX&&bvel>=BACK_FLICK_V);suppressClickUntil=Date.now()+420;releasePointer(g);settleBack(g.back,commit,bvel);
    }
  },{capture:true,passive:false});

  window.addEventListener('pointercancel',function(e){if(gesture&&e.pointerId===gesture.id)cancelGesture(true);},true);
  // Losing DOM capture is not itself a cancellation. Browsers can retarget or
  // release capture during layout changes; the gesture remains owned until an
  // actual pointercancel/pointerup arrives.
  window.addEventListener('lostpointercapture',function(e){
    if(!gesture||e.pointerId!==gesture.id)return;
    if(gesture.mode==='swipe'||gesture.mode==='hold')gesture.captured=false;
  },true);

  window.addEventListener('click',function(e){
    if(allowSyntheticClick)return;
    if(Date.now()<suppressClickUntil){
      var row=e.target.closest&&e.target.closest(ROW_SELECTOR);
      if(row){e.preventDefault();e.stopImmediatePropagation();return;}
    }
    if(openRow&&e.target.closest&&!e.target.closest('.rt-gesture-row'))closeRow(openRow,false);
  },true);
  window.addEventListener('contextmenu',function(e){
    var row=e.target.closest&&e.target.closest(ROW_SELECTOR);if(!row)return;
    e.preventDefault();if(contextOpen)return;var model=contextActionsForRow(row);if(model.actions.length)openContext(row);
  },true);
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&contextOpen){e.preventDefault();closeContext();return;}
    if((e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))&&document.activeElement&&document.activeElement.closest){var row=document.activeElement.closest(ROW_SELECTOR);if(row){e.preventDefault();openContext(row);}}
  },true);

  window.__rtInteractionSystem={
    version:VERSION,
    selector:ROW_SELECTOR,
    config:{axisLock:AXIS_LOCK,axisDominance:AXIS_DOMINANCE,holdMs:HOLD_MS,holdSlop:HOLD_SLOP,revealPx:REVEAL_PX,revealCommitPx:REVEAL_COMMIT_PX,edgePx:EDGE_PX,backRatio:BACK_RATIO},
    pageStack:pageStack,
    closeOpenRow:function(){if(openRow)closeRow(openRow,false);},
    closeContext:closeContext,
    openContextForRow:openContext
  };
})();
