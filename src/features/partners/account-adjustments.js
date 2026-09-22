/* RETRADE partner account adjustments — v1.4.81
 *
 * Account-level, non-cash credits that reduce a supplier/partner payable without
 * pretending money moved. Credits can be economically allocated to affected
 * items, applied to a later payment transaction, and shown in partner statements.
 */
(function(){
  'use strict';
  if(window.__rtPartnerAccountAdjustmentsReady)return;
  window.__rtPartnerAccountAdjustmentsReady=true;

  var rows=[];
  var loadedUser=null;
  var loadPromise=null;
  var activeAccountId=null;
  var renderQueued=false;
  var pdfPromise=null;
  var xlsxPromise=null;

  function round(v){return Math.round((Number(v)||0)*100)/100;}
  function money(v){try{return typeof fmt==='function'?fmt(round(v)):'£'+round(v).toFixed(2);}catch(_){return '£'+round(v).toFixed(2);}}
  function gbp(v){return '£'+round(v).toFixed(2);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function today(){return new Date().toISOString().slice(0,10);}
  function uid(){try{return _currentUserId||null;}catch(_){return null;}}
  function sb(){try{return _sb||null;}catch(_){return null;}}
  function account(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function allAccountItems(accountId){var out=[];try{(typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(m){(DB[m]||[]).forEach(function(i){if(i&&String(i.accountId)===String(accountId))out.push({item:i,month:m});});});}catch(_){}return out;}
  function itemById(id){var hit=null;allAccountItems(activeAccountId).some(function(e){if(String(e.item.id)===String(id)){hit=e.item;return true;}return false;});if(hit)return hit;try{(typeof allDBKeys==='function'?allDBKeys():[]).some(function(m){return (DB[m]||[]).some(function(i){if(i&&String(i.id)===String(id)){hit=i;return true;}return false;});});}catch(_){}return hit;}
  function active(r){return !!r&&r.status!=='void';}
  function applications(r){return Array.isArray(r&&r.applications)?r.applications:[];}
  function used(r,throughDate){return round(applications(r).reduce(function(s,a){if(!a)return s;if(throughDate&&a.date&&String(a.date)>String(throughDate))return s;return s+Math.max(0,Number(a.amount)||0);},0));}
  function remaining(r,throughDate){return Math.max(0,round((Number(r&&r.amount)||0)-used(r,throughDate)));}
  function kindLabel(kind){return kind==='supplier_credit'?'Supplier credit':kind==='manual_credit'?'Manual credit':'Return-loss contribution';}
  function rowsForAccount(accountId){return rows.filter(function(r){return r&&String(r.account_id)===String(accountId);}).sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''))||String(b.created_at||'').localeCompare(String(a.created_at||''));});}
  function activeRowsForAccount(accountId){return rowsForAccount(accountId).filter(active);}
  function availableCredit(accountId,throughDate){return round(activeRowsForAccount(accountId).reduce(function(s,r){if(throughDate&&r.date&&String(r.date)>String(throughDate))return s;return s+remaining(r,throughDate);},0));}

  async function ensureLoaded(force){
    var client=sb(),user=uid();
    if(!client||!user)return rows;
    if(!force&&loadedUser===user)return rows;
    if(loadPromise)return loadPromise;
    loadPromise=(async function(){
      var res=await client.from('account_adjustments').select('*').eq('user_id',user).order('date',{ascending:false}).order('created_at',{ascending:false});
      if(res.error)throw res.error;
      rows=Array.isArray(res.data)?res.data:[];
      loadedUser=user;
      return rows;
    })().catch(function(err){console.warn('[RETRADE] account adjustments load failed',err);throw err;}).finally(function(){loadPromise=null;});
    return loadPromise;
  }

  function planPayment(accountId,gross,date){
    gross=Math.max(0,round(gross));
    var left=gross,out=[];
    activeRowsForAccount(accountId).slice().sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''))||String(a.created_at||'').localeCompare(String(b.created_at||''));}).forEach(function(r){
      if(left<=0.009)return;
      if(date&&r.date&&String(r.date)>String(date))return;
      var free=remaining(r,date);if(free<=0.009)return;
      var take=Math.min(left,free);take=round(take);
      if(take>0){out.push({adjustmentId:r.id,amount:take,reason:r.reason||kindLabel(r.kind)});left=round(left-take);}
    });
    return {gross:gross,credit:round(gross-left),net:round(left),applications:out};
  }

  async function commitPaymentPlan(plan,tx){
    if(!plan||!plan.applications||!plan.applications.length)return true;
    await ensureLoaded(false);
    var client=sb(),user=uid();if(!client||!user)throw new Error('Database is not ready.');
    var changed=[];
    for(var i=0;i<plan.applications.length;i++){
      var app=plan.applications[i],r=rows.find(function(x){return x&&String(x.id)===String(app.adjustmentId);});
      if(!r||!active(r))throw new Error('An account adjustment changed before payment. Refresh and try again.');
      var free=remaining(r,tx.date);if(free+0.009<app.amount)throw new Error('An account adjustment no longer has enough unused credit.');
      var oldApps=applications(r).slice(),newApps=oldApps.concat([{settlement_id:tx.id,amount:round(app.amount),date:tx.date,created_at:new Date().toISOString()}]);
      var oldRevision=Number(r.revision)||0;
      var res=await client.from('account_adjustments').update({applications:newApps,revision:oldRevision+1,updated_at:new Date().toISOString()}).eq('id',r.id).eq('user_id',user).eq('revision',oldRevision).select('*');
      if(res.error||!res.data||res.data.length!==1){
        for(var j=changed.length-1;j>=0;j--){
          var c=changed[j];
          try{await client.from('account_adjustments').update({applications:c.oldApps,revision:c.newRevision+1,updated_at:new Date().toISOString()}).eq('id',c.id).eq('user_id',user).eq('revision',c.newRevision);}catch(_){}
        }
        await ensureLoaded(true).catch(function(){});
        throw new Error((res.error&&res.error.message)||'Could not apply account credit. Refresh and try again.');
      }
      var fresh=res.data[0];changed.push({id:r.id,oldApps:oldApps,newRevision:Number(fresh.revision)||oldRevision+1});
      Object.assign(r,fresh);
    }
    return true;
  }

  async function rollbackPaymentPlan(txId){
    if(!txId)return;
    await ensureLoaded(false).catch(function(){});
    var client=sb(),user=uid();if(!client||!user)return;
    var affected=rows.filter(function(r){return active(r)&&applications(r).some(function(a){return a&&String(a.settlement_id)===String(txId);});});
    for(var i=0;i<affected.length;i++){
      var r=affected[i],oldRevision=Number(r.revision)||0,newApps=applications(r).filter(function(a){return !a||String(a.settlement_id)!==String(txId);});
      try{var res=await client.from('account_adjustments').update({applications:newApps,revision:oldRevision+1,updated_at:new Date().toISOString()}).eq('id',r.id).eq('user_id',user).eq('revision',oldRevision).select('*');if(res.data&&res.data[0])Object.assign(r,res.data[0]);}catch(_){}
    }
  }

  function returnLoss(item){
    var total=0;
    try{(item&&Array.isArray(item.returnHistory)?item.returnHistory:[]).forEach(function(r){var x=(typeof _returnEventImpact==='function')?_returnEventImpact(item,r):null;if(x){total+=Math.max(0,(Number(x.refund)||0)+(Number(x.postage)||0)-(Number(x.feeCredit)||0)-(Number(x.promoCredit)||0));}else total+=Math.max(0,(Number(r&&r.refundAmount)||0)+(Number(r&&r.returnPostage)||0));});}catch(_){}
    return round(total);
  }

  function proportionalAllocations(accountId,selectedIds,total){
    total=round(total);var selected=allAccountItems(accountId).filter(function(e){return selectedIds.indexOf(String(e.item.id))!==-1;});if(!selected.length||total<=0)return [];
    var weights=selected.map(function(e){return Math.max(0,returnLoss(e.item));});var sum=weights.reduce(function(s,v){return s+v;},0);if(sum<=0){weights=weights.map(function(){return 1;});sum=weights.length;}
    var cents=Math.round(total*100),usedCents=0;
    return selected.map(function(e,idx){var c=idx===selected.length-1?cents-usedCents:Math.floor(cents*weights[idx]/sum);usedCents+=c;return {item_id:e.item.id,item_name:e.item.item||'Item',amount:round(c/100)};}).filter(function(a){return a.amount>0;});
  }

  async function saveNewAdjustment(accountId){
    var amount=Math.abs(Number((document.getElementById('rt-adj-amount')||{}).value)||0),date=(document.getElementById('rt-adj-date')||{}).value||today(),kind=(document.getElementById('rt-adj-kind')||{}).value||'partner_loss_contribution',reason=String((document.getElementById('rt-adj-reason')||{}).value||'').trim(),note=String((document.getElementById('rt-adj-note')||{}).value||'').trim();
    if(!(amount>0)||!reason){try{toast('Enter an amount and reason','error');}catch(_){}return;}
    amount=round(amount);
    var ids=Array.prototype.slice.call(document.querySelectorAll('[data-rt-adj-item]:checked')).map(function(el){return String(el.getAttribute('data-rt-adj-item'));});
    var itemAlloc=proportionalAllocations(accountId,ids,amount);
    var client=sb(),user=uid();if(!client||!user){try{toast('Database is not ready','error');}catch(_){}return;}
    var rec={id:'adj_'+Date.now()+'_'+Math.random().toString(36).slice(2,9),user_id:user,account_id:String(accountId),date:date,kind:kind,amount:amount,reason:reason,note:note||null,item_allocations:itemAlloc,applications:[],status:'active',revision:0,updated_at:new Date().toISOString()};
    var btn=document.getElementById('rt-adj-save');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    try{
      var res=await client.from('account_adjustments').insert(rec).select('*');if(res.error)throw res.error;
      rows.unshift(res.data&&res.data[0]?res.data[0]:rec);
      try{closePanel();}catch(_){}try{toast('Account credit recorded · '+money(amount));}catch(_){}
      var a=account(accountId);if(a)render(a);
    }catch(err){console.error('[RETRADE] adjustment save failed',err);try{toast(err.message||'Could not save account adjustment','error');}catch(_){}}
    finally{if(btn){btn.disabled=false;btn.textContent='Save account credit';}}
  }

  function openAdd(accountId){
    var entries=allAccountItems(accountId).filter(function(e){var i=e.item;return i&&(i.dateSold||i.resaleDateSold||i.returnHistory&&i.returnHistory.length||i.scrappedAt);});
    entries.sort(function(a,b){var aw=returnLoss(a.item),bw=returnLoss(b.item);if((aw>0)!==(bw>0))return bw-aw;return String(b.item.dateSold||b.item.resaleDateSold||'').localeCompare(String(a.item.dateSold||a.item.resaleDateSold||''));});
    var defaultReturnIds=entries.filter(function(e){return returnLoss(e.item)>0;}).map(function(e){return String(e.item.id);});
    var itemHtml=entries.length?entries.slice(0,80).map(function(e){var loss=returnLoss(e.item),checked=loss>0?' checked':'';return '<label class="rt-adj-item"><input type="checkbox" data-rt-adj-item="'+esc(e.item.id)+'"'+checked+'><span><strong>'+esc(e.item.item||'Item')+'</strong><small>'+(loss>0?'Recorded return loss '+esc(money(loss)):'Link for item-level attribution')+'</small></span></label>';}).join(''):'<div class="rt-adj-empty">No eligible account items to link.</div>';
    var body=''
      +'<div class="rt-adj-help">This is a <strong>non-cash account credit</strong>. It reduces what the partner/supplier is owed and improves RETRADE earnings, but does not create a cashflow entry until a real payment is made.</div>'
      +'<div class="fg"><label>Adjustment type</label><select id="rt-adj-kind"><option value="partner_loss_contribution">Return-loss contribution</option><option value="supplier_credit">Supplier credit</option><option value="manual_credit">Other agreed credit</option></select></div>'
      +'<div class="fg"><label>Amount</label><input id="rt-adj-amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="100.00"></div>'
      +'<div class="fg"><label>Date</label><input id="rt-adj-date" type="date" value="'+today()+'"></div>'
      +'<div class="fg"><label>Reason</label><input id="rt-adj-reason" type="text" placeholder="e.g. Contribution toward returned stock losses"></div>'
      +'<div class="fg"><label>Note <span style="font-weight:400">optional</span></label><textarea id="rt-adj-note" rows="2" placeholder="Extra context for the audit trail or statement"></textarea></div>'
      +'<div class="rt-adj-link-head"><div><strong>Link affected items</strong><small>Optional · selected items split the credit proportionally using recorded return losses.</small></div>'+(defaultReturnIds.length?'<button type="button" class="btn btn-secondary" id="rt-adj-returned">Returned items</button>':'')+'</div>'
      +'<div class="rt-adj-items">'+itemHtml+'</div>'
      +'<button type="button" class="btn btn-primary" id="rt-adj-save" style="width:100%;margin-top:12px">Save account credit</button>';
    try{openPanel('Add account adjustment',body);}catch(_){return;}
    var save=document.getElementById('rt-adj-save');if(save)save.addEventListener('click',function(){saveNewAdjustment(accountId);});
    var returned=document.getElementById('rt-adj-returned');if(returned)returned.addEventListener('click',function(){document.querySelectorAll('[data-rt-adj-item]').forEach(function(el){el.checked=defaultReturnIds.indexOf(String(el.getAttribute('data-rt-adj-item')))!==-1;});});
  }

  async function voidAdjustment(id){
    var r=rows.find(function(x){return x&&String(x.id)===String(id);});if(!r||!active(r))return;
    if(used(r)>0.009){try{toast('This adjustment has already been applied to a payment and cannot be voided','error');}catch(_){}return;}
    var reason=String((document.getElementById('rt-adj-void-reason')||{}).value||'Voided by user').trim()||'Voided by user';
    var client=sb(),user=uid(),oldRevision=Number(r.revision)||0;if(!client||!user)return;
    try{var res=await client.from('account_adjustments').update({status:'void',voided_at:new Date().toISOString(),void_reason:reason,revision:oldRevision+1,updated_at:new Date().toISOString()}).eq('id',r.id).eq('user_id',user).eq('revision',oldRevision).select('*');if(res.error||!res.data||res.data.length!==1)throw (res.error||new Error('Adjustment changed on another device.'));Object.assign(r,res.data[0]);try{closePanel();}catch(_){}try{toast('Adjustment voided');}catch(_){}var a=account(r.account_id);if(a)render(a);}catch(err){try{toast(err.message||'Could not void adjustment','error');}catch(_){}}
  }

  function openVoid(id){var r=rows.find(function(x){return x&&String(x.id)===String(id);});if(!r)return;var body='<div class="rt-adj-help">Voiding keeps the original record for audit history but removes its effect from the account balance and statements.</div><div class="fg"><label>Reason</label><input id="rt-adj-void-reason" type="text" value="Voided by user"></div><button type="button" class="btn btn-danger" id="rt-adj-void-confirm" style="width:100%">Void '+esc(money(r.amount))+' credit</button>';try{openPanel('Void account adjustment',body);}catch(_){return;}var b=document.getElementById('rt-adj-void-confirm');if(b)b.addEventListener('click',function(){voidAdjustment(id);});}

  function installStyles(){if(document.getElementById('rt-account-adjustments-style'))return;var s=document.createElement('style');s.id='rt-account-adjustments-style';s.textContent='\
    .rt-account-adjustments{margin:0 0 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden}.rt-adj-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border)}.rt-adj-head-copy{flex:1;min-width:0}.rt-adj-title{font-size:13px;font-weight:800}.rt-adj-sub{font-size:10.5px;color:var(--text-secondary);margin-top:2px}.rt-adj-credit{font-size:14px;font-weight:800;color:var(--green);white-space:nowrap}.rt-adj-list{display:block}.rt-adj-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border)}.rt-adj-row:last-child{border-bottom:0}.rt-adj-name{font-size:12px;font-weight:750}.rt-adj-meta{font-size:10.5px;color:var(--text-secondary);margin-top:3px}.rt-adj-amount{font-size:12px;font-weight:800;color:var(--green);font-variant-numeric:tabular-nums}.rt-adj-voided .rt-adj-name,.rt-adj-voided .rt-adj-amount{color:var(--text-secondary);text-decoration:line-through}.rt-adj-empty{padding:12px 14px;font-size:11px;color:var(--text-secondary)}.rt-adj-help{font-size:11.5px;line-height:1.5;color:var(--text-secondary);padding:10px 11px;border:1px solid var(--border);background:var(--surface2);border-radius:10px;margin-bottom:13px}.rt-adj-link-head{display:flex;gap:10px;align-items:center;margin:12px 0 7px}.rt-adj-link-head>div{flex:1;min-width:0}.rt-adj-link-head strong{display:block;font-size:12px}.rt-adj-link-head small{display:block;font-size:10.5px;color:var(--text-secondary);margin-top:2px}.rt-adj-items{max-height:240px;overflow:auto;border:1px solid var(--border);border-radius:10px}.rt-adj-item{display:flex;gap:10px;align-items:center;padding:9px 10px;border-bottom:1px solid var(--border);cursor:pointer}.rt-adj-item:last-child{border-bottom:0}.rt-adj-item input{width:18px;height:18px}.rt-adj-item span{min-width:0}.rt-adj-item strong{display:block;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-adj-item small{display:block;font-size:10px;color:var(--text-secondary);margin-top:2px}.rt-adj-statement-note{font-size:6.8px;color:#65707e}@media(max-width:560px){.rt-adj-head{flex-wrap:wrap}.rt-adj-head .btn{width:100%}.rt-adj-row{grid-template-columns:minmax(0,1fr) auto}.rt-adj-row .rt-adj-void{grid-column:1/-1;width:100%}}';document.head.appendChild(s);}

  function insertionPoint(page){var pay=page.querySelector('.rt-payalloc2');if(pay)return {p:pay.parentNode,b:pay};var groups=Array.prototype.slice.call(page.querySelectorAll('.account-group'));for(var i=0;i<groups.length;i++){var t=String((groups[i].querySelector('.account-group-title')||{}).textContent||'').toLowerCase();if(t.indexOf('payment')!==-1||t.indexOf('settlement')!==-1)return {p:groups[i].parentNode,b:groups[i]};}return {p:page,b:null};}
  function render(a){
    var page=document.getElementById('p-item');if(!a||!page||!page.classList.contains('on'))return;activeAccountId=a.id;installStyles();
    var old=page.querySelector('.rt-account-adjustments');if(old)old.remove();
    var all=rowsForAccount(a.id),available=availableCredit(a.id),activeN=all.filter(active).length;
    var list=all.length?all.map(function(r){var isActive=active(r),applied=used(r),left=remaining(r);return '<div class="rt-adj-row '+(isActive?'':'rt-adj-voided')+'"><div><div class="rt-adj-name">'+esc(r.reason||kindLabel(r.kind))+'</div><div class="rt-adj-meta">'+esc(r.date||'')+' · '+esc(kindLabel(r.kind))+(applied>0?' · '+esc(money(applied))+' applied'+(left>0?' · '+esc(money(left))+' remaining':''):'')+(r.item_allocations&&r.item_allocations.length?' · '+r.item_allocations.length+' linked item'+(r.item_allocations.length===1?'':'s'):'')+(isActive?'':' · VOID')+'</div></div><div class="rt-adj-amount">−'+esc(money(r.amount))+'</div>'+(isActive&&applied<=0.009?'<button type="button" class="btn btn-secondary rt-adj-void" data-adj-void="'+esc(r.id)+'">Void</button>':'<span></span>')+'</div>';}).join(''):'<div class="rt-adj-empty">No account adjustments recorded.</div>';
    var box=document.createElement('section');box.className='rt-account-adjustments';box.innerHTML='<div class="rt-adj-head"><div class="rt-adj-head-copy"><div class="rt-adj-title">Account adjustments</div><div class="rt-adj-sub">Non-cash credits that reduce partner/supplier payable · '+activeN+' active</div></div><div class="rt-adj-credit">'+(available>0?'−'+esc(money(available))+' available':'No credit available')+'</div><button type="button" class="btn btn-secondary rt-adj-add">+ Add adjustment</button></div><div class="rt-adj-list">'+list+'</div>';
    var pt=insertionPoint(page);if(pt.b)pt.p.insertBefore(box,pt.b);else pt.p.appendChild(box);
    box.querySelector('.rt-adj-add').addEventListener('click',function(){openAdd(a.id);});box.querySelectorAll('[data-adj-void]').forEach(function(b){b.addEventListener('click',function(){openVoid(b.getAttribute('data-adj-void'));});});
    var actions=page.querySelector('.rt-payalloc2-actions');if(actions&&!actions.querySelector('.rt-payalloc-adjust')){var ab=document.createElement('button');ab.type='button';ab.className='btn btn-secondary rt-payalloc-adjust';ab.textContent='Add adjustment';ab.addEventListener('click',function(){openAdd(a.id);});actions.insertBefore(ab,actions.querySelector('.payalloc-existing')||null);}
  }
  function schedule(a){if(a&&a.id!=null)activeAccountId=a.id;if(renderQueued)return;renderQueued=true;requestAnimationFrame(function(){renderQueued=false;var resolved=(a&&a.id!=null)?a:account(activeAccountId);if(!resolved)return;ensureLoaded(false).then(function(){render(resolved);}).catch(function(){});});}

  function adjustmentRowsForPeriod(accountId,period){return activeRowsForAccount(accountId).filter(function(r){return (!period||!period.from||String(r.date)>=String(period.from))&&(!period||!period.to||String(r.date)<=String(period.to));});}
  function adjustedStatement(accountId,period){
    if(typeof window.__rtBuildPartnerStatementV3Base!=='function'&&typeof window.__rtBuildPartnerStatementV3==='function')window.__rtBuildPartnerStatementV3Base=window.__rtBuildPartnerStatementV3;
    var base=window.__rtBuildPartnerStatementV3Base;if(typeof base!=='function')throw new Error('Partner statement engine is not ready.');
    var s=base(accountId,period),adjs=adjustmentRowsForPeriod(accountId,period),matchedCredit=0,unmatchedCredit=0;
    s.accountAdjustments=[];s.totals.grossPartnerEarned=round(s.totals.partnerEarned);s.totals.partnerAdjustment=0;
    adjs.forEach(function(r){
      var itemAllocs=Array.isArray(r.item_allocations)?r.item_allocations:[],rowMatched=0;
      itemAllocs.forEach(function(a){var amt=Math.max(0,round(a&&a.amount)),sale=s.sales.find(function(x){return x&&String(x.itemId)===String(a&&a.item_id)&&Number(x.saleCycle||1)===1;});if(sale&&amt>0){sale.accountAdjustment=round((sale.accountAdjustment||0)-amt);sale.partnerAmount=round(Math.max(0,sale.partnerAmount-amt));sale.retrade=round(sale.preDistribution-sale.partnerAmount);sale.partnerPct=sale.preDistribution!==0?round(sale.partnerAmount/sale.preDistribution*100):null;sale.retradePct=sale.preDistribution!==0?round(sale.retrade/sale.preDistribution*100):null;rowMatched=round(rowMatched+amt);matchedCredit=round(matchedCredit+amt);}});
      var residual=Math.max(0,round((Number(r.amount)||0)-rowMatched));unmatchedCredit=round(unmatchedCredit+residual);
      var appl=used(r,period&&period.to),left=Math.max(0,round((Number(r.amount)||0)-appl));
      s.accountAdjustments.push({id:r.id,date:r.date,kind:r.kind,label:kindLabel(r.kind),reason:r.reason||kindLabel(r.kind),note:r.note||'',amount:round(r.amount),partnerImpact:round(-Number(r.amount)),retradeImpact:round(Number(r.amount)),applied:appl,remaining:left,itemAllocations:itemAllocs});
      s.totals.partnerAdjustment=round(s.totals.partnerAdjustment-Number(r.amount));
    });
    s.totals.partnerEarned=round(Math.max(0,s.totals.grossPartnerEarned+s.totals.partnerAdjustment));
    s.totals.retradeEarned=round(s.totals.preDistribution-s.totals.partnerEarned);
    s.totals.partnerPct=s.totals.preDistribution!==0?round(s.totals.partnerEarned/s.totals.preDistribution*100):null;
    s.totals.retradePct=s.totals.preDistribution!==0?round(s.totals.retradeEarned/s.totals.preDistribution*100):null;
    var rowNet=round(s.sales.reduce(function(sum,r){return sum+(Number(r.retrade)||0);},0)+(s.adjustments||[]).filter(function(a){return !a.matched;}).reduce(function(sum,a){return sum+(Number(a.profitImpact)||0);},0)+unmatchedCredit);
    s.totals.reconciledItemNet=rowNet;s.totals.reconciliationDifference=round(s.totals.retradeEarned-rowNet);
    var remainingCredits=round(adjs.reduce(function(sum,r){return sum+remaining(r,period&&period.to);},0));
    s.due=round(Math.max(0,(Number(s.due)||0)-remainingCredits));
    (s.payments||[]).forEach(function(p){var tx=(s.account.settlements||[]).find(function(x){return x&&String(x.id)===String(p.id);});if(tx&&Number(tx.accountAdjustmentAmount)>0){p.grossAmount=round(tx.grossPartnerAmount||((Number(tx.partnerAmount)||0)+(Number(tx.accountAdjustmentAmount)||0)));p.accountAdjustmentAmount=round(tx.accountAdjustmentAmount);p.adjustmentIds=Array.isArray(tx.accountAdjustmentIds)?tx.accountAdjustmentIds.slice():[];}});
    return s;
  }

  function periodFromPanel(){
    function vis(id){var el=document.getElementById(id);return !!(el&&el.style.display!=='none'&&getComputedStyle(el).display!=='none');}
    function monthEnd(ym){var p=ym.split('-');return new Date(Number(p[0]),Number(p[1]),0).toISOString().slice(0,10);}
    var from='',to='',label='',slug='';
    if(vis('ps-fields-custom')){from=(document.getElementById('ps-from')||{}).value||'';to=(document.getElementById('ps-to')||{}).value||'';if(!from||!to||from>to)throw new Error('Choose a valid statement date range.');label=from+' – '+to;slug=from+'_to_'+to;}
    else if(vis('ps-fields-year')){var y=Number((document.getElementById('ps-year')||{}).value)||new Date().getFullYear();from=y+'-01-01';to=y+'-12-31';label=String(y);slug=String(y);}
    else{var ym=(document.getElementById('ps-month')||{}).value||today().slice(0,7);from=ym+'-01';to=monthEnd(ym);label=new Date(from+'T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});slug=ym;}
    return {from:from,to:to,label:label,slug:slug};
  }
  function currentAdjustedStatement(){if(!activeAccountId)try{activeAccountId=window.__rtPartnerStatementActiveAccountId||null;}catch(_){}if(!activeAccountId)throw new Error('Partner account is not selected.');return adjustedStatement(activeAccountId,periodFromPanel());}

  function csvCell(v){var s=String(v==null?'':v);if(/^[=+\-@]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function csvRows(rowsIn){return rowsIn.map(function(r){return r.map(csvCell).join(',');}).join('\n');}
  function download(content,type,name){var blob=new Blob([content],{type:type}),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},0);}
  function statementTables(s){
    var t=s.totals;
    var summary=[['RETRADE · PARTNER STATEMENT'],['Partner',s.account.name||'Partner'],['Period',s.period.label],[],['Revenue',t.revenue],['Margin before partner/supplier payout',t.preDistribution],['Gross partner/supplier earned',t.grossPartnerEarned],['Account adjustments',t.partnerAdjustment],['Net partner/supplier earned',t.partnerEarned],['RETRADE earned',t.retradeEarned],['Paid in this period',s.paidInPeriod],['Still owed',s.due]];
    var sold=[['Date','Item','Sale','Revenue (£)','Operating costs (£)','Margin (£)','Gross partner/supplier (£)','Account adjustment (£)','Net partner/supplier (£)','RETRADE net (£)','Payment status']];
    s.sales.forEach(function(r){sold.push([r.date,r.item,r.saleNo,r.revenue,r.operatingCosts,r.preDistribution,round(r.partnerAmount-(r.accountAdjustment||0)),r.accountAdjustment||0,r.partnerAmount,r.retrade,r.status]);});
    var transactions=[['Date','Type','Reference / reason','Gross (£)','Adjustment (£)','Cash payment / RETRADE impact (£)','Status']];
    (s.payments||[]).forEach(function(p){transactions.push([p.date,'Payment',p.ref+(p.note?' · '+p.note:''),p.grossAmount||p.amount,p.accountAdjustmentAmount?round(-p.accountAdjustmentAmount):0,p.amount,p.status]);});
    (s.accountAdjustments||[]).forEach(function(a){transactions.push([a.date,'Account adjustment',a.reason,a.amount,round(-a.amount),a.retradeImpact,'Partner payable reduced'+(a.applied?' · '+money(a.applied)+' applied':'')]);});
    (s.adjustments||[]).forEach(function(a){transactions.push([a.date,'Return / refund',a.item+' · '+a.saleNo,a.amount,0,a.profitImpact,'RETRADE impact']);});
    return {summary:summary,sold:sold,transactions:transactions};
  }

  function ensureXlsx(){if(window.XLSX)return Promise.resolve();if(xlsxPromise)return xlsxPromise;xlsxPromise=new Promise(function(resolve,reject){var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.async=true;s.crossOrigin='anonymous';s.onload=function(){window.XLSX?resolve():reject(new Error('Excel library failed'));};s.onerror=reject;document.head.appendChild(s);}).catch(function(e){xlsxPromise=null;throw e;});return xlsxPromise;}
  function ensurePdf(){if(window.jspdf&&window.jspdf.jsPDF)return Promise.resolve();if(pdfPromise)return pdfPromise;pdfPromise=new Promise(function(resolve,reject){var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.async=true;s.crossOrigin='anonymous';s.onload=function(){window.jspdf&&window.jspdf.jsPDF?resolve():reject(new Error('PDF library failed'));};s.onerror=reject;document.head.appendChild(s);}).catch(function(e){pdfPromise=null;throw e;});return pdfPromise;}

  async function generateCsv(){try{await ensureLoaded(false);var s=currentAdjustedStatement(),tab=statementTables(s),out=[];tab.summary.forEach(function(r){out.push(r);});out.push([],['SOLD ITEMS']);tab.sold.forEach(function(r){out.push(r);});out.push([],['PAYMENTS, ACCOUNT ADJUSTMENTS & RETURNS']);tab.transactions.forEach(function(r){out.push(r);});download('\uFEFF'+csvRows(out),'text/csv;charset=utf-8','RETRADE_'+String(s.account.name||'Partner').replace(/[^a-z0-9._-]+/gi,'_')+'_Statement_'+s.period.slug+'.csv');try{toast('Partner statement CSV downloaded');}catch(_){}}catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}}}
  async function generateExcel(){try{await ensureLoaded(false);var s=currentAdjustedStatement(),tab=statementTables(s);await ensureXlsx();var wb=XLSX.utils.book_new(),ws1=XLSX.utils.aoa_to_sheet(tab.summary),ws2=XLSX.utils.aoa_to_sheet(tab.sold),ws3=XLSX.utils.aoa_to_sheet(tab.transactions);ws1['!cols']=[{wch:44},{wch:26}];ws2['!cols']=[{wch:12},{wch:38},{wch:11},{wch:14},{wch:16},{wch:14},{wch:22},{wch:18},{wch:22},{wch:18},{wch:15}];ws3['!cols']=[{wch:12},{wch:22},{wch:52},{wch:14},{wch:16},{wch:24},{wch:36}];XLSX.utils.book_append_sheet(wb,ws1,'Statement');XLSX.utils.book_append_sheet(wb,ws2,'Sold Items');XLSX.utils.book_append_sheet(wb,ws3,'Transactions');XLSX.writeFile(wb,'RETRADE_'+String(s.account.name||'Partner').replace(/[^a-z0-9._-]+/gi,'_')+'_Statement_'+s.period.slug+'.xlsx');try{toast('Partner statement Excel downloaded');}catch(_){}}catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}}}
  function writePdf(s){
    var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'}),navy=[12,20,36],gold=[247,183,55],muted=[101,110,126],line=[220,224,231],pale=[247,249,252],L=14,R=196,W=182,y=0;
    function colour(fn,c){fn.apply(doc,c);}function brand(){colour(doc.setFillColor,navy);doc.rect(0,0,210,24,'F');doc.setFont('helvetica','bold');doc.setFontSize(18);colour(doc.setTextColor,gold);doc.text('RETRADE',L,15);doc.setFontSize(9);doc.setTextColor(255,255,255);doc.text('PARTNER STATEMENT',R,14,{align:'right'});}function page(){doc.addPage();brand();y=32;}function ensure(h){if(y+h>280)page();}function section(t){ensure(10);doc.setFont('helvetica','bold');doc.setFontSize(10);colour(doc.setTextColor,navy);doc.text(t,L,y);y+=5;}function rule(){colour(doc.setDrawColor,line);doc.line(L,y,R,y);}function row(label,value,bold){ensure(8);if(bold){colour(doc.setFillColor,pale);doc.rect(L,y-4,W,7,'F');}doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(8.5);colour(doc.setTextColor,navy);doc.text(label,L+2,y);doc.text(value,R-2,y,{align:'right'});y+=7;rule();}
    brand();y=36;doc.setFont('helvetica','bold');doc.setFontSize(19);colour(doc.setTextColor,navy);doc.text(String(s.account.name||'Partner'),L,y);y+=7;doc.setFont('helvetica','normal');doc.setFontSize(9);colour(doc.setTextColor,muted);doc.text(s.period.label+' · Adjustments reconciled',L,y);y+=10;
    section('Account summary');row('Revenue',gbp(s.totals.revenue));row('Margin before partner/supplier payout',gbp(s.totals.preDistribution));row('Gross partner/supplier earned',gbp(s.totals.grossPartnerEarned));if(Math.abs(s.totals.partnerAdjustment)>0.009)row('Account adjustments',('-'+gbp(Math.abs(s.totals.partnerAdjustment))));row('Net partner/supplier earned',gbp(s.totals.partnerEarned),true);row('RETRADE earned',gbp(s.totals.retradeEarned),true);row('Paid in this period',gbp(s.paidInPeriod));row('Still owed',gbp(s.due),true);y+=5;
    section('Sold items — final net position');if(!s.sales.length)row('No sold items in this period','');s.sales.forEach(function(r){var adj=Math.abs(r.accountAdjustment||0)>0.009,label=String(r.item||'Item')+(r.saleNo?' · '+r.saleNo:''),lines=doc.splitTextToSize(label,94),h=Math.max(adj?16:11,lines.length*3.5+(adj?10:6));ensure(h);doc.setFontSize(7.3);doc.setFont('helvetica','normal');colour(doc.setTextColor,muted);doc.text(String(r.date||''),L,y+3);doc.setFont('helvetica','bold');colour(doc.setTextColor,navy);doc.text(lines,L+23,y+3);doc.setFont('helvetica','normal');doc.text('Partner '+gbp(r.partnerAmount),R-31,y+3,{align:'right'});doc.setFont('helvetica','bold');doc.text('RETRADE '+gbp(r.retrade),R,y+3,{align:'right'});if(adj){doc.setFont('helvetica','normal');doc.setFontSize(6.8);colour(doc.setTextColor,muted);doc.text('Account credit allocated '+gbp(Math.abs(r.accountAdjustment)),L+23,y+8);}y+=h;rule();});
    if(s.accountAdjustments.length){y+=6;section('Account adjustments — non-cash');s.accountAdjustments.forEach(function(a){var txt=a.date+' · '+a.reason+(a.itemAllocations&&a.itemAllocations.length?' · '+a.itemAllocations.length+' linked item'+(a.itemAllocations.length===1?'':'s'):'');row(txt,'−'+gbp(a.amount),true);if(a.note){ensure(6);doc.setFont('helvetica','italic');doc.setFontSize(7);colour(doc.setTextColor,muted);doc.text(doc.splitTextToSize(a.note,W-8),L+4,y);y+=6;}});}
    y+=6;section('Payment transactions');if(!s.payments.length)row('No partner payments in this period','');s.payments.forEach(function(p){var label=p.date+' · '+p.ref+' · '+p.status;row(label,gbp(p.amount),true);if(p.accountAdjustmentAmount){ensure(7);doc.setFontSize(7.2);doc.setFont('helvetica','normal');colour(doc.setTextColor,muted);doc.text('Gross liabilities '+gbp(p.grossAmount)+' · account credit −'+gbp(p.accountAdjustmentAmount)+' · cash paid '+gbp(p.amount),L+5,y);y+=7;}p.allocations.forEach(function(a){ensure(7);doc.setFontSize(7.1);colour(doc.setTextColor,navy);doc.text(doc.splitTextToSize('↳ '+a.item+(a.saleNo?' · '+a.saleNo:''),138),L+5,y);doc.text(gbp(a.amount),R-2,y,{align:'right'});y+=7;});});
    if(s.adjustments&&s.adjustments.length){y+=5;section('Returns & refunds — RETRADE impact');s.adjustments.forEach(function(a){row(a.date+' · '+a.item+' · '+a.saleNo,(a.profitImpact>0?'+':'')+gbp(a.profitImpact));});}
    if(Math.abs(s.totals.reconciliationDifference)>0.01){y+=4;row('RECONCILIATION WARNING',String(s.totals.reconciliationDifference),true);}var pages=doc.getNumberOfPages();for(var i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7);colour(doc.setTextColor,muted);doc.text('RETRADE · '+String(s.account.name||'Partner')+' · '+s.period.label,L,291);doc.text('Page '+i+' of '+pages,R,291,{align:'right'});}doc.save('RETRADE_'+String(s.account.name||'Partner').replace(/[^a-z0-9._-]+/gi,'_')+'_Statement_'+s.period.slug+'.pdf');
  }
  async function generatePdf(){try{await ensureLoaded(false);var s=currentAdjustedStatement();await ensurePdf();writePdf(s);try{toast('Partner statement PDF downloaded');}catch(_){}}catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}}}

  try{if(typeof _taxCashStockAndPartner==='function'&&!_taxCashStockAndPartner.__rtAccountAdjustments){var baseTax=_taxCashStockAndPartner;var wrappedTax=function(from,to){var out=baseTax.apply(this,arguments),userRows=rows.filter(active);userRows.forEach(function(r){applications(r).forEach(function(a){if(!a||!a.date||a.date<from||a.date>to)return;var acct=account(r.account_id),amt=Math.max(0,Number(a.amount)||0);if(!amt)return;var typ=String(acct&&acct.accountType||'supplier').toLowerCase();if(typ==='supplier')out.goodsPaid=round(Math.max(0,(Number(out.goodsPaid)||0)-amt));else out.partnerPaid=round(Math.max(0,(Number(out.partnerPaid)||0)-amt));});});return out;};wrappedTax.__rtAccountAdjustments=true;_taxCashStockAndPartner=wrappedTax;}}catch(_){}

  try{if(typeof calcNetProfit==='function'&&!calcNetProfit.__rtAccountAdjustments){var baseNet=calcNetProfit;var wrappedNet=function(i){var v=baseNet.apply(this,arguments);if(v==null||!i||!i.accountId)return v;var credit=0;activeRowsForAccount(i.accountId).forEach(function(r){(Array.isArray(r.item_allocations)?r.item_allocations:[]).forEach(function(a){if(a&&String(a.item_id)===String(i.id))credit+=Math.max(0,Number(a.amount)||0);});});return round((Number(v)||0)+credit);};wrappedNet.__rtAccountAdjustments=true;calcNetProfit=wrappedNet;}}catch(_){}

  window.__rtPartnerAdjustmentsEnsureLoaded=ensureLoaded;
  window.__rtPartnerAdjustmentsAvailableCredit=availableCredit;
  window.__rtPartnerAdjustmentsPlanPayment=planPayment;
  window.__rtPartnerAdjustmentsCommitPayment=commitPaymentPlan;
  window.__rtPartnerAdjustmentsRollbackPayment=rollbackPaymentPlan;
  window.__rtPartnerAdjustmentsRowsForAccount=rowsForAccount;
  window.__rtBuildPartnerStatementV3Adjusted=adjustedStatement;

  try{if(typeof _renderAccountPage==='function'){var baseRender=_renderAccountPage;_renderAccountPage=function(a){if(a&&a.id!=null)activeAccountId=a.id;var result=baseRender.apply(this,arguments);schedule(a);setTimeout(function(){schedule(a);},100);return result;};}}catch(_){}
  var baseOpen=window.openPartnerStatement;if(typeof baseOpen==='function'){window.openPartnerStatement=function(accountId){activeAccountId=accountId;window.__rtPartnerStatementActiveAccountId=accountId;var r=baseOpen.apply(this,arguments);ensureLoaded(false).catch(function(){});return r;};}
  window._partnerStatementPdf=generatePdf;
  window._partnerStatementExcel=generateExcel;
  window._partnerStatementCsv=generateCsv;

  function boot(){ensureLoaded(false).then(function(){schedule();}).catch(function(){});}
  setTimeout(boot,0);setTimeout(boot,700);
  console.info('[RETRADE] partner account adjustments v1.4.81 loaded');
})();
