/* RETRADE partner actions v1.4.66
 * Partner-account interaction layer for the live app.
 *
 * Goals:
 * - keep partner KPIs clean: no page-wide Allocate & settle / Mark all paid CTA;
 * - place Search + Select immediately above the partner item groups;
 * - keep the existing per-item menu/actions untouched;
 * - make selection show a live unpaid total;
 * - turn bulk "Mark as paid" into one grouped settlement/cashflow transaction.
 */
(function(){
  'use strict';

  var searchByAccount=Object.create(null);
  var activeAccountId=null;
  var paymentDraft=null;
  var enhanceQueued=false;

  function accountById(id){
    try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}
    catch(_){return null;}
  }

  function htmlEscape(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function money(value){
    try{if(typeof fmt==='function')return fmt(Number(value)||0);}catch(_){}
    return '£'+(Number(value)||0).toFixed(2);
  }

  function roundMoney(value){return Math.round((Number(value)||0)*100)/100;}

  function isAccountDetailPage(page){
    if(!page||!page.classList.contains('on'))return false;
    try{if(typeof _itemPageOrigin!=='undefined'&&_itemPageOrigin==='p-account-detail')return false;}catch(_){}
    var buttons=page.querySelectorAll('button,a');
    for(var i=0;i<buttons.length;i++){
      var t=String(buttons[i].textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      if(t==='back to accounts'||t==='back to account'||t==='back to partners'||t==='back to partner')return true;
    }
    return !!page.querySelector('.account-group');
  }

  function accountItems(accountId){
    var out=[];
    try{
      (typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(month){
        var rows=(typeof DB!=='undefined'&&DB&&Array.isArray(DB[month]))?DB[month]:[];
        rows.forEach(function(item){
          if(item&&String(item.accountId)===String(accountId))out.push({item:item,month:month});
        });
      });
    }catch(_){}
    return out;
  }

  function selectedIdSet(){
    try{return _acctSelected instanceof Set?_acctSelected:new Set();}
    catch(_){return new Set();}
  }

  function isSelectMode(){
    try{return !!_acctSelectMode;}catch(_){return false;}
  }

  function debtFor(item){
    if(!item||item.accountSettled===true)return 0;
    try{
      if(typeof _accountItemDebt==='function'){
        var debt=_accountItemDebt(item);
        return debt==null?0:Math.max(0,Number(debt)||0);
      }
    }catch(_){}
    try{
      if(typeof _accountItemOwed==='function'){
        var owed=_accountItemOwed(item);
        return owed==null?0:Math.max(0,Number(owed)||0);
      }
    }catch(_){}
    return 0;
  }

  function selectedSummary(acct){
    var selected=selectedIdSet();
    var picked=[];
    accountItems(acct.id).forEach(function(entry){
      if(selected.has(entry.item.id))picked.push(entry);
    });
    var payable=picked.filter(function(entry){return debtFor(entry.item)>0;});
    var total=roundMoney(payable.reduce(function(sum,entry){return sum+debtFor(entry.item);},0));
    return {picked:picked,payable:payable,total:total};
  }

  function hideLegacyPartnerControls(page){
    // Retire the old page-wide settlement CTAs. Payment now lives per item or in
    // selection mode, so KPIs never have a large settlement button attached.
    page.querySelectorAll('button[onclick]').forEach(function(btn){
      if(btn.closest('.rt-partner-v2-toolbar,.rt-partner-v2-selection'))return;
      var action=String(btn.getAttribute('onclick')||'');
      if((action.indexOf('_openConsignmentSettlementBuilder')!==-1||action.indexOf('settleAllForAccount')!==-1)&&!btn.closest('.account-group')){
        btn.style.display='none';
        btn.setAttribute('data-rt-partner-v2-hidden','settlement');
      }
    });

    // Hide the original top Select control; the replacement sits beside Search
    // immediately above the item groups.
    page.querySelectorAll('button').forEach(function(btn){
      if(btn.closest('.rt-partner-v2-toolbar,.rt-partner-v2-selection,.account-group'))return;
      var action=String(btn.getAttribute('onclick')||'');
      var text=String(btn.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      if(action.indexOf('_acctToggleSelectMode')!==-1||(text==='select'&&!btn.classList.contains('rt-partner-statement-btn'))){
        btn.style.display='none';
        btn.setAttribute('data-rt-partner-v2-hidden','select');
      }
    });

    // The core selection bar is rendered high on the page. Hide only its own
    // container; the new bar below carries the same workflow plus the live total.
    var coreButtons=page.querySelectorAll('button[onclick*="_acctSelectAll"],button[onclick*="_acctBulkSettle"]');
    coreButtons.forEach(function(btn){
      if(btn.closest('.rt-partner-v2-selection'))return;
      var bar=btn.parentElement;
      if(bar&&!bar.closest('.account-group')){
        bar.style.display='none';
        bar.setAttribute('data-rt-partner-v2-hidden','selection-bar');
      }
    });
  }

  function installStyles(){
    if(document.getElementById('rt-partner-actions-v2-style'))return;
    var style=document.createElement('style');
    style.id='rt-partner-actions-v2-style';
    style.textContent='\
      .rt-partner-v2-toolbar{display:flex;align-items:center;gap:9px;margin:0 0 14px;position:relative;}\
      .rt-partner-v2-search{position:relative;flex:1;min-width:0;}\
      .rt-partner-v2-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--muted);}\
      .rt-partner-v2-search input{width:100%;height:42px;padding:0 38px 0 38px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:500 13px var(--font-body);box-sizing:border-box;}\
      .rt-partner-v2-search input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim);}\
      .rt-partner-v2-search-clear{position:absolute;right:7px;top:50%;transform:translateY(-50%);width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;font-size:18px;line-height:1;}\
      .rt-partner-v2-search-clear:hover{background:var(--surface2);color:var(--text);}\
      .rt-partner-v2-select{height:42px;white-space:nowrap;flex:0 0 auto;}\
      .rt-partner-v2-selection{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;margin:-2px 0 14px;border:1px solid var(--accent);border-radius:11px;background:var(--surface2);}\
      .rt-partner-v2-selection-copy{flex:1 1 180px;min-width:0;}\
      .rt-partner-v2-selection-count{font-size:12px;font-weight:750;color:var(--text);}\
      .rt-partner-v2-selection-total{font-size:15px;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums;margin-top:1px;}\
      .rt-partner-v2-selection-sub{font-size:10.5px;color:var(--text-secondary);margin-top:1px;}\
      .rt-partner-v2-selection .btn{font-size:12px;padding:7px 10px;}\
      .rt-partner-v2-empty-search{padding:12px 4px;color:var(--muted);font-size:12px;}\
      @media(max-width:560px){.rt-partner-v2-toolbar{align-items:stretch}.rt-partner-v2-select{padding-left:12px;padding-right:12px}.rt-partner-v2-selection{align-items:stretch}.rt-partner-v2-selection-copy{flex-basis:100%}.rt-partner-v2-selection .btn{flex:1 1 auto;min-height:38px}}\
    ';
    document.head.appendChild(style);
  }

  function filterItemRows(page,query){
    var q=String(query||'').trim().toLowerCase();
    var groups=page.querySelectorAll('.account-group');
    groups.forEach(function(group){
      var title=String((group.querySelector('.account-group-title')||{}).textContent||'').trim().toLowerCase();
      if(title.indexOf('settlement')!==-1)return;
      var body=group.querySelector('.account-group-body');
      if(!body)return;
      var rows=Array.prototype.slice.call(body.querySelectorAll('.metric-inline'));
      if(!rows.length)return;
      var visible=0;
      rows.forEach(function(row){
        var match=!q||String(row.textContent||'').toLowerCase().indexOf(q)!==-1;
        row.style.display=match?'':'none';
        if(match)visible++;
      });
      if(q){
        group.classList.remove('collapsed');
        var head=group.querySelector('.account-group-head');if(head)head.setAttribute('aria-expanded','true');
        body.style.display='';
      }
      var old=body.querySelector('.rt-partner-v2-empty-search');
      if(old)old.remove();
      if(q&&visible===0){
        var empty=document.createElement('div');
        empty.className='rt-partner-v2-empty-search';
        empty.textContent='No matching items in this section';
        body.appendChild(empty);
      }
    });
  }

  function buildToolbar(page,acct,anchor){
    var existing=page.querySelector('.rt-partner-v2-toolbar');
    if(existing)existing.remove();
    var toolbar=document.createElement('div');
    toolbar.className='rt-partner-v2-toolbar';
    toolbar.innerHTML='\
      <div class="rt-partner-v2-search">\
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>\
        <input type="search" autocomplete="off" aria-label="Search partner items" placeholder="Search partner items…">\
        <button type="button" class="rt-partner-v2-search-clear" aria-label="Clear search" title="Clear search">×</button>\
      </div>\
      <button type="button" class="btn btn-secondary rt-partner-v2-select"></button>';
    anchor.parentNode.insertBefore(toolbar,anchor);

    var input=toolbar.querySelector('input');
    var clear=toolbar.querySelector('.rt-partner-v2-search-clear');
    var select=toolbar.querySelector('.rt-partner-v2-select');
    var saved=searchByAccount[String(acct.id)]||'';
    input.value=saved;
    clear.style.display=saved?'':'none';
    select.textContent=isSelectMode()?'Cancel':'Select';
    select.setAttribute('aria-pressed',isSelectMode()?'true':'false');

    input.addEventListener('input',function(){
      searchByAccount[String(acct.id)]=input.value||'';
      clear.style.display=input.value?'':'none';
      filterItemRows(page,input.value);
    });
    clear.addEventListener('click',function(){
      input.value='';searchByAccount[String(acct.id)]='';clear.style.display='none';
      // Re-render rather than trying to reconstruct collapsed state changed by a
      // live search. The persisted account-group state remains authoritative.
      try{_renderAccountPage(acct);}catch(_){filterItemRows(page,'');}
    });
    select.addEventListener('click',function(){
      try{if(typeof _acctToggleSelectMode==='function')_acctToggleSelectMode();}
      catch(err){console.warn('[RETRADE] partner select toggle failed',err);}
    });

    filterItemRows(page,saved);
    return toolbar;
  }

  function buildSelectionBar(page,acct,toolbar){
    var old=page.querySelector('.rt-partner-v2-selection');if(old)old.remove();
    if(!isSelectMode())return;
    var summary=selectedSummary(acct);
    var bar=document.createElement('div');
    bar.className='rt-partner-v2-selection';

    var selectedCount=summary.picked.length;
    var payableCount=summary.payable.length;
    var actionLabel=payableCount?'Mark as paid · '+money(summary.total):'Mark as paid';
    var type=String(acct.accountType||'supplier');
    var secondaryAction=type==='supplier'
      ? '<button type="button" class="btn btn-secondary rt-partner-v2-terms">Set cost</button>'
      : '<button type="button" class="btn btn-secondary rt-partner-v2-terms">Set split</button>';

    bar.innerHTML='\
      <div class="rt-partner-v2-selection-copy">\
        <div class="rt-partner-v2-selection-count">'+selectedCount+' selected</div>\
        <div class="rt-partner-v2-selection-total">'+money(summary.total)+' to pay</div>\
        <div class="rt-partner-v2-selection-sub">'+(payableCount===selectedCount?payableCount+' unpaid item'+(payableCount===1?'':'s'):payableCount+' of '+selectedCount+' selected item'+(selectedCount===1?'':'s')+' unpaid')+'</div>\
      </div>\
      <button type="button" class="btn btn-secondary rt-partner-v2-select-all">Select all</button>\
      '+secondaryAction+'\
      <button type="button" class="btn btn-primary rt-partner-v2-pay"'+(payableCount?'':' disabled')+'>'+htmlEscape(actionLabel)+'</button>';
    toolbar.insertAdjacentElement('afterend',bar);

    bar.querySelector('.rt-partner-v2-select-all').addEventListener('click',function(){
      try{if(typeof _acctSelectAll==='function')_acctSelectAll();}catch(_){}
    });
    var terms=bar.querySelector('.rt-partner-v2-terms');
    terms.addEventListener('click',function(){
      try{
        if(type==='supplier'&&typeof _acctBulkSetCost==='function')_acctBulkSetCost();
        else if(type!=='supplier'&&typeof _acctBulkSetSplit==='function')_acctBulkSetSplit();
      }catch(err){console.warn('[RETRADE] partner bulk terms failed',err);}
    });
    bar.querySelector('.rt-partner-v2-pay').addEventListener('click',function(){
      if(!payableCount)return;
      openGroupedPayment(acct);
    });
  }

  function enhance(acct){
    enhanceQueued=false;
    var page=document.getElementById('p-item');
    if(!acct||!isAccountDetailPage(page))return;
    activeAccountId=acct.id;
    installStyles();
    hideLegacyPartnerControls(page);
    var anchor=page.querySelector('.account-group');
    if(!anchor)return;
    var toolbar=buildToolbar(page,acct,anchor);
    buildSelectionBar(page,acct,toolbar);
  }

  function scheduleEnhance(acct){
    if(acct&&acct.id!=null)activeAccountId=acct.id;
    if(enhanceQueued)return;
    enhanceQueued=true;
    requestAnimationFrame(function(){
      var resolved=acct&&acct.id!=null?acct:accountById(activeAccountId);
      enhance(resolved);
    });
  }

  function openGroupedPayment(acct){
    var summary=selectedSummary(acct);
    if(!summary.payable.length){
      try{toast('No unpaid items selected','error');}catch(_){}
      return;
    }
    paymentDraft={accountId:acct.id,itemIds:summary.payable.map(function(entry){return entry.item.id;})};
    var today=new Date().toISOString().slice(0,10);
    var rows=summary.payable.map(function(entry){
      return '<div class="metric-inline"><div style="min-width:0;flex:1;"><div class="metric-k" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+htmlEscape(entry.item.item||'Item')+'</div></div><strong>'+money(debtFor(entry.item))+'</strong></div>';
    }).join('');
    var body='\
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">This records one payment to '+htmlEscape(acct.name||'partner')+' and one cashflow outflow.</div>\
      <div class="panel-card" style="margin-bottom:14px;">'+rows+'<div class="pnl-row total"><span>Total payment</span><strong>'+money(summary.total)+'</strong></div></div>\
      <div class="fg"><label>Date paid</label><input type="date" id="rt-partner-paid-date" value="'+today+'"></div>\
      <div class="fg"><label>Note / reference (optional)</label><input type="text" id="rt-partner-paid-note" placeholder="e.g. bank transfer ref" autocomplete="off"></div>\
      <button type="button" class="btn btn-primary" style="width:100%;margin-top:6px" onclick="_rtPartnerConfirmPaid()">Mark '+summary.payable.length+' item'+(summary.payable.length===1?'':'s')+' as paid · '+money(summary.total)+'</button>';
    try{openPanel('Mark as paid · '+htmlEscape(acct.name||'Partner'),body);}catch(err){
      console.warn('[RETRADE] partner payment panel failed',err);
      paymentDraft=null;
    }
  }

  window._rtPartnerConfirmPaid=function(){
    var draft=paymentDraft;
    if(!draft)return;
    var acct=accountById(draft.accountId);
    if(!acct)return;
    var wanted=new Set(draft.itemIds||[]);
    var payable=accountItems(acct.id).filter(function(entry){return wanted.has(entry.item.id)&&debtFor(entry.item)>0;});
    if(!payable.length){
      paymentDraft=null;
      try{if(typeof closePanel==='function')closePanel();}catch(_){}
      try{toast('Nothing left to pay');}catch(_){}
      try{_renderAccountPage(acct);}catch(_){}
      return;
    }

    var allocations=[];
    var total=0;
    var gross=0;
    payable.forEach(function(entry){
      var amount=roundMoney(debtFor(entry.item));
      if(amount<=0)return;
      total=roundMoney(total+amount);
      try{if(typeof calcGrossProfit==='function')gross+=Number(calcGrossProfit(entry.item))||0;}catch(_){}
      allocations.push({id:entry.item.id,month:entry.month,amount:amount,name:entry.item.item||''});
    });
    if(!allocations.length)return;

    allocations.forEach(function(a){
      var entry=payable.find(function(x){return x.item.id===a.id;});
      if(!entry)return;
      var item=entry.item;
      item.accountSettled=true;
      var itemType='supplier';
      try{if(typeof _itemAccountType==='function')itemType=_itemAccountType(item)||itemType;}catch(_){}
      if(itemType!=='supplier'){
        // Lock the exact paid share as the historical amount. This mirrors the
        // previous settlement builder without asking the user to re-allocate it.
        item.accountPaidAmount=a.amount;
        item.accountSplitPercent=null;
      }
    });

    if(!Array.isArray(acct.settlements))acct.settlements=[];
    var dateEl=document.getElementById('rt-partner-paid-date');
    var noteEl=document.getElementById('rt-partner-paid-note');
    var date=(dateEl&&dateEl.value)||new Date().toISOString().slice(0,10);
    var note=String(noteEl&&noteEl.value||'').trim();
    var isSupplier=String(acct.accountType||'supplier')==='supplier';
    var tx={
      id:'stl_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
      date:date,
      createdAt:new Date().toISOString(),
      paid:true,
      kind:isSupplier?'supplier':String(acct.accountType||'consignment'),
      partnerAmount:roundMoney(total),
      yourAmount:isSupplier?0:roundMoney(gross-total),
      grossProfit:isSupplier?null:roundMoney(gross),
      note:note||null,
      items:allocations
    };
    acct.settlements.unshift(tx);

    paymentDraft=null;
    try{saveDB();}catch(err){console.error('[RETRADE] partner grouped payment save failed',err);}
    try{if(typeof closePanel==='function')closePanel();}catch(_){}
    try{toast('Paid '+money(total)+' · '+allocations.length+' item'+(allocations.length===1?'':'s'));}catch(_){}
    try{_acctSelected.clear();_acctSelectMode=false;}catch(_){}
    try{_renderAccountPage(acct);}catch(_){}
  };

  // Any legacy caller of "bulk settle" now gets the exact grouped payment path,
  // so there is no remaining route from selection mode into Allocate & settle.
  try{
    if(typeof _acctBulkSettle==='function'){
      _acctBulkSettle=function(){
        var acct=accountById(activeAccountId);
        if(!acct){try{if(typeof _acctCurrentAcct==='function')acct=_acctCurrentAcct();}catch(_){} }
        if(acct)openGroupedPayment(acct);
      };
    }
  }catch(_){}

  if(typeof _renderAccountPage==='function'){
    var baseRenderAccountPage=_renderAccountPage;
    _renderAccountPage=function(acct){
      var result=baseRenderAccountPage.apply(this,arguments);
      scheduleEnhance(acct);
      return result;
    };
  }

  installStyles();
  console.info('[RETRADE] v1.4.66 partner search + grouped Mark as paid loaded');
})();
