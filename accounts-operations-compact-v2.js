/* RETRADE Accounts compact operations controls v1.4.85
 * Partners is deliberately a debt snapshot, not a second account-detail page.
 * - headline is total outstanding only
 * - account rows show name, arrangement/payment term, outstanding amount/count
 * - returns/unlisted/action badges stay inside the account detail page
 * - one compact Filter / Sort control beside Search
 * - no account-list selection mode
 * - delegated account-card navigation for reliable touch/click behaviour
 */
(function(){
  'use strict';
  if(window.__rtAccountsCompact1485)return;
  window.__rtAccountsCompact1485=true;

  var queued=false,customSort='',defaultSortApplied=false;
  var FILTERS={all:'All accounts',due:'Outstanding',fixed:'Fixed cost',share:'Profit share',settled:'Settled'};
  var SORTS={owed:'Outstanding · high to low','owed-asc':'Outstanding · low to high',name:'Alphabetical · A–Z','name-desc':'Alphabetical · Z–A',recent:'Recent activity'};
  var baseSort=window._rtAcctOpSort;

  function escHtml(v){
    try{if(typeof esc==='function')return esc(String(v==null?'':v));}catch(_){}
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }
  function money(v){try{return typeof fmt==='function'?fmt(Number(v)||0):'£'+(Number(v)||0).toFixed(2);}catch(_){return '£'+(Number(v)||0).toFixed(2);}}
  function accountById(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function accountModel(a){
    try{if(typeof _rtArrangementForAccount==='function')return _rtArrangementForAccount(a);}catch(_){}
    return String(a&&a.accountType||'supplier').toLowerCase()==='supplier'?'fixed_cost':'profit_share';
  }
  function paymentTiming(a){
    try{if(typeof _rtPartnerPaymentTiming==='function')return _rtPartnerPaymentTiming(a);}catch(_){}
    var v=String(a&&a.paymentTiming||a&&a.paymentTerms||'upfront').toLowerCase();
    return v==='on_sale'?'on_sale':'upfront';
  }
  function arrangementMeta(a){
    var model=accountModel(a);
    if(model==='fixed_cost')return {type:'Fixed cost',kind:'fixed',term:paymentTiming(a)==='on_sale'?'After sale':'Upfront'};
    var p=a&&a.defaultSplitPercent!=null?Number(a.defaultSplitPercent):null;
    return {type:'Profit share',kind:'share',term:p!=null&&isFinite(p)?((p%1?p.toFixed(1):p.toFixed(0))+'% split'):'Split set per item'};
  }
  function rowsData(){
    var out=[];
    try{(_accounts||[]).forEach(function(a){var s=typeof _accountStats==='function'?_accountStats(a.id):{};out.push({a:a,s:s,due:Number(s.dueNow)||0});});}catch(_){}
    return out;
  }
  function summaryStrip(){
    var due=rowsData().reduce(function(n,r){return n+r.due;},0);
    var el=document.createElement('div');el.className='rt-acct-compact-strip';
    el.innerHTML='<span>Outstanding</span><strong>'+money(due)+'</strong>';
    return el;
  }
  function inferSort(controls){
    if(customSort)return customSort;
    var sel=controls.querySelector('select[aria-label="Sort accounts"]');if(sel&&SORTS[sel.value])return sel.value;
    var act=controls.querySelector('.rt-acct-op-sort-menu .filter-pill-dd-opt.active');
    if(act){var oc=String(act.getAttribute('onclick')||''),m=oc.match(/_rtAcctOpSort\('([^']+)'\)/);if(m&&SORTS[m[1]])return m[1];}
    return 'owed';
  }
  function inferFilter(controls){
    var sel=controls.querySelector('select[aria-label="Filter accounts"]');
    if(sel&&FILTERS[sel.value])return sel.value;
    var act=controls.querySelector('.rt-acct-combined-menu [data-filter].active');
    return act&&FILTERS[act.getAttribute('data-filter')]?act.getAttribute('data-filter'):'all';
  }
  function reorderCustom(){
    if(!customSort)return;
    var page=document.getElementById('p-accounts'),list=page&&page.querySelector('.rt-acct-op-list');if(!list)return;
    var nodes=Array.prototype.slice.call(list.querySelectorAll('.rt-acct-op-row[data-account-id]'));
    nodes.sort(function(x,y){
      var xid=x.getAttribute('data-account-id'),yid=y.getAttribute('data-account-id'),xa=accountById(xid),ya=accountById(yid);
      var xn=String(xa&&xa.name||'').toLowerCase(),yn=String(ya&&ya.name||'').toLowerCase();
      if(customSort==='name-desc')return yn.localeCompare(xn);
      if(customSort==='owed-asc'){
        var xs=typeof _accountStats==='function'?_accountStats(xid):{},ys=typeof _accountStats==='function'?_accountStats(yid):{};
        var xd=Number(xs.dueNow)||0,yd=Number(ys.dueNow)||0;return xd-yd||xn.localeCompare(yn);
      }
      return 0;
    });
    nodes.forEach(function(n){list.appendChild(n);});
  }
  function simplifyRows(page){
    page.querySelectorAll('.rt-acct-op-row[data-account-id]').forEach(function(row){
      var id=row.getAttribute('data-account-id'),a=accountById(id);if(!a)return;
      var s=typeof _accountStats==='function'?_accountStats(id):{},due=Number(s.dueNow)||0;
      var outstandingCount=Number(s.unsettledCount)||Number(s.unsettledSoldCount)||0;
      var meta=arrangementMeta(a),name=row.querySelector('.rt-acct-op-name'),terms=row.querySelector('.rt-acct-op-terms');
      if(name)name.innerHTML='<span class="rt-acct-snapshot-name">'+escHtml(a.name||'Unnamed account')+'</span>';
      if(terms)terms.innerHTML='<span class="rt-acct-op-badge '+meta.kind+'">'+escHtml(meta.type)+'</span><span class="rt-acct-snapshot-term">'+escHtml(meta.term)+'</span>';
      var actions=row.querySelector('.rt-acct-op-actions');if(actions)actions.style.display='none';
      var stock=row.querySelector('.rt-acct-op-stock');if(stock)stock.style.display='none';
      var activity=row.querySelector('.rt-acct-op-activity');if(activity)activity.style.display='none';
      var moneyBox=row.querySelector('.rt-acct-op-money');
      if(moneyBox){
        moneyBox.innerHTML='<strong class="rt-acct-op-due'+(due>0?' hot':'')+'">'+money(due)+'</strong><span>'+(due>0?(outstandingCount+' item'+(outstandingCount===1?'':'s')+' outstanding'):'Settled')+'</span>';
      }
    });
  }
  function icon(){return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/><circle cx="18" cy="6" r="1.4" fill="currentColor" stroke="none"/></svg>';}
  function combinedControl(filter,sort){
    var wrap=document.createElement('div');wrap.className='filter-pill-dd rt-acct-combined-dd';wrap.id='rt-acct-filter-sort';
    var filterOpts=Object.keys(FILTERS).map(function(k){return '<button class="filter-pill-dd-opt'+(k===filter?' active':'')+'" type="button" data-filter="'+k+'" onclick="_rtAcctCompactFilter(\''+k+'\')"><span class="rt-acct-fs-check">'+(k===filter?'✓':'')+'</span>'+FILTERS[k]+'</button>';}).join('');
    var sortOpts=Object.keys(SORTS).map(function(k){return '<button class="filter-pill-dd-opt'+(k===sort?' active':'')+'" type="button" data-sort="'+k+'" onclick="_rtAcctCompactSort(\''+k+'\')"><span class="rt-acct-fs-check">'+(k===sort?'✓':'')+'</span>'+SORTS[k]+'</button>';}).join('');
    wrap.innerHTML='<div class="filter-pill-dd-backdrop" onclick="closeFilterPill(\'rt-acct-filter-sort\')"></div>'+
      '<button class="filter-pill-dd-btn rt-acct-combined-btn" type="button" aria-label="Filter and sort accounts" title="Filter and sort" onclick="event.stopPropagation();toggleFilterPill(\'rt-acct-filter-sort\')">'+icon()+'<span class="rt-acct-combined-label">Filter / Sort</span><span class="fpdd-chev">▾</span></button>'+
      '<div class="filter-pill-dd-menu rt-acct-combined-menu" onclick="event.stopPropagation()"><div class="rt-acct-fs-title">Filter</div>'+filterOpts+'<div class="rt-acct-fs-sep"></div><div class="rt-acct-fs-title">Sort</div>'+sortOpts+'</div>';
    return wrap;
  }
  function patch(){
    queued=false;
    var page=document.getElementById('p-accounts');if(!page||!page.classList.contains('on'))return;
    page.querySelectorAll('.rt-acct-op-overview').forEach(function(el){el.style.display='none';});
    page.querySelectorAll('.rt-acct-op-selectbar').forEach(function(el){el.remove();});
    var controls=page.querySelector('.rt-acct-op-controls');if(!controls)return;

    /* The old dashboard default was Priority, which included returns/unlisted.
       This page is now debt-first, so default to highest outstanding instead. */
    var nativeSort=controls.querySelector('select[aria-label="Sort accounts"]');
    if(!defaultSortApplied&&nativeSort&&nativeSort.value==='attention'&&typeof baseSort==='function'){
      defaultSortApplied=true;baseSort('owed');return;
    }
    defaultSortApplied=true;

    var oldStrip=page.querySelector('.rt-acct-compact-strip');if(oldStrip)oldStrip.remove();
    controls.parentNode.insertBefore(summaryStrip(),controls);

    var selectBtn=Array.prototype.slice.call(controls.querySelectorAll('button')).find(function(b){return /^(select|cancel)$/i.test(String(b.textContent||'').trim());});
    if(selectBtn&&/^cancel$/i.test(String(selectBtn.textContent||'').trim())&&typeof window._rtAcctOpSelectMode==='function'){
      window._rtAcctOpSelectMode();return;
    }

    var existing=controls.querySelector('.rt-acct-combined-dd');
    if(existing){
      if(selectBtn)selectBtn.remove();
      controls.classList.add('rt-acct-compact-controls');
      simplifyRows(page);reorderCustom();return;
    }

    var filter=inferFilter(controls),sort=inferSort(controls);
    controls.querySelectorAll('.rt-acct-op-sort-dd').forEach(function(el){el.remove();});
    var sortSel=controls.querySelector('select[aria-label="Sort accounts"]');if(sortSel)sortSel.remove();
    var filterSel=controls.querySelector('select[aria-label="Filter accounts"]');if(filterSel)filterSel.remove();
    if(selectBtn)selectBtn.remove();
    controls.appendChild(combinedControl(filter,sort));
    controls.classList.add('rt-acct-compact-controls');
    var search=controls.querySelector('.rt-acct-op-search');if(search)search.style.minWidth='0';
    simplifyRows(page);reorderCustom();
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){requestAnimationFrame(patch);});}

  window._rtAcctCompactFilter=function(v){
    try{closeFilterPill('rt-acct-filter-sort');}catch(_){}
    if(typeof window._rtAcctOpFilter==='function')window._rtAcctOpFilter(v);
    setTimeout(schedule,0);
  };
  window._rtAcctCompactSort=function(v){
    try{closeFilterPill('rt-acct-filter-sort');}catch(_){}
    if(v==='name-desc'){customSort=v;if(typeof baseSort==='function')baseSort('name');setTimeout(schedule,0);return;}
    if(v==='owed-asc'){customSort=v;if(typeof baseSort==='function')baseSort('owed');setTimeout(schedule,0);return;}
    customSort='';if(typeof baseSort==='function')baseSort(v);setTimeout(schedule,0);
  };

  function installNavigation(page){
    if(!page||page.__rtAccountCardNav1485)return;
    page.__rtAccountCardNav1485=true;
    page.addEventListener('click',function(ev){
      var row=ev.target&&ev.target.closest?ev.target.closest('.rt-acct-op-row[data-account-id]'):null;
      if(!row||!page.contains(row))return;
      if(ev.target.closest&&ev.target.closest('button,a,input,select,textarea,[contenteditable="true"]'))return;
      var id=row.getAttribute('data-account-id');if(!id)return;
      ev.preventDefault();ev.stopPropagation();
      try{
        if(typeof openAccountPage==='function'){openAccountPage(id);return;}
        if(typeof window.openAccountPage==='function'){window.openAccountPage(id);return;}
        if(typeof _renderAccountPage==='function'){
          var acct=accountById(id);
          if(acct){_itemPageOrigin='p-accounts';if(typeof _deactivatePages==='function')_deactivatePages();var p=document.getElementById('p-item');if(p)p.classList.add('on');_renderAccountPage(acct);}
        }
      }catch(err){console.warn('[RETRADE] account card navigation failed',err);try{toast('Could not open account','error');}catch(_){}}
    },true);
  }

  function styles(){if(document.getElementById('rt-accounts-compact-v2-style'))return;var s=document.createElement('style');s.id='rt-accounts-compact-v2-style';s.textContent='\
    .rt-acct-compact-strip{display:flex;align-items:baseline;gap:10px;min-height:48px;padding:11px 14px;margin:0 0 10px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);white-space:nowrap}.rt-acct-compact-strip span{font-size:11px;color:var(--text-secondary)}.rt-acct-compact-strip strong{font-size:21px;line-height:1;color:var(--accent);font-variant-numeric:tabular-nums}\
    .rt-acct-op-controls.rt-acct-compact-controls{display:flex!important;align-items:stretch!important;gap:8px!important;grid-template-columns:none!important}.rt-acct-compact-controls .rt-acct-op-search{flex:1 1 auto!important;grid-column:auto!important;min-width:0}.rt-acct-combined-dd{flex:0 0 auto;min-width:0}.rt-acct-combined-btn{height:100%;min-height:40px;display:flex!important;align-items:center;gap:7px;padding:0 11px!important;white-space:nowrap}.rt-acct-combined-menu{right:0;left:auto;min-width:238px;max-height:min(520px,75vh);overflow:auto;z-index:10030}.rt-acct-fs-title{padding:8px 10px 5px;font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary)}.rt-acct-fs-sep{height:1px;background:var(--border);margin:6px 8px}.rt-acct-fs-check{display:inline-flex;width:17px;justify-content:center;margin-right:6px;color:var(--accent);font-weight:800}\
    #p-accounts .rt-acct-op-row{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(128px,auto) 18px!important;gap:16px!important;align-items:center!important;min-height:92px!important;padding:14px 16px!important}#p-accounts .rt-acct-op-main{min-width:0!important}#p-accounts .rt-acct-op-name{display:block!important;min-width:0!important;font-size:15px!important;line-height:1.2!important}#p-accounts .rt-acct-snapshot-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#p-accounts .rt-acct-op-terms{display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important;margin-top:8px!important;white-space:nowrap!important;overflow:hidden!important}#p-accounts .rt-acct-snapshot-term{font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#p-accounts .rt-acct-op-actions,#p-accounts .rt-acct-op-stock,#p-accounts .rt-acct-op-activity{display:none!important}#p-accounts .rt-acct-op-money{display:flex!important;flex-direction:column!important;align-items:flex-end!important;justify-content:center!important;text-align:right!important;gap:3px!important;min-width:0}#p-accounts .rt-acct-op-money strong{font-size:16px!important;white-space:nowrap}#p-accounts .rt-acct-op-money span{font-size:10.5px!important;white-space:nowrap;color:var(--text-secondary)!important}#p-accounts .rt-acct-op-arrow{align-self:center!important}\
    @media(max-width:640px){.rt-acct-compact-strip{min-height:44px;padding:10px 12px}.rt-acct-compact-strip span{font-size:10px}.rt-acct-compact-strip strong{font-size:19px}.rt-acct-combined-btn{width:44px;justify-content:center;padding:0!important}.rt-acct-combined-label,.rt-acct-combined-btn .fpdd-chev{display:none}.rt-acct-combined-menu{min-width:min(250px,calc(100vw - 32px));right:0}.rt-acct-op-controls.rt-acct-compact-controls{gap:7px!important}#p-accounts .rt-acct-op-row{grid-template-columns:minmax(0,1fr) 108px 12px!important;gap:9px!important;min-height:88px!important;padding:13px 12px!important}#p-accounts .rt-acct-op-name{font-size:15px!important}#p-accounts .rt-acct-op-terms{gap:6px!important;margin-top:7px!important}#p-accounts .rt-acct-op-badge{font-size:9px!important;padding:3px 6px!important}#p-accounts .rt-acct-snapshot-term{font-size:10.5px}#p-accounts .rt-acct-op-money strong{font-size:15px!important}#p-accounts .rt-acct-op-money span{font-size:9.5px!important}}\
  ';document.head.appendChild(s);}
  function start(){
    styles();
    var page=document.getElementById('p-accounts');
    if(page){
      installNavigation(page);
      new MutationObserver(schedule).observe(page,{childList:true,subtree:true});
    }
    window.addEventListener('hashchange',schedule);schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.4.85 Accounts debt snapshot loaded');
})();