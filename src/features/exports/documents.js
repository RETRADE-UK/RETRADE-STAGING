/* RETRADE branded document exports — v1.5.00
 *
 * Shared presentation layer for generated business documents.
 * Keeps accounting/lifecycle data untouched while standardising the RETRADE
 * banner, typography, table spacing, status stamps and document language.
 */
(function(){
  'use strict';
  if(window.__rtDocumentExportsReady)return;
  window.__rtDocumentExportsReady=true;

  var C={navy:[12,20,36],gold:[247,183,55],brandLight:[226,231,238],text:[28,36,48],muted:[110,118,130],line:[224,228,233],pale:[247,249,252],green:[46,125,50],red:[178,55,55],amber:[177,117,23]};
  var pdfPromise=null,logoPromise=null,activeItem=null,activeBundleId=null,activeAccountId=null,repairQueued=false;
  var TAGLINE="THE RESELLER'S BACK POCKET";
  var BANNER_WORDS='SALES · PAYMENTS · STATEMENTS';
  var L=14,R=196,W=182;

  function n(v){v=Number(v);return isFinite(v)?v:0;}
  function round(v){return Math.round(n(v)*100)/100;}
  function gbp(v){return '£'+round(v).toFixed(2);}
  function safe(v){return String(v||'Document').replace(/[^a-z0-9._-]+/gi,'_').replace(/^_+|_+$/g,'')||'Document';}
  function txt(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function colour(doc,method,c){method.apply(doc,c);}
  function toastSafe(message,type){try{if(typeof toast==='function')toast(message,type);}catch(_){} }
  function today(){return new Date().toISOString().slice(0,10);}
  function friendlyDate(value){if(!value)return '—';try{return new Date(String(value).slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch(_){return String(value);} }
  function platformLabel(id){try{var p=PLATFORMS&&PLATFORMS[id];return p&&(p.short||p.label||p.name)||id||'—';}catch(_){return id||'—';}}
  function itemBy(m,id){try{return (DB[m]||[]).find(function(i){return i&&String(i.id)===String(id);})||null;}catch(_){return null;}}
  function accountById(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}

  function fitSingle(doc,value,maxWidth){
    var s=txt(value);if(!s)return '';
    if(doc.getTextWidth(s)<=maxWidth)return s;
    var suffix='...';while(s.length&&doc.getTextWidth(suffix+s.slice(0,1))>maxWidth)s=s.slice(0,-1);
    while(s.length&&doc.getTextWidth(s+suffix)>maxWidth)s=s.slice(0,-1).replace(/\s+$/,'');
    return (s||'')+suffix;
  }
  function clampLines(doc,value,maxWidth,maxLines){
    var s=txt(value)||'—',lines=doc.splitTextToSize(s,maxWidth);if(!Array.isArray(lines))lines=[String(lines)];
    if(lines.length<=maxLines)return lines;
    lines=lines.slice(0,maxLines);var last=String(lines[maxLines-1]||'').replace(/\s+$/,'');
    while(last.length&&doc.getTextWidth(last+'...')>maxWidth)last=last.slice(0,-1).replace(/\s+$/,'');
    lines[maxLines-1]=(last||'')+'...';return lines;
  }

  function ensurePdf(){
    if(window.jspdf&&window.jspdf.jsPDF)return Promise.resolve();
    if(pdfPromise)return pdfPromise;
    pdfPromise=new Promise(function(resolve,reject){
      var old=document.getElementById('rt-doc-jspdf');
      if(old){old.addEventListener('load',function(){window.jspdf&&window.jspdf.jsPDF?resolve():reject(new Error('PDF library did not initialise'));},{once:true});old.addEventListener('error',reject,{once:true});return;}
      var s=document.createElement('script');s.id='rt-doc-jspdf';s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.async=true;s.crossOrigin='anonymous';s.referrerPolicy='no-referrer';
      s.onload=function(){window.jspdf&&window.jspdf.jsPDF?resolve():reject(new Error('PDF library did not initialise'));};s.onerror=reject;document.head.appendChild(s);
    }).catch(function(err){pdfPromise=null;throw err;});
    return pdfPromise;
  }

  function logoDataUrl(){
    if(logoPromise)return logoPromise;
    logoPromise=new Promise(function(resolve){
      try{
        var symbol=document.getElementById('rt-mark');
        if(!symbol){resolve(null);return;}
        var inner=String(symbol.innerHTML||'').replace(/var\(--brand\)/g,'#F7B737').replace(/var\(--text-primary\)/g,'#FFFFFF');
        var svg='<svg xmlns="http://www.w3.org/2000/svg" width="324" height="378" viewBox="0 0 811 946">'+inner+'</svg>';
        var blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),img=new Image();
        img.onload=function(){try{var canvas=document.createElement('canvas');canvas.width=324;canvas.height=378;var ctx=canvas.getContext('2d');ctx.clearRect(0,0,324,378);ctx.drawImage(img,0,0,324,378);var out=canvas.toDataURL('image/png');URL.revokeObjectURL(url);resolve(out);}catch(_){try{URL.revokeObjectURL(url);}catch(__){}resolve(null);}};
        img.onerror=function(){try{URL.revokeObjectURL(url);}catch(_){}resolve(null);};img.src=url;
      }catch(_){resolve(null);}
    });
    return logoPromise;
  }

  function brandBanner(doc,logo){
    colour(doc,doc.setFillColor,C.navy);doc.roundedRect(L,12,W,25,1.6,1.6,'F');
    if(logo){try{doc.addImage(logo,'PNG',19,15.8,9.6,11.2,undefined,'FAST');}catch(_){} }
    var x=logo?32:20;
    doc.setFont('helvetica','bold');doc.setFontSize(16.5);colour(doc,doc.setTextColor,C.brandLight);doc.text('RE',x,24.8);
    var reWidth=doc.getTextWidth('RE');colour(doc,doc.setTextColor,C.gold);doc.text('TRADE',x+reWidth+.6,24.8);
    doc.setFont('helvetica','normal');doc.setFontSize(5.6);colour(doc,doc.setTextColor,C.brandLight);doc.text(TAGLINE,x,31.2);
    doc.setFont('helvetica','bold');doc.setFontSize(6.3);colour(doc,doc.setTextColor,C.brandLight);doc.text(BANNER_WORDS,190,25.2,{align:'right'});
  }

  function statusStamp(doc,label,x,y){
    label=String(label||'').toUpperCase();if(!label)return;
    var c=/PAID|SETTLED/.test(label)?C.green:/REFUND|CREDIT/.test(label)?C.red:/UNPAID|DUE/.test(label)?C.amber:C.navy;
    doc.setFont('helvetica','bold');doc.setFontSize(8);var tw=doc.getTextWidth(label)+10;
    colour(doc,doc.setDrawColor,c);colour(doc,doc.setTextColor,c);doc.setLineWidth(.45);doc.roundedRect(x-tw,y-5,tw,8,1.4,1.4,'S');doc.text(label,x-5,y,{align:'right'});doc.setLineWidth(.2);
  }

  function addFooter(doc,label){
    var pages=doc.getNumberOfPages();
    for(var i=1;i<=pages;i++){
      doc.setPage(i);colour(doc,doc.setDrawColor,C.line);doc.line(L,285,R,285);
      doc.setFont('helvetica','normal');doc.setFontSize(6.8);colour(doc,doc.setTextColor,C.muted);
      doc.text('RETRADE · '+String(label||'Generated document'),L,290);doc.text('Page '+i+' of '+pages,R,290,{align:'right'});
    }
  }

  function shell(doc,logo,title,subtitle,status){
    brandBanner(doc,logo);var y=50;
    doc.setFont('helvetica','bold');doc.setFontSize(18.5);colour(doc,doc.setTextColor,C.navy);doc.text(String(title||'Document'),L,y);
    if(status)statusStamp(doc,status,R,y-1);
    y+=7;doc.setFont('helvetica','normal');doc.setFontSize(8.5);colour(doc,doc.setTextColor,C.muted);if(subtitle)doc.text(fitSingle(doc,subtitle,W-4),L,y);return y+10;
  }

  function section(doc,label,y){doc.setFont('helvetica','bold');doc.setFontSize(9.2);colour(doc,doc.setTextColor,C.navy);doc.text(String(label),L,y);colour(doc,doc.setDrawColor,C.line);doc.line(L,y+2,R,y+2);return y+8;}
  function kv(doc,label,value,y,bold){
    if(bold){colour(doc,doc.setFillColor,C.pale);doc.roundedRect(L,y-4,W,7,1,1,'F');}
    doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(8.3);colour(doc,doc.setTextColor,bold?C.navy:C.text);
    var left=fitSingle(doc,label,112),right=fitSingle(doc,value,60);doc.text(left,L+2,y);doc.text(right,R-2,y,{align:'right'});return y+7;
  }
  function note(doc,text,y){var lines=doc.splitTextToSize(String(text||''),W-4);doc.setFont('helvetica','normal');doc.setFontSize(7.6);colour(doc,doc.setTextColor,C.muted);doc.text(lines,L+2,y);return y+lines.length*3.7+3;}
  function tableHead(doc,cols,y){colour(doc,doc.setFillColor,C.navy);doc.roundedRect(L,y-4,W,8,1,1,'F');doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(255,255,255);cols.forEach(function(c){doc.text(c.label,c.x,y,{align:c.align||'left'});});return y+7;}
  function rule(doc,y){colour(doc,doc.setDrawColor,C.line);doc.line(L,y,R,y);}
  function newPage(doc,logo,title){doc.addPage();brandBanner(doc,logo);doc.setFont('helvetica','bold');doc.setFontSize(9);colour(doc,doc.setTextColor,C.navy);doc.text(title||'Document',L,47);return 55;}

  async function startPdf(){await ensurePdf();var logo=await logoDataUrl();return {doc:new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4'}),logo:logo};}

  function saleSnapshot(item){
    var isSale2=!!item.resaleSalePrice,price=isSale2?n(item.resaleSalePrice):n(item.salePrice),postage=isSale2?n(item.resalePostage):n(item.postage),date=isSale2?(item.resaleDateSold||item.dateSold):(item.dateSold||''),platform=isSale2?(item.resalePlatform||item.soldOnPlatform||item.defaultPlatform):(item.soldOnPlatform||item.salePlatform||item.defaultPlatform),saleNo=isSale2?2:1;
    return {saleNo:saleNo,price:round(price),postage:round(postage),total:round(price+postage),date:date,platform:platform};
  }
  function receiptRef(item,sale){return item.bundleRef||item.orderRef||item.saleRef||item.gid||('SALE-'+String(item.id||'').slice(-8).toUpperCase()+'-'+sale.saleNo);}

  async function salesReceipt(m,id){
    try{
      var item=itemBy(m,id);if(!item)throw new Error('Item not found.');var s=saleSnapshot(item);if(!s.date&&!s.price)throw new Error('This item has not been sold yet.');
      var p=await startPdf(),doc=p.doc,y=shell(doc,p.logo,'SALES RECEIPT','Receipt '+receiptRef(item,s)+' · '+friendlyDate(s.date),'PAID');
      y=section(doc,'Sale details',y);y=kv(doc,'Reference',receiptRef(item,s),y);y=kv(doc,'Sale date',friendlyDate(s.date),y);y=kv(doc,'Sold via',platformLabel(s.platform),y);if(item.gid)y=kv(doc,'Inventory ID',item.gid,y);y+=5;
      y=section(doc,'Items',y);y=tableHead(doc,[{label:'Description',x:L+2},{label:'Qty',x:151,align:'right'},{label:'Amount',x:R-2,align:'right'}],y);
      doc.setFont('helvetica','normal');doc.setFontSize(8.2);colour(doc,doc.setTextColor,C.text);var lines=clampLines(doc,item.item||'Item',116,2),h=Math.max(10,lines.length*3.6+4);doc.text(lines,L+2,y+2);doc.setFont('helvetica','normal');doc.text('1',151,y+2,{align:'right'});doc.text(gbp(s.price),R-2,y+2,{align:'right'});y+=h;rule(doc,y);
      if(s.postage)y=kv(doc,'Delivery / buyer postage',gbp(s.postage),y);y=kv(doc,'TOTAL PAID',gbp(s.total),y,true);y+=8;y=note(doc,'Payment received. This receipt is generated from the sale record held in RETRADE.',y);
      addFooter(doc,'Sales Receipt · '+receiptRef(item,s));doc.save('RETRADE_Sales_Receipt_'+safe(receiptRef(item,s))+'.pdf');toastSafe('Sales receipt downloaded');
    }catch(err){toastSafe(err.message||'Could not generate sales receipt','error');}
  }

  function bundleItems(bid){try{return typeof _bundleItems==='function'?(_bundleItems(bid)||[]):[];}catch(_){return [];}}
  function bundleCycle(item,bid){try{return typeof _bundleMemberCycle==='function'?_bundleMemberCycle(item,bid):null;}catch(_){return null;}}
  async function orderSummary(bid){
    try{
      var items=bundleItems(bid);if(!items.length)throw new Error('Bundle order not found.');var rows=[],date='',ref='',platform='',subtotal=0,postage=0;
      items.forEach(function(item){var c=bundleCycle(item,bid)||{},price=round(c.price),post=round(c.postage);subtotal+=price;postage+=post;if(!date)date=c.date||'';if(!ref)ref=c.bundleRef||item.bundleRef||bid;if(!platform)platform=c.platformId||c.platform||item.soldOnPlatform||item.defaultPlatform;rows.push({name:item.item||'Item',price:price});});subtotal=round(subtotal);postage=round(postage);
      var p=await startPdf(),doc=p.doc,y=shell(doc,p.logo,'ORDER SUMMARY','Order '+String(ref||bid)+' · '+friendlyDate(date),'PAID');
      y=section(doc,'Order details',y);y=kv(doc,'Order reference',ref||bid,y);y=kv(doc,'Order date',friendlyDate(date),y);y=kv(doc,'Sold via',platformLabel(platform),y);y+=5;y=section(doc,'Items',y);y=tableHead(doc,[{label:'Description',x:L+2},{label:'Qty',x:151,align:'right'},{label:'Amount',x:R-2,align:'right'}],y);
      rows.forEach(function(r){if(y>270)y=newPage(doc,p.logo,'ORDER SUMMARY · continued');doc.setFont('helvetica','normal');doc.setFontSize(8);colour(doc,doc.setTextColor,C.text);var lines=clampLines(doc,r.name,116,2),h=Math.max(9,lines.length*3.4+3);doc.text(lines,L+2,y+2);doc.setFont('helvetica','normal');doc.text('1',151,y+2,{align:'right'});doc.text(gbp(r.price),R-2,y+2,{align:'right'});y+=h;rule(doc,y);});
      y+=3;y=kv(doc,'Items subtotal',gbp(subtotal),y);if(postage)y=kv(doc,'Delivery / buyer postage',gbp(postage),y);y=kv(doc,'ORDER TOTAL',gbp(subtotal+postage),y,true);addFooter(doc,'Order Summary · '+String(ref||bid));doc.save('RETRADE_Order_Summary_'+safe(ref||bid)+'.pdf');toastSafe('Order summary downloaded');
    }catch(err){toastSafe(err.message||'Could not generate order summary','error');}
  }

  function latestReturn(item){var arr=Array.isArray(item&&item.returnHistory)?item.returnHistory.slice():[];arr.sort(function(a,b){return String(b.loggedAt||b.date||'').localeCompare(String(a.loggedAt||a.date||''));});return arr[0]||null;}
  async function creditNote(m,id){
    try{
      var item=itemBy(m,id);if(!item)throw new Error('Item not found.');var ret=latestReturn(item);if(!ret)throw new Error('No refund or return is recorded for this item.');var s=saleSnapshot(item),refund=round(ret.refundAmount||ret.amount),returnPost=round(ret.returnPostage),ref=receiptRef(item,s),date=ret.loggedAt||ret.date||today(),kind=String(ret.type||'refund').replace(/_/g,' ');
      var p=await startPdf(),doc=p.doc,y=shell(doc,p.logo,'REFUND / CREDIT NOTE','Credit against '+ref+' · '+friendlyDate(date),'REFUNDED');
      y=section(doc,'Original sale',y);y=kv(doc,'Original reference',ref,y);y=kv(doc,'Item',item.item||'Item',y);y=kv(doc,'Original sale amount',gbp(s.total),y);y+=5;y=section(doc,'Refund details',y);y=kv(doc,'Reason / type',kind.replace(/^./,function(c){return c.toUpperCase();}),y);y=kv(doc,'Refund to buyer',gbp(refund),y,true);if(returnPost)y=kv(doc,'Return postage',gbp(returnPost),y);if(ret.note)y=note(doc,'Note: '+ret.note,y+4);y+=7;y=note(doc,'This note records the refund held in RETRADE and should be kept with the original sale record.',y);
      addFooter(doc,'Credit Note · '+ref);doc.save('RETRADE_Credit_Note_'+safe(ref)+'_'+String(date).slice(0,10)+'.pdf');toastSafe('Refund / credit note downloaded');
    }catch(err){toastSafe(err.message||'Could not generate credit note','error');}
  }

  async function annualStatement(fyStart){
    try{
      fyStart=Number(fyStart);if(!fyStart||fyStart<2000)throw new Error('Choose a valid financial year.');var label=typeof _getFYLabel==='function'?_getFYLabel(fyStart):(fyStart+'/'+String(fyStart+1).slice(-2)),from=fyStart+'-04-06',to=(fyStart+1)+'-04-05',pnl=typeof _buildPnLSummary==='function'?_buildPnLSummary(from,to,'FY '+label):null;
      var p=await startPdf(),doc=p.doc,y=shell(doc,p.logo,'ANNUAL STATEMENT','Financial year '+label+' · 6 Apr '+fyStart+' to 5 Apr '+(fyStart+1),'');
      y=section(doc,'Annual summary',y);
      var summaryRows=pnl&&Array.isArray(pnl.rows)?pnl.rows.filter(function(r){return r&&r.length&&txt(r[0])&&r.length>=2;}).slice(0,28):[];
      if(summaryRows.length){summaryRows.forEach(function(r){if(y>274)y=newPage(doc,p.logo,'ANNUAL STATEMENT · continued');var labelText=txt(r[0]),val=r[1];if(val==null||val==='')return;var display=typeof val==='number'?gbp(val):String(val);y=kv(doc,labelText,display,y,/net profit|taxable profit|total/i.test(labelText));});}
      else if(typeof _fyKeys==='function'&&typeof calcMonthStatsBySale==='function'){
        var tr=0,tc=0,tp=0,ts=0;_fyKeys(fyStart).forEach(function(k){var ms=calcMonthStatsBySale(k);tr+=n(ms.totalRev);tp+=n(ms.realisedProfit);tc+=n(ms.totalRev)-n(ms.realisedProfit);ts+=n(ms.soldCount);});y=kv(doc,'Revenue',gbp(tr),y);y=kv(doc,'Costs',gbp(tc),y);y=kv(doc,'Net profit',gbp(tp),y,true);y=kv(doc,'Items sold',String(ts),y);}
      if(typeof _fyKeys==='function'&&typeof calcMonthStatsBySale==='function'){
        y+=7;if(y>260)y=newPage(doc,p.logo,'ANNUAL STATEMENT · continued');y=section(doc,'Monthly performance',y);y=tableHead(doc,[{label:'Month',x:L+2},{label:'Revenue',x:112,align:'right'},{label:'Costs',x:151,align:'right'},{label:'Profit',x:R-2,align:'right'}],y);
        _fyKeys(fyStart).forEach(function(k){if(y>274)y=newPage(doc,p.logo,'ANNUAL STATEMENT · monthly performance');var ms=calcMonthStatsBySale(k),rev=round(ms.totalRev),profit=round(ms.realisedProfit),cost=round(rev-profit);doc.setFont('helvetica','normal');doc.setFontSize(7.5);colour(doc,doc.setTextColor,C.text);doc.text(typeof keyName==='function'?keyName(k):k,L+2,y+2);doc.text(gbp(rev),112,y+2,{align:'right'});doc.text(gbp(cost),151,y+2,{align:'right'});doc.setFont('helvetica','bold');colour(doc,doc.setTextColor,profit>=0?C.green:C.red);doc.text(gbp(profit),R-2,y+2,{align:'right'});y+=7;rule(doc,y);});
      }
      addFooter(doc,'Annual Statement · FY '+label);doc.save('RETRADE_FY'+String(label).replace('/','-')+'_Annual_Statement.pdf');toastSafe('Annual statement PDF downloaded');
    }catch(err){toastSafe(err.message||'Could not generate annual statement','error');}
  }

  function settlementById(account,id){var list=Array.isArray(account&&account.settlements)?account.settlements:[];if(id==null)return list.slice().sort(function(a,b){return String(b&&b.date||'').localeCompare(String(a&&a.date||''));})[0]||null;return list.find(function(tx,idx){return tx&&(String(tx.id||tx.ref||idx)===String(id));})||null;}
  function settlementKey(tx,idx){return String((tx&&(tx.id||tx.ref))!=null?(tx.id||tx.ref):idx);}
  async function settlementSlip(accountId,settlementId){
    try{
      var account=accountById(accountId);if(!account)throw new Error('Partner account not found.');var tx=settlementById(account,settlementId);if(!tx)throw new Error('No settlement transaction found.');var allocations=Array.isArray(tx.items)?tx.items:[],allocated=round(allocations.reduce(function(s,a){return s+n(a&&a.amount);},0)),gross=round(tx.grossAmount||tx.grossPartnerAmount||allocated||tx.partnerAmount),credit=round(tx.accountAdjustmentAmount||tx.adjustmentAmount),cash=round(tx.partnerAmount!=null?tx.partnerAmount:Math.max(0,gross-credit)),status=tx.paid===true?'SETTLED':'UNPAID',ref=tx.ref||tx.reference||tx.id||('SET-'+String(tx.date||today()).replace(/-/g,''));
      var p=await startPdf(),doc=p.doc,y=shell(doc,p.logo,'SETTLEMENT SLIP',String(account.name||'Partner')+' · '+friendlyDate(tx.date),status);
      y=section(doc,'Settlement details',y);y=kv(doc,'Partner / supplier',account.name||'Partner',y);y=kv(doc,'Reference',ref,y);y=kv(doc,'Payment date',friendlyDate(tx.date),y);y=kv(doc,'Payment status',tx.paid===true?'Paid':'Unpaid',y);y+=5;y=section(doc,'Payment summary',y);y=kv(doc,'Total partner amount',gbp(gross),y);if(credit)y=kv(doc,'Credit used','-'+gbp(Math.abs(credit)),y);y=kv(doc,'AMOUNT PAID',gbp(cash),y,true);
      if(allocations.length){y+=6;y=section(doc,'Included items',y);y=tableHead(doc,[{label:'Item',x:L+2},{label:'Amount',x:R-2,align:'right'}],y);allocations.forEach(function(a){if(y>273)y=newPage(doc,p.logo,'SETTLEMENT SLIP · continued');var name=a.item||a.item_name||a.name||a.id||a.itemId||'Item';doc.setFont('helvetica','normal');doc.setFontSize(7.6);colour(doc,doc.setTextColor,C.text);var lines=clampLines(doc,name,138,2),h=Math.max(8,lines.length*3.4+3);doc.text(lines,L+2,y+2);doc.setFont('helvetica','normal');doc.text(gbp(a.amount),R-2,y+2,{align:'right'});y+=h;rule(doc,y);});}
      if(tx.note)y=note(doc,'Note: '+tx.note,y+6);addFooter(doc,'Settlement Slip · '+String(account.name||'Partner')+' · '+ref);doc.save('RETRADE_Settlement_'+safe(account.name)+'_'+safe(ref)+'.pdf');toastSafe('Settlement slip downloaded');
    }catch(err){toastSafe(err.message||'Could not generate settlement slip','error');}
  }

  function button(label,cls){var b=document.createElement('button');b.type='button';b.className='btn btn-secondary '+(cls||'');b.textContent=label;return b;}
  function scheduleRepair(){if(repairQueued)return;repairQueued=true;requestAnimationFrame(function(){repairQueued=false;repair();});}
  function installItemHooks(){
    if(typeof window.renderItemPage==='function'&&!window.renderItemPage.__rtDocs){var base=window.renderItemPage,wrap=function(m,id){activeItem={m:m,id:id};var out=base.apply(this,arguments);scheduleRepair();return out;};wrap.__rtDocs=true;window.renderItemPage=wrap;}
    if(typeof window._renderStockItemPage==='function'&&!window._renderStockItemPage.__rtDocs){var base2=window._renderStockItemPage,wrap2=function(m,item){if(item&&item.id!=null)activeItem={m:m,id:item.id};var out=base2.apply(this,arguments);scheduleRepair();return out;};wrap2.__rtDocs=true;window._renderStockItemPage=wrap2;}
  }
  function itemActions(){
    var page=document.getElementById('p-item');if(!page||!page.classList.contains('on')||!activeItem)return;var item=itemBy(activeItem.m,activeItem.id);if(!item)return;var host=page.querySelector('.ip-actions');if(!host)return;
    if((item.dateSold||item.resaleDateSold||item.salePrice||item.resaleSalePrice)&&!host.querySelector('.rt-doc-sales-receipt')){var r=button('Sales receipt','rt-doc-sales-receipt');r.addEventListener('click',function(){salesReceipt(activeItem.m,activeItem.id);});host.appendChild(r);}
    if(Array.isArray(item.returnHistory)&&item.returnHistory.length&&!host.querySelector('.rt-doc-credit-note')){var c=button('Refund / credit note','rt-doc-credit-note');c.addEventListener('click',function(){creditNote(activeItem.m,activeItem.id);});host.appendChild(c);}
  }
  function installBundleHook(){if(typeof window.openBundlePage==='function'&&!window.openBundlePage.__rtDocs){var base=window.openBundlePage,wrap=function(bid){activeBundleId=bid;var out=base.apply(this,arguments);setTimeout(scheduleRepair,0);return out;};wrap.__rtDocs=true;window.openBundlePage=wrap;}}
  function bundleAction(){if(!activeBundleId)return;var host=document.querySelector('#slide-panel .rt-bop-actions');if(!host||host.querySelector('.rt-doc-order-summary'))return;var b=button('Order summary PDF','rt-doc-order-summary');b.addEventListener('click',function(){orderSummary(activeBundleId);});host.appendChild(b);}
  function installAccountHook(){if(typeof window._renderAccountPage==='function'&&!window._renderAccountPage.__rtDocs){var base=window._renderAccountPage,wrap=function(account){if(account&&account.id!=null)activeAccountId=account.id;var out=base.apply(this,arguments);scheduleRepair();return out;};wrap.__rtDocs=true;window._renderAccountPage=wrap;}}
  function accountAction(){
    var page=document.getElementById('p-item'),account=accountById(activeAccountId);if(!page||!page.classList.contains('on')||!account||!Array.isArray(account.settlements)||!account.settlements.length)return;var statement=page.querySelector('.rt-partner-statement-btn'),host=statement&&statement.parentElement;if(!host||host.querySelector('.rt-doc-settlement'))return;
    var b=button('Settlement slip','rt-doc-settlement');b.style.cssText='display:inline-flex;align-items:center;justify-content:center;font-size:12px;padding:7px 10px;min-height:36px;white-space:nowrap;';b.addEventListener('click',function(){showSettlementPicker(account);});host.appendChild(b);
  }
  function closePicker(){var el=document.getElementById('rt-doc-settlement-picker');if(el)el.remove();}
  function showSettlementPicker(account){
    closePicker();var list=(account.settlements||[]).slice().sort(function(a,b){return String(b&&b.date||'').localeCompare(String(a&&a.date||''));});if(list.length===1){settlementSlip(account.id,settlementKey(list[0],0));return;}
    var root=document.createElement('div');root.id='rt-doc-settlement-picker';root.style.cssText='position:fixed;inset:0;z-index:17000;background:rgba(4,9,18,.62);display:flex;align-items:center;justify-content:center;padding:18px';var card=document.createElement('div');card.style.cssText='width:min(520px,100%);max-height:78vh;overflow:auto;border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:0 24px 70px rgba(0,0,0,.4);padding:16px';card.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><div style="flex:1"><strong style="font-size:15px">Settlement slip</strong><div style="font-size:10.5px;color:var(--text-secondary);margin-top:3px">Choose the payment transaction to export.</div></div><button type="button" class="btn btn-secondary" data-close>Close</button></div>';
    list.forEach(function(tx,idx){var k=settlementKey(tx,idx),row=document.createElement('button');row.type='button';row.style.cssText='display:flex;width:100%;align-items:center;gap:12px;text-align:left;border:1px solid var(--border);border-radius:10px;background:var(--surface2);color:var(--text);padding:10px 11px;margin:0 0 7px;cursor:pointer';row.innerHTML='<span style="flex:1"><strong style="display:block;font-size:12px">'+friendlyDate(tx.date)+' · '+String(tx.ref||tx.reference||'Payment')+'</strong><small style="display:block;color:var(--text-secondary);margin-top:2px">'+(tx.paid===true?'Paid':'Unpaid')+'</small></span><strong>'+gbp(tx.partnerAmount||0)+'</strong>';row.addEventListener('click',function(){closePicker();settlementSlip(account.id,k);});card.appendChild(row);});
    root.appendChild(card);document.body.appendChild(root);root.querySelector('[data-close]').addEventListener('click',closePicker);root.addEventListener('click',function(ev){if(ev.target===root)closePicker();});
  }
  function annualActions(){
    document.querySelectorAll('[onclick*="downloadAnnualExcel("]').forEach(function(src){if(src.dataset.rtAnnualPdfSibling)return;src.dataset.rtAnnualPdfSibling='1';var code=src.getAttribute('onclick')||'',pdfCode=code.replace(/downloadAnnualExcel/g,'generateRetradeAnnualStatement');if(pdfCode===code)return;var b=button('PDF statement','rt-doc-annual-pdf');b.setAttribute('onclick',pdfCode);src.insertAdjacentElement('afterend',b);});
  }
  function repair(){installItemHooks();installBundleHook();installAccountHook();itemActions();bundleAction();accountAction();annualActions();}

  window.generateRetradeSalesReceipt=salesReceipt;
  window.generateRetradeOrderSummary=orderSummary;
  window.generateRetradeCreditNote=creditNote;
  window.generateRetradeAnnualStatement=annualStatement;
  window.generateRetradeSettlementSlip=settlementSlip;
  window.RETRADE_DOCUMENTS={colors:C,tagline:TAGLINE,bannerWords:BANNER_WORDS,ensurePdf:ensurePdf,logoDataUrl:logoDataUrl,brandBanner:brandBanner,statusStamp:statusStamp,addFooter:addFooter,safeFileName:safe,gbp:gbp,fitSingle:fitSingle,clampLines:clampLines};

  // Export actions live in these surfaces. KPI text updates elsewhere must not
  // trigger a full export-button repair on every animation frame.
  try{
    var exportObserver=new MutationObserver(function(records){
      if(records.some(function(record){
        return Array.prototype.some.call(record.addedNodes,function(n){return n.nodeType===1;})||
          Array.prototype.some.call(record.removedNodes,function(n){return n.nodeType===1;});
      }))scheduleRepair();
    });
    ['p-item','p-tax','p-data','panel-content'].forEach(function(id){
      var host=document.getElementById(id);if(host)exportObserver.observe(host,{childList:true,subtree:true});
    });
  }catch(_){}
  repair();
  console.info('[RETRADE] branded document exports v1.5.00 loaded');
})();
