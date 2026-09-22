/* RETRADE Cashflow render performance — v1.5.16
 *
 * Performance-only layer. It does not change accounting truth:
 * - cash/KPI calculations always see the complete ledger;
 * - only the visible transaction list is paged in small batches by default;
 * - repeated cash-event and summary calculations inside one render are memoised;
 * - search/export code outside renderCash continues to see the complete snapshot.
 */
(function(){
  'use strict';
  if(window.__rtCashPerformance1509)return;
  window.__rtCashPerformance1509=true;
  if(typeof window.renderCash!=='function')return;

  var PAGE_SIZE=25;
  var RECENT_DAYS=90;
  var visibleLimit=PAGE_SIZE;
  var historyMode=false;
  var recentAvailable=0;
  var olderAvailable=0;
  var renderDepth=0;
  var summaryDepth=0;
  var summaryCached=null;
  var eventsCached=null;
  var lastFullCount=0;
  var lastVisibleCount=0;
  var lastRenderMs=0;
  var renderStartedAt=0;
  var diag=window.__rtCashPerf1509=window.__rtCashPerf1509||{};

  function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function localISO(d){var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day;}
  function recentCutoff(){var d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(RECENT_DAYS-1));return localISO(d);}
  function activeCash(){var p=document.querySelector('.page.on');return !!(p&&p.id==='p-cash');}
  function searchActive(){
    var page=document.getElementById('p-cash');if(!page)return false;
    var input=page.querySelector('.cashflow-search-field input,input[type="search"]');
    return !!(input&&String(input.value||'').trim());
  }
  function shouldWindow(){return renderDepth>0&&summaryDepth===0&&activeCash()&&!searchActive()&&isFinite(visibleLimit);}
  function cloneSnapshot(snap,rows){
    if(!snap||typeof snap!=='object')return snap;
    var out={};Object.keys(snap).forEach(function(k){out[k]=snap[k];});out.rows=rows;return out;
  }

  var baseEvents=window._cashEventsAll;
  if(typeof baseEvents==='function'){
    window._cashEventsAll=function(){
      if(renderDepth>0&&eventsCached)return eventsCached.slice();
      var v=baseEvents.apply(this,arguments);
      if(renderDepth>0&&Array.isArray(v))eventsCached=v.slice();
      return v;
    };
  }

  var baseSummary=window.calcCashSummary;
  if(typeof baseSummary==='function'){
    window.calcCashSummary=function(){
      if(renderDepth>0&&summaryCached)return summaryCached;
      summaryDepth++;
      try{
        var v=baseSummary.apply(this,arguments);
        if(renderDepth>0)summaryCached=v;
        return v;
      }finally{summaryDepth=Math.max(0,summaryDepth-1);}
    };
  }

  var baseSnapshot=window._cashflowFilteredSnapshot;
  if(typeof baseSnapshot==='function'){
    window._cashflowFilteredSnapshot=function(){
      var snap=baseSnapshot.apply(this,arguments);
      if(!snap||!Array.isArray(snap.rows))return snap;
      lastFullCount=snap.rows.length;
      if(!shouldWindow()){
        lastVisibleCount=lastFullCount;
        return snap;
      }
      /* Main Cashflow is an operational 90-day view. Older rows stay in the
         same authoritative ledger and are exposed through History mode below.
         Search deliberately bypasses this split and still sees the full result. */
      var cut=recentCutoff();
      var recent=[],older=[];
      snap.rows.forEach(function(r){
        var ds=String(r&&r.date||'');
        if(!ds||ds>=cut)recent.push(r);else older.push(r);
      });
      recentAvailable=recent.length;olderAvailable=older.length;
      var source=historyMode?older:recent;
      var rows=source.slice(0,Math.max(PAGE_SIZE,visibleLimit));
      lastVisibleCount=rows.length;
      return cloneSnapshot(snap,rows);
    };
  }

  function installStyles(){
    if(document.getElementById('rt-cash-performance-1509-style'))return;
    var s=document.createElement('style');s.id='rt-cash-performance-1509-style';
    s.textContent='\
#p-cash .rt-cash-history-window1509{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0 0;padding:11px 12px;border:1px solid var(--border);border-radius:10px;background:color-mix(in srgb,var(--surface2) 72%,transparent);font-size:10.5px;color:var(--text-secondary)}\
#p-cash .rt-cash-history-window1509 strong{color:var(--text);font-size:11px}\
#p-cash .cashflow-result-count{display:none!important}\
#p-cash .rt-cash-history-window1509 button{min-height:30px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:10.5px;font-weight:700;cursor:pointer}\
#p-cash .rt-cash-history-window1509 button:hover{border-color:color-mix(in srgb,var(--accent) 46%,var(--border))}\
#p-cash .rt-cash-history-window1509 .rt-cash-history-back1514{background:var(--surface2)}\
@media(max-width:640px){#p-cash .rt-cash-history-window1509{align-items:flex-start;flex-direction:column}#p-cash .rt-cash-history-window1509 button{width:100%}}';
    document.head.appendChild(s);
  }

  function nextWindow(){
    if(!isFinite(visibleLimit))return;
    visibleLimit+=PAGE_SIZE;
  }
  function enterHistory(){
    historyMode=true;visibleLimit=PAGE_SIZE;
    try{window.renderCash();}catch(_){}
    requestAnimationFrame(function(){try{window.scrollTo({top:0,behavior:'smooth'});}catch(_){window.scrollTo(0,0);}});
  }
  function leaveHistory(){
    historyMode=false;visibleLimit=PAGE_SIZE;
    try{window.renderCash();}catch(_){}
    requestAnimationFrame(function(){
      var h=document.querySelector('#p-cash .cashflow-list-heading');
      if(h&&h.scrollIntoView)try{h.scrollIntoView({block:'start',behavior:'smooth'});}catch(_){}
    });
  }

  function injectWindowControl(){
    var page=document.getElementById('p-cash');if(!page||!page.classList.contains('on'))return;
    var old=page.querySelector('.rt-cash-history-window1509');if(old)old.remove();
    var ledger=page.querySelector('.rt-cash-ledger');
    var mobile=page.querySelector('.rt-cash-mobile-list');
    var nativeList=page.querySelector('.cashflow-ledger-list');
    var anchor=ledger||mobile||nativeList;
    if(!anchor)return;
    var box=document.createElement('div');box.className='rt-cash-history-window1509';
    var available=historyMode?olderAvailable:recentAvailable;
    var hidden=Math.max(0,available-lastVisibleCount);
    var text=document.createElement('span');
    if(historyMode){
      text.innerHTML='<strong>Cashflow History</strong> · showing '+lastVisibleCount+' of '+available+' transaction'+(available===1?'':'s')+' older than '+RECENT_DAYS+' days';
    }else{
      text.innerHTML='<strong>Recent Cashflow</strong> · showing '+lastVisibleCount+' of '+available+' transaction'+(available===1?'':'s')+' from the last '+RECENT_DAYS+' days';
    }
    box.appendChild(text);
    if(hidden&&isFinite(visibleLimit)){
      var btn=document.createElement('button');btn.type='button';btn.textContent='Load '+Math.min(PAGE_SIZE,hidden)+' more';
      btn.onclick=function(){nextWindow();try{window.renderCash();}catch(_){}};
      box.appendChild(btn);
    }else if(!historyMode&&olderAvailable>0){
      var history=document.createElement('button');history.type='button';history.textContent='View older transactions ('+olderAvailable+')';
      history.onclick=enterHistory;box.appendChild(history);
    }else if(historyMode){
      var back=document.createElement('button');back.type='button';back.className='rt-cash-history-back1514';back.textContent='Back to recent Cashflow';
      back.onclick=leaveHistory;box.appendChild(back);
    }
    /* This is intentionally a ledger footer: the user reaches it only after
       scrolling through the currently rendered batch. Inserting the next batch
       before the footer keeps the current scroll offset stable, so the old footer
       position becomes the natural continuation point into the newly revealed
       rows. */
    if(anchor.parentNode)anchor.parentNode.insertBefore(box,anchor.nextSibling);
  }

  var baseRender=window.renderCash;
  window.renderCash=function(){
    var outer=renderDepth===0;
    if(outer){
      summaryCached=null;eventsCached=null;lastFullCount=0;lastVisibleCount=0;recentAvailable=0;olderAvailable=0;renderStartedAt=now();
    }
    renderDepth++;
    try{return baseRender.apply(this,arguments);}
    finally{
      renderDepth=Math.max(0,renderDepth-1);
      if(outer){
        lastRenderMs=now()-renderStartedAt;
        diag.lastRenderMs=Math.round(lastRenderMs*10)/10;
        diag.fullRows=lastFullCount;
        diag.visibleRows=lastVisibleCount;
        diag.visibleLimit=isFinite(visibleLimit)?visibleLimit:'all';
        diag.historyMode=historyMode;
        diag.recentRows=recentAvailable;
        diag.olderRows=olderAvailable;
        summaryCached=null;eventsCached=null;
        requestAnimationFrame(injectWindowControl);
      }
    }
  };

  /* Data mutations invalidate any short-lived memo immediately. */
  if(typeof window.saveDB==='function'&&!window.saveDB.__rtCashPerf1509){
    var baseSave=window.saveDB;
    var saveWrapped=function(){summaryCached=null;eventsCached=null;return baseSave.apply(this,arguments);};
    saveWrapped.__rtCashPerf1509=true;saveWrapped.__rtBase=baseSave;window.saveDB=saveWrapped;try{saveDB=saveWrapped;}catch(_){}
  }

  window._rtCashHistoryWindow1509={
    reset:function(){historyMode=false;visibleLimit=PAGE_SIZE;},
    showAll:function(){historyMode=true;visibleLimit=Infinity;try{window.renderCash();}catch(_){}},
    showHistory:enterHistory,
    showRecent:leaveHistory,
    get:function(){return visibleLimit;},
    pageSize:PAGE_SIZE,
    recentDays:RECENT_DAYS
  };

  installStyles();
  requestAnimationFrame(injectWindowControl);
  console.info('[RETRADE] v1.5.16 Cashflow heading count removed, footer counts restored');
})();
