/* RETRADE partner actions v1.4.67
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

  function selectedSummary(acct){
    var selected=selectedIdSet(),ids=Array.from(selected).map(String),idSet=new Set(ids),picked=accountItems(acct.id).filter(function(entry){return idSet.has(String(entry.item.id));});
    if(typeof window.__rtPartnerPaymentSelectionState==='function'){
      var state=window.__rtPartnerPaymentSelectionState(acct.id,ids)||{};
      return {picked:picked,payable:state.payable||[],needsTerms:state.needsTerms||[],otherCount:Number(state.otherCount)||0,total:roundMoney(state.total)};
    }
    var eligible=typeof window.__rtPartnerPaymentCandidates==='function'?window.__rtPartnerPaymentCandidates(acct.id):[];
    var byId=new Map(eligible.filter(function(r){return r.unpaid;}).map(function(r){return [String(r.item.id),r];}));
    var payable=picked.map(function(entry){return byId.get(String(entry.item.id));}).filter(Boolean);
    var total=roundMoney(payable.reduce(function(sum,entry){return sum+entry.remaining;},0));
    return {picked:picked,payable:payable,needsTerms:[],otherCount:Math.max(0,picked.length-payable.length),total:total};
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
    var groups=page.querySelectorAll('.rt-account-workspace' + ' .rt-account-inventory .account-group');
    if(!page.querySelector('.rt-account-workspace'))groups=page.querySelectorAll('.account-group');
    groups.forEach(function(group){
      var title=String((group.querySelector('.account-group-title')||{}).textContent||'').trim().toLowerCase();
      if(/settlement|payment/.test(title)||group.dataset.groupKey==='settlements'||group.dataset.rtAccountKey==='settlements')return;
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
    var needsTermsCount=(summary.needsTerms||[]).length;
    var actionLabel=needsTermsCount?('Set payout · '+needsTermsCount):(payableCount?'Mark as paid · '+money(summary.total):'Mark as paid');
    var type=String(acct.accountType||'supplier');
    var secondaryAction=type==='supplier'
      ? '<button type="button" class="btn btn-secondary rt-partner-v2-terms">Set cost</button>'
      : '<button type="button" class="btn btn-secondary rt-partner-v2-terms">Set split</button>';

    var statusLine=needsTermsCount
      ? payableCount+' ready · '+needsTermsCount+' need payout'+(summary.otherCount?' · '+summary.otherCount+' not payable':'')
      : (payableCount===selectedCount?payableCount+' unpaid item'+(payableCount===1?'':'s'):payableCount+' of '+selectedCount+' selected item'+(selectedCount===1?'':'s')+' payable'+(summary.otherCount?' · '+summary.otherCount+' not payable':''));
    bar.innerHTML='\
      <div class="rt-partner-v2-selection-copy">\
        <div class="rt-partner-v2-selection-count">'+selectedCount+' selected</div>\
        <div class="rt-partner-v2-selection-total">'+money(summary.total)+(needsTermsCount?' ready to pay':' to pay')+'</div>\
        <div class="rt-partner-v2-selection-sub">'+statusLine+'</div>\
      </div>\
      <button type="button" class="btn btn-secondary rt-partner-v2-select-all">Select all</button>\
      '+secondaryAction+'\
      <button type="button" class="btn btn-primary rt-partner-v2-pay"'+((payableCount||needsTermsCount)?'':' disabled')+'>'+htmlEscape(actionLabel)+'</button>';
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
      if(needsTermsCount&&typeof window.__rtPartnerPrepareTerms==='function'){window.__rtPartnerPrepareTerms(acct.id,Array.from(selectedIdSet()));return;}
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
    if(typeof window.__rtPartnerOpenPayment!=='function'){
      try{toast('Payment controls are still loading. Please try again.','error');}catch(_){}return;
    }
    var ids=Array.from(selectedIdSet());
    if(typeof window.__rtPartnerPaymentSelectionState==='function'){
      var state=window.__rtPartnerPaymentSelectionState(acct.id,ids);
      if(state&&state.needsTerms&&state.needsTerms.length&&typeof window.__rtPartnerPrepareTerms==='function'){window.__rtPartnerPrepareTerms(acct.id,ids);return;}
    }
    window.__rtPartnerOpenPayment(acct.id,ids);
  }

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
      enhance(acct);
      return result;
    };
  }

  installStyles();
  console.info('[RETRADE] v1.4.66 partner search + grouped Mark as paid loaded');
})();
