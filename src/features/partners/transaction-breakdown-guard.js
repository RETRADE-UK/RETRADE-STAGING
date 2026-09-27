/* RETRADE partner transaction breakdown guard v1.4.84
 * A settlement is a reconciliation, not just a cash number:
 *   gross item liabilities - account adjustments = cash payment.
 * Item allocations must reconcile to the gross liability, while the cash ledger
 * only records the final amount actually transferred.
 */
(function(){
  'use strict';
  if(window.__rtPartnerTransactionBreakdown1484)return;
  window.__rtPartnerTransactionBreakdown1484=true;

  function round(v){return Math.round((Number(v)||0)*100)/100;}
  function money(v){try{return typeof fmt==='function'?fmt(round(v)):'£'+round(v).toFixed(2);}catch(_){return '£'+round(v).toFixed(2);}}
  function e(v){try{return typeof esc==='function'?esc(String(v==null?'':v)):String(v==null?'':v);}catch(_){return String(v==null?'':v);}}
  function acct(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function itemName(a){var id=a&&(a.id!=null?a.id:a.itemId),rec=null;try{if(id&&typeof _findItemRecordById==='function')rec=_findItemRecordById(id);}catch(_){}return (rec&&rec.item&&rec.item.item)||(a&&a.name)||'Item no longer found';}
  function allocTotal(tx){return round((tx&&Array.isArray(tx.items)?tx.items:[]).reduce(function(s,a){return s+Math.max(0,Number(a&&a.amount)||0);},0));}
  function adjustmentRows(accountId,tx){
    var out=[];try{if(typeof window.__rtPartnerAdjustmentsRowsForAccount!=='function')return out;var rows=window.__rtPartnerAdjustmentsRowsForAccount(accountId)||[];(rows||[]).forEach(function(r){if(!r||r.status==='void')return;(Array.isArray(r.applications)?r.applications:[]).forEach(function(a){if(a&&String(a.settlement_id)===String(tx.id)&&Number(a.amount)>0)out.push({reason:r.reason||'Account adjustment',amount:round(a.amount),kind:r.kind||''});});});}catch(_){}return out;
  }

  window._openSettlementDetail=function(accountId,settlementId){
    var a=acct(accountId);if(!a)return;var tx=(a.settlements||[]).find(function(t){return t&&String(t.id)===String(settlementId);});if(!tx)return;
    var cash=round(tx.partnerAmount||0),allocated=allocTotal(tx),credit=round(tx.accountAdjustmentAmount||0),gross=round(tx.grossPartnerAmount!=null?tx.grossPartnerAmount:(allocated||cash+credit)),grossDiff=round(gross-allocated),cashDiff=round((gross-credit)-cash),adjustments=adjustmentRows(accountId,tx);
    if(!adjustments.length&&credit>0){adjustments.push({reason:'Account adjustment credit',amount:credit});}
    var itemRows=(tx.items||[]).map(function(x,index){
      var id=x&&(x.id!=null?x.id:x.itemId),rec=id!=null?_findItemRecordById(id):null;
      var tag=rec?'button':'div';
      return '<'+tag+(rec?' type="button" data-settlement-item="'+index+'"':'')+' class="metric-inline rt-settle-breakdown-row rt-settle-item"><span style="min-width:0;flex:1"><span class="metric-k">'+e(itemName(x))+'</span><span class="rt-settle-breakdown-note">'+(rec?'View item · '+e(rec.item.state||'Stock'):'Item record unavailable')+'</span></span><strong>'+e(money(x.amount||0))+'</strong>'+(rec?'<span class="rt-settle-item-chevron" aria-hidden="true">›</span>':'')+'</'+tag+'>';
    }).join('');
    var adjRows=adjustments.map(function(x){return '<div class="metric-inline rt-settle-breakdown-row rt-settle-adjustment-row"><div style="min-width:0;flex:1"><div class="metric-k">'+e(x.reason)+'</div><div class="rt-settle-breakdown-note">Non-cash account adjustment</div></div><strong>−'+e(money(x.amount||0))+'</strong></div>';}).join('');
    var note=tx.note?'<div class="rt-settle-detail-note">'+e(tx.note)+'</div>':'';
    var warnings='';if(Math.abs(grossDiff)>0.009)warnings+='<div class="rt-settle-allocation-warning">Gross item allocations differ from the recorded gross liability by '+e(money(Math.abs(grossDiff)))+'. Review this transaction.</div>';if(Math.abs(cashDiff)>0.009)warnings+='<div class="rt-settle-allocation-warning">Gross liability less account adjustments does not equal the recorded cash payment by '+e(money(Math.abs(cashDiff)))+'. Review this transaction.</div>';
    var html='<div class="rt-transaction-account">'+e(a.name||'Partner')+'</div><div class="rt-transaction-status">'+(tx.paid?'Paid':'Unpaid allocation')+' · '+e(tx.date||'Date not recorded')+'</div><div class="rt-settle-reconcile"><div class="rt-settle-reconcile-row"><span>Item allocations</span><strong>'+e(money(gross))+'</strong></div>'+(credit>0?'<div class="rt-settle-reconcile-row rt-settle-credit"><span>Account adjustments</span><strong>−'+e(money(credit))+'</strong></div>':'')+'<div class="rt-settle-reconcile-row rt-settle-cash"><span>'+(tx.paid?'Cash paid':'Payment amount')+'</span><strong>'+e(money(cash))+'</strong></div></div>'+
      '<p class="rt-transaction-help">'+(tx.paid?'This payment covers ':'This allocation covers ')+(tx.items||[]).length+' item'+((tx.items||[]).length===1?'':'s')+'. Each amount below is the portion allocated to that item.'+(credit>0?' Account adjustments reduce the cash payment.':'')+'</p>'+note+
      '<div class="rt-settle-allocation-head"><span>Items covered</span><strong>'+e(money(allocated))+'</strong></div>'+(itemRows||'<div class="rt-settle-empty">No item allocations recorded yet.</div>')+
      (credit>0?'<div class="rt-settle-allocation-head"><span>Adjustments applied</span><strong>−'+e(money(credit))+'</strong></div>'+adjRows:'')+warnings+
      '<details class="rt-payment-edit"><summary>Amend payment</summary><div class="rt-payment-edit-body">'+
        '<div class="fg"><label for="settlement-action-date">'+(tx.paid?'Payment date':'Allocation date')+'</label><input type="date" id="settlement-action-date" value="'+e(tx.date||_todayISO())+'"></div>'+
        '<div class="fg"><label for="settlement-detail-note">Note / payment reference</label><input type="text" id="settlement-detail-note" value="'+e(tx.note||'')+'"></div>'+
        '<button type="button" class="btn btn-primary" id="settlement-save-details">Save date &amp; note</button>'+
        '<p class="rt-transaction-help">To change the items or allocation amounts, open the partner account. A payment recorded in error can be reversed; its allocation will remain unpaid.</p>'+
        '<button type="button" class="btn btn-secondary'+(tx.paid?' danger':'')+'" id="settlement-paid-action">'+(tx.paid?'Reverse payment':'Mark paid')+'</button></div></details>'+
      '<div class="rt-transaction-actions"><button type="button" class="btn btn-secondary" id="settlement-view-account">Open partner account</button><button type="button" class="btn btn-secondary" onclick="closePanel()">Close</button></div>';
    openPanel('Payment details',html);
    document.querySelectorAll('#panel-content [data-settlement-item]').forEach(function(button){
      button.onclick=function(){
        var allocation=(tx.items||[])[Number(button.dataset.settlementItem)];
        var record=allocation?_findItemRecordById(allocation.id!=null?allocation.id:allocation.itemId):null;
        if(!record){toast('This item is no longer available.');return;}
        closePanel();
        if(document.getElementById('p-cash').classList.contains('on'))openItemPage(record.month,record.item.id,'p-cash');
        else openAccountItemPage(record.month,record.item.id,accountId);
      };
    });
    document.getElementById('settlement-view-account').onclick=function(){closePanel();openAccountPage(accountId);};
    document.getElementById('settlement-paid-action').onclick=function(){if(tx.paid)_reverseSettlementPayment(accountId,settlementId);else _markSettlementPaid(accountId,settlementId);};
    var originalDate=tx.date,originalNote=tx.note;
    document.getElementById('settlement-save-details').onclick=function(){
      var currentAccount=acct(accountId),current=currentAccount&&(currentAccount.settlements||[]).find(function(x){return String(x.id)===String(settlementId);});
      if(!current||current.date!==originalDate||current.note!==originalNote){toast('This payment has changed. Reopen it before editing.','error');return;}
      var date=document.getElementById('settlement-action-date').value,note=document.getElementById('settlement-detail-note').value.trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Choose a valid payment date.','error');return;}
      current.date=date;current.note=note;
      if(current.paid&&!current.historicalReconstruction)_recordSystemCashEvent(_systemSettlementCashId(current.id),'partner_settlement',current.partnerAmount,date,'Settlement paid · '+(currentAccount.name||'Partner')+' · '+(current.items||[]).length+' items');
      saveDB();refreshActivePage();toast('Payment details updated');_openSettlementDetail(accountId,settlementId);
    };
  };

  function styles(){if(document.getElementById('rt-settle-breakdown-style'))return;var s=document.createElement('style');s.id='rt-settle-breakdown-style';s.textContent='\
    .rt-settle-reconcile{border:1px solid var(--border);border-radius:12px;background:var(--surface2);padding:3px 12px;margin-bottom:10px}.rt-settle-reconcile-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid var(--border);font-size:12px}.rt-settle-reconcile-row:last-child{border-bottom:0}.rt-settle-reconcile-row span{color:var(--text-secondary)}.rt-settle-reconcile-row strong{font-size:14px;font-variant-numeric:tabular-nums}.rt-settle-credit strong{color:var(--green)}.rt-settle-cash strong{font-size:21px;color:var(--accent)}.rt-settle-explain{font-size:11px;line-height:1.5;color:var(--text-secondary);padding:10px 11px;border-left:3px solid var(--accent);background:color-mix(in srgb,var(--accent) 7%,transparent);border-radius:0 8px 8px 0;margin-bottom:12px}.rt-settle-explain strong{color:var(--text)}.rt-settle-detail-note{font-size:11px;color:var(--text-secondary);margin:0 0 12px}.rt-settle-allocation-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;color:var(--text-secondary);margin:10px 0 6px}.rt-settle-allocation-head strong{color:var(--text)}.rt-settle-breakdown-row{padding-top:9px!important;padding-bottom:9px!important}.rt-settle-breakdown-note{font-size:9.5px;color:var(--text-secondary);margin-top:2px}.rt-settle-adjustment-row strong{color:var(--green)}.rt-settle-allocation-warning{margin-top:10px;padding:9px 10px;border:1px solid var(--warn);border-radius:8px;color:var(--warn);font-size:10.5px;line-height:1.45}.rt-settle-empty{padding:12px;color:var(--text-secondary);font-size:11px;border:1px solid var(--border);border-radius:8px}\
  ';document.head.appendChild(s);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',styles,{once:true});else styles();
  console.info('[RETRADE] v1.4.84 settlement reconciliation display loaded');
})();
