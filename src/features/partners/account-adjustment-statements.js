/* RETRADE adjustment-aware partner statement exporters — v1.5.00 */
(function(){
  'use strict';
  if(window.__rtPartnerAdjustmentStatementExportersReady)return;
  window.__rtPartnerAdjustmentStatementExportersReady=true;

  var pdfPromise=null,xlsxPromise=null;
  function n(v){v=Number(v);return isFinite(v)?v:0;}
  function round(v){return Math.round(n(v)*100)/100;}
  function gbp(v){return '£'+round(v).toFixed(2);}
  function safe(s){return String(s||'Partner').replace(/[^a-z0-9._-]+/gi,'_').replace(/^_+|_+$/g,'')||'Partner';}
  function visible(id){var el=document.getElementById(id);return !!(el&&el.style.display!=='none'&&getComputedStyle(el).display!=='none');}
  function monthEnd(ym){var p=String(ym||'').split('-'),y=Number(p[0]),m=Number(p[1]);if(!y||!m)return null;return new Date(y,m,0).toISOString().slice(0,10);}
  function period(){
    var from='',to='',label='',slug='';
    if(visible('ps-fields-custom')){
      from=(document.getElementById('ps-from')||{}).value||'';to=(document.getElementById('ps-to')||{}).value||'';
      if(!from||!to||from>to)throw new Error('Choose a valid statement date range.');label=from+' – '+to;slug=from+'_to_'+to;
    }else if(visible('ps-fields-year')){
      var y=Number((document.getElementById('ps-year')||{}).value)||new Date().getFullYear();from=y+'-01-01';to=y+'-12-31';label=String(y);slug=String(y);
    }else{
      var ym=(document.getElementById('ps-month')||{}).value||new Date().toISOString().slice(0,7);from=ym+'-01';to=monthEnd(ym);label=new Date(from+'T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});slug=ym;
    }
    return {from:from,to:to,label:label,slug:slug};
  }
  async function statement(){
    if(typeof window.__rtPartnerAdjustmentsEnsureLoaded==='function')await window.__rtPartnerAdjustmentsEnsureLoaded(false);
    var id=window.__rtPartnerStatementActiveAccountId;if(!id)throw new Error('Partner account is not selected.');
    if(typeof window.__rtBuildPartnerStatementV3Adjusted!=='function')throw new Error('Adjustment statement engine is not ready.');
    return window.__rtBuildPartnerStatementV3Adjusted(id,period());
  }
  function tables(s){
    var t=s.totals;
    var summary=[['RETRADE · PARTNER STATEMENT'],['Partner',s.account.name||'Partner'],['Period',s.period.label],[],['Revenue',t.revenue],['Margin before payout',t.preDistribution],['Partner total before adjustments',t.grossPartnerEarned],['Credits / adjustments',t.partnerAdjustment],['Partner total after adjustments',t.partnerEarned],['RETRADE earned',t.retradeEarned],['Paid in this period',s.paidInPeriod],['Still owed',s.due]];
    var sold=[['Date','Item','Sale','Revenue (£)','Operating costs (£)','Margin (£)','Partner before adjustments (£)','Credits / adjustments (£)','Partner after adjustments (£)','RETRADE (£)','Payment status']];
    s.sales.forEach(function(r){sold.push([r.date,r.item,r.saleNo,r.revenue,r.operatingCosts,r.preDistribution,round(r.partnerAmount-(r.accountAdjustment||0)),r.accountAdjustment||0,r.partnerAmount,r.retrade,r.status]);});
    var tx=[['Date','Type','Reference / reason','Total (£)','Credit / adjustment (£)','Amount paid / RETRADE impact (£)','Status']];
    (s.payments||[]).forEach(function(p){tx.push([p.date,'Payment',p.ref+(p.note?' · '+p.note:''),p.grossAmount||p.amount,p.accountAdjustmentAmount?round(-p.accountAdjustmentAmount):0,p.amount,p.status]);});
    (s.accountAdjustments||[]).forEach(function(a){tx.push([a.date,'Credit / adjustment',a.reason,a.amount,round(-a.amount),a.retradeImpact,'Partner amount reduced'+(a.applied?' · '+gbp(a.applied)+' applied':'')]);});
    (s.adjustments||[]).forEach(function(a){tx.push([a.date,'Return / refund',a.item+' · '+a.saleNo,a.amount,0,a.profitImpact,'RETRADE impact']);});
    return {summary:summary,sold:sold,transactions:tx};
  }
  function csvCell(v){var s=String(v==null?'':v);if(/^[=+\-@]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function csvRows(rows){return rows.map(function(r){return r.map(csvCell).join(',');}).join('\n');}
  function download(content,type,name){var blob=new Blob([content],{type:type}),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},0);}
  function ensureXlsx(){
    if(window.XLSX)return Promise.resolve();if(xlsxPromise)return xlsxPromise;
    xlsxPromise=new Promise(function(resolve,reject){var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.async=true;s.crossOrigin='anonymous';s.onload=function(){window.XLSX?resolve():reject(new Error('Excel library did not initialise'));};s.onerror=reject;document.head.appendChild(s);}).catch(function(e){xlsxPromise=null;throw e;});return xlsxPromise;
  }
  function ensurePdf(){
    if(window.jspdf&&window.jspdf.jsPDF)return Promise.resolve();if(pdfPromise)return pdfPromise;
    if(window.RETRADE_DOCUMENTS&&typeof window.RETRADE_DOCUMENTS.ensurePdf==='function')return window.RETRADE_DOCUMENTS.ensurePdf();
    pdfPromise=new Promise(function(resolve,reject){var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.async=true;s.crossOrigin='anonymous';s.onload=function(){window.jspdf&&window.jspdf.jsPDF?resolve():reject(new Error('PDF library did not initialise'));};s.onerror=reject;document.head.appendChild(s);}).catch(function(e){pdfPromise=null;throw e;});return pdfPromise;
  }

  async function csv(){
    try{var s=await statement(),tab=tables(s),out=[];tab.summary.forEach(function(r){out.push(r);});out.push([],['SOLD ITEMS']);tab.sold.forEach(function(r){out.push(r);});out.push([],['PAYMENTS, CREDITS / ADJUSTMENTS & RETURNS']);tab.transactions.forEach(function(r){out.push(r);});download('\uFEFF'+csvRows(out),'text/csv;charset=utf-8','RETRADE_'+safe(s.account.name)+'_Statement_'+s.period.slug+'.csv');try{toast('Partner statement CSV downloaded');}catch(_){}}
    catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}}
  }
  async function excel(){
    try{
      var s=await statement(),tab=tables(s);await ensureXlsx();
      var wb=XLSX.utils.book_new(),ws1=XLSX.utils.aoa_to_sheet(tab.summary),ws2=XLSX.utils.aoa_to_sheet(tab.sold),ws3=XLSX.utils.aoa_to_sheet(tab.transactions);
      ws1['!cols']=[{wch:44},{wch:26}];ws2['!cols']=[{wch:12},{wch:38},{wch:11},{wch:14},{wch:16},{wch:14},{wch:22},{wch:18},{wch:22},{wch:18},{wch:15}];ws3['!cols']=[{wch:12},{wch:22},{wch:52},{wch:14},{wch:16},{wch:24},{wch:36}];
      XLSX.utils.book_append_sheet(wb,ws1,'Statement');XLSX.utils.book_append_sheet(wb,ws2,'Sold Items');XLSX.utils.book_append_sheet(wb,ws3,'Transactions');XLSX.writeFile(wb,'RETRADE_'+safe(s.account.name)+'_Statement_'+s.period.slug+'.xlsx');try{toast('Partner statement Excel downloaded');}catch(_){}
    }catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}}
  }

  function writePdf(s,logo){
    var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'}),theme=window.RETRADE_DOCUMENTS||null;
    var navy=theme&&theme.colors?theme.colors.navy:[12,20,36],gold=theme&&theme.colors?theme.colors.gold:[247,183,55],brandLight=theme&&theme.colors&&theme.colors.brandLight?theme.colors.brandLight:[226,231,238],muted=theme&&theme.colors?theme.colors.muted:[110,118,130],line=theme&&theme.colors?theme.colors.line:[224,228,233],pale=[247,249,252],green=theme&&theme.colors?theme.colors.green:[46,125,50],red=theme&&theme.colors?theme.colors.red:[178,55,55],L=14,R=196,W=182,y=0;
    function colour(fn,c){fn.apply(doc,c);}
    function fitSingle(value,maxWidth){if(theme&&typeof theme.fitSingle==='function')return theme.fitSingle(doc,value,maxWidth);var v=String(value==null?'':value).replace(/\s+/g,' ').trim();if(doc.getTextWidth(v)<=maxWidth)return v;while(v.length&&doc.getTextWidth(v+'...')>maxWidth)v=v.slice(0,-1).replace(/\s+$/,'');return v+'...';}
    function clampLines(value,maxWidth,maxLines){if(theme&&typeof theme.clampLines==='function')return theme.clampLines(doc,value,maxWidth,maxLines);var v=String(value==null?'':value).replace(/\s+/g,' ').trim(),lines=doc.splitTextToSize(v,maxWidth);if(lines.length<=maxLines)return lines;lines=lines.slice(0,maxLines);var last=lines[maxLines-1];while(last.length&&doc.getTextWidth(last+'...')>maxWidth)last=last.slice(0,-1).replace(/\s+$/,'');lines[maxLines-1]=last+'...';return lines;}
    function brand(){
      if(theme&&typeof theme.brandBanner==='function'){theme.brandBanner(doc,logo);return;}
      colour(doc.setFillColor,navy);doc.roundedRect(L,12,W,25,1.6,1.6,'F');
      doc.setFont('helvetica','bold');doc.setFontSize(16.5);colour(doc.setTextColor,brandLight);doc.text('RE',20,24.8);var rw=doc.getTextWidth('RE');colour(doc.setTextColor,gold);doc.text('TRADE',20+rw+.6,24.8);
      doc.setFont('helvetica','normal');doc.setFontSize(5.6);colour(doc.setTextColor,brandLight);doc.text("THE RESELLER'S BACK POCKET",20,31.2);
      doc.setFont('helvetica','bold');doc.setFontSize(6.3);doc.text('SALES · PAYMENTS · STATEMENTS',190,25.2,{align:'right'});
    }
    function page(){doc.addPage();brand();doc.setFont('helvetica','bold');doc.setFontSize(9);colour(doc.setTextColor,navy);doc.text('PARTNER STATEMENT · continued',L,47);y=55;}
    function ensure(h){if(y+h>279)page();}
    function section(t){ensure(10);doc.setFont('helvetica','bold');doc.setFontSize(9.4);colour(doc.setTextColor,navy);doc.text(t,L,y);colour(doc.setDrawColor,line);doc.line(L,y+2,R,y+2);y+=8;}
    function rule(){colour(doc.setDrawColor,line);doc.line(L,y,R,y);}
    function row(label,value,bold){ensure(8);if(bold){colour(doc.setFillColor,pale);doc.roundedRect(L,y-4,W,7,1,1,'F');}doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(8.3);colour(doc.setTextColor,bold?navy:[28,36,48]);doc.text(fitSingle(label,126),L+2,y);doc.setFont('helvetica',bold?'bold':'normal');doc.text(fitSingle(value,48),R-2,y,{align:'right'});y+=7;rule();}

    brand();y=50;
    doc.setFont('helvetica','bold');doc.setFontSize(18.5);colour(doc.setTextColor,navy);doc.text('PARTNER STATEMENT',L,y);
    y+=8;doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(fitSingle(String(s.account.name||'Partner'),150),L,y);
    y+=6;doc.setFont('helvetica','normal');doc.setFontSize(8.5);colour(doc.setTextColor,muted);doc.text(fitSingle(s.period.label+' · Includes payments and adjustments',W),L,y);y+=11;

    section('Account summary');
    row('Revenue',gbp(s.totals.revenue));
    row('Margin before payout',gbp(s.totals.preDistribution));
    row('Partner total before adjustments',gbp(s.totals.grossPartnerEarned));
    if(Math.abs(s.totals.partnerAdjustment)>0.009)row('Credits / adjustments','-'+gbp(Math.abs(s.totals.partnerAdjustment)));
    row('Partner total after adjustments',gbp(s.totals.partnerEarned),true);
    row('RETRADE earned',gbp(s.totals.retradeEarned),true);
    row('Paid in this period',gbp(s.paidInPeriod));
    row('Still owed',gbp(s.due),true);

    y+=6;section('Sold items');
    if(!s.sales.length)row('No sold items in this period','');
    s.sales.forEach(function(r){
      var adj=Math.abs(r.accountAdjustment||0)>0.009,label=String(r.item||'Item')+(r.saleNo?' · '+r.saleNo:''),itemX=L+23,itemWidth=91;
      doc.setFont('helvetica','bold');doc.setFontSize(7.2);var lines=clampLines(label,itemWidth,2),h=Math.max(adj?16:11,lines.length*3.5+(adj?9:5));ensure(h);
      doc.setFont('helvetica','normal');doc.setFontSize(6.8);colour(doc.setTextColor,muted);doc.text(String(r.date||''),L,y+3);
      doc.setFont('helvetica','bold');doc.setFontSize(7.2);colour(doc.setTextColor,navy);doc.text(lines,itemX,y+3);
      doc.setFont('helvetica','normal');doc.setFontSize(7.1);colour(doc.setTextColor,navy);doc.text('Partner '+gbp(r.partnerAmount),162,y+3,{align:'right'});
      doc.setFont('helvetica','bold');doc.setFontSize(7.1);doc.text('RETRADE '+gbp(r.retrade),R,y+3,{align:'right'});
      if(adj){doc.setFont('helvetica','normal');doc.setFontSize(6.6);colour(doc.setTextColor,muted);doc.text(fitSingle('Credit / adjustment '+gbp(Math.abs(r.accountAdjustment)),itemWidth),itemX,y+lines.length*3.5+3);}
      y+=h;rule();
    });

    if(s.accountAdjustments&&s.accountAdjustments.length){y+=6;section('Credits / adjustments');s.accountAdjustments.forEach(function(a){row(a.date+' · '+a.reason+(a.itemAllocations&&a.itemAllocations.length?' · '+a.itemAllocations.length+' linked items':''),'-'+gbp(Math.abs(a.amount)),true);});}

    y+=6;section('Payment transactions');
    if(!s.payments.length)row('No payments in this period','');
    s.payments.forEach(function(p){
      row(p.date+' · '+p.ref+' · '+p.status,gbp(p.amount),true);
      if(p.accountAdjustmentAmount){ensure(8);doc.setFontSize(7.1);doc.setFont('helvetica','normal');colour(doc.setTextColor,muted);doc.text(fitSingle('Total '+gbp(p.grossAmount)+' · credit -'+gbp(Math.abs(p.accountAdjustmentAmount))+' · paid '+gbp(p.amount),W-10),L+5,y);y+=7;}
      (p.allocations||[]).forEach(function(a){
        doc.setFont('helvetica','normal');doc.setFontSize(7.1);var lines=clampLines('Item: '+a.item+(a.saleNo?' · '+a.saleNo:''),138,2),h=Math.max(7,lines.length*3.4+2);ensure(h);colour(doc.setTextColor,navy);doc.text(lines,L+5,y);doc.setFont('helvetica','normal');doc.setFontSize(7.1);doc.text(gbp(a.amount),R-2,y,{align:'right'});y+=h;
      });
    });

    if(s.adjustments&&s.adjustments.length){y+=5;section('Returns / refunds');s.adjustments.forEach(function(a){row(a.date+' · '+a.item+' · '+a.saleNo,(a.profitImpact>0?'+':'')+gbp(a.profitImpact));});}
    if(Math.abs(s.totals.reconciliationDifference)>0.01){y+=4;row('RECONCILIATION WARNING',String(s.totals.reconciliationDifference),true);}

    if(theme&&typeof theme.addFooter==='function')theme.addFooter(doc,'Partner Statement · '+String(s.account.name||'Partner')+' · '+s.period.label);
    else{
      var pages=doc.getNumberOfPages();for(var i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7);colour(doc.setTextColor,muted);colour(doc.setDrawColor,line);doc.line(L,285,R,285);doc.text('RETRADE · '+String(s.account.name||'Partner')+' · '+s.period.label,L,290);doc.text('Page '+i+' of '+pages,R,290,{align:'right'});}
    }
    doc.save('RETRADE_'+safe(s.account.name)+'_Statement_'+s.period.slug+'.pdf');
  }
  async function pdf(){
    try{
      var s=await statement();await ensurePdf();var logo=null;
      if(window.RETRADE_DOCUMENTS&&typeof window.RETRADE_DOCUMENTS.logoDataUrl==='function')logo=await window.RETRADE_DOCUMENTS.logoDataUrl();
      writePdf(s,logo);try{toast('Partner statement PDF downloaded');}catch(_){}
    }catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}}
  }

  window._partnerStatementPdf=pdf;
  window._partnerStatementExcel=excel;
  window._partnerStatementCsv=csv;
  console.info('[RETRADE] adjustment-aware partner statement exporters v1.5.00 loaded');
})();