/* RETRADE Accounts operations dashboard v1.4.81
 * Reframes Partners as an account-management work queue rather than a profit
 * leaderboard. Uses the existing _accountStats/debt engine as source of truth.
 */
(function(){
  'use strict';
  if(window.__rtAccountsOperations1481)return;
  window.__rtAccountsOperations1481=true;

  var state={q:'',filter:'all',sort:'attention',selecting:false,selected:new Set()};

  function escHtml(v){
    try{if(typeof esc==='function')return esc(String(v==null?'':v));}catch(_){}
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }
  function money(v){
    try{if(typeof fmt==='function')return fmt(Number(v)||0);}catch(_){}
    return '£'+(Number(v)||0).toFixed(2);
  }
  function accountModel(a){
    try{if(typeof _rtArrangementForAccount==='function')return _rtArrangementForAccount(a);}catch(_){}
    return String(a&&a.accountType||'supplier').toLowerCase()==='supplier'?'fixed_cost':'profit_share';
  }
  function paymentTiming(a){
    try{if(typeof _rtPartnerPaymentTiming==='function')return _rtPartnerPaymentTiming(a);}catch(_){}
    return String(a&&a.paymentTiming||a&&a.paymentTerms||'upfront')==='on_sale'?'on_sale':'upfront';
  }
  function arrangementLabel(a){
    var model=accountModel(a);
    if(model==='fixed_cost')return 'Fixed cost · '+(paymentTiming(a)==='on_sale'?'After sale':'Upfront');
    return 'Profit share · Split set per item';
  }
  function accountItems(id){
    try{if(typeof _accountItems==='function')return _accountItems(id)||[];}catch(_){}
    var out=[];
    try{(typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(k){(DB[k]||[]).forEach(function(i){if(i&&String(i.accountId)===String(id))out.push(i);});});}catch(_){}
    return out;
  }
  function isoCandidate(v){
    if(!v)return '';
    var s=String(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s:'';
  }
  function lastActivity(a){
    var dates=[];
    (a.settlements||[]).forEach(function(tx){dates.push(isoCandidate(tx&&tx.createdAt)||isoCandidate(tx&&tx.date));});
    accountItems(a.id).forEach(function(i){
      ['resaleDateSold','dateSold','dateListed','dateSourced','updatedAt','createdAt'].forEach(function(k){dates.push(isoCandidate(i&&i[k]));});
      (i&&i.returnHistory||[]).forEach(function(r){dates.push(isoCandidate(r&&r.loggedAt)||isoCandidate(r&&r.date));});
    });
    dates=dates.filter(Boolean).sort();
    return dates.length?dates[dates.length-1].slice(0,10):'';
  }
  function formatDate(iso){
    if(!iso)return 'No activity yet';
    try{return new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch(_){return iso;}
  }
  function rowData(a){
    var s=typeof _accountStats==='function'?_accountStats(a.id):{};
    var due=Number(s.dueNow)||0,unsettledSold=Number(s.unsettledSoldCount)||0,returned=Number(s.returnedCount)||0,unlisted=Number(s.unlistedCount)||0;
    return {acct:a,stats:s,due:due,unsettledSold:unsettledSold,returned:returned,unlisted:unlisted,attention:due>0||unsettledSold>0||returned>0||unlisted>0,last:lastActivity(a),model:accountModel(a),terms:arrangementLabel(a)};
  }
  function allRows(){try{return (_accounts||[]).map(rowData);}catch(_){return [];}}
  function matches(r){
    var q=state.q.trim().toLowerCase();
    if(q&&[r.acct.name,r.terms,r.model].join(' ').toLowerCase().indexOf(q)===-1)return false;
    if(state.filter==='attention'&&!r.attention)return false;
    if(state.filter==='due'&&!(r.due>0))return false;
    if(state.filter==='fixed'&&r.model!=='fixed_cost')return false;
    if(state.filter==='share'&&r.model!=='profit_share')return false;
    if(state.filter==='settled'&&(r.due>0||r.unsettledSold>0))return false;
    return true;
  }
  function sortRows(rows){
    return rows.sort(function(a,b){
      if(state.sort==='owed')return b.due-a.due||(a.acct.name||'').localeCompare(b.acct.name||'');
      if(state.sort==='recent')return String(b.last||'').localeCompare(String(a.last||''))||(a.acct.name||'').localeCompare(b.acct.name||'');
      if(state.sort==='name')return (a.acct.name||'').localeCompare(b.acct.name||'');
      if(state.sort==='stock')return (Number(b.stats.stockOnHandCount)||0)-(Number(a.stats.stockOnHandCount)||0)||(a.acct.name||'').localeCompare(b.acct.name||'');
      var aa=(a.due>0?100000:0)+(a.returned*1000)+(a.unsettledSold*100)+(a.unlisted*10);
      var bb=(b.due>0?100000:0)+(b.returned*1000)+(b.unsettledSold*100)+(b.unlisted*10);
      return bb-aa||b.due-a.due||(a.acct.name||'').localeCompare(b.acct.name||'');
    });
  }
  function badge(label,kind){return '<span class="rt-acct-op-badge '+(kind||'')+'">'+escHtml(label)+'</span>';}
  function actionBadges(r){
    var out=[];
    if(r.returned)out.push(badge(r.returned+' returned','warn'));
    if(r.unsettledSold)out.push(badge(r.unsettledSold+' unsettled sold','warn'));
    if(r.unlisted)out.push(badge(r.unlisted+' needs listing','neutral'));
    if(!out.length)out.push(badge('No action needed','ok'));
    return out.join('');
  }
  function overview(rows){
    var totalDue=rows.reduce(function(n,r){return n+r.due;},0);
    var attention=rows.filter(function(r){return r.attention;}).length;
    var unsettled=rows.reduce(function(n,r){return n+r.unsettledSold;},0);
    function card(label,value,sub,hot){return '<div class="rt-acct-op-kpi'+(hot?' hot':'')+'"><div>'+label+'</div><strong>'+value+'</strong><span>'+sub+'</span></div>';}
    return '<div class="rt-acct-op-overview">'+
      card('Accounts',String(rows.length),'Active partner/vendor accounts',false)+
      card('Due now',money(totalDue),totalDue>0?'Across all accounts':'Nothing currently due',totalDue>0)+
      card('Needs attention',String(attention),attention===1?'1 account with actions':attention+' accounts with actions',attention>0)+
      card('Unsettled sold',String(unsettled),unsettled===1?'1 sold item awaiting payment':'Sold items awaiting payment',unsettled>0)+
    '</div>';
  }
  function rowHtml(r){
    var a=r.acct,s=r.stats,selected=state.selected.has(String(a.id));
    var typeLabel=r.model==='fixed_cost'?'Fixed cost':'Profit share';
    var stock=Number(s.stockOnHandCount)||0,listed=Number(s.listedCount)||0,unlisted=Number(s.unlistedCount)||0;
    var dueHtml=r.due>0?'<strong class="rt-acct-op-due hot">'+money(r.due)+'</strong><span>due now</span>':'<strong class="rt-acct-op-due">£0.00</strong><span>settled up</span>';
    return '<div class="rt-acct-op-row'+(selected?' selected':'')+'" data-account-id="'+escHtml(a.id)+'" onclick="_rtAcctOpOpen(event,this.dataset.accountId)">'+
      (state.selecting?'<label class="rt-acct-op-check" onclick="event.stopPropagation()"><input type="checkbox" '+(selected?'checked ':'')+'onchange="_rtAcctOpToggle(\''+String(a.id).replace(/'/g,"\\'")+'\',this.checked)"></label>':'')+
      '<div class="rt-acct-op-main"><div class="rt-acct-op-name">'+escHtml(a.name||'Unnamed account')+' '+badge(typeLabel,r.model==='fixed_cost'?'fixed':'share')+'</div><div class="rt-acct-op-terms">'+escHtml(r.terms)+'</div><div class="rt-acct-op-actions">'+actionBadges(r)+'</div></div>'+
      '<div class="rt-acct-op-stock"><strong>'+stock+'</strong><span>stock on hand</span><small>'+listed+' listed · '+unlisted+' unlisted</small></div>'+
      '<div class="rt-acct-op-activity"><span>Last activity</span><strong>'+escHtml(formatDate(r.last))+'</strong></div>'+
      '<div class="rt-acct-op-money">'+dueHtml+'</div>'+
      (state.selecting?'':'<span class="rt-acct-op-arrow">›</span>')+
    '</div>';
  }
  function controls(){
    return '<div class="rt-acct-op-controls">'+
      '<div class="rt-acct-op-search"><span>⌕</span><input id="rt-acct-op-search" type="search" value="'+escHtml(state.q)+'" placeholder="Search accounts…" oninput="_rtAcctOpSearch(this.value)"></div>'+
      '<select aria-label="Filter accounts" onchange="_rtAcctOpFilter(this.value)">'+
        '<option value="all"'+(state.filter==='all'?' selected':'')+'>All accounts</option><option value="attention"'+(state.filter==='attention'?' selected':'')+'>Needs attention</option><option value="due"'+(state.filter==='due'?' selected':'')+'>Money due</option><option value="fixed"'+(state.filter==='fixed'?' selected':'')+'>Fixed cost</option><option value="share"'+(state.filter==='share'?' selected':'')+'>Profit share</option><option value="settled"'+(state.filter==='settled'?' selected':'')+'>Settled</option></select>'+
      '<select aria-label="Sort accounts" onchange="_rtAcctOpSort(this.value)">'+
        '<option value="attention"'+(state.sort==='attention'?' selected':'')+'>Priority</option><option value="owed"'+(state.sort==='owed'?' selected':'')+'>Amount due</option><option value="recent"'+(state.sort==='recent'?' selected':'')+'>Recent activity</option><option value="name"'+(state.sort==='name'?' selected':'')+'>Name</option><option value="stock"'+(state.sort==='stock'?' selected':'')+'>Stock on hand</option></select>'+
      '<button class="btn btn-secondary" onclick="_rtAcctOpSelectMode()">'+(state.selecting?'Cancel':'Select')+'</button></div>';
  }
  function selectionBar(visible){
    if(!state.selecting)return '';
    var count=state.selected.size;
    return '<div class="rt-acct-op-selectbar"><strong>'+count+' selected</strong><div><button class="btn btn-secondary" onclick="_rtAcctOpSelectVisible()">Select all visible</button><button class="btn btn-secondary" '+(count?'':'disabled')+' onclick="_rtAcctOpTiming(\'upfront\')">Set upfront</button><button class="btn btn-secondary" '+(count?'':'disabled')+' onclick="_rtAcctOpTiming(\'on_sale\')">Set after sale</button><button class="btn btn-secondary rt-acct-op-danger" '+(count?'':'disabled')+' onclick="_rtAcctOpDeleteSelected()">Delete</button></div></div>';
  }
  function installStyles(){
    if(document.getElementById('rt-accounts-operations-style'))return;
    var s=document.createElement('style');s.id='rt-accounts-operations-style';
    s.textContent='\
      .rt-acct-op-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 16px}.rt-acct-op-kpi{border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px}.rt-acct-op-kpi>div,.rt-acct-op-kpi span{font-size:11px;color:var(--text-secondary)}.rt-acct-op-kpi strong{font-size:20px;line-height:1.1;color:var(--text)}.rt-acct-op-kpi.hot strong{color:var(--accent)}\
      .rt-acct-op-controls{display:grid;grid-template-columns:minmax(220px,1fr) auto auto auto;gap:8px;margin:0 0 12px}.rt-acct-op-search{display:flex;align-items:center;gap:8px;border:1px solid var(--border);background:var(--surface);border-radius:10px;padding:0 11px}.rt-acct-op-search span{color:var(--text-secondary)}.rt-acct-op-search input{width:100%;border:0!important;background:transparent!important;box-shadow:none!important;padding:10px 0!important;color:var(--text)}.rt-acct-op-controls select{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:10px;padding:0 10px;min-height:40px}\
      .rt-acct-op-selectbar{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--accent);background:var(--surface2);border-radius:11px;padding:9px 11px;margin-bottom:10px}.rt-acct-op-selectbar>div{display:flex;gap:7px;flex-wrap:wrap}.rt-acct-op-danger{color:var(--red)!important}\
      .rt-acct-op-list{display:flex;flex-direction:column;gap:8px}.rt-acct-op-row{display:grid;grid-template-columns:minmax(280px,1.5fr) minmax(105px,.5fr) minmax(125px,.55fr) minmax(105px,.45fr) 18px;gap:14px;align-items:center;border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:13px 15px;cursor:pointer;transition:border-color .15s,background .15s}.rt-acct-op-row:hover{border-color:var(--text-tertiary);background:var(--surface2)}.rt-acct-op-row.selected{border-color:var(--accent)}.rt-acct-op-row:has(.rt-acct-op-check){grid-template-columns:24px minmax(260px,1.5fr) minmax(105px,.5fr) minmax(125px,.55fr) minmax(105px,.45fr)}.rt-acct-op-check input{width:17px;height:17px;accent-color:var(--accent)}\
      .rt-acct-op-name{font-size:14px;font-weight:750;color:var(--text);display:flex;gap:7px;align-items:center;flex-wrap:wrap}.rt-acct-op-terms{font-size:11px;color:var(--text-secondary);margin-top:3px}.rt-acct-op-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.rt-acct-op-badge{font-size:9.5px;font-weight:700;padding:3px 6px;border-radius:999px;background:var(--surface2);color:var(--text-secondary);white-space:nowrap}.rt-acct-op-badge.warn{color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 35%,transparent)}.rt-acct-op-badge.ok{color:var(--green)}.rt-acct-op-badge.fixed{color:var(--blue)}.rt-acct-op-badge.share{color:var(--accent)}\
      .rt-acct-op-stock,.rt-acct-op-activity,.rt-acct-op-money{display:flex;flex-direction:column;gap:2px}.rt-acct-op-stock strong,.rt-acct-op-activity strong,.rt-acct-op-money strong{font-size:13px;color:var(--text)}.rt-acct-op-stock span,.rt-acct-op-activity span,.rt-acct-op-money span,.rt-acct-op-stock small{font-size:10.5px;color:var(--text-secondary)}.rt-acct-op-due.hot{color:var(--accent);font-size:15px}.rt-acct-op-arrow{font-size:22px;color:var(--text-tertiary)}.rt-acct-op-empty{text-align:center;border:1px dashed var(--border);border-radius:12px;padding:30px;color:var(--text-secondary)}\
      @media(max-width:900px){.rt-acct-op-overview{grid-template-columns:repeat(2,minmax(0,1fr))}.rt-acct-op-controls{grid-template-columns:1fr 1fr}.rt-acct-op-search{grid-column:1/-1}.rt-acct-op-row{grid-template-columns:minmax(220px,1fr) 105px 18px}.rt-acct-op-row:has(.rt-acct-op-check){grid-template-columns:24px minmax(220px,1fr) 105px}.rt-acct-op-stock,.rt-acct-op-activity{display:none}}\
      @media(max-width:560px){.rt-acct-op-overview{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.rt-acct-op-kpi{padding:10px}.rt-acct-op-kpi strong{font-size:17px}.rt-acct-op-controls{grid-template-columns:1fr 1fr}.rt-acct-op-controls .btn{grid-column:1/-1}.rt-acct-op-row{grid-template-columns:minmax(0,1fr) 86px 12px;padding:12px;gap:8px}.rt-acct-op-row:has(.rt-acct-op-check){grid-template-columns:22px minmax(0,1fr) 86px}.rt-acct-op-selectbar{align-items:flex-start;flex-direction:column}.rt-acct-op-selectbar>div{width:100%}.rt-acct-op-selectbar .btn{flex:1}.rt-acct-op-terms{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}';
    document.head.appendChild(s);
  }

  function render(){
    installStyles();
    var page=document.getElementById('p-accounts');if(!page)return;
    var all=allRows(),visible=sortRows(all.filter(matches));
    var header='<div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><div><div class="page-title">Partners</div><div class="page-subtitle" style="font-size:12px;margin-top:2px">Account operations · payments, stock and actions that need attention.</div></div><button class="btn btn-primary" onclick="openAddAccountModal()">+ Add partner</button></div>';
    if(!all.length){page.innerHTML=header+'<div class="rt-acct-op-empty"><strong>No accounts yet</strong><div style="margin-top:5px">Add a partner or vendor to track stock, terms and payments.</div></div>';return;}
    page.innerHTML=header+overview(all)+controls()+selectionBar(visible)+'<div class="rt-acct-op-list">'+(visible.length?visible.map(rowHtml).join(''):'<div class="rt-acct-op-empty">No accounts match this search/filter.</div>')+'</div>';
  }

  window._rtAcctOpSearch=function(v){state.q=v||'';var pos=null;try{var x=document.getElementById('rt-acct-op-search');pos=x&&x.selectionStart;}catch(_){}render();var n=document.getElementById('rt-acct-op-search');if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(_){}}};
  window._rtAcctOpFilter=function(v){state.filter=v||'all';render();};
  window._rtAcctOpSort=function(v){state.sort=v||'attention';render();};
  window._rtAcctOpSelectMode=function(){state.selecting=!state.selecting;if(!state.selecting)state.selected.clear();render();};
  window._rtAcctOpToggle=function(id,on){if(on)state.selected.add(String(id));else state.selected.delete(String(id));render();};
  window._rtAcctOpSelectVisible=function(){sortRows(allRows().filter(matches)).forEach(function(r){state.selected.add(String(r.acct.id));});render();};
  window._rtAcctOpOpen=function(ev,id){if(state.selecting){var on=!state.selected.has(String(id));window._rtAcctOpToggle(id,on);return;}if(typeof openAccountPage==='function')openAccountPage(id);};
  window._rtAcctOpTiming=function(timing){
    if(!state.selected.size)return;
    var changed=0,skipped=0;
    (_accounts||[]).forEach(function(a){if(!state.selected.has(String(a.id)))return;if(accountModel(a)!=='fixed_cost'){skipped++;return;}a.arrangementModel='fixed_cost';a.paymentTiming=timing;a.paymentTerms=timing;changed++;});
    try{saveDB();}catch(_){}
    try{toast(changed+' account'+(changed===1?'':'s')+' set to '+(timing==='on_sale'?'after sale':'upfront')+(skipped?' · '+skipped+' profit-share skipped':''));}catch(_){}
    render();
  };
  window._rtAcctOpDeleteSelected=function(){
    if(!state.selected.size)return;
    var count=state.selected.size;
    var proceed=function(ok){
      if(!ok)return;
      var ids=new Set(state.selected);
      try{(typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(k){(DB[k]||[]).forEach(function(i){if(i&&ids.has(String(i.accountId))){i.accountId=null;i.accountSplitPercent=null;i.accountSettled=false;}});});}catch(_){}
      try{_accounts=(_accounts||[]).filter(function(a){return !ids.has(String(a.id));});}catch(_){}
      state.selected.clear();state.selecting=false;
      try{saveDB();}catch(_){}
      try{toast('Deleted '+count+' account'+(count===1?'':'s'));}catch(_){}
      render();
    };
    try{if(typeof showConfirm==='function'){showConfirm('Delete '+count+' account'+(count===1?'':'s')+'?','Items will be unassigned, not deleted.',{icon:'delete',okLabel:'Delete accounts'}).then(proceed);return;}}catch(_){}
    proceed(window.confirm('Delete '+count+' account'+(count===1?'':'s')+'? Items will be unassigned, not deleted.'));
  };

  window.renderAccountsPage=render;
  try{renderAccountsPage=render;}catch(_){}
  if(document.getElementById('p-accounts')&&document.getElementById('p-accounts').classList.contains('on'))render();
  console.info('[RETRADE] v1.4.81 Accounts operations dashboard loaded');
})();