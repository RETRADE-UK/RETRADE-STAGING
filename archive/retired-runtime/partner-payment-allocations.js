/* RETRADE partner payment allocations — v1.4.76
 *
 * Adds a transaction-first payment repair/workflow to every partner account.
 * Items that are due but not linked to a payment transaction appear in a
 * collapsible "Unsettled items" section immediately above payment history.
 *
 * Safety rules:
 * - no automatic data migration or payment creation on load;
 * - existing settlements/cash transfers are never edited implicitly;
 * - assigning to an existing payment only consumes its unallocated balance;
 * - creating a payment writes one grouped transaction with item allocations;
 * - legacy accountSettled flags without a transaction remain visible until the
 *   user explicitly assigns them to an existing or reconstructed payment.
 */
(function(){
  'use strict';
  if(window.__rtPartnerPaymentAllocationsReady)return;
  window.__rtPartnerPaymentAllocationsReady=true;

  var activeAccountId=null;
  var selectedByAccount=Object.create(null);
  var collapsedByAccount=Object.create(null);
  var draft=null;
  var repairQueued=false;

  function round(v){return Math.round((Number(v)||0)*100)/100;}
  function money(v){try{return typeof fmt==='function'?fmt(round(v)):'£'+round(v).toFixed(2);}catch(_){return '£'+round(v).toFixed(2);}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function today(){return new Date().toISOString().slice(0,10);}
  function accountById(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function isSold(i){try{return typeof _accountItemIsSold==='function'?!!_accountItemIsSold(i):!!(i&&(i.dateSold||i.resaleSalePrice||i.resaleDateSold||i.state==='sold')&&!i.isReturned);}catch(_){return false;}}
  function accountItems(accountId){var out=[];try{(typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(month){(DB[month]||[]).forEach(function(i){if(i&&String(i.accountId)===String(accountId))out.push({item:i,month:month});});});}catch(_){}return out;}
  function modelFor(acct,item){try{if(item&&typeof _rtArrangementForItem==='function')return _rtArrangementForItem(item,acct);}catch(_){}try{if(typeof _rtArrangementForAccount==='function')return _rtArrangementForAccount(acct);}catch(_){}return String((item&&item.accountType)||(acct&&acct.accountType)||'supplier')==='supplier'?'fixed_cost':'profit_share';}
  function paysOnSale(acct){try{return typeof _accountPaysOnSale==='function'?!!_accountPaysOnSale(acct):true;}catch(_){return true;}}
  function owedFor(acct,item){
    var v=null;
    try{if(typeof _accountItemDebt==='function')v=_accountItemDebt(item);}catch(_){}
    if(v==null){try{if(typeof _accountItemOwed==='function')v=_accountItemOwed(item);}catch(_){} }
    if(v!=null&&Number(v)>=0)return round(v);
    if(modelFor(acct,item)==='fixed_cost'){
      try{if(typeof _rtPartnerAgreedAmount==='function'){v=_rtPartnerAgreedAmount(item,acct);if(v!=null)return round(v);}}catch(_){}
      if(item.partnerAgreedAmount!=null)return round(item.partnerAgreedAmount);
      if(item.accountPaidAmount!=null)return round(item.accountPaidAmount);
      if(item.costPrice!=null)return round(item.costPrice);
    }
    return 0;
  }
  function txAllocations(acct,itemId,paidOnly){var sum=0;(acct&&Array.isArray(acct.settlements)?acct.settlements:[]).forEach(function(tx){if(!tx)return;if(paidOnly&&tx.paid!==true)return;(Array.isArray(tx.items)?tx.items:[]).forEach(function(a){var id=a&&(a.id!=null?a.id:a.itemId);if(String(id)===String(itemId))sum+=Math.max(0,Number(a.amount)||0);});});return round(sum);}
  function unassignedRows(acct){
    var rows=[];
    accountItems(acct.id).forEach(function(entry){
      var i=entry.item,owed=owedFor(acct,i),assigned=txAllocations(acct,i.id,false),paidAssigned=txAllocations(acct,i.id,true);
      var remaining=Math.max(0,round(owed-assigned));
      var legacy=!!i.accountSettled&&assigned<owed-0.009;
      var dueNow=owed>0.009&&(!paysOnSale(acct)||isSold(i));
      var unpaid=!i.accountSettled&&dueNow&&remaining>0.009;
      if(!legacy&&!unpaid)return;
      if(legacy&&remaining<=0.009)return;
      rows.push({entry:entry,item:i,owed:owed,assigned:assigned,paidAssigned:paidAssigned,remaining:remaining,legacy:legacy,unpaid:unpaid});
    });
    rows.sort(function(a,b){if(a.legacy!==b.legacy)return a.legacy?-1:1;var ad=a.item.dateSold||a.item.resaleDateSold||a.item.dateListed||'',bd=b.item.dateSold||b.item.resaleDateSold||b.item.dateListed||'';return String(bd).localeCompare(String(ad))||String(a.item.item||'').localeCompare(String(b.item.item||''));});
    return rows;
  }
  function selectedSet(acct){var key=String(acct.id);if(!selectedByAccount[key])selectedByAccount[key]=new Set();return selectedByAccount[key];}
  function selectedRows(acct){var set=selectedSet(acct),map=Object.create(null);unassignedRows(acct).forEach(function(r){map[String(r.item.id)]=r;});return Array.from(set).map(function(id){return map[String(id)]||null;}).filter(Boolean);}
  function selectedTotal(acct){return round(selectedRows(acct).reduce(function(s,r){return s+r.remaining;},0));}

  function installStyles(){
    if(document.getElementById('rt-payment-allocation-style'))return;
    var s=document.createElement('style');s.id='rt-payment-allocation-style';s.textContent='\
      .rt-payalloc{margin:0 0 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden}.rt-payalloc-head{width:100%;border:0;background:transparent;color:var(--text);display:flex;align-items:center;gap:10px;padding:13px 14px;text-align:left;cursor:pointer}.rt-payalloc-head-main{flex:1;min-width:0}.rt-payalloc-title{font-size:13px;font-weight:800}.rt-payalloc-sub{font-size:10.5px;color:var(--text-secondary);margin-top:2px;line-height:1.35}.rt-payalloc-count{font-size:11px;font-weight:800;background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:3px 7px}.rt-payalloc-chevron{font-size:14px;color:var(--muted);transition:transform .16s ease}.rt-payalloc.collapsed .rt-payalloc-chevron{transform:rotate(-90deg)}.rt-payalloc.collapsed .rt-payalloc-body{display:none}.rt-payalloc-body{border-top:1px solid var(--border)}.rt-payalloc-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border)}.rt-payalloc-row input[type=checkbox]{width:18px;height:18px}.rt-payalloc-name{font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-payalloc-meta{font-size:10.5px;color:var(--text-secondary);margin-top:2px}.rt-payalloc-amt{text-align:right;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums}.rt-payalloc-legacy{color:var(--accent)}.rt-payalloc-unpaid{color:var(--red)}.rt-payalloc-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;background:var(--surface2);border-top:1px solid var(--border)}.rt-payalloc-summary{flex:1 1 160px;font-size:11px;color:var(--text-secondary)}.rt-payalloc-summary strong{display:block;font-size:13px;color:var(--text);margin-bottom:1px}.rt-payalloc-actions .btn{font-size:11.5px;padding:7px 10px}.rt-payalloc-empty{padding:12px 14px;font-size:11px;color:var(--text-secondary)}.rt-payalloc-panel-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}.rt-payalloc-choice{display:block;width:100%;text-align:left;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);padding:10px 11px;margin:0 0 8px;cursor:pointer}.rt-payalloc-choice strong{display:block;font-size:12px}.rt-payalloc-choice span{display:block;font-size:10.5px;color:var(--text-secondary);margin-top:3px}@media(max-width:560px){.rt-payalloc-row{grid-template-columns:26px minmax(0,1fr) auto;padding:10px 11px}.rt-payalloc-actions .btn{flex:1 1 130px;min-height:38px}.rt-payalloc-head{padding:12px 11px}}';document.head.appendChild(s);
  }

  function accountFromPage(page){var a=accountById(activeAccountId);if(a)return a;var tagged=page&&page.querySelector('[data-account-id]');if(tagged){a=accountById(tagged.getAttribute('data-account-id'));if(a)return a;}var heading=page&&page.querySelector('.page-title,h1,h2,h3'),txt=String(heading&&heading.textContent||'').trim().toLowerCase();if(txt){try{var matches=(_accounts||[]).filter(function(x){var n=String(x&&x.name||'').trim().toLowerCase();return n&&(txt===n||txt.indexOf(n)!==-1);});if(matches.length===1)return matches[0];}catch(_){}}return null;}
  function historyAnchor(page){var groups=Array.prototype.slice.call(page.querySelectorAll('.account-group'));for(var i=0;i<groups.length;i++){var t=String((groups[i].querySelector('.account-group-title')||{}).textContent||'').trim().toLowerCase();if(/(settlement|payment).*(history)|history.*(settlement|payment)/.test(t))return groups[i];}var candidates=Array.prototype.slice.call(page.querySelectorAll('.panel-card,.card,section'));for(var j=0;j<candidates.length;j++){var h=candidates[j].querySelector('.sl,.section-title,h2,h3,h4');var tx=String(h&&h.textContent||'').trim().toLowerCase();if(/(settlement|payment).*(history)|history.*(settlement|payment)/.test(tx))return candidates[j];}return null;}
  function insertionPoint(page){var hist=historyAnchor(page);if(hist)return {parent:hist.parentNode,before:hist};var groups=Array.prototype.slice.call(page.querySelectorAll('.account-group'));if(groups.length){var last=groups[groups.length-1];return {parent:last.parentNode,before:last.nextSibling};}return {parent:page,before:null};}

  function renderSection(page,acct){
    installStyles();var old=page.querySelector('.rt-payalloc');if(old)old.remove();
    var rows=unassignedRows(acct),key=String(acct.id),collapsed=collapsedByAccount[key]===true,set=selectedSet(acct);
    Array.from(set).forEach(function(id){if(!rows.some(function(r){return String(r.item.id)===String(id);}))set.delete(id);});
    var total=round(rows.reduce(function(s,r){return s+r.remaining;},0)),legacyCount=rows.filter(function(r){return r.legacy;}).length;
    var box=document.createElement('div');box.className='rt-payalloc'+(collapsed?' collapsed':'');box.setAttribute('data-account-id',acct.id);
    var rowHtml=rows.length?rows.map(function(r){var checked=set.has(r.item.id)?' checked':'';var status=r.legacy?'Legacy settled · payment not assigned':'Needs payment transaction';var date=r.item.dateSold||r.item.resaleDateSold||'';return '<label class="rt-payalloc-row"><input type="checkbox" data-rt-pay-item="'+esc(r.item.id)+'"'+checked+'><div><div class="rt-payalloc-name">'+esc(r.item.item||'Untitled item')+'</div><div class="rt-payalloc-meta '+(r.legacy?'rt-payalloc-legacy':'rt-payalloc-unpaid')+'">'+esc(status)+(date?' · sold '+esc(date):'')+'</div></div><div class="rt-payalloc-amt">'+esc(money(r.remaining))+'</div></label>';}).join(''):'<div class="rt-payalloc-empty">All payable items are assigned to payment transactions.</div>';
    box.innerHTML='<button type="button" class="rt-payalloc-head" aria-expanded="'+(collapsed?'false':'true')+'"><div class="rt-payalloc-head-main"><div class="rt-payalloc-title">Unsettled items</div><div class="rt-payalloc-sub">Items that still need linking to a payment transaction'+(legacyCount?' · '+legacyCount+' legacy settled item'+(legacyCount===1?'':'s')+' need reconstructing':'')+'</div></div><span class="rt-payalloc-count">'+rows.length+'</span><span class="rt-payalloc-chevron">⌄</span></button><div class="rt-payalloc-body">'+rowHtml+'<div class="rt-payalloc-actions"><div class="rt-payalloc-summary"></div><button type="button" class="btn btn-secondary rt-payalloc-all">Select all</button><button type="button" class="btn btn-secondary rt-payalloc-existing">Assign to payment</button><button type="button" class="btn btn-primary rt-payalloc-new">New transaction</button></div></div>';
    var pt=insertionPoint(page);if(pt.before)pt.parent.insertBefore(box,pt.before);else pt.parent.appendChild(box);
    box.querySelector('.rt-payalloc-head').addEventListener('click',function(){collapsedByAccount[key]=!box.classList.contains('collapsed');box.classList.toggle('collapsed');box.querySelector('.rt-payalloc-head').setAttribute('aria-expanded',box.classList.contains('collapsed')?'false':'true');});
    function refreshActions(){var picked=selectedRows(acct),sum=selectedTotal(acct),summary=box.querySelector('.rt-payalloc-summary');summary.innerHTML=picked.length?'<strong>'+picked.length+' selected · '+esc(money(sum))+'</strong>Assign these items to one payment transaction.':'<strong>'+rows.length+' items · '+esc(money(total))+'</strong>'+(rows.length?'Select items that were paid together.':'Nothing needs assigning.');var disabled=!picked.length;box.querySelector('.rt-payalloc-existing').disabled=disabled;box.querySelector('.rt-payalloc-new').disabled=disabled;box.querySelector('.rt-payalloc-all').disabled=!rows.length;}
    box.querySelectorAll('[data-rt-pay-item]').forEach(function(cb){cb.addEventListener('change',function(){var id=cb.getAttribute('data-rt-pay-item');if(cb.checked)set.add(id);else set.delete(id);refreshActions();});});
    box.querySelector('.rt-payalloc-all').addEventListener('click',function(){var all=rows.length&&rows.every(function(r){return set.has(r.item.id);});rows.forEach(function(r){if(all)set.delete(r.item.id);else set.add(r.item.id);});renderSection(page,acct);});
    box.querySelector('.rt-payalloc-existing').addEventListener('click',function(){openExisting(acct);});
    box.querySelector('.rt-payalloc-new').addEventListener('click',function(){openNew(acct);});refreshActions();
  }

  function allocationsTotal(tx){return round((Array.isArray(tx&&tx.items)?tx.items:[]).reduce(function(s,a){return s+Math.max(0,Number(a&&a.amount)||0);},0));}
  function existingChoices(acct,total){return (Array.isArray(acct.settlements)?acct.settlements:[]).map(function(tx){var amount=round(tx&&tx.partnerAmount),used=allocationsTotal(tx),capacity=Math.max(0,round(amount-used));return {tx:tx,amount:amount,used:used,capacity:capacity};}).filter(function(x){return x.tx&&x.capacity>=total-0.009;}).sort(function(a,b){return String(b.tx.date||'').localeCompare(String(a.tx.date||''));});}
  function openExisting(acct){var rows=selectedRows(acct),total=selectedTotal(acct);if(!rows.length)return;draft={accountId:acct.id,itemIds:rows.map(function(r){return r.item.id;}),total:total,mode:'existing'};var choices=existingChoices(acct,total);var html='<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Assign '+rows.length+' item'+(rows.length===1?'':'s')+' ('+esc(money(total))+') to an existing payment. The payment total and cash transfer are not changed.</div>';if(!choices.length)html+='<div class="panel-card" style="padding:12px;font-size:12px;color:var(--text-secondary);">No existing payment has '+esc(money(total))+' of unallocated balance. Create a new transaction instead, or select fewer items.</div>';else choices.forEach(function(x){html+='<button type="button" class="rt-payalloc-choice" onclick="_rtAssignPartnerItemsToPayment(\''+esc(x.tx.id)+'\')"><strong>'+esc(x.tx.date||'Undated')+' · '+esc(money(x.amount))+' · '+(x.tx.paid===true?'Paid':'Unpaid')+'</strong><span>'+esc(money(x.capacity))+' still unallocated'+(x.tx.note?' · '+esc(x.tx.note):'')+'</span></button>';});try{openPanel('Assign to existing payment',html);}catch(_){alert('Could not open payment panel');}}
  function openNew(acct){var rows=selectedRows(acct),total=selectedTotal(acct);if(!rows.length)return;var hasLegacy=rows.some(function(r){return r.legacy;});draft={accountId:acct.id,itemIds:rows.map(function(r){return r.item.id;}),total:total,mode:'new'};var list=rows.map(function(r){return '<div class="rt-payalloc-panel-row"><span>'+esc(r.item.item||'Item')+'</span><strong>'+esc(money(r.remaining))+'</strong></div>';}).join('');var html='<div class="panel-card" style="margin-bottom:14px;">'+list+'<div class="rt-payalloc-panel-row"><span><strong>Total payment</strong></span><strong>'+esc(money(total))+'</strong></div></div><div class="fg"><label>Payment date</label><input type="date" id="rt-payalloc-date" value="'+today()+'"></div><div class="fg"><label>Note / bank reference <span style="font-weight:400;">optional</span></label><input type="text" id="rt-payalloc-note" placeholder="e.g. Bank transfer ref"></div><label style="display:flex;gap:9px;align-items:flex-start;padding:10px 11px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);font-size:11px;line-height:1.4;margin-bottom:12px;"><input type="checkbox" id="rt-payalloc-historical" style="margin-top:2px;"'+(hasLegacy?' checked':'')+'><span><strong style="display:block;color:var(--text);margin-bottom:2px;">Historical / already paid</strong>Use this when reconstructing an old payment that was already made. It creates the missing payment history and item allocations but does not add a second cash movement.</span></label><button type="button" class="btn btn-primary" style="width:100%;" onclick="_rtCreatePartnerPaymentTransaction()">Record payment transaction · '+esc(money(total))+'</button>';try{openPanel('New payment transaction',html);}catch(_){alert('Could not open payment panel');}}

  function draftRows(){if(!draft)return {acct:null,rows:[]};var acct=accountById(draft.accountId);if(!acct)return {acct:null,rows:[]};var map=Object.create(null);unassignedRows(acct).forEach(function(r){map[String(r.item.id)]=r;});return {acct:acct,rows:(draft.itemIds||[]).map(function(id){return map[String(id)]||null;}).filter(Boolean)};}
  function setItemSettledIfPaid(acct,item){var owed=owedFor(acct,item),paid=txAllocations(acct,item.id,true);if(owed>0&&paid>=owed-0.009)item.accountSettled=true;}
  function saveAndRefresh(acct,message){try{saveDB();}catch(e){console.warn('[RETRADE] payment allocation save failed',e);try{toast('Could not save payment allocation','error');}catch(_){}return;}selectedByAccount[String(acct.id)]=new Set();draft=null;try{closePanel();}catch(_){}try{toast(message);}catch(_){}try{_renderAccountPage(acct);}catch(_){} }

  window._rtAssignPartnerItemsToPayment=function(txId){var d=draftRows(),acct=d.acct,rows=d.rows;if(!acct||!rows.length)return;var tx=(acct.settlements||[]).find(function(t){return t&&String(t.id)===String(txId);});if(!tx)return;var total=round(rows.reduce(function(s,r){return s+r.remaining;},0)),capacity=Math.max(0,round((Number(tx.partnerAmount)||0)-allocationsTotal(tx)));if(capacity<total-0.009){try{toast('That payment no longer has enough unallocated balance','error');}catch(_){}return;}if(!Array.isArray(tx.items))tx.items=[];rows.forEach(function(r){tx.items.push({id:r.item.id,itemId:r.item.id,name:r.item.item||'',amount:round(r.remaining)});setItemSettledIfPaid(acct,r.item);});tx.updatedAt=new Date().toISOString();tx.allocationRepairedAt=tx.updatedAt;saveAndRefresh(acct,'Assigned '+rows.length+' item'+(rows.length===1?'':'s')+' to payment '+money(tx.partnerAmount||0));};

  window._rtCreatePartnerPaymentTransaction=function(){var d=draftRows(),acct=d.acct,rows=d.rows;if(!acct||!rows.length)return;var total=round(rows.reduce(function(s,r){return s+r.remaining;},0));if(total<=0)return;var date=(document.getElementById('rt-payalloc-date')||{}).value||today();var note=String((document.getElementById('rt-payalloc-note')||{}).value||'').trim();var historical=!!((document.getElementById('rt-payalloc-historical')||{}).checked);var tx={id:'stl_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),date:date,createdAt:new Date().toISOString(),paid:true,kind:modelFor(acct)==='fixed_cost'?'supplier':'consignment',partnerAmount:total,yourAmount:0,note:note||null,items:rows.map(function(r){return {id:r.item.id,itemId:r.item.id,name:r.item.item||'',amount:round(r.remaining)};}),arrangementModel:modelFor(acct),paymentTiming:(typeof _rtPartnerPaymentTiming==='function'?_rtPartnerPaymentTiming(acct):null),historicalReconstruction:historical,cashRecorded:historical?false:true};if(!Array.isArray(acct.settlements))acct.settlements=[];acct.settlements.unshift(tx);rows.forEach(function(r){setItemSettledIfPaid(acct,r.item);});saveAndRefresh(acct,(historical?'Reconstructed':'Recorded')+' '+money(total)+' payment for '+rows.length+' item'+(rows.length===1?'':'s'));};

  try{if(typeof _cashEventsAll==='function'&&!_cashEventsAll.__rtPayAllocHistorical){var baseCashEvents=_cashEventsAll;_cashEventsAll=function(){var out=baseCashEvents.apply(this,arguments)||[],suppressed=[];try{(_accounts||[]).forEach(function(a){(a.settlements||[]).forEach(function(tx){if(tx&&tx.historicalReconstruction===true&&tx.cashRecorded===false)suppressed.push(String(tx.id));});});}catch(_){}if(!suppressed.length)return out;return out.filter(function(e){var kind=String((e&&e.type)||'')+' '+String((e&&e.category)||'')+' '+String((e&&e.source)||'');if(kind.toLowerCase().indexOf('settlement')===-1)return true;var hay=[e&&e.id,e&&e.sourceId,e&&e.settlementId,e&&e.reference,e&&e.description].join('|');return !suppressed.some(function(id){return hay.indexOf(id)!==-1;});});};_cashEventsAll.__rtPayAllocHistorical=true;}}catch(_){}

  function repair(acct){repairQueued=false;var page=document.getElementById('p-item');if(!page||!page.classList.contains('on'))return;acct=acct||accountFromPage(page);if(!acct)return;activeAccountId=acct.id;renderSection(page,acct);}
  function schedule(acct){if(acct&&acct.id!=null)activeAccountId=acct.id;if(repairQueued)return;repairQueued=true;requestAnimationFrame(function(){repair(acct);});}
  try{if(typeof _renderAccountPage==='function'){var baseRender=_renderAccountPage;_renderAccountPage=function(acct){if(acct&&acct.id!=null)activeAccountId=acct.id;var r=baseRender.apply(this,arguments);schedule(acct);return r;};}}catch(_){}
  try{var page=document.getElementById('p-item');if(page)new MutationObserver(function(){schedule();}).observe(page,{childList:true,subtree:true});}catch(_){}
  schedule();
  console.info('[RETRADE] partner payment allocation workflow v1.4.76 loaded');
})();