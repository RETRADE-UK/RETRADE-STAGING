/* RETRADE partner statements accounting v3 — v1.4.80
 * Canonical fixed-cost / profit-share statement model plus transaction-level
 * settlement detail.
 *
 * v1.4.80 — statement reconciliation hardening:
 * - Return/refund events are now applied back to the matching sold-item row.
 * - Per-item RETRADE earnings therefore show true NET earnings after refunds,
 *   return postage, platform/promo fee credits, parts and other item costs.
 * - Returns that fall inside the statement period but whose sale is outside it
 *   remain explicit unmatched adjustments, so period totals still reconcile.
 * - PDF / CSV / Excel expose the net adjustment impact, not a misleading
 *   pre-return item profit.
 */
(function(){
  'use strict';
  if(window.__rtPartnerStatementAccountingV3Ready)return;
  window.__rtPartnerStatementAccountingV3Ready=true;
  window.__rtPartnerStatementAccountingV2Ready=true;

  var activeAccountId=null,pdfLibPromise=null,xlsxPromise=null;

  function n(v){v=Number(v);return isFinite(v)?v:0;}
  function money(v){return Math.round(n(v)*100)/100;}
  function gbp(v){return '£'+money(v).toFixed(2);}
  function signedGbp(v){v=money(v);return (v>0?'+':'')+gbp(v);}
  function pct(v){return v==null||!isFinite(v)?'—':money(v).toFixed(1)+'%';}
  function safeName(s){return String(s||'Partner').replace(/[^a-z0-9._-]+/gi,'_').replace(/^_+|_+$/g,'')||'Partner';}
  function account(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function accountModel(acct){try{if(typeof _rtArrangementForAccount==='function')return _rtArrangementForAccount(acct);}catch(_){}return String(acct&&acct.accountType||'supplier').toLowerCase()==='supplier'?'fixed_cost':'profit_share';}
  function itemModel(item,acct){try{if(typeof _rtArrangementForItem==='function')return _rtArrangementForItem(item,acct);}catch(_){}try{if(typeof _itemAccountType==='function')return String(_itemAccountType(item)||'').toLowerCase()==='supplier'?'fixed_cost':'profit_share';}catch(_){}return accountModel(acct);}
  function arrangementLabel(acct){try{if(typeof _rtArrangementLabel==='function')return _rtArrangementLabel(acct);}catch(_){}return accountModel(acct)==='fixed_cost'?'Fixed cost':'Profit share';}
  function agreedAmount(item,acct,b){try{if(typeof _rtPartnerAgreedAmount==='function'){var a=_rtPartnerAgreedAmount(item,acct);if(a!=null)return Math.max(0,money(a));}}catch(_){}if(item&&item.partnerAgreedAmount!=null)return Math.max(0,money(item.partnerAgreedAmount));if(item&&item.accountPaidAmount!=null)return Math.max(0,money(item.accountPaidAmount));if(b&&b.itemCost!=null)return Math.max(0,money(b.itemCost));return Math.max(0,money(item&&item.costPrice));}
  function iso(d){var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day;}
  function monthEnd(ym){var p=String(ym||'').split('-'),y=Number(p[0]),m=Number(p[1]);if(!y||!m)return null;return iso(new Date(y,m,0));}
  function currentMonth(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
  function visible(id){var el=document.getElementById(id);return !!(el&&el.style.display!=='none'&&getComputedStyle(el).display!=='none');}
  function resolvedPeriod(){
    var from='',to='',label='',slug='';
    if(visible('ps-fields-custom')){
      from=(document.getElementById('ps-from')||{}).value||'';
      to=(document.getElementById('ps-to')||{}).value||'';
      if(!from||!to)throw new Error('Choose both a start and end date.');
      if(from>to)throw new Error('The start date must be before the end date.');
      label=new Date(from+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+' – '+new Date(to+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
      slug=from+'_to_'+to;
    }else if(visible('ps-fields-year')){
      var y=Number((document.getElementById('ps-year')||{}).value)||new Date().getFullYear();
      from=y+'-01-01';to=y+'-12-31';label=String(y);slug=String(y);
    }else{
      var ym=(document.getElementById('ps-month')||{}).value||currentMonth();
      if(!/^\d{4}-\d{2}$/.test(ym))throw new Error('Choose a month.');
      from=ym+'-01';to=monthEnd(ym);
      var d=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1,1);
      label=d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});slug=ym;
    }
    return {from:from,to:to,label:label,slug:slug};
  }

  function itemById(itemId,month){
    try{if(month&&DB&&Array.isArray(DB[month])){var hit=DB[month].find(function(i){return i&&String(i.id)===String(itemId);});if(hit)return hit;}}catch(_){}
    try{var keys=typeof allDBKeys==='function'?allDBKeys():Object.keys(DB||{});for(var k=0;k<keys.length;k++){var rows=DB&&Array.isArray(DB[keys[k]])?DB[keys[k]]:[];var found=rows.find(function(i){return i&&String(i.id)===String(itemId);});if(found)return found;}}catch(_){}
    return null;
  }
  function allSalesForAccount(acct){
    var out=[];
    try{out=getSaleEventsInRange(null,null).filter(function(ev){return ev&&ev.item&&!ev.isReturnAdjustment&&String(ev.item.accountId)===String(acct.id);});}catch(_){}
    out.sort(function(a,b){return String(a.saleDate||'').localeCompare(String(b.saleDate||''));});
    return out;
  }
  function saleForAllocation(allSales,itemId,paymentDate,acct){
    var itemSales=allSales.filter(function(ev){return ev&&ev.item&&String(ev.item.id)===String(itemId);});
    var candidates=itemSales.filter(function(ev){return !paymentDate||!ev.saleDate||ev.saleDate<=paymentDate;});
    var pool=candidates.length?candidates:itemSales,ev=null;
    if(pool.length){var fixed=itemModel(pool[0].item,acct)==='fixed_cost';ev=fixed?pool[0]:pool[pool.length-1];}
    if(!ev)return null;
    var b={};try{b=_saleBreakdown(ev)||{};}catch(_){}
    return {date:ev.saleDate||'',saleNo:b.saleNo||('Sale '+(ev.sale||'')),salePrice:money(b.salePrice||0)};
  }
  function txRef(tx,index){var raw=String(tx&&tx.id||'').trim();if(raw)return raw.length>20?raw.slice(0,8)+'…'+raw.slice(-6):raw;var created=String(tx&&tx.createdAt||'').trim();if(created)return 'Payment '+created.replace('T',' ').slice(0,16);return 'Payment '+String(index+1);}
  function settlementForItem(acct,itemId,to){
    var paid=0,paidDate=null,legacy=false;
    (acct.settlements||[]).forEach(function(tx){if(!tx)return;(tx.items||[]).forEach(function(a){var id=a&&(a.id!=null?a.id:a.itemId);if(String(id)!==String(itemId))return;if(tx.paid===true&&tx.date&&tx.date<=to){paid+=Math.max(0,n(a.amount));if(!paidDate||tx.date>paidDate)paidDate=tx.date;}});});
    if(paid===0){try{var rec=_accountItems(acct.id).find(function(i){return String(i.id)===String(itemId);});if(rec&&rec.accountSettled===true)legacy=true;}catch(_){} }
    return {paid:money(paid),paidDate:paidDate,legacy:legacy};
  }

  function cycleNoFromSaleLabel(label,fallback){
    var m=String(label||'').match(/(\d+)/);if(m)return Math.max(1,Number(m[1])||1);
    return Math.max(1,Number(fallback)||1);
  }
  function saleKey(itemId,saleNo){return String(itemId)+'::'+Math.max(1,Number(saleNo)||1);}

  // This is intentionally the SAME cost movement used by the statement totals.
  // Do not substitute b.netProfit here: full-return _saleBreakdown includes COGS
  // restoration, while fixed-cost statements deliberately exclude supplier cost
  // from RETRADE operating costs. Keeping one contract prevents row/summary drift.
  function adjustmentMetrics(b,fixed){
    var refund=money(n(b.returnRefund)+n(b.returnPostage)+n(b.partialRefund));
    var feeMovement=money(n(b.bpf)+n(b.listingFee)+n(b.promoFee));
    var otherMovement=money(n(b.shipping)+n(b.packaging)+n(b.parts)+(fixed?0:n(b.itemCost)));
    var costDelta=money(refund+feeMovement+otherMovement);
    var feeCredits=money(Math.max(0,-n(b.bpf))+Math.max(0,-n(b.listingFee))+Math.max(0,-n(b.promoFee)));
    return {refundAmount:refund,feeCredits:feeCredits,costDelta:costDelta,profitImpact:money(-costDelta)};
  }

  function build(accountId,period){
    var acct=account(accountId);if(!acct)throw new Error('Partner account not found.');
    if(typeof getSaleEventsInRange!=='function'||typeof _saleBreakdown!=='function')throw new Error('Reporting engine is not available yet.');
    var events=getSaleEventsInRange(period.from,period.to).filter(function(ev){return ev&&ev.item&&String(ev.item.accountId)===String(acct.id);});
    events.sort(function(a,b){return String(a.saleDate||'').localeCompare(String(b.saleDate||''));});
    var allSales=allSalesForAccount(acct);
    var t={goods:0,postageIncome:0,platformFees:0,advertising:0,delivery:0,packaging:0,parts:0,returns:0,otherItemCost:0,operatingCosts:0,preDistribution:0,partnerEarned:0,retradeEarned:0};
    var sales=[],adjustments=[],models=[],salesByKey={};

    events.filter(function(ev){return !ev.isReturnAdjustment;}).forEach(function(ev){
      var b=_saleBreakdown(ev),rowModel=itemModel(ev.item,acct),fixed=rowModel==='fixed_cost';models.push(rowModel);
      var revenue=money(n(b.salePrice)+n(b.postage));
      var saleCycle=cycleNoFromSaleLabel(b.saleNo,ev.sale);
      // Fixed-cost suppliers earn their agreed amount once per item. A customer
      // return does not reverse that supplier payout, and a later resale must
      // never create a second supplier payout. Profit-share rows already rely
      // on the canonical b.partnerSplit sale-cycle allocation.
      var partnerAmount=fixed?(saleCycle===1?agreedAmount(ev.item,acct,b):0):Math.max(0,money(b.partnerSplit));
      var operatingCosts=fixed?money(n(b.totalCosts)-n(b.partnerSplit)-n(b.itemCost)):money(n(b.totalCosts)-n(b.partnerSplit));
      var preDistribution=money(revenue-operatingCosts),retrade=money(preDistribution-partnerAmount);
      var partnerPct=preDistribution!==0?partnerAmount/preDistribution*100:null,retradePct=preDistribution!==0?retrade/preDistribution*100:null;
      var sett=settlementForItem(acct,ev.item.id,period.to),status='—';
      if(partnerAmount>0)status=(sett.paid>=partnerAmount-0.009||sett.legacy)?'Paid':'To pay';
      else if(fixed&&saleCycle>1)status='No new payout';
      else if(!fixed&&ev.item.accountSplitPercent==null&&acct.defaultSplitPercent==null)status='Split not set';
      t.goods+=n(b.salePrice);t.postageIncome+=n(b.postage);t.platformFees+=n(b.bpf)+n(b.listingFee);t.advertising+=n(b.promoFee);t.delivery+=n(b.shipping);t.packaging+=n(b.packaging);t.parts+=n(b.parts);if(!fixed)t.otherItemCost+=n(b.itemCost);t.partnerEarned+=partnerAmount;
      var row={date:ev.saleDate||'',item:ev.item.item||'Untitled',saleNo:b.saleNo||('Sale '+ev.sale),saleCycle:saleCycle,arrangement:rowModel,revenue:revenue,baseOperatingCosts:operatingCosts,operatingCosts:operatingCosts,basePreDistribution:preDistribution,preDistribution:preDistribution,partnerAmount:partnerAmount,partnerPct:partnerPct,baseRetrade:retrade,retrade:retrade,retradePct:retradePct,adjustmentImpact:0,adjustmentAmount:0,feeCredits:0,status:status,paidDate:sett.paidDate||'',itemId:ev.item.id};
      sales.push(row);salesByKey[saleKey(ev.item.id,saleCycle)]=row;
    });

    events.filter(function(ev){return !!ev.isReturnAdjustment;}).forEach(function(ev){
      var b=_saleBreakdown(ev),rowModel=itemModel(ev.item,acct),fixed=rowModel==='fixed_cost';models.push(rowModel);
      t.platformFees+=n(b.bpf)+n(b.listingFee);t.advertising+=n(b.promoFee);t.delivery+=n(b.shipping);t.packaging+=n(b.packaging);t.parts+=n(b.parts);
      t.returns+=n(b.returnRefund)+n(b.returnPostage)+n(b.partialRefund);if(!fixed)t.otherItemCost+=n(b.itemCost);
      var saleCycle=Math.max(1,Number(ev.returnEntry&&ev.returnEntry.saleNo)||cycleNoFromSaleLabel(b.saleNo,1));
      var metrics=adjustmentMetrics(b,fixed),match=salesByKey[saleKey(ev.item.id,saleCycle)]||null;
      if(match){
        match.adjustmentImpact=money(match.adjustmentImpact+metrics.profitImpact);
        match.adjustmentAmount=money(match.adjustmentAmount+metrics.refundAmount);
        match.feeCredits=money(match.feeCredits+metrics.feeCredits);
      }
      adjustments.push({date:ev.saleDate||'',item:ev.item.item||'Untitled',type:'Return / refund',saleNo:'Sale '+saleCycle,amount:metrics.refundAmount,feeCredits:metrics.feeCredits,profitImpact:metrics.profitImpact,costDelta:metrics.costDelta,arrangement:rowModel,itemId:ev.item.id,matched:!!match});
    });

    // Finalise each sold row only after every matching return/refund event has
    // been applied. This is the critical v1.4.80 reconciliation step.
    sales.forEach(function(r){
      r.operatingCosts=money(r.baseOperatingCosts-r.adjustmentImpact);
      r.preDistribution=money(r.revenue-r.operatingCosts);
      r.retrade=money(r.preDistribution-r.partnerAmount);
      r.partnerPct=r.preDistribution!==0?r.partnerAmount/r.preDistribution*100:null;
      r.retradePct=r.preDistribution!==0?r.retrade/r.preDistribution*100:null;
    });

    Object.keys(t).forEach(function(k){t[k]=money(t[k]);});
    t.revenue=money(t.goods+t.postageIncome);
    t.operatingCosts=money(t.platformFees+t.advertising+t.delivery+t.packaging+t.parts+t.returns+t.otherItemCost);
    t.preDistribution=money(t.revenue-t.operatingCosts);
    t.partnerEarned=money(t.partnerEarned);
    t.retradeEarned=money(t.preDistribution-t.partnerEarned);
    t.partnerPct=t.preDistribution!==0?money(t.partnerEarned/t.preDistribution*100):null;
    t.retradePct=t.preDistribution!==0?money(t.retradeEarned/t.preDistribution*100):null;

    var rowNet=money(sales.reduce(function(sum,r){return sum+n(r.retrade);},0)+adjustments.filter(function(a){return !a.matched;}).reduce(function(sum,a){return sum+n(a.profitImpact);},0));
    t.reconciledItemNet=rowNet;
    t.reconciliationDifference=money(t.retradeEarned-rowNet);
    if(Math.abs(t.reconciliationDifference)>0.01){console.error('[RETRADE] partner statement reconciliation mismatch',{account:acct.id,period:period,difference:t.reconciliationDifference,summary:t.retradeEarned,itemNet:rowNet});}

    var unique=Array.from(new Set(models)),mode=unique.length>1?'mixed':(unique[0]||accountModel(acct));
    var payments=[],paidInPeriod=0;
    (acct.settlements||[]).slice().sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));}).forEach(function(tx,idx){
      if(!tx||!tx.date||tx.date<period.from||tx.date>period.to)return;
      var amount=money(tx.partnerAmount||0);if(tx.paid===true)paidInPeriod+=amount;
      var allocations=(tx.items||[]).map(function(a){var itemId=a&&(a.id!=null?a.id:a.itemId),item=itemById(itemId,a&&a.month),sale=saleForAllocation(allSales,itemId,tx.date,acct);return {itemId:itemId,item:(a&&a.name)||(item&&item.item)||'Unknown item',amount:money(a&&a.amount),saleNo:sale&&sale.saleNo||'',saleDate:sale&&sale.date||'',salePrice:sale&&sale.salePrice||0};});
      payments.push({id:tx.id||'',ref:txRef(tx,idx),date:tx.date,amount:amount,status:tx.paid===true?'Paid':'Unpaid',note:tx.note||'',allocations:allocations});
    });
    var due=0;
    sales.forEach(function(r){if(r.partnerAmount<=0)return;var sett=settlementForItem(acct,r.itemId,period.to),paidAgainst=sett.legacy?r.partnerAmount:Math.min(r.partnerAmount,sett.paid);due+=Math.max(0,r.partnerAmount-paidAgainst);});
    return {account:acct,period:period,mode:mode,sales:sales,adjustments:adjustments,payments:payments,totals:t,paidInPeriod:money(paidInPeriod),due:money(due),arrangementLabel:arrangementLabel(acct)};
  }

  function isFixed(s){return s.mode==='fixed_cost';}
  function isShare(s){return s.mode==='profit_share';}
  function partnerNoun(s){return isFixed(s)?'Fixed payout':'Partner share';}
  function preLabel(s){return isFixed(s)?'PROFIT BEFORE FIXED PAYOUT':isShare(s)?'PROFIT TO SPLIT':'MARGIN BEFORE PARTNER PAYOUTS';}

  function summaryRows(s){
    var t=s.totals,rows=[['RETRADE · PARTNER STATEMENT'],['Partner',s.account.name||'Partner'],['Period',s.period.label],['Arrangement',s.mode==='mixed'?'Mixed item arrangements':s.arrangementLabel],['Items sold',s.sales.length],[],['REVENUE','Amount (£)'],['Sales made',t.goods],['Postage charged to customers',t.postageIncome],['TOTAL REVENUE',t.revenue],[],['OPERATING COSTS — BEFORE PARTNER/SUPPLIER PAYOUT','Amount (£)'],['Selling & listing fees',t.platformFees],['Advertising',t.advertising],['Delivery postage',t.delivery],['Packaging',t.packaging]];
    if(Math.abs(t.parts)>0.009)rows.push(['Parts & repairs',t.parts]);
    if(Math.abs(t.returns)>0.009)rows.push(['Refunds & return postage',t.returns]);
    if(Math.abs(t.otherItemCost)>0.009)rows.push(['Other item / stock cost',t.otherItemCost]);
    rows.push(['TOTAL OPERATING COSTS',t.operatingCosts],[],[preLabel(s),t.preDistribution],[],['WHO EARNED WHAT','Amount (£)']);
    rows.push([partnerNoun(s)+' · '+pct(t.partnerPct)+' of available margin',t.partnerEarned]);
    rows.push(['RETRADE earned · '+pct(t.retradePct)+' of available margin',t.retradeEarned]);
    rows.push([],['PAYMENTS','Amount (£)'],['Paid in this period',s.paidInPeriod],['Still owed on sales in this statement',s.due]);
    rows.push([],['Simple summary',gbp(t.preDistribution)+' before partner/supplier payout · Partner/supplier '+gbp(t.partnerEarned)+' ('+pct(t.partnerPct)+') · RETRADE '+gbp(t.retradeEarned)+' ('+pct(t.retradePct)+')']);
    rows.push(['Note','RETRADE item earnings are NET figures. Matching returns/refunds, return postage, fee credits, parts and item costs are applied back to the affected sale so item rows reconcile to the statement total.']);
    return rows;
  }

  function soldRows(s){
    var rows=[['Date','Item','Sale','Arrangement','Revenue (£)','Base operating costs (£)','Return / adjustment impact (£)','Net operating costs (£)','Margin before payout (£)','Partner / supplier earned (£)','Partner / supplier %','RETRADE net earned (£)','RETRADE %','Payment status','Paid date']];
    s.sales.forEach(function(r){rows.push([r.date,r.item,r.saleNo,r.arrangement==='fixed_cost'?'Fixed cost':'Profit share',r.revenue,r.baseOperatingCosts,r.adjustmentImpact,r.operatingCosts,r.preDistribution,r.partnerAmount,r.partnerPct==null?'':money(r.partnerPct),r.retrade,r.retradePct==null?'':money(r.retradePct),r.status,r.paidDate]);});
    return rows;
  }

  function paymentRows(s){
    var rows=[['Payment date','Transaction','Item / sale','Sale date','Allocated / refund (£)','Payment total (£)','Status / net impact']];
    s.payments.forEach(function(p){
      if(!p.allocations.length){rows.push([p.date,p.ref,'No item allocation recorded','',0,p.amount,p.status+(p.note?' · '+p.note:'')]);return;}
      p.allocations.forEach(function(a,i){rows.push([i===0?p.date:'',i===0?p.ref:'',a.item+(a.saleNo?' · '+a.saleNo:''),a.saleDate,a.amount,i===0?p.amount:'',i===0?p.status+(p.note?' · '+p.note:''):'']);});
    });
    s.adjustments.forEach(function(a){rows.push([a.date,'Adjustment',a.item+' · '+a.saleNo,'',a.amount,'','RETRADE impact '+signedGbp(a.profitImpact)+(a.feeCredits?' · fee credits '+gbp(a.feeCredits):'')+(a.matched?' · applied to sold item':' · sale outside period')]);});
    if(rows.length===1)rows.push(['','No payments or adjustments in this period','','','','','']);
    return rows;
  }

  function csvCell(value){var s=String(value==null?'':value);if(/^[=+\-@]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function rowsCsv(rows){return rows.map(function(r){return r.map(csvCell).join(',');}).join('\n');}
  function downloadBlob(content,type,name){var blob=new Blob([content],{type:type}),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},0);}
  function currentStatement(){if(!activeAccountId)throw new Error('Partner account is not selected.');return build(activeAccountId,resolvedPeriod());}

  function generateCsv(){
    try{var s=currentStatement(),rows=[];summaryRows(s).forEach(function(r){rows.push(r);});rows.push([],['SOLD ITEMS']);soldRows(s).forEach(function(r){rows.push(r);});rows.push([],['PAYMENT TRANSACTIONS & ADJUSTMENTS']);paymentRows(s).forEach(function(r){rows.push(r);});downloadBlob('\uFEFF'+rowsCsv(rows),'text/csv;charset=utf-8','RETRADE_'+safeName(s.account.name)+'_Statement_'+s.period.slug+'.csv');try{toast('Partner statement CSV downloaded');}catch(_){} }
    catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}}
  }
  function ensureXlsx(){
    if(window.XLSX)return Promise.resolve();if(xlsxPromise)return xlsxPromise;
    xlsxPromise=new Promise(function(resolve,reject){var old=document.getElementById('rt-xlsx-lib');if(old){old.addEventListener('load',function(){window.XLSX?resolve():reject(new Error('Excel library did not initialise'));},{once:true});old.addEventListener('error',reject,{once:true});return;}var script=document.createElement('script');script.id='rt-xlsx-lib';script.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';script.async=true;script.crossOrigin='anonymous';script.onload=function(){window.XLSX?resolve():reject(new Error('Excel library did not initialise'));};script.onerror=reject;document.head.appendChild(script);}).catch(function(err){xlsxPromise=null;throw err;});
    return xlsxPromise;
  }
  function generateExcel(){
    var s;try{s=currentStatement();}catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}return;}
    ensureXlsx().then(function(){var wb=XLSX.utils.book_new(),sr=summaryRows(s),ir=soldRows(s),pr=paymentRows(s),ws1=XLSX.utils.aoa_to_sheet(sr),ws2=XLSX.utils.aoa_to_sheet(ir),ws3=XLSX.utils.aoa_to_sheet(pr);ws1['!cols']=[{wch:54},{wch:34}];ws2['!cols']=[{wch:12},{wch:38},{wch:12},{wch:15},{wch:14},{wch:20},{wch:23},{wch:20},{wch:20},{wch:24},{wch:20},{wch:20},{wch:14},{wch:15},{wch:12}];ws3['!cols']=[{wch:13},{wch:22},{wch:46},{wch:13},{wch:20},{wch:17},{wch:48}];try{if(typeof _styleReportSheet==='function'){_styleReportSheet(ws1,sr,{moneyCols:[1],freezeRow:0});_styleReportSheet(ws2,ir,{headerRows:[0],moneyCols:[4,5,6,7,8,9,11],freezeRow:1});_styleReportSheet(ws3,pr,{headerRows:[0],moneyCols:[4,5],freezeRow:1});}}catch(_){}XLSX.utils.book_append_sheet(wb,ws1,'Statement');XLSX.utils.book_append_sheet(wb,ws2,'Sold Items');XLSX.utils.book_append_sheet(wb,ws3,'Payment Transactions');XLSX.writeFile(wb,'RETRADE_'+safeName(s.account.name)+'_Statement_'+s.period.slug+'.xlsx');try{toast('Partner statement Excel downloaded');}catch(_){} }).catch(function(){try{toast('Could not load the Excel exporter','error');}catch(_){}});
  }

  function ensurePdf(){
    if(window.jspdf&&window.jspdf.jsPDF)return Promise.resolve();if(pdfLibPromise)return pdfLibPromise;
    pdfLibPromise=new Promise(function(resolve,reject){var old=document.getElementById('rt-jspdf-lib');if(old){old.addEventListener('load',function(){window.jspdf&&window.jspdf.jsPDF?resolve():reject(new Error('PDF library did not initialise'));},{once:true});old.addEventListener('error',reject,{once:true});return;}var script=document.createElement('script');script.id='rt-jspdf-lib';script.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';script.async=true;script.crossOrigin='anonymous';script.onload=function(){window.jspdf&&window.jspdf.jsPDF?resolve():reject(new Error('PDF library did not initialise'));};script.onerror=reject;document.head.appendChild(script);}).catch(function(err){pdfLibPromise=null;throw err;});
    return pdfLibPromise;
  }

  function writePdf(s){
    var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'}),navy=[12,20,36],gold=[247,183,55],muted=[101,110,126],line=[220,224,231],pale=[247,249,252],L=14,R=196,W=182,y=0;
    function colour(fn,c){fn.apply(doc,c);}
    function brand(){colour(doc.setFillColor,navy);doc.rect(0,0,210,24,'F');doc.setFont('helvetica','bold');doc.setFontSize(18);colour(doc.setTextColor,gold);doc.text('RETRADE',L,15);doc.setFontSize(9);doc.setTextColor(255,255,255);doc.text('PARTNER STATEMENT',R,14,{align:'right'});}
    function page(){doc.addPage();brand();y=32;}
    function ensure(h){if(y+h>280)page();}
    function section(label){ensure(10);doc.setFont('helvetica','bold');doc.setFontSize(10);colour(doc.setTextColor,navy);doc.text(label,L,y);y+=5;}
    function rule(){colour(doc.setDrawColor,line);doc.line(L,y,R,y);}
    function row(label,value,bold){ensure(8);if(bold){colour(doc.setFillColor,pale);doc.rect(L,y-4,W,7,'F');}doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(8.5);colour(doc.setTextColor,navy);doc.text(label,L+2,y);doc.text(value,R-2,y,{align:'right'});y+=7;rule();}

    brand();y=36;
    doc.setFont('helvetica','bold');doc.setFontSize(19);colour(doc.setTextColor,navy);doc.text(String(s.account.name||'Partner'),L,y);y+=7;
    doc.setFont('helvetica','normal');doc.setFontSize(9);colour(doc.setTextColor,muted);doc.text(s.period.label+'  ·  '+(s.mode==='mixed'?'Mixed arrangements':s.arrangementLabel),L,y);y+=10;
    section('Account summary');row('Revenue',gbp(s.totals.revenue));row(preLabel(s).replace(/_/g,' '),gbp(s.totals.preDistribution));row(partnerNoun(s),gbp(s.totals.partnerEarned));row('RETRADE earned',gbp(s.totals.retradeEarned));row('Paid in this period',gbp(s.paidInPeriod));row('Still owed',gbp(s.due),true);y+=5;

    section('Sold items — RETRADE figures are net after matching adjustments');
    s.sales.forEach(function(r){
      var label=String(r.item||'Untitled')+(r.saleNo?' · '+r.saleNo:''),lines=doc.splitTextToSize(label,99),extra=Math.abs(r.adjustmentImpact)>0.009,h=Math.max(extra?15:11,lines.length*3.5+(extra?10:6));ensure(h);
      doc.setFontSize(7.3);doc.setFont('helvetica','normal');colour(doc.setTextColor,muted);doc.text(String(r.date||''),L,y+3);
      doc.setFont('helvetica','bold');colour(doc.setTextColor,navy);doc.text(lines,L+23,y+3);
      doc.setFont('helvetica','normal');doc.text('Partner '+gbp(r.partnerAmount),R-29,y+3,{align:'right'});doc.setFont('helvetica','bold');doc.text('RETRADE '+gbp(r.retrade),R,y+3,{align:'right'});
      if(extra){doc.setFont('helvetica','normal');doc.setFontSize(6.8);colour(doc.setTextColor,muted);var detail='Return/refund '+gbp(r.adjustmentAmount)+(r.feeCredits?' · fee credits '+gbp(r.feeCredits):'')+' · net impact '+signedGbp(r.adjustmentImpact);doc.text(doc.splitTextToSize(detail,98),L+23,y+8);}
      y+=h;rule();
    });
    if(!s.sales.length)row('No sold items in this period','');

    y+=6;section('Payment transactions');
    if(!s.payments.length)row('No partner payments in this period','');
    s.payments.forEach(function(p){
      ensure(11);row(p.date+' · '+p.ref+' · '+p.status,gbp(p.amount),true);
      if(p.note){ensure(6);doc.setFont('helvetica','italic');doc.setFontSize(7.2);colour(doc.setTextColor,muted);doc.text(doc.splitTextToSize(p.note,W-8),L+4,y);y+=6;}
      if(!p.allocations.length){ensure(7);doc.setFont('helvetica','normal');doc.setFontSize(7.2);colour(doc.setTextColor,muted);doc.text('No item allocation recorded for this transaction.',L+5,y);y+=6;}
      p.allocations.forEach(function(a){var detail='↳ '+a.item+(a.saleNo?' · '+a.saleNo:'')+(a.saleDate?' · sold '+a.saleDate:'');var lines=doc.splitTextToSize(detail,138),h=Math.max(7,lines.length*3.4+3);ensure(h);doc.setFont('helvetica','normal');doc.setFontSize(7.2);colour(doc.setTextColor,navy);doc.text(lines,L+5,y);doc.text(gbp(a.amount),R-2,y,{align:'right'});y+=h;});y+=2;
    });

    if(s.adjustments.length){
      y+=4;section('Returns & adjustments — net RETRADE impact');
      s.adjustments.forEach(function(a){var label=a.date+' · '+a.item+' · '+a.saleNo+' · refund '+gbp(a.amount)+(a.feeCredits?' · credits '+gbp(a.feeCredits):'');row(label,signedGbp(a.profitImpact));});
    }
    if(Math.abs(s.totals.reconciliationDifference)>0.01){y+=4;row('RECONCILIATION WARNING — statement rows differ from summary',signedGbp(s.totals.reconciliationDifference),true);}

    var pages=doc.getNumberOfPages();
    for(var i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7);colour(doc.setTextColor,muted);doc.text('RETRADE · '+String(s.account.name||'Partner')+' · '+s.period.label,L,291);doc.text('Page '+i+' of '+pages,R,291,{align:'right'});}
    doc.save('RETRADE_'+safeName(s.account.name)+'_Statement_'+s.period.slug+'.pdf');try{toast('Partner statement PDF downloaded');}catch(_){}
  }

  function generatePdf(){var s;try{s=currentStatement();}catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}return;}ensurePdf().then(function(){writePdf(s);}).catch(function(){try{toast('Could not load the PDF exporter','error');}catch(_){}});}
  function enhancePanel(){var excel=document.querySelector('button[onclick="_partnerStatementExcel()"]'),csv=document.querySelector('button[onclick="_partnerStatementCsv()"]'),host=excel&&excel.parentElement;if(host&&csv&&csv.parentElement===host){host.style.gridTemplateColumns='repeat(3,minmax(0,1fr))';host.innerHTML='<button type="button" class="btn btn-primary" style="width:100%;" onclick="_partnerStatementPdf()">Generate PDF</button><button type="button" class="btn btn-secondary" style="width:100%;" onclick="_partnerStatementExcel()">Generate Excel</button><button type="button" class="btn btn-secondary" style="width:100%;" onclick="_partnerStatementCsv()">Generate CSV</button>';}var note=host&&host.previousElementSibling;if(note&&/easy to read|statement:|transaction-linked/i.test(note.textContent||''))note.innerHTML='<strong style="color:var(--text);">Reconciled statement:</strong> RETRADE item earnings are net of matching returns/refunds and credits, so sold-item figures reconcile to the account summary.';}
  var originalOpen=window.openPartnerStatement;
  if(typeof originalOpen==='function'){window.openPartnerStatement=function(accountId){activeAccountId=accountId;window.__rtPartnerStatementActiveAccountId=accountId;var result=originalOpen.apply(this,arguments);setTimeout(enhancePanel,0);return result;};}

  // Diagnostics hook: read-only build output for reconciliation testing.
  window.__rtBuildPartnerStatementV3=build;
  window._partnerStatementPdf=generatePdf;
  window._partnerStatementExcel=generateExcel;
  window._partnerStatementCsv=generateCsv;
  console.info('[RETRADE] partner statement accounting v3.80 reconciled item earnings loaded');
})();