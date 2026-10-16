/* RETRADE partner payment allocations v2 — v1.5.22
 *
 * Transaction-first account payment workflow.
 * - Every account gets a collapsible Unsettled items section above payment history.
 * - Includes genuinely unpaid items plus legacy accountSettled items that have no
 *   payment allocation.
 * - Selected items can be linked to an existing payment with spare unallocated
 *   balance, or grouped into one new dated payment transaction.
 * - New payments can apply non-cash account credits. Gross item liabilities stay
 *   fully allocated while only the NET bank payment enters cashflow.
 * - Existing payment totals/cash transfers are never changed when allocating.
 */
(function(){
  'use strict';
  if(window.__rtPartnerPaymentAllocationsV2Ready)return;
  window.__rtPartnerPaymentAllocationsV2Ready=true;

  var activeAccountId=null;
  var selected=Object.create(null);
  var collapsed=Object.create(null);
  var scopeByAccount=Object.create(null);
  var draft=null;
  var renderQueued=false;

  function round(v){return Math.round((Number(v)||0)*100)/100;}
  function money(v){try{return typeof fmt==='function'?fmt(round(v)):'£'+round(v).toFixed(2);}catch(_){return '£'+round(v).toFixed(2);}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function today(){return new Date().toISOString().slice(0,10);}
  function acct(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function itemsFor(accountId){var out=[];try{(typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(m){(DB[m]||[]).forEach(function(i){if(i&&String(i.accountId)===String(accountId))out.push({item:i,month:m});});});}catch(_){}return out;}
  function sold(i){try{return typeof _accountItemIsSold==='function'?!!_accountItemIsSold(i):!!(i&&!i.isReturned&&(i.dateSold||i.resaleSalePrice||i.resaleDateSold||i.state==='sold'));}catch(_){return false;}}
  function model(a,i){try{if(i&&typeof _rtArrangementForItem==='function')return _rtArrangementForItem(i,a);}catch(_){}try{if(typeof _rtArrangementForAccount==='function')return _rtArrangementForAccount(a);}catch(_){}return String((i&&i.accountType)||(a&&a.accountType)||'supplier')==='supplier'?'fixed_cost':'profit_share';}
  function onSale(a){try{return typeof _accountPaysOnSale==='function'?!!_accountPaysOnSale(a):true;}catch(_){return true;}}
  function debt(a,i){
    var v=null;
    if(model(a,i)==='fixed_cost'&&typeof _rtPartnerAgreedAmount==='function'){
      v=_rtPartnerAgreedAmount(i,a);
      if(v!=null&&isFinite(Number(v)))return Math.max(0,round(v));
    }
    try{if(typeof _accountItemDebt==='function')v=_accountItemDebt(i);}catch(_){}
    if(v==null){try{if(typeof _accountItemOwed==='function')v=_accountItemOwed(i);}catch(_){} }
    if(v!=null&&isFinite(Number(v)))return Math.max(0,round(v));
    if(model(a,i)==='fixed_cost'){
      try{if(typeof _rtPartnerAgreedAmount==='function'){v=_rtPartnerAgreedAmount(i,a);if(v!=null)return Math.max(0,round(v));}}catch(_){}
      if(i.partnerAgreedAmount!=null)return Math.max(0,round(i.partnerAgreedAmount));
      if(i.accountPaidAmount!=null)return Math.max(0,round(i.accountPaidAmount));
      if(i.costPrice!=null)return Math.max(0,round(i.costPrice));
    }
    return 0;
  }
  function allocated(a,itemId,paidOnly){var n=0;(a&&Array.isArray(a.settlements)?a.settlements:[]).forEach(function(tx){if(!tx)return;if(paidOnly&&tx.paid!==true)return;(tx.items||[]).forEach(function(x){var id=x&&(x.id!=null?x.id:x.itemId);if(String(id)===String(itemId))n+=Math.max(0,Number(x.amount)||0);});});return round(n);}
  function candidates(a){
    var out=[];
    itemsFor(a.id).forEach(function(e){
      var i=e.item,owed=debt(a,i),used=allocated(a,i.id,false),remaining=Math.max(0,round(owed-used));
      var legacy=!!i.accountSettled&&used<owed-0.009;
      // An agreed fixed cost can be paid early without inventing a sale or a
      // percentage-based liability. Keep disposed/returned stock out of this
      // additional early-payment path; legacy reconstruction is unchanged.
      var early=!sold(i)&&!i.scrappedAt&&!i.isReturned&&model(a,i)==='fixed_cost';
      var due=owed>0.009&&(!onSale(a)||sold(i)||early);
      var unpaid=!i.accountSettled&&due&&remaining>0.009;
      if(!legacy&&!unpaid)return;
      if(remaining<=0.009)return;
      out.push({item:i,month:e.month,owed:owed,used:used,remaining:remaining,legacy:legacy,unpaid:unpaid});
    });
    out.sort(function(a,b){if(a.legacy!==b.legacy)return a.legacy?-1:1;var ad=a.item.dateSold||a.item.resaleDateSold||a.item.dateListed||'',bd=b.item.dateSold||b.item.resaleDateSold||b.item.dateListed||'';return String(bd).localeCompare(String(ad))||String(a.item.item||'').localeCompare(String(b.item.item||''));});
    return out;
  }

  function hasFixedTerms(i){
    if(!i)return false;
    if(i.partnerAgreedAmount!=null||i.partner_agreed_amount!=null||i.accountPaidAmount!=null||i.account_paid_amount!=null)return true;
    return (Number(i.costPrice)||Number(i.cost_price)||0)>0;
  }
  function hasShareTerms(i){
    if(!i)return false;
    if(i.partnerAgreedAmount!=null||i.partner_agreed_amount!=null||i.accountPaidAmount!=null||i.account_paid_amount!=null)return true;
    return i.accountSplitPercent!=null||i.account_split_percent!=null;
  }
  function needsTerms(a,i){
    if(!i||i.accountSettled===true||i.scrappedAt||i.isReturned)return false;
    if(model(a,i)==='fixed_cost')return !hasFixedTerms(i);
    return sold(i)&&!hasShareTerms(i);
  }
  function cashOutstanding(a,i){
    var owed=debt(a,i),paid=allocated(a,i.id,true);
    return Math.max(0,round(owed-paid));
  }
  function outstandingRows(a,scope){
    scope=scope==='all'?'all':'sold';
    var cmap=Object.create(null);
    candidates(a).forEach(function(r){cmap[String(r.item.id)]=r;});
    var out=[];
    itemsFor(a.id).forEach(function(e){
      var i=e.item;if(!i||i.scrappedAt||i.isReturned)return;
      var isSold=sold(i);if(scope==='sold'&&!isSold)return;
      var cand=cmap[String(i.id)];
      if(cand){
        out.push({kind:'payable',item:i,month:e.month,candidate:cand,isSold:isSold,amount:cand.remaining,outstanding:i.accountSettled?0:cashOutstanding(a,i)});
        return;
      }
      if(i.accountSettled===true)return;
      var owed=debt(a,i),cash=cashOutstanding(a,i),allAllocated=allocated(a,i.id,false),paid=allocated(a,i.id,true),pending=Math.max(0,round(allAllocated-paid));
      if(owed>0.009&&cash>0.009&&pending>0.009&&Math.max(0,round(owed-allAllocated))<=0.009){
        out.push({kind:'assigned',item:i,month:e.month,isSold:isSold,amount:cash,outstanding:cash});
        return;
      }
      if(needsTerms(a,i)&&(isSold||(scope==='all'&&model(a,i)==='fixed_cost'))){
        out.push({kind:'terms',item:i,month:e.month,isSold:isSold,amount:null,outstanding:0});
      }
    });
    out.sort(function(x,y){
      if(x.isSold!==y.isSold)return x.isSold?-1:1;
      var xd=x.item.dateSold||x.item.resaleDateSold||x.item.dateListed||x.item.dateSourced||'',yd=y.item.dateSold||y.item.resaleDateSold||y.item.dateListed||y.item.dateSourced||'';
      return String(yd).localeCompare(String(xd))||String(x.item.item||'').localeCompare(String(y.item.item||''));
    });
    return out;
  }
  function outstandingSummary(a){
    function one(scope){
      var rows=outstandingRows(a,scope),amount=0,terms=0,assigned=0,payable=0;
      rows.forEach(function(r){
        if(r.kind==='terms'){terms++;return;}
        if(r.kind==='assigned'){amount+=r.outstanding;assigned++;return;}
        if(r.kind==='payable'){
          if(!r.candidate.legacy)amount+=r.outstanding;
          payable++;
        }
      });
      return {amount:round(amount),terms:terms,assigned:assigned,payable:payable,count:rows.length};
    }
    var soldInfo=one('sold'),allInfo=one('all');
    return {soldAmount:soldInfo.amount,allAmount:allInfo.amount,soldNeedsTerms:soldInfo.terms,allNeedsTerms:allInfo.terms,soldCount:soldInfo.count,allCount:allInfo.count,soldPayable:soldInfo.payable,allPayable:allInfo.payable,soldAssigned:soldInfo.assigned,allAssigned:allInfo.assigned};
  }

  function setFor(a){var k=String(a.id);if(!selected[k])selected[k]=new Set();return selected[k];}
  function picked(a){var map=Object.create(null);candidates(a).forEach(function(r){map[String(r.item.id)]=r;});return Array.from(setFor(a)).map(function(id){return map[String(id)]||null;}).filter(Boolean);}
  function pickedTotal(a){return round(picked(a).reduce(function(s,r){return s+r.remaining;},0));}
  function creditPlan(a,total,date){try{if(typeof window.__rtPartnerAdjustmentsPlanPayment==='function')return window.__rtPartnerAdjustmentsPlanPayment(a.id,total,date||today());}catch(_){}return {gross:round(total),credit:0,net:round(total),applications:[]};}

  function css(){if(document.getElementById('rt-payalloc-v2-style'))return;var s=document.createElement('style');s.id='rt-payalloc-v2-style';s.textContent='\
    .rt-payalloc2{margin:0 0 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden}.rt-payalloc2-head{width:100%;border:0;background:transparent;color:var(--text);display:flex;align-items:center;gap:10px;padding:13px 14px;text-align:left;cursor:pointer}.rt-payalloc2-main{flex:1;min-width:0}.rt-payalloc2-title{font-size:13px;font-weight:800}.rt-payalloc2-sub{font-size:10.5px;color:var(--text-secondary);margin-top:2px;line-height:1.35}.rt-payalloc2-count{font-size:11px;font-weight:800;background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:3px 7px}.rt-payalloc2-chevron{color:var(--muted);transition:transform .16s ease}.rt-payalloc2.closed .rt-payalloc2-chevron{transform:rotate(-90deg)}.rt-payalloc2.closed .rt-payalloc2-body{display:none}.rt-payalloc2-body{border-top:1px solid var(--border)}.rt-payalloc2-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border)}.rt-payalloc2-row input{width:18px;height:18px}.rt-payalloc2-name{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-payalloc2-meta{font-size:10.5px;margin-top:2px;color:var(--text-secondary)}.rt-payalloc2-legacy{color:var(--accent)}.rt-payalloc2-unpaid{color:var(--red)}.rt-payalloc2-amt{font-size:12px;font-weight:800;font-variant-numeric:tabular-nums}.rt-payalloc2-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;background:var(--surface2);border-top:1px solid var(--border)}.rt-payalloc2-summary{flex:1 1 160px;font-size:11px;color:var(--text-secondary)}.rt-payalloc2-summary strong{display:block;font-size:13px;color:var(--text)}.rt-payalloc2-actions .btn{font-size:11.5px;padding:7px 10px}.rt-payalloc2-empty{padding:12px 14px;font-size:11px;color:var(--text-secondary)}.rt-payalloc2-choice{display:block;width:100%;text-align:left;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);padding:10px 11px;margin:0 0 8px;cursor:pointer}.rt-payalloc2-choice strong{display:block;font-size:12px}.rt-payalloc2-choice span{display:block;font-size:10.5px;color:var(--text-secondary);margin-top:3px}.rt-payalloc2-panel-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}.rt-payalloc-credit{display:flex;align-items:flex-start;gap:9px;padding:10px 11px;margin:0 0 13px;border:1px solid var(--border);border-radius:10px;background:var(--surface2)}.rt-payalloc-credit input{width:18px;height:18px;margin-top:2px}.rt-payalloc-credit strong{display:block;font-size:12px;color:var(--green)}.rt-payalloc-credit span{display:block;font-size:10.5px;color:var(--text-secondary);line-height:1.4;margin-top:2px}.rt-payalloc-modal-backdrop{position:fixed;inset:0;z-index:15500;background:rgba(4,9,18,.68);display:flex;align-items:center;justify-content:center;padding:18px}.rt-payalloc-modal{width:min(620px,100%);max-height:min(820px,calc(100dvh - 36px));overflow:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:0 24px 70px rgba(0,0,0,.44)}.rt-payalloc-modal-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 17px;border-bottom:1px solid var(--border);background:var(--surface);font-size:15px;font-weight:850}.rt-payalloc-modal-close{width:36px;height:36px;border:0;border-radius:9px;background:var(--surface2);color:var(--text);font-size:22px;line-height:1;cursor:pointer;touch-action:manipulation}.rt-payalloc-modal-body{padding:16px 17px 20px}.rt-payalloc-modal input,.rt-payalloc-modal button{touch-action:manipulation}.rt-payalloc-modal input[type="text"],.rt-payalloc-modal input[type="date"]{font-size:16px!important}.rt-payalloc-modal #payalloc-create-btn{min-height:48px}@media(max-width:560px){.rt-payalloc-modal-backdrop{align-items:flex-end;padding:0}.rt-payalloc-modal{width:100%;max-height:92dvh;border-radius:18px 18px 0 0;border-bottom:0;padding-bottom:env(safe-area-inset-bottom,0px)}.rt-payalloc-modal-body{padding:14px 16px 22px}}@media(max-width:560px){.rt-payalloc2-row{grid-template-columns:26px minmax(0,1fr) auto;padding:10px 11px}.rt-payalloc2-actions .btn{flex:1 1 130px;min-height:38px}}';document.head.appendChild(s);}

  function outstandingCss(){if(document.getElementById('rt-payalloc-v22-style'))return;var s=document.createElement('style');s.id='rt-payalloc-v22-style';s.textContent='\
    .rt-payalloc2-scopes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px 12px;background:var(--surface2);border-bottom:1px solid var(--border)}.rt-payalloc2-scope{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;padding:10px 11px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);text-align:left;cursor:pointer}.rt-payalloc2-scope.active{border-color:var(--accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent)}.rt-payalloc2-scope span{font-size:10.5px;font-weight:750;color:var(--text-secondary)}.rt-payalloc2-scope strong{font-size:17px;font-weight:850;color:var(--text);font-variant-numeric:tabular-nums}.rt-payalloc2-scope.active strong{color:var(--accent)}.rt-payalloc2-scope small{font-size:9.5px;line-height:1.25;color:var(--muted)}.rt-payalloc2-missing{color:var(--warn,#e0a72f)!important}.rt-payalloc2-needs-terms .btn{font-size:10.5px;padding:6px 9px;white-space:nowrap}.rt-payalloc2-payout-row{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:12px;align-items:center;padding:10px 11px;border-bottom:1px solid var(--border)}.rt-payalloc2-payout-row:last-child{border-bottom:0}.rt-payalloc2-payout-row strong{display:block;font-size:12px}.rt-payalloc2-payout-row small{display:block;font-size:10px;color:var(--text-secondary);margin-top:2px}.rt-payalloc2-payout-row label{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:750}.rt-payalloc2-payout-row input{width:100%;min-width:0;font-size:16px!important}@media(max-width:560px){.rt-payalloc2-scopes{padding:9px 10px;gap:7px}.rt-payalloc2-scope{padding:9px}.rt-payalloc2-scope strong{font-size:15px}.rt-payalloc2-scope small{font-size:9px}.rt-payalloc2-needs-terms{grid-template-columns:26px minmax(0,1fr) auto}.rt-payalloc2-payout-row{grid-template-columns:minmax(0,1fr) 104px}}';document.head.appendChild(s);}

  function fromPage(page){var a=acct(activeAccountId);if(a)return a;var tag=page&&page.querySelector('[data-account-id]');if(tag){a=acct(tag.getAttribute('data-account-id'));if(a)return a;}var h=page&&page.querySelector('.page-title,h1,h2,h3'),t=String(h&&h.textContent||'').trim().toLowerCase();if(t){try{var m=(_accounts||[]).filter(function(x){var n=String(x&&x.name||'').trim().toLowerCase();return n&&(t===n||t.indexOf(n)!==-1);});if(m.length===1)return m[0];}catch(_){}}return null;}
  function paymentHistory(page){var groups=Array.prototype.slice.call(page.querySelectorAll('.account-group'));for(var i=0;i<groups.length;i++){var t=String((groups[i].querySelector('.account-group-title')||{}).textContent||'').trim().toLowerCase();if(/(settlement|payment).*(history)|history.*(settlement|payment)/.test(t))return groups[i];}var cards=Array.prototype.slice.call(page.querySelectorAll('.panel-card,.card,section'));for(var j=0;j<cards.length;j++){var h=cards[j].querySelector('.sl,.section-title,h2,h3,h4'),x=String(h&&h.textContent||'').trim().toLowerCase();if(/(settlement|payment).*(history)|history.*(settlement|payment)/.test(x))return cards[j];}return null;}
  function point(page){var hist=paymentHistory(page);if(hist)return {p:hist.parentNode,b:hist};var groups=Array.prototype.slice.call(page.querySelectorAll('.account-group'));if(groups.length){var last=groups[groups.length-1];return {p:last.parentNode,b:last.nextSibling};}return {p:page,b:null};}

  function render(a){
    var page=document.getElementById('p-item');if(!page||!page.classList.contains('on')||!a||String(page.dataset.rtAccountId)!==String(a.id))return;
    activeAccountId=a.id;css();outstandingCss();var old=page.querySelector('.rt-payalloc2');if(old)old.remove();
    var k=String(a.id),scope=scopeByAccount[k]==='all'?'all':'sold',rows=outstandingRows(a,scope),set=setFor(a),summary=outstandingSummary(a);
    var visibleSelectable=rows.filter(function(r){return r.kind==='payable'||r.kind==='terms';});
    var visibleIds=new Set(visibleSelectable.map(function(r){return String(r.item.id);}));
    Array.from(set).forEach(function(id){if(!visibleIds.has(String(id)))set.delete(id);});
    var legacyN=rows.filter(function(r){return r.kind==='payable'&&r.candidate.legacy;}).length,isClosed=collapsed[k]!==false;

    function rowStatus(r){
      var i=r.item,date=i.dateSold||i.resaleDateSold||'',prefix=r.isSold?('Sold'+(date?' '+date:'')):(i.state==='listed'?'Listed stock':'Unlisted stock');
      if(r.kind==='terms')return prefix+' · payout not set';
      if(r.kind==='assigned')return prefix+' · assigned to an unpaid payment';
      if(r.candidate.legacy)return 'Legacy paid · payment record not assigned';
      return r.isSold?prefix+' · payment outstanding':prefix+' · fixed payout · available to pay early';
    }
    var rowHtml=rows.length?rows.map(function(r){
      var id=String(r.item.id),name=esc(r.item.item||'Untitled item'),status=esc(rowStatus(r));
      if(r.kind==='payable'){
        return '<label class="rt-payalloc2-row"><input type="checkbox" data-payalloc-id="'+esc(id)+'"'+(set.has(r.item.id)||set.has(id)?' checked':'')+'><div><div class="rt-payalloc2-name">'+name+'</div><div class="rt-payalloc2-meta '+(r.candidate.legacy?'rt-payalloc2-legacy':'rt-payalloc2-unpaid')+'">'+status+'</div></div><div class="rt-payalloc2-amt">'+esc(money(r.amount))+'</div></label>';
      }
      if(r.kind==='terms'){
        var action=model(a,r.item)==='fixed_cost'?'Set payout':'Set split';
        return '<div class="rt-payalloc2-row rt-payalloc2-needs-terms" data-payalloc-needs-terms="'+esc(id)+'"><input type="checkbox" data-payalloc-term-id="'+esc(id)+'"'+(set.has(r.item.id)||set.has(id)?' checked':'')+' aria-label="Select '+name+'"><div><div class="rt-payalloc2-name">'+name+'</div><div class="rt-payalloc2-meta rt-payalloc2-missing">'+status+'</div></div><button type="button" class="btn btn-secondary" data-payalloc-edit="'+esc(id)+'">'+action+'</button></div>';
      }
      return '<div class="rt-payalloc2-row" data-payalloc-assigned="'+esc(id)+'"><input type="checkbox" disabled aria-label="Already assigned"><div><div class="rt-payalloc2-name">'+name+'</div><div class="rt-payalloc2-meta">'+status+'</div></div><div class="rt-payalloc2-amt">'+esc(money(r.amount))+'</div></div>';
    }).join(''):'<div class="rt-payalloc2-empty">'+(scope==='sold'?'No sold items are waiting for payment.':'No known stock liabilities are waiting for payment.')+'</div>';

    var soldMeta=summary.soldCount+' item'+(summary.soldCount===1?'':'s')+(summary.soldNeedsTerms?' · '+summary.soldNeedsTerms+' need payout':'');
    var allMeta=summary.allCount+' item'+(summary.allCount===1?'':'s')+(summary.allNeedsTerms?' · '+summary.allNeedsTerms+' need payout':'');
    var scopes='<div class="rt-payalloc2-scopes" role="group" aria-label="Outstanding scope">'
      +'<button type="button" class="rt-payalloc2-scope'+(scope==='sold'?' active':'')+'" data-payalloc-scope="sold"><span>Sold outstanding</span><strong>'+esc(money(summary.soldAmount))+'</strong><small>'+esc(soldMeta)+'</small></button>'
      +'<button type="button" class="rt-payalloc2-scope'+(scope==='all'?' active':'')+'" data-payalloc-scope="all"><span>All stock outstanding</span><strong>'+esc(money(summary.allAmount))+'</strong><small>'+esc(allMeta)+'</small></button>'
      +'</div>';
    var box=document.createElement('div');box.className='rt-payalloc2'+(isClosed?' closed':'');
    box.innerHTML='<button type="button" class="rt-payalloc2-head" aria-expanded="'+(isClosed?'false':'true')+'"><div class="rt-payalloc2-main"><div class="rt-payalloc2-title">Outstanding payments</div><div class="rt-payalloc2-sub">'+(scope==='sold'?'Sold items that still need paying or a payout amount.':'All known unpaid stock commitments, including unsold fixed payouts.')+(legacyN?' · '+legacyN+' legacy paid item'+(legacyN===1?'':'s')+' need a payment record':'')+'</div></div><span class="rt-payalloc2-count">'+rows.length+'</span><span class="rt-payalloc2-chevron">⌄</span></button><div class="rt-payalloc2-body">'+scopes+rowHtml+'<div class="rt-payalloc2-actions"><div class="rt-payalloc2-summary"></div><button type="button" class="btn btn-secondary payalloc-all">Select all</button><button type="button" class="btn btn-secondary payalloc-terms" hidden>Set payout</button><button type="button" class="btn btn-secondary payalloc-existing">Assign to payment</button><button type="button" class="btn btn-primary payalloc-new">New transaction</button></div></div>';
    var pt=point(page);if(pt.b)pt.p.insertBefore(box,pt.b);else pt.p.appendChild(box);

    box.querySelectorAll('[data-payalloc-scope]').forEach(function(btn){btn.addEventListener('click',function(){
      var next=btn.getAttribute('data-payalloc-scope')==='all'?'all':'sold';if(scopeByAccount[k]===next)return;scopeByAccount[k]=next;set.clear();render(a);
    });});
    box.querySelectorAll('[data-payalloc-edit]').forEach(function(btn){btn.addEventListener('click',function(ev){
      ev.preventDefault();ev.stopPropagation();var id=btn.getAttribute('data-payalloc-edit'),r=rows.find(function(x){return String(x.item.id)===String(id);});if(r)prepareTerms(a,[r]);
    });});

    function selection(){
      var map=Object.create(null);rows.forEach(function(r){map[String(r.item.id)]=r;});
      var chosen=Array.from(set).map(function(id){return map[String(id)]||null;}).filter(Boolean);
      var payable=chosen.filter(function(r){return r.kind==='payable';}),terms=chosen.filter(function(r){return r.kind==='terms';});
      return {chosen:chosen,payable:payable,terms:terms,total:round(payable.reduce(function(s,r){return s+r.candidate.remaining;},0))};
    }
    function refresh(){
      var state=selection(),plan=creditPlan(a,state.total,today()),copy=box.querySelector('.rt-payalloc2-summary'),scopeAmount=scope==='sold'?summary.soldAmount:summary.allAmount,scopeTerms=scope==='sold'?summary.soldNeedsTerms:summary.allNeedsTerms;
      if(state.chosen.length){
        copy.innerHTML='<strong>'+state.chosen.length+' selected · '+esc(money(state.total))+' ready</strong>'+(state.terms.length?state.terms.length+' selected item'+(state.terms.length===1?' needs':'s need')+' a payout before payment.':(plan.credit>0?'Account credit '+esc(money(plan.credit))+' · bank payment '+esc(money(plan.net)):'Ready to record one payment transaction.'));
      }else{
        copy.innerHTML='<strong>'+esc(money(scopeAmount))+' '+(scope==='sold'?'sold':'all-stock')+' outstanding</strong>'+(scopeTerms?scopeTerms+' item'+(scopeTerms===1?' needs':'s need')+' a payout amount.':'Select items that were paid together.');
      }
      var termBtn=box.querySelector('.payalloc-terms');termBtn.hidden=!state.terms.length;termBtn.textContent=state.terms.length?('Set '+state.terms.length+' payout'+(state.terms.length===1?'':'s')):'Set payout';
      var blocked=state.terms.length>0||state.payable.length===0;box.querySelector('.payalloc-existing').disabled=blocked;box.querySelector('.payalloc-new').disabled=blocked;
      box.querySelector('.payalloc-all').disabled=!visibleSelectable.length;
      box.querySelector('.payalloc-new').textContent=!blocked&&plan.credit>0?'New payment · '+money(plan.net):'New transaction';
    }
    box.querySelector('.rt-payalloc2-head').addEventListener('click',function(){collapsed[k]=!box.classList.contains('closed');box.classList.toggle('closed');box.querySelector('.rt-payalloc2-head').setAttribute('aria-expanded',box.classList.contains('closed')?'false':'true');});
    box.querySelectorAll('[data-payalloc-id],[data-payalloc-term-id]').forEach(function(cb){cb.addEventListener('change',function(){var id=cb.getAttribute('data-payalloc-id')||cb.getAttribute('data-payalloc-term-id');if(cb.checked)set.add(id);else set.delete(id);refresh();});});
    box.querySelector('.payalloc-all').addEventListener('click',function(){
      var all=visibleSelectable.length&&visibleSelectable.every(function(r){return set.has(r.item.id)||set.has(String(r.item.id));});
      visibleSelectable.forEach(function(r){if(all){set.delete(r.item.id);set.delete(String(r.item.id));}else set.add(String(r.item.id));});render(a);
    });
    box.querySelector('.payalloc-terms').addEventListener('click',function(){var st=selection();if(st.terms.length)prepareTerms(a,st.terms);});
    box.querySelector('.payalloc-existing').addEventListener('click',function(){var st=selection();if(st.terms.length){prepareTerms(a,st.terms);return;}openExisting(a);});
    box.querySelector('.payalloc-new').addEventListener('click',function(){var st=selection();if(st.terms.length){prepareTerms(a,st.terms);return;}openNew(a);});
    refresh();
  }
  function txUsed(tx){return round((tx&&Array.isArray(tx.items)?tx.items:[]).reduce(function(s,x){return s+Math.max(0,Number(x&&x.amount)||0);},0));}
  function openExisting(a){var need=selectedNeedsTerms(a);if(need.length){prepareTerms(a,need);return;}var rows=picked(a),total=pickedTotal(a);if(!rows.length)return;draft={accountId:a.id,ids:rows.map(function(r){return r.item.id;}),mode:'existing',snapshot:snapshot(a,rows)};var choices=(a.settlements||[]).map(function(tx){var amt=round(tx&&tx.partnerAmount),used=txUsed(tx);return {tx:tx,amount:amt,free:Math.max(0,round(amt-used))};}).filter(function(x){return x.tx&&x.free>=total-0.009;}).sort(function(x,y){return String(y.tx.date||'').localeCompare(String(x.tx.date||''));});var body='<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Assign '+rows.length+' item'+(rows.length===1?'':'s')+' ('+esc(money(total))+') to an existing payment. Its amount, date and cash transfer will not change.</div>';if(!choices.length)body+='<div class="panel-card" style="padding:12px;font-size:12px;color:var(--text-secondary);">No existing payment has enough unallocated balance. Create a new transaction or select fewer items.</div>';else choices.forEach(function(x){body+='<button type="button" class="rt-payalloc2-choice" onclick="_rtPayAllocAssignExisting(\''+esc(x.tx.id)+'\')"><strong>'+esc(x.tx.date||'Undated')+' · '+esc(money(x.amount))+' · '+(x.tx.paid===true?'Paid':'Unpaid')+'</strong><span>'+esc(money(x.free))+' unallocated'+(x.tx.note?' · '+esc(x.tx.note):'')+'</span></button>';});try{openPanel('Assign to existing payment',body);}catch(_){} }

  function closePaymentModal(){
    var ov=document.getElementById('rt-payalloc-modal-backdrop');
    if(ov)ov.remove();
    document.documentElement.classList.remove('rt-payalloc-modal-open');
  }
  function openPaymentModal(title,body){
    closePaymentModal();
    var ov=document.createElement('div');
    ov.id='rt-payalloc-modal-backdrop';
    ov.className='rt-payalloc-modal-backdrop';
    ov.innerHTML='<div class="rt-payalloc-modal" role="dialog" aria-modal="true" aria-labelledby="rt-payalloc-modal-title"><div class="rt-payalloc-modal-head"><div id="rt-payalloc-modal-title">'+esc(title)+'</div><button type="button" class="rt-payalloc-modal-close" aria-label="Close">×</button></div><div class="rt-payalloc-modal-body">'+body+'</div></div>';
    document.body.appendChild(ov);
    document.documentElement.classList.add('rt-payalloc-modal-open');
    var modal=ov.querySelector('.rt-payalloc-modal');
    ov.addEventListener('click',function(ev){if(ev.target===ov)closePaymentModal();});
    ov.querySelector('.rt-payalloc-modal-close').addEventListener('click',closePaymentModal);
    modal.addEventListener('click',function(ev){ev.stopPropagation();});
  }

  function openNew(a){
    var need=selectedNeedsTerms(a);if(need.length){prepareTerms(a,need);return;}
    var rows=picked(a);if(!rows.length)return;var legacy=rows.filter(function(r){return r.legacy;}),unpaid=rows.filter(function(r){return r.unpaid;});if(legacy.length&&unpaid.length){try{toast('Select legacy settled items or unpaid items separately','error');}catch(_){}return;}
    // Eligibility belongs to each candidate, not the whole bank payment.
    // Fixed upfront costs and earned shares can share one set of allocations.
    var total=pickedTotal(a),reconstruct=legacy.length>0,plan=reconstruct?{credit:0,net:total}:creditPlan(a,total,today());draft={accountId:a.id,ids:rows.map(function(r){return r.item.id;}),mode:'new',reconstruct:reconstruct,snapshot:snapshot(a,rows)};
    var list=rows.map(function(r){return '<div class="rt-payalloc2-panel-row"><span>'+esc(r.item.item||'Item')+'</span><strong>'+esc(money(r.remaining))+'</strong></div>';}).join('');
    var intro=reconstruct?'This rebuilds one historical payment from items the old system marked settled but never linked to a transaction. The dated payment will also restore the matching historical cashflow outflow.':'This records one payment transaction. Item liabilities are allocated at their gross amount; any account credit reduces only the actual bank payment.';
    var creditHtml=!reconstruct&&plan.credit>0?'<label class="rt-payalloc-credit"><input type="checkbox" id="payalloc-apply-credit" checked><span><strong>Apply account credit · −'+esc(money(plan.credit))+'</strong><span>Gross liability '+esc(money(total))+' → expected bank payment '+esc(money(plan.net))+'. This credit is non-cash and will be linked to this payment.</span></span></label>':'';
    var body='<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">'+esc(intro)+'</div><div class="panel-card" style="margin-bottom:14px;">'+list+'<div class="rt-payalloc2-panel-row"><span><strong>Gross liability</strong></span><strong>'+esc(money(total))+'</strong></div></div>'+creditHtml+'<div class="fg"><label>Payment date</label><input type="date" id="payalloc-date" value="'+today()+'"></div><div class="fg"><label>Note / bank reference <span style="font-weight:400">optional</span></label><input type="text" id="payalloc-note" placeholder="e.g. Bank transfer ref"></div><button type="button" class="btn btn-primary" style="width:100%" id="payalloc-create-btn">'+(reconstruct?'Reconstruct payment · ': 'Record payment · ')+esc(money(plan.net))+'</button>';
    try{openPaymentModal((reconstruct?'Reconstruct':'New')+' payment transaction',body);}catch(_){return;}
    var dateEl=document.getElementById('payalloc-date'),creditEl=document.getElementById('payalloc-apply-credit'),btn=document.getElementById('payalloc-create-btn');function refreshNet(){if(!btn)return;var use=creditEl&&creditEl.checked,pp=(!reconstruct&&use)?creditPlan(a,total,(dateEl&&dateEl.value)||today()):{credit:0,net:total};btn.textContent=(reconstruct?'Reconstruct payment · ':'Record payment · ')+money(pp.net);}if(dateEl)dateEl.addEventListener('change',refreshNet);if(creditEl)creditEl.addEventListener('change',refreshNet);
    if(btn)btn.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();window._rtPayAllocCreate();});
  }

  function selectedNeedsTerms(a){
    var map=Object.create(null);outstandingRows(a,'all').forEach(function(r){if(r.kind==='terms')map[String(r.item.id)]=r;});
    return Array.from(setFor(a)).map(function(id){return map[String(id)]||null;}).filter(Boolean);
  }
  function prepareTerms(a,rows){
    rows=(rows||[]).filter(function(r){return r&&r.kind==='terms';});if(!rows.length)return;
    var fixed=rows.filter(function(r){return model(a,r.item)==='fixed_cost';});
    if(fixed.length){openPayoutEditor(a,fixed);return;}
    var first=rows[0];if(typeof openSetItemSplit==='function'){openSetItemSplit(first.month,first.item.id);return;}
    try{toast('Open the item and set its partner split before paying','error');}catch(_){}
  }
  function openPayoutEditor(a,rows){
    rows=(rows||[]).filter(Boolean);if(!rows.length)return;
    var body='<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Set the agreed fixed payout for the selected item'+(rows.length===1?'':'s')+'. This only sets the liability; it does not record a payment or change the sale/stock state.</div>';
    body+='<div class="panel-card" style="margin-bottom:14px;">'+rows.map(function(r){
      var i=r.item,date=i.dateSold||i.resaleDateSold||'',hint=r.isSold?('Sold'+(date?' '+date:'')):(i.state==='listed'?'Listed stock':'Unlisted stock');
      return '<div class="rt-payalloc2-payout-row"><div><strong>'+esc(i.item||'Item')+'</strong><small>'+esc(hint)+'</small></div><label>£ <input type="number" min="0" step="0.01" inputmode="decimal" data-payalloc-payout="'+esc(i.id)+'" placeholder="0.00"></label></div>';
    }).join('')+'</div><button type="button" class="btn btn-primary" id="payalloc-save-payouts" style="width:100%;min-height:48px">Save payout'+(rows.length===1?'':'s')+'</button>';
    openPaymentModal('Set agreed payout'+(rows.length===1?'':'s'),body);
    var btn=document.getElementById('payalloc-save-payouts');if(!btn)return;
    btn.addEventListener('click',async function(){
      var values=[],invalid=false;
      rows.forEach(function(r){var el=document.querySelector('[data-payalloc-payout="'+CSS.escape(String(r.item.id))+'"]'),raw=String(el&&el.value||'').trim(),n=raw===''?NaN:Number(raw);if(!isFinite(n)||n<0){invalid=true;return;}values.push({r:r,value:round(n)});});
      if(invalid||values.length!==rows.length){try{toast('Enter an agreed payout for every selected item','error');}catch(_){}return;}
      var before=values.map(function(x){var i=x.r.item;return {i:i,partnerAgreedAmount:i.partnerAgreedAmount,arrangementModelOverride:i.arrangementModelOverride,accountPaidAmount:i.accountPaidAmount,accountSplitPercent:i.accountSplitPercent};});
      values.forEach(function(x){var i=x.r.item;i.partnerAgreedAmount=x.value;i.arrangementModelOverride='fixed_cost';i.accountPaidAmount=x.value;i.accountSplitPercent=null;});
      btn.disabled=true;btn.textContent='Saving…';
      try{await persistDB();closePaymentModal();try{if(typeof _renderAccountPage==='function')_renderAccountPage(a);else render(a);}catch(_){render(a);}try{toast('Payout'+(values.length===1?'':'s')+' saved · ready to pay');}catch(_){}}
      catch(err){before.forEach(function(x){x.i.partnerAgreedAmount=x.partnerAgreedAmount;x.i.arrangementModelOverride=x.arrangementModelOverride;x.i.accountPaidAmount=x.accountPaidAmount;x.i.accountSplitPercent=x.accountSplitPercent;});btn.disabled=false;btn.textContent='Save payout'+(rows.length===1?'':'s');try{toast('Could not save payout amount','error');}catch(_){}}
    });
  }

  // Both selection surfaces use this same eligibility/allocation owner.
  window.__rtPartnerPaymentCandidates=function(accountId){var a=acct(accountId);return a?candidates(a):[];};
  window.__rtPartnerOutstandingSummary=function(accountId){var a=acct(accountId);return a?outstandingSummary(a):{soldAmount:0,allAmount:0,soldNeedsTerms:0,allNeedsTerms:0,soldCount:0,allCount:0};};
  window.__rtPartnerPaymentSelectionState=function(accountId,ids){
    var a=acct(accountId);if(!a)return {payable:[],needsTerms:[],other:[],total:0};
    var wanted=new Set((ids||[]).map(String)),map=Object.create(null);outstandingRows(a,'all').forEach(function(r){map[String(r.item.id)]=r;});
    var pickedRows=Array.from(wanted).map(function(id){return map[String(id)]||null;}).filter(Boolean),payable=pickedRows.filter(function(r){return r.kind==='payable'&&r.candidate&&r.candidate.unpaid;}),needs=pickedRows.filter(function(r){return r.kind==='terms';});
    return {payable:payable,needsTerms:needs,otherCount:Math.max(0,wanted.size-payable.length-needs.length),total:round(payable.reduce(function(s,r){return s+r.candidate.remaining;},0))};
  };
  window.__rtPartnerPrepareTerms=function(accountId,ids){var a=acct(accountId);if(!a)return false;var st=window.__rtPartnerPaymentSelectionState(accountId,ids);if(!st.needsTerms.length)return false;prepareTerms(a,st.needsTerms);return true;};
  window.__rtPartnerOpenPayment=function(accountId,ids){
    var a=acct(accountId);if(!a)return false;
    var state=window.__rtPartnerPaymentSelectionState(accountId,ids);
    if(state.needsTerms.length){prepareTerms(a,state.needsTerms);return false;}
    var wanted=new Set((ids||[]).map(String));
    var rows=candidates(a).filter(function(r){return r.unpaid&&wanted.has(String(r.item.id));});
    if(!rows.length){try{toast('No unpaid fixed costs or completed sales selected','error');}catch(_){}return false;}
    selected[String(a.id)]=new Set(rows.map(function(r){return r.item.id;}));
    draft=null;openNew(a);if(draft)draft.fromAccountSelection=true;return !!draft;
  };
  function snapshot(a,rows){return JSON.stringify(rows.map(function(r){return [String(r.item.id),r.month,r.owed,r.remaining,r.legacy,r.unpaid,model(a,r.item),sold(r.item),r.item.state,r.item.isReturned,r.item.scrappedAt,typeof _itemAccountType==='function'?_itemAccountType(r.item):r.item.accountType];}));}
  function liveDraft(){
    if(!draft)return {a:null,rows:[]};var a=acct(draft.accountId);if(!a)return {a:null,rows:[]};
    var map=Object.create(null);candidates(a).forEach(function(r){map[String(r.item.id)]=r;});
    var rows=(draft.ids||[]).map(function(id){return map[String(id)]||null;}).filter(Boolean);
    if(snapshot(a,rows)!==draft.snapshot){
      try{toast('Selected items or amounts changed. Review the payment again.','error');}catch(_){}
      return {a:a,rows:[]};
    }
    return {a:a,rows:rows};
  }
  function markIfFullyPaid(a,i){var owed=debt(a,i),paid=allocated(a,i.id,true);if(owed>0&&paid>=owed-0.009)i.accountSettled=true;}
  async function persistDB(){try{var result=saveDB();if(result&&typeof result.then==='function')await result;return true;}catch(e){console.warn('[RETRADE] payment allocation save failed',e);throw e;}}
  function finish(a,msg){selected[String(a.id)]=new Set();if(draft&&draft.fromAccountSelection){try{_acctSelected.clear();_acctSelectMode=false;}catch(_){}}draft=null;try{closePaymentModal();}catch(_){}try{closePanel();}catch(_){}try{toast(msg);}catch(_){}try{_renderAccountPage(a);}catch(_){} }

  window._rtPayAllocAssignExisting=async function(txId){var d=liveDraft(),a=d.a,rows=d.rows;if(!a||!rows.length)return;var tx=(a.settlements||[]).find(function(x){return x&&String(x.id)===String(txId);});if(!tx)return;var total=round(rows.reduce(function(s,r){return s+r.remaining;},0)),free=Math.max(0,round((Number(tx.partnerAmount)||0)-txUsed(tx)));if(free<total-0.009){try{toast('That payment no longer has enough unallocated balance','error');}catch(_){}return;}if(!Array.isArray(tx.items))tx.items=[];var prev=rows.map(function(r){return {item:r.item,settled:!!r.item.accountSettled};});rows.forEach(function(r){tx.items.push({id:r.item.id,itemId:r.item.id,name:r.item.item||'',kind:typeof _itemAccountType==='function'?_itemAccountType(r.item):String(r.item.accountType||a.accountType||'supplier'),amount:round(r.remaining)});markIfFullyPaid(a,r.item);});tx.updatedAt=new Date().toISOString();tx.allocationRepairedAt=tx.updatedAt;try{await persistDB();finish(a,'Assigned '+rows.length+' item'+(rows.length===1?'':'s')+' to '+money(tx.partnerAmount||0)+' payment');}catch(_){tx.items.splice(Math.max(0,tx.items.length-rows.length),rows.length);prev.forEach(function(x){x.item.accountSettled=x.settled;});try{toast('Could not save payment allocation','error');}catch(__){}}};

  window._rtPayAllocCreate=async function(){
    var d=liveDraft(),a=d.a,rows=d.rows;if(!a||!rows.length)return;var total=round(rows.reduce(function(s,r){return s+r.remaining;},0));if(total<=0)return;
    var date=(document.getElementById('payalloc-date')||{}).value||today(),note=String((document.getElementById('payalloc-note')||{}).value||'').trim();var fixed=rows.every(function(r){return model(a,r.item)==='fixed_cost';}),sharesOnly=rows.every(function(r){return sold(r.item)&&model(a,r.item)!=='fixed_cost';}),gross=0;
    // A mixed payment is a cash allocation, not a realised profit subtotal.
    // Keep the existing share summary only for sold profit-share-only payments.
    if(sharesOnly)rows.forEach(function(r){try{if(typeof calcGrossProfit==='function')gross+=Number(calcGrossProfit(r.item))||0;}catch(_){} });gross=round(gross);
    var useCredit=!draft.reconstruct&&!!(document.getElementById('payalloc-apply-credit')&&document.getElementById('payalloc-apply-credit').checked),plan=useCredit?creditPlan(a,total,date):{gross:total,credit:0,net:total,applications:[]};
    var tx={id:'stl_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),date:date,createdAt:new Date().toISOString(),paid:true,kind:fixed?'supplier':String(a.accountType||'consignment'),partnerAmount:round(plan.net),grossPartnerAmount:total,accountAdjustmentAmount:round(plan.credit),accountAdjustmentIds:(plan.applications||[]).map(function(x){return x.adjustmentId;}),yourAmount:sharesOnly?round(gross-plan.net):0,grossProfit:sharesOnly?gross:null,note:note||null,items:rows.map(function(r){return {id:r.item.id,itemId:r.item.id,name:r.item.item||'',kind:typeof _itemAccountType==='function'?_itemAccountType(r.item):String(r.item.accountType||a.accountType||'supplier'),amount:round(r.remaining)};}),arrangementModel:fixed?'fixed_cost':model(a),historicalReconstruction:!!draft.reconstruct};
    if(!Array.isArray(a.settlements))a.settlements=[];var prev=rows.map(function(r){return {item:r.item,settled:!!r.item.accountSettled};});a.settlements.unshift(tx);rows.forEach(function(r){markIfFullyPaid(a,r.item);});
    var btn=document.getElementById('payalloc-create-btn');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    try{
      await persistDB();
      if(plan.credit>0&&typeof window.__rtPartnerAdjustmentsCommitPayment==='function')await window.__rtPartnerAdjustmentsCommitPayment(plan,tx);
      finish(a,(draft&&draft.reconstruct?'Reconstructed ':'Paid ')+money(plan.net)+(plan.credit>0?' · '+money(plan.credit)+' account credit applied':'')+' · '+rows.length+' item'+(rows.length===1?'':'s'));
    }catch(err){
      var idx=a.settlements.indexOf(tx);if(idx!==-1)a.settlements.splice(idx,1);prev.forEach(function(x){x.item.accountSettled=x.settled;});try{if(plan.credit>0&&typeof window.__rtPartnerAdjustmentsRollbackPayment==='function')await window.__rtPartnerAdjustmentsRollbackPayment(tx.id);}catch(_){}try{await persistDB();}catch(_){}try{toast((err&&err.message)||'Could not record payment','error');}catch(_){}if(btn){btn.disabled=false;btn.textContent='Record payment · '+money(plan.net);}
    }
  };

  function schedule(a){if(a&&a.id!=null)activeAccountId=a.id;if(renderQueued)return;renderQueued=true;requestAnimationFrame(function(){renderQueued=false;var page=document.getElementById('p-item'),resolved=a&&a.id!=null?a:fromPage(page);if(resolved)render(resolved);});}
  try{if(typeof _renderAccountPage==='function'){var base=_renderAccountPage;_renderAccountPage=function(a){if(a&&a.id!=null)activeAccountId=a.id;var r=base.apply(this,arguments);render(a);return r;};}}catch(_){}
  console.info('[RETRADE] partner payment allocation workflow v2 v1.5.20 loaded');
})();
