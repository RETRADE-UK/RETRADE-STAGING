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
  var pdfPromise=null;
  var xlsxPromise=null;

  function round(v){return Math.round((Number(v)||0)*100)/100;}
  function money(v){try{return typeof fmt==='function'?fmt(round(v)):'£'+round(v).toFixed(2);}catch(_){return '£'+round(v).toFixed(2);}}
  function gbp(v){return '£'+round(v).toFixed(2);}
  function today(){return new Date().toISOString().slice(0,10);}
  function uid(){try{return _currentUserId||null;}catch(_){return null;}}
  function sb(){try{return _sb||null;}catch(_){return null;}}
  function account(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function allAccountItems(accountId){var out=[];try{(typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(m){(DB[m]||[]).forEach(function(i){if(i&&String(i.accountId)===String(accountId))out.push({item:i,month:m});});});}catch(_){}return out;}
  function itemById(id){var hit=null;allAccountItems(activeAccountId).some(function(e){if(String(e.item.id)===String(id)){hit=e.item;return true;}return false;});if(hit)return hit;try{(typeof allDBKeys==='function'?allDBKeys():[]).some(function(m){return (DB[m]||[]).some(function(i){if(i&&String(i.id)===String(id)){hit=i;return true;}return false;});});}catch(_){}return hit;}
  function active(r){return !!r&&r.status!=='void';}
  function profitEvents(){
    if(!uid()||loadedUser!==uid())return [];
    var out=[];
    rows.filter(active).forEach(function(r){
      if(!r.date||r.user_id&&String(r.user_id)!==String(uid()))return;
      var left=Math.max(0,round(r.amount));
      (Array.isArray(r.item_allocations)?r.item_allocations:[]).forEach(function(allocation,idx){
        var amount=Math.min(left,Math.max(0,round(allocation&&allocation.amount)));left=round(left-amount);
        if(!amount)return;
        var item=itemById(allocation&&allocation.item_id);
        if(!item||String(item.accountId)!==String(r.account_id))return;
        // An unused supplier credit is a balance, not realised profit. Linked
        // stock must have a sale, return loss or write-off before recognition.
        var dates=[typeof _originalSale1Date==='function'?_originalSale1Date(item):item.dateSold,item.resaleDateSold,item.scrappedAt];
        (item.returnHistory||[]).forEach(function(ret){if(ret&&ret.loggedAt)dates.push(String(ret.loggedAt).slice(0,10));});
        dates=dates.filter(function(d){return /^\d{4}-\d{2}-\d{2}$/.test(String(d||''));}).sort();
        if(!dates.length)return;
        var date=String(r.date)>dates[0]?String(r.date):dates[0];
        out.push({id:'accountcredit:'+r.id+':'+idx,date:date,creditDate:r.date,accountId:r.account_id,adjustmentId:r.id,itemId:item.id,kind:r.kind,amount:amount});
      });
    });
    return out;
  }
  function cashEvents(){
    if(!uid()||loadedUser!==uid())return [];
    var out=[];
    rows.filter(active).forEach(function(r){
      var left=Math.max(0,round(r.amount));
      applications(r).forEach(function(a,idx){
        if(!a)return;
        var amount=Math.min(left,Math.max(0,round(a.amount)));left=round(left-amount);
        if(!amount||a.type!=='cash_refund'||!/^\d{4}-\d{2}-\d{2}$/.test(a.date||'')||a.date<r.date||!['personal','business'].includes(a.destination))return;
        var event={id:'accountrefund:'+r.id+':'+idx,date:a.date,type:'supplier_refund',direction:'in',amount:amount,description:r.reason||'Supplier reimbursement',source:'account_adjustment',accountId:r.account_id,adjustmentId:r.id};
        out.push(event);
        if(a.destination==='personal')out.push(Object.assign({},event,{id:event.id+':drawing',type:'owner_draw',direction:'out',description:'Owner drawing · reimbursement received personally'}));
      });
    });
    return out;
  }
  function refreshFinancialViews(){try{if(typeof _dbLoading!=='undefined'&&_dbLoading)return;if(typeof refreshActivePage==='function')refreshActivePage();}catch(_){} }
  function applications(r){return Array.isArray(r&&r.applications)?r.applications:[];}
  function used(r,throughDate){return round(applications(r).reduce(function(s,a){if(!a)return s;if(throughDate&&a.date&&String(a.date)>String(throughDate))return s;return s+Math.max(0,Number(a.amount)||0);},0));}
  function remaining(r,throughDate){return Math.max(0,round((Number(r&&r.amount)||0)-used(r,throughDate)));}
  function kindLabel(kind){return kind==='supplier_credit'?'Supplier credit':kind==='manual_credit'?'Manual credit':'Return-loss contribution';}
  function rowsForAccount(accountId){if(loadedUser!==uid())return [];return rows.filter(function(r){return r&&String(r.account_id)===String(accountId);}).sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''))||String(b.created_at||'').localeCompare(String(a.created_at||''));});}
  function activeRowsForAccount(accountId){return rowsForAccount(accountId).filter(active);}
  function availableCredit(accountId,throughDate){return round(activeRowsForAccount(accountId).reduce(function(s,r){if(throughDate&&r.date&&String(r.date)>String(throughDate))return s;return s+remaining(r,throughDate);},0));}

  async function ensureLoaded(force){
    var client=sb(),user=uid();
    if(!client||!user)return rows;
    if(!force&&loadedUser===user)return rows;
    if(loadPromise){await loadPromise;if(loadedUser===user)return rows;return ensureLoaded(force);}
    loadPromise=(async function(){
      var res=await client.from('account_adjustments').select('*').eq('user_id',user).order('date',{ascending:false}).order('created_at',{ascending:false});
      if(res.error)throw res.error;
      if(uid()!==user)return []; // never publish another user's in-flight response
      var nextRows=(Array.isArray(res.data)?res.data:[]).filter(function(r){return r&&(!r.user_id||String(r.user_id)===String(user));});
      var changed=JSON.stringify(loadedUser===user?rows:[])!==JSON.stringify(nextRows);
      rows=nextRows;loadedUser=user;
      if(changed)refreshFinancialViews();
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

  function adjustedStatement(accountId,period){
    if(typeof window.__rtBuildPartnerStatementV3Base!=='function'&&typeof window.__rtBuildPartnerStatementV3==='function')window.__rtBuildPartnerStatementV3Base=window.__rtBuildPartnerStatementV3;
    var base=window.__rtBuildPartnerStatementV3Base;if(typeof base!=='function')throw new Error('Partner statement engine is not ready.');
    var s=base(accountId,period),inPeriod=function(d){return (!period||!period.from||d>=period.from)&&(!period||!period.to||d<=period.to);};
    var recognised=profitEvents().filter(function(e){return String(e.accountId)===String(accountId)&&inPeriod(e.date);});
    var amount=round(recognised.reduce(function(sum,e){return sum+e.amount;},0)),rowCredit=0;
    s.accountAdjustments=[];s.totals.grossPartnerEarned=round(s.totals.partnerEarned);s.totals.partnerAdjustment=-amount;
    recognised.forEach(function(e){
      var sale=s.sales.find(function(x){return x&&String(x.itemId)===String(e.itemId)&&Number(x.saleCycle||1)===1;});
      if(!sale)return;
      var applied=Math.min(e.amount,Math.max(0,sale.partnerAmount));
      sale.accountAdjustment=round((sale.accountAdjustment||0)-applied);sale.partnerAmount=round(sale.partnerAmount-applied);
      sale.retrade=round(sale.preDistribution-sale.partnerAmount);sale.partnerPct=sale.preDistribution!==0?round(sale.partnerAmount/sale.preDistribution*100):null;sale.retradePct=sale.preDistribution!==0?round(sale.retrade/sale.preDistribution*100):null;
      rowCredit=round(rowCredit+applied);
    });
    activeRowsForAccount(accountId).forEach(function(r){
      var events=recognised.filter(function(e){return String(e.adjustmentId)===String(r.id);});
      if(!inPeriod(r.date)&&!events.length)return;
      var earned=round(events.reduce(function(sum,e){return sum+e.amount;},0)),appl=used(r,period&&period.to),left=Math.max(0,round((Number(r.amount)||0)-appl));
      s.accountAdjustments.push({id:r.id,date:r.date,kind:r.kind,label:kindLabel(r.kind),reason:r.reason||kindLabel(r.kind),note:r.note||'',amount:round(r.amount),recognisedAmount:earned,recognitionEvents:events,partnerImpact:-earned,retradeImpact:earned,applied:appl,remaining:left,itemAllocations:Array.isArray(r.item_allocations)?r.item_allocations:[]});
    });
    s.totals.partnerEarned=round(s.totals.grossPartnerEarned-amount);
    s.totals.retradeEarned=round(s.totals.preDistribution-s.totals.partnerEarned);
    s.totals.partnerPct=s.totals.preDistribution!==0?round(s.totals.partnerEarned/s.totals.preDistribution*100):null;
    s.totals.retradePct=s.totals.preDistribution!==0?round(s.totals.retradeEarned/s.totals.preDistribution*100):null;
    var rowNet=round(s.sales.reduce(function(sum,r){return sum+(Number(r.retrade)||0);},0)+(s.adjustments||[]).filter(function(a){return !a.matched;}).reduce(function(sum,a){return sum+(Number(a.profitImpact)||0);},0)+amount-rowCredit);
    s.totals.reconciledItemNet=rowNet;s.totals.reconciliationDifference=round(s.totals.retradeEarned-rowNet);
    var remainingCredits=availableCredit(accountId,period&&period.to);
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
    if(s.accountAdjustments.length){y+=6;section('Account credits and reimbursements');s.accountAdjustments.forEach(function(a){var txt=a.date+' · '+a.reason+(a.itemAllocations&&a.itemAllocations.length?' · '+a.itemAllocations.length+' linked item'+(a.itemAllocations.length===1?'':'s'):'');row(txt,'−'+gbp(a.amount),true);if(a.note){ensure(6);doc.setFont('helvetica','italic');doc.setFontSize(7);colour(doc.setTextColor,muted);doc.text(doc.splitTextToSize(a.note,W-8),L+4,y);y+=6;}});}
    y+=6;section('Payment transactions');if(!s.payments.length)row('No partner payments in this period','');s.payments.forEach(function(p){var label=p.date+' · '+p.ref+' · '+p.status;row(label,gbp(p.amount),true);if(p.accountAdjustmentAmount){ensure(7);doc.setFontSize(7.2);doc.setFont('helvetica','normal');colour(doc.setTextColor,muted);doc.text('Gross liabilities '+gbp(p.grossAmount)+' · account credit −'+gbp(p.accountAdjustmentAmount)+' · cash paid '+gbp(p.amount),L+5,y);y+=7;}p.allocations.forEach(function(a){ensure(7);doc.setFontSize(7.1);colour(doc.setTextColor,navy);doc.text(doc.splitTextToSize('↳ '+a.item+(a.saleNo?' · '+a.saleNo:''),138),L+5,y);doc.text(gbp(a.amount),R-2,y,{align:'right'});y+=7;});});
    if(s.adjustments&&s.adjustments.length){y+=5;section('Returns & refunds — RETRADE impact');s.adjustments.forEach(function(a){row(a.date+' · '+a.item+' · '+a.saleNo,(a.profitImpact>0?'+':'')+gbp(a.profitImpact));});}
    if(Math.abs(s.totals.reconciliationDifference)>0.01){y+=4;row('RECONCILIATION WARNING',String(s.totals.reconciliationDifference),true);}var pages=doc.getNumberOfPages();for(var i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7);colour(doc.setTextColor,muted);doc.text('RETRADE · '+String(s.account.name||'Partner')+' · '+s.period.label,L,291);doc.text('Page '+i+' of '+pages,R,291,{align:'right'});}doc.save('RETRADE_'+String(s.account.name||'Partner').replace(/[^a-z0-9._-]+/gi,'_')+'_Statement_'+s.period.slug+'.pdf');
  }
  async function generatePdf(){try{await ensureLoaded(false);var s=currentAdjustedStatement();await ensurePdf();writePdf(s);try{toast('Partner statement PDF downloaded');}catch(_){}}catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}}}

  try{if(typeof _taxCashStockAndPartner==='function'&&!_taxCashStockAndPartner.__rtAccountAdjustments){
    var baseTax=_taxCashStockAndPartner;
    var wrappedTax=function(from,to){
      var out=baseTax.apply(this,arguments),seen=Object.create(null),userRows=loadedUser===uid()?rows.filter(active):[];
      userRows.forEach(function(r){applications(r).forEach(function(a){
        if(!a)return;
        var acct=account(r.account_id),tx=((acct&&acct.settlements)||[]).find(function(t){return t&&String(t.id)===String(a.settlement_id);});
        if(!tx||tx.paid!==true||!tx.date||tx.date<from||tx.date>to)return;
        // The base counts gross allocations. Remove only their funded credit,
        // once, on the actual paid transaction date (never a stale application).
        var gross=(tx.items||[]).reduce(function(sum,x){return sum+Math.max(0,Number(x&&x.amount)||0);},0);
        var cap=Math.max(0,round(gross-Math.max(0,Number(tx.partnerAmount)||0)));
        var key=String(r.account_id)+':'+String(tx.id),amt=Math.min(Math.max(0,Number(a.amount)||0),Math.max(0,cap-(seen[key]||0)));
        if(!amt)return;seen[key]=round((seen[key]||0)+amt);
        var typ=String(acct&&acct.accountType||'supplier').toLowerCase();
        if(typ==='supplier'){out.goodsPaid=round((Number(out.goodsPaid)||0)-amt);out.supplierStockPaid=round((Number(out.supplierStockPaid)||0)-amt);}else out.partnerPaid=round((Number(out.partnerPaid)||0)-amt);
      });});
      out.supplierRefundIncome=round((out.supplierRefundIncome||0)+cashEvents().filter(function(e){return e.direction==='in'&&(!from||e.date>=from)&&(!to||e.date<=to);}).reduce(function(n,e){return n+e.amount;},0));
      return out;
    };
    wrappedTax.__rtAccountAdjustments=true;_taxCashStockAndPartner=wrappedTax;
  }}catch(_){}


  try{if(typeof calcNetProfit==='function'&&!calcNetProfit.__rtAccountAdjustments){var baseNet=calcNetProfit;var wrappedNet=function(i){var v=baseNet.apply(this,arguments);if(v==null||!i||!i.accountId)return v;var credit=profitEvents().filter(function(e){return String(e.accountId)===String(i.accountId)&&String(e.itemId)===String(i.id);}).reduce(function(sum,e){return sum+e.amount;},0);return round((Number(v)||0)+credit);};wrappedNet.__rtAccountAdjustments=true;calcNetProfit=wrappedNet;}}catch(_){}

  window.__rtPartnerAdjustmentsLoaded=function(){return !sb()||!uid()||loadedUser===uid();};
  window.__rtPartnerAdjustmentsEnsureLoaded=ensureLoaded;
  window.__rtPartnerAdjustmentsProfitEvents=profitEvents;
  window.__rtPartnerAdjustmentsCashEvents=cashEvents;
  window.__rtPartnerAdjustmentsAvailableCredit=availableCredit;
  window.__rtPartnerAdjustmentsPlanPayment=planPayment;
  window.__rtPartnerAdjustmentsCommitPayment=commitPaymentPlan;
  window.__rtPartnerAdjustmentsRollbackPayment=rollbackPaymentPlan;
  window.__rtPartnerAdjustmentsRowsForAccount=rowsForAccount;
  window.__rtBuildPartnerStatementV3Adjusted=adjustedStatement;

  var baseOpen=window.openPartnerStatement;if(typeof baseOpen==='function'){window.openPartnerStatement=function(accountId){activeAccountId=accountId;window.__rtPartnerStatementActiveAccountId=accountId;var r=baseOpen.apply(this,arguments);ensureLoaded(false).catch(function(){});return r;};}
  window._partnerStatementPdf=generatePdf;
  window._partnerStatementExcel=generateExcel;
  window._partnerStatementCsv=generateCsv;

  // Reload credits with the user data, so navigation and imports cannot retain
  // stale P&L after a credit is created or voided on another device.
  if(typeof loadFromSupabase==='function'){var baseLoad=loadFromSupabase;loadFromSupabase=async function(){var result=await baseLoad.apply(this,arguments);await ensureLoaded(true).catch(function(){});return result;};}
  // One load; navigation and the data-load wrapper retry when needed.
  ensureLoaded(false).catch(function(){});
  console.info('[RETRADE] partner account adjustments v1.4.81 loaded');
})();
