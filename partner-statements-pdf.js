/* RETRADE partner statement PDF export v1.4.73
 * Adds a professional PDF option beside the existing Excel/CSV exports.
 * Uses the live RETRADE sale/return/accounting helpers and does not mutate data.
 */
(function(){
  'use strict';
  if(window.__rtPartnerStatementPdfReady)return;
  window.__rtPartnerStatementPdfReady=true;

  var libPromise=null;

  function money(n){return +(Number(n)||0).toFixed(2);}
  function gbp(n){return '£'+money(n).toFixed(2);}
  function safeName(s){return String(s||'Partner').replace(/[^a-z0-9._-]+/gi,'_').replace(/^_+|_+$/g,'')||'Partner';}
  function account(id){
    try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}
    catch(_){return null;}
  }
  function iso(d){
    var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+day;
  }
  function monthEnd(ym){
    var p=String(ym||'').split('-'),y=Number(p[0]),m=Number(p[1]);
    if(!y||!m)return null;
    return iso(new Date(y,m,0));
  }
  function currentMonth(){
    var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function isVisible(id){
    var el=document.getElementById(id);if(!el)return false;
    return el.style.display!=='none'&&window.getComputedStyle(el).display!=='none';
  }
  function resolvedPeriod(){
    var from='',to='',label='',slug='';
    if(isVisible('ps-fields-custom')){
      from=(document.getElementById('ps-from')||{}).value||'';
      to=(document.getElementById('ps-to')||{}).value||'';
      if(!from||!to)throw new Error('Choose both a start and end date.');
      if(from>to)throw new Error('The start date must be before the end date.');
      label=new Date(from+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+' - '+new Date(to+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
      slug=from+'_to_'+to;
    }else if(isVisible('ps-fields-year')){
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

  function itemType(item,acct){
    try{if(typeof _itemAccountType==='function')return String(_itemAccountType(item)||'supplier').toLowerCase();}catch(_){}
    return String((item&&item.accountType)||(acct&&acct.accountType)||'supplier').toLowerCase();
  }
  function settlementForItem(acct,itemId,to){
    var paid=0,paidDate=null,legacy=false;
    (acct.settlements||[]).forEach(function(tx){
      if(!tx)return;
      (tx.items||[]).forEach(function(a){
        var id=a&&(a.id!=null?a.id:a.itemId);
        if(String(id)!==String(itemId))return;
        if(tx.paid===true&&tx.date&&tx.date<=to){
          paid+=Math.max(0,Number(a.amount)||0);
          if(!paidDate||tx.date>paidDate)paidDate=tx.date;
        }
      });
    });
    if(paid===0){
      try{
        var rec=_accountItems(acct.id).find(function(i){return String(i.id)===String(itemId);});
        if(rec&&rec.accountSettled===true)legacy=true;
      }catch(_){}
    }
    return {paid:money(paid),paidDate:paidDate,legacy:legacy};
  }

  function build(accountId,period){
    var acct=account(accountId);if(!acct)throw new Error('Partner account not found.');
    if(typeof getSaleEventsInRange!=='function'||typeof _saleBreakdown!=='function')throw new Error('Reporting engine is not available yet.');

    var events=getSaleEventsInRange(period.from,period.to).filter(function(ev){return ev&&ev.item&&String(ev.item.accountId)===String(acct.id);});
    events.sort(function(a,b){return String(a.saleDate||'').localeCompare(String(b.saleDate||''));});
    var t={goods:0,postageIncome:0,platformFees:0,advertising:0,delivery:0,packaging:0,itemCost:0,parts:0,returns:0,partnerShare:0,supplierDue:0};
    var sales=[],adjustments=[];

    events.filter(function(ev){return !ev.isReturnAdjustment;}).forEach(function(ev){
      var b=_saleBreakdown(ev),type=itemType(ev.item,acct),supplier=type==='supplier';
      var revenue=money((b.salePrice||0)+(b.postage||0));
      var external=money((b.totalCosts||0)-(b.partnerSplit||0));
      var pool=money(revenue-external),partner=supplier?Math.max(0,money(b.itemCost||0)):money(b.partnerSplit||0),retrade=money(b.netProfit||0);
      var sett=settlementForItem(acct,ev.item.id,period.to),status='—';
      if(partner>0)status=(sett.paid>=partner-0.009||sett.legacy)?'Paid':'To pay';
      else if(!supplier&&ev.item.accountSplitPercent==null&&acct.defaultSplitPercent==null&&ev.item.accountPaidAmount==null)status='Split not set';

      t.goods+=Number(b.salePrice)||0;t.postageIncome+=Number(b.postage)||0;
      t.platformFees+=(Number(b.bpf)||0)+(Number(b.listingFee)||0);
      t.advertising+=Number(b.promoFee)||0;t.delivery+=Number(b.shipping)||0;t.packaging+=Number(b.packaging)||0;
      t.itemCost+=Number(b.itemCost)||0;t.parts+=Number(b.parts)||0;
      if(supplier)t.supplierDue+=partner;else t.partnerShare+=partner;
      sales.push({date:ev.saleDate||'',item:ev.item.item||'Untitled',salePrice:money(b.salePrice),partner:partner,retrade:retrade,status:status,itemId:ev.item.id});
    });

    events.filter(function(ev){return !!ev.isReturnAdjustment;}).forEach(function(ev){
      var b=_saleBreakdown(ev);
      t.platformFees+=(Number(b.bpf)||0)+(Number(b.listingFee)||0);
      t.advertising+=Number(b.promoFee)||0;t.delivery+=Number(b.shipping)||0;t.packaging+=Number(b.packaging)||0;
      t.itemCost+=Number(b.itemCost)||0;t.parts+=Number(b.parts)||0;
      t.returns+=(Number(b.returnRefund)||0)+(Number(b.returnPostage)||0)+(Number(b.partialRefund)||0);
      adjustments.push({date:ev.saleDate||'',item:ev.item.item||'Untitled',amount:money((Number(b.returnRefund)||0)+(Number(b.returnPostage)||0)),profitImpact:money(b.netProfit||0)});
    });

    Object.keys(t).forEach(function(k){t[k]=money(t[k]);});
    t.revenue=money(t.goods+t.postageIncome);
    t.totalCosts=money(t.platformFees+t.advertising+t.delivery+t.packaging+t.itemCost+t.parts+t.returns);
    t.profitPool=money(t.revenue-t.totalCosts);
    var supplierAccount=String(acct.accountType||'supplier').toLowerCase()==='supplier';
    t.retradeShare=money(supplierAccount?t.profitPool:t.profitPool-t.partnerShare);

    var payments=[],paidInPeriod=0;
    (acct.settlements||[]).slice().sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));}).forEach(function(tx){
      if(!tx||!tx.date||tx.date<period.from||tx.date>period.to)return;
      var amount=money(tx.partnerAmount||0);if(tx.paid===true)paidInPeriod+=amount;
      payments.push({date:tx.date,amount:amount,status:tx.paid===true?'Paid':'Unpaid',items:(tx.items||[]).length,note:tx.note||''});
    });

    var due=0;
    sales.forEach(function(r){
      if(r.partner<=0)return;
      var sett=settlementForItem(acct,r.itemId,period.to);
      var paidAgainst=sett.legacy?r.partner:Math.min(r.partner,sett.paid);
      due+=Math.max(0,r.partner-paidAgainst);
    });
    return {account:acct,period:period,sales:sales,adjustments:adjustments,payments:payments,totals:t,paidInPeriod:money(paidInPeriod),due:money(due),supplier:supplierAccount};
  }

  function ensureLibrary(){
    if(window.jspdf&&window.jspdf.jsPDF)return Promise.resolve();
    if(libPromise)return libPromise;
    libPromise=new Promise(function(resolve,reject){
      var old=document.getElementById('rt-jspdf-lib');
      if(old){
        old.addEventListener('load',function(){window.jspdf&&window.jspdf.jsPDF?resolve():reject(new Error('PDF library did not initialise'));},{once:true});
        old.addEventListener('error',reject,{once:true});
        return;
      }
      var s=document.createElement('script');s.id='rt-jspdf-lib';s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.async=true;s.crossOrigin='anonymous';
      s.onload=function(){window.jspdf&&window.jspdf.jsPDF?resolve():reject(new Error('PDF library did not initialise'));};
      s.onerror=reject;document.head.appendChild(s);
    }).catch(function(err){libPromise=null;throw err;});
    return libPromise;
  }

  function writePdf(s){
    var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    var navy=[12,20,36],gold=[247,183,55],muted=[101,110,126],line=[221,225,232],pale=[248,249,251];
    var left=14,right=196,width=182,y=0;

    function setColour(method,c){method.apply(doc,c);}
    function brand(title){
      setColour(doc.setFillColor,navy);doc.rect(0,0,210,24,'F');
      doc.setFont('helvetica','bold');doc.setFontSize(18);setColour(doc.setTextColor,gold);doc.text('RETRADE',left,15);
      doc.setFontSize(9);doc.setTextColor(255,255,255);doc.text(title||'PARTNER STATEMENT',right,14,{align:'right'});
    }
    function newPage(){doc.addPage();brand('PARTNER STATEMENT');y=32;}
    function ensure(h){if(y+h>279)newPage();}
    function section(label){ensure(12);doc.setFont('helvetica','bold');doc.setFontSize(10);setColour(doc.setTextColor,navy);doc.text(label,left,y);y+=5;}
    function rule(){setColour(doc.setDrawColor,line);doc.line(left,y,right,y);}
    function summaryRow(label,value,bold){
      ensure(8);if(bold){setColour(doc.setFillColor,pale);doc.rect(left,y-4,width,7,'F');}
      doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(8.5);setColour(doc.setTextColor,navy);doc.text(label,left+2,y);
      doc.text(value,right-2,y,{align:'right'});y+=7;rule();
    }
    function soldHeader(){
      ensure(9);setColour(doc.setFillColor,navy);doc.rect(left,y-4,width,8,'F');
      doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(255,255,255);
      doc.text('Date',left+2,y);doc.text('Item',left+25,y);doc.text('Sold',left+110,y,{align:'right'});doc.text(s.supplier?'Supplier':'Partner',left+134,y,{align:'right'});doc.text('RETRADE',left+158,y,{align:'right'});doc.text('Status',right-2,y,{align:'right'});y+=7;
    }
    function soldRow(r){
      doc.setFont('helvetica','normal');doc.setFontSize(7.2);var lines=doc.splitTextToSize(String(r.item||''),78);var h=Math.max(8,lines.length*3.4+3);
      if(y+h>279){newPage();section('Sold items (continued)');soldHeader();}
      setColour(doc.setTextColor,navy);doc.text(String(r.date||''),left+2,y+2);doc.text(lines,left+25,y+2);doc.text(gbp(r.salePrice),left+110,y+2,{align:'right'});doc.text(gbp(r.partner),left+134,y+2,{align:'right'});doc.text(gbp(r.retrade),left+158,y+2,{align:'right'});doc.text(String(r.status||''),right-2,y+2,{align:'right'});
      y+=h;rule();
    }
    function activityHeader(){
      ensure(9);setColour(doc.setFillColor,navy);doc.rect(left,y-4,width,8,'F');doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(255,255,255);
      doc.text('Date',left+2,y);doc.text('Type',left+28,y);doc.text('Details',left+58,y);doc.text('Amount',right-2,y,{align:'right'});y+=7;
    }
    function activityRow(date,type,details,amount){
      doc.setFont('helvetica','normal');doc.setFontSize(7.2);var lines=doc.splitTextToSize(String(details||''),98);var h=Math.max(8,lines.length*3.4+3);
      if(y+h>279){newPage();section('Payments & adjustments (continued)');activityHeader();}
      setColour(doc.setTextColor,navy);doc.text(String(date||''),left+2,y+2);doc.text(type,left+28,y+2);doc.text(lines,left+58,y+2);doc.text(amount,right-2,y+2,{align:'right'});y+=h;rule();
    }

    brand('PARTNER STATEMENT');y=36;
    doc.setFont('helvetica','bold');doc.setFontSize(19);setColour(doc.setTextColor,navy);doc.text(String(s.account.name||'Partner'),left,y);y+=7;
    doc.setFont('helvetica','normal');doc.setFontSize(9);setColour(doc.setTextColor,muted);doc.text(s.period.label+'  ·  '+String(s.account.accountType||'supplier').replace(/^./,function(c){return c.toUpperCase();}),left,y);
    doc.text('Generated '+new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),right,y,{align:'right'});y+=11;

    var cards=[['Revenue',gbp(s.totals.revenue)],[s.supplier?'RETRADE profit':'Profit to split',gbp(s.totals.retradeShare)],[s.supplier?'Supplier amount':'Partner earned',gbp(s.supplier?s.totals.supplierDue:s.totals.partnerShare)],['Still owed',gbp(s.due)]];
    var cw=43.5,gap=2.5;
    cards.forEach(function(c,i){var x=left+i*(cw+gap);setColour(doc.setDrawColor,line);setColour(doc.setFillColor,pale);doc.roundedRect(x,y,cw,22,2,2,'FD');doc.setFont('helvetica','normal');doc.setFontSize(7.4);setColour(doc.setTextColor,muted);doc.text(c[0],x+3,y+7);doc.setFont('helvetica','bold');doc.setFontSize(12.5);setColour(doc.setTextColor,navy);doc.text(c[1],x+3,y+16);});
    y+=31;

    section('Financial summary');
    summaryRow('Sales made',gbp(s.totals.goods));summaryRow('Postage charged to customers',gbp(s.totals.postageIncome));summaryRow('TOTAL REVENUE',gbp(s.totals.revenue),true);
    summaryRow('Selling & listing fees',gbp(s.totals.platformFees));summaryRow('Advertising',gbp(s.totals.advertising));summaryRow('Delivery postage',gbp(s.totals.delivery));summaryRow('Packaging',gbp(s.totals.packaging));
    if(Math.abs(s.totals.itemCost)>0.009)summaryRow(s.supplier?'Supplier / stock cost':'Item / stock cost',gbp(s.totals.itemCost));
    if(Math.abs(s.totals.parts)>0.009)summaryRow('Parts & repairs',gbp(s.totals.parts));
    if(Math.abs(s.totals.returns)>0.009)summaryRow('Refunds & return postage',gbp(s.totals.returns));
    summaryRow('TOTAL COSTS',gbp(s.totals.totalCosts),true);
    if(!s.supplier){summaryRow('PROFIT TO SPLIT',gbp(s.totals.profitPool),true);summaryRow('Partner earned',gbp(s.totals.partnerShare));}
    summaryRow('RETRADE earned',gbp(s.totals.retradeShare),true);summaryRow('Paid to partner in this period',gbp(s.paidInPeriod));summaryRow('Still owed on sales in this statement',gbp(s.due),true);y+=8;

    section('Sold items');
    if(s.sales.length){soldHeader();s.sales.forEach(soldRow);}else{doc.setFont('helvetica','normal');doc.setFontSize(9);setColour(doc.setTextColor,muted);doc.text('No sold items in this period.',left,y);y+=12;}

    if(s.payments.length||s.adjustments.length){
      y+=8;section('Payments & adjustments');activityHeader();
      s.payments.forEach(function(p){activityRow(p.date,'Payment',(p.items||0)+' item'+(p.items===1?'':'s')+' · '+p.status+(p.note?' · '+p.note:''),gbp(p.amount));});
      s.adjustments.forEach(function(a){activityRow(a.date,'Return / refund',a.item+' · profit impact '+gbp(a.profitImpact),gbp(a.amount));});
    }

    var pages=doc.getNumberOfPages();
    for(var p=1;p<=pages;p++){
      doc.setPage(p);setColour(doc.setDrawColor,line);doc.line(left,286,right,286);doc.setFont('helvetica','normal');doc.setFontSize(7);setColour(doc.setTextColor,muted);
      doc.text('RETRADE partner statement · figures use the live RETRADE accounting engine',left,291);doc.text('Page '+p+' of '+pages,right,291,{align:'right'});
    }
    doc.save('RETRADE_'+safeName(s.account.name)+'_Statement_'+s.period.slug+'.pdf');
    try{toast('Partner statement PDF downloaded');}catch(_){}
  }

  function generatePdf(){
    var period,s;
    try{period=resolvedPeriod();s=build(window.__rtPartnerStatementAccountId||'',period);}catch(err){
      try{toast(err.message||'Could not generate PDF statement','error');}catch(_){alert(err.message||err);}return;
    }
    try{toast('Preparing PDF statement…');}catch(_){}
    ensureLibrary().then(function(){writePdf(s);}).catch(function(err){
      console.warn('[RETRADE] PDF statement exporter failed',err);
      try{toast('Could not load the PDF exporter. Excel and CSV are still available.','error');}catch(_){}
    });
  }

  function decoratePanel(accountId){
    window.__rtPartnerStatementAccountId=accountId;
    var excel=document.querySelector('button[onclick="_partnerStatementExcel()"]');
    var csv=document.querySelector('button[onclick="_partnerStatementCsv()"]');
    if(!excel||!csv)return;
    var host=excel.parentElement;if(!host)return;
    host.style.gridTemplateColumns='1fr 1fr';
    var pdf=host.querySelector('.rt-partner-statement-pdf');
    if(!pdf){
      pdf=document.createElement('button');pdf.type='button';pdf.className='btn btn-primary rt-partner-statement-pdf';pdf.style.cssText='width:100%;grid-column:1/-1;';pdf.textContent='Generate PDF';pdf.addEventListener('click',generatePdf);host.insertBefore(pdf,excel);
    }
    excel.classList.remove('btn-primary');excel.classList.add('btn-secondary');
    var info=host.previousElementSibling;
    if(info&&/Easy to read:/i.test(info.textContent||'')){
      info.innerHTML='<strong style="color:var(--text);">Easy to share:</strong> PDF creates a clean partner-facing statement with the financial summary, sold items and payment/return activity. Excel keeps the detailed worksheets and CSV provides the raw portable export.';
    }
  }

  var baseOpen=window.openPartnerStatement;
  if(typeof baseOpen==='function'){
    window.openPartnerStatement=function(accountId){
      window.__rtPartnerStatementAccountId=accountId;
      var result=baseOpen.apply(this,arguments);
      requestAnimationFrame(function(){requestAnimationFrame(function(){decoratePanel(accountId);});});
      return result;
    };
  }
  window._partnerStatementPdf=generatePdf;
  console.info('[RETRADE] v1.4.73 partner PDF statements loaded');
})();