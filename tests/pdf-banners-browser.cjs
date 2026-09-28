/* Audit every current PDF exporter with real jsPDF and isolated synthetic data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{
  const {page,context,errors}=await open(browser,{signedIn:true});await settled(page);
  await page.addScriptTag({content:fs.readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'),'utf8')});
  // The Statement action loads these in this order before exposing its PDF button.
  for(const file of ['statements.js','statements-accounting-v3.js','account-adjustment-statements.js'])await page.addScriptTag({url:'http://retrade.test/src/features/partners/'+file});
  await page.evaluate(()=>{
   goToTab('tax');renderTax();
   const Original=window.jspdf.jsPDF;window.__pdfAudit=[];
   window.jspdf.jsPDF=function(...args){
    const doc=new Original(...args),images=[],text=[],addImage=doc.addImage,write=doc.text,save=doc.save;
    doc.addImage=function(image,type,x,y,w,h,...rest){images.push({page:doc.getCurrentPageInfo().pageNumber,x,y,w,h});return addImage.call(this,image,type,x,y,w,h,...rest);};
    doc.text=function(value,x,y,...rest){if(y<38)text.push({page:doc.getCurrentPageInfo().pageNumber,value,x,y,size:doc.getFontSize()});return write.call(this,value,x,y,...rest);};
    doc.save=function(name){window.__pdfAudit.push({name,pages:doc.getNumberOfPages(),images,text});return save.call(this,name);};return doc;
   };
   const month=currentMonthKey();window.__pdfMonth=month;
   DB[month].push({id:'pdf-audit-sale',item:'Sample camera',salePrice:120,dateSold:'2026-09-01',soldOnPlatform:'ebay_biz',postage:5,returnHistory:[{type:'refund',date:'2026-09-02',amount:20}]});
   const items=Array.from({length:35},(_,i)=>({item:'Sample item '+(i+1),amount:10}));
   _accounts.push({id:'pdf-audit-account',name:'Sample partner',settlements:[{id:'pdf-audit-payment',date:'2026-09-03',partnerAmount:350,paid:true,items}]});
   _bundleItems=()=>items;_bundleMemberCycle=()=>({price:10,postage:0,date:'2026-09-01',bundleRef:'PDF-AUDIT',platform:'ebay_biz'});
   window.__rtPartnerStatementActiveAccountId='pdf-audit-account';
   window.__rtPartnerAdjustmentsEnsureLoaded=async()=>{};
   window.__rtBuildPartnerStatementV3Adjusted=()=>({account:{name:'Sample partner'},period:{label:'September 2026',slug:'2026-09'},totals:{revenue:700,preDistribution:500,grossPartnerEarned:350,partnerAdjustment:0,partnerEarned:350,retradeEarned:150,reconciliationDifference:0},paidInPeriod:350,due:0,sales:items.map(i=>({...i,date:'2026-09-01',saleNo:1,partnerAmount:10,retrade:5})),payments:[],adjustments:[],accountAdjustments:[]});
  });
  const alignment=await page.evaluate(async()=>{
   const image=new Image();image.src=await RETRADE_DOCUMENTS.logoDataUrl();await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   const scale=canvas.width/6118,split=Math.round(1650*scale);
   function bounds(left,right,bottom){let top=canvas.height,last=-1;for(let y=0;y<bottom;y++)for(let x=left;x<right;x++)if(pixels[(y*canvas.width+x)*4+3]>127){top=Math.min(top,y);last=Math.max(last,y);}return {centre:(top+last)/2,height:last-top+1};}
   return {shield:bounds(0,split,canvas.height),text:bounds(split,canvas.width,canvas.height),expectedHeight:1106*scale};
  });
  assert(Math.abs(alignment.shield.centre-alignment.text.centre)<=1,'Title/tagline group centred on the complete shield including its gold swoosh');
  assert(Math.abs(alignment.text.height-alignment.expectedHeight)<=2,'Title and tagline spacing retained as one group');
  const exports=[['receipt',()=>generateRetradeSalesReceipt(__pdfMonth,'pdf-audit-sale')],['order',()=>generateRetradeOrderSummary('pdf-audit-order')],['credit',()=>generateRetradeCreditNote(__pdfMonth,'pdf-audit-sale')],['annual',()=>generateRetradeAnnualStatement(2026)],['settlement',()=>generateRetradeSettlementSlip('pdf-audit-account','pdf-audit-payment')],['partner',()=>_partnerStatementPdf()]];
  for(const [label,generate] of exports){
   const pending=page.waitForEvent('download');await page.evaluate(generate);const download=await pending;
   assert(download.suggestedFilename().endsWith('.pdf'));
   if(process.env.RETRADE_CAPTURE)await download.saveAs(path.join(process.env.RETRADE_CAPTURE,label+'.pdf'));
  }
  const audit=await page.evaluate(()=>window.__pdfAudit);assert.equal(audit.length,exports.length);
  let reference;
  for(const pdf of audit){
   assert.equal(pdf.images.length,pdf.pages,pdf.name+' has the approved logo on every page');
   for(let pageNo=1;pageNo<=pdf.pages;pageNo++){
    const logo=pdf.images.find(i=>i.page===pageNo),words=pdf.text.filter(t=>t.page===pageNo);
    assert(!words.some(t=>t.value==='RE'||t.value==="THE RESELLER'S BACK POCKET"),'Do not reconstruct or duplicate the supplied artwork');
    assert(words.some(t=>t.value==='SALES · PAYMENTS · STATEMENTS'));
    assert(Math.abs(logo.w/logo.h-6118/1795)<.005,'Approved artwork keeps its aspect ratio');
    assert(Math.abs(logo.y+logo.h/2-24.5)<.01,'Complete logo centred within banner');
    const signature=JSON.stringify({logo:{...logo,page:0},words:words.map(t=>({...t,page:0}))});
    reference??=signature;assert.equal(signature,reference,'Identical banner on '+pdf.name+' page '+pageNo);
   }
  }
  assert(audit.filter(p=>p.pages>1).length>=3,'Audit includes continuation pages');
  assert.deepEqual(errors,[]);console.log('PASS six PDF formats, approved sign artwork and identical banners on every page:',audit.map(p=>({name:p.name,pages:p.pages})));
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
