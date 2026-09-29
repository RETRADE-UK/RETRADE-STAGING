/* Actual downloads with local copies of the existing export libraries. No external data requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),XLSX=require('xlsx');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{for(const mobile of [true,false]){
  const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
  await context.route('**/jspdf.umd.min.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'))}));
  await context.route('**/xlsx.full.min.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'))}));
  await page.evaluate(()=>{goToTab('tax');renderTax();});
  // Wait for the app's deferred legacy-record normalisation before checking export immutability.
  await page.evaluate(()=>window.dispatchEvent(new Event('retrade:data-ready')));
  const initial=await page.evaluate(()=>JSON.stringify([DB,_accounts,_taxExportData]));
  const button=page.getByRole('button',{name:'Download tax summary',exact:true});
  const dialog=page.getByRole('dialog',{name:'Download tax summary'});
  let downloads=0;page.on('download',()=>downloads++);
  await button.click();assert.equal(downloads,0,'Opening the chooser never downloads CSV immediately');
  for(const label of ['PDF','CSV','Excel'])assert(await dialog.getByRole('button',{name:new RegExp('^'+label)}).isVisible());
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  assert(await button.evaluate(e=>e===document.activeElement),'Escape restores focus');
  await button.click();await dialog.getByRole('button',{name:'Cancel'}).click();await dialog.waitFor({state:'detached'});assert.equal(downloads,0);
  for(const width of mobile?[320,390,768]:[1440]){
   await page.setViewportSize({width,height:900});await button.click();
   const r=await dialog.boundingBox();assert(r.x>=0&&r.x+r.width<=width+1,'Chooser fits '+width);assert(Math.abs(r.x-(width-r.width)/2)<2&&r.y>100,'Chooser is centred');
   if(process.env.RETRADE_CAPTURE)await page.screenshot({path:path.join(process.env.RETRADE_CAPTURE,'tax-export-chooser-'+width+'.png')});
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  }
  const data=await page.evaluate(()=>_taxExportData);
  for(const [label,extension] of [['PDF','pdf'],['CSV','csv'],['Excel','xlsx']]){
   await button.click();const pending=page.waitForEvent('download');
   await dialog.getByRole('button',{name:new RegExp('^'+label)}).click();
   const download=await pending;assert.equal(download.suggestedFilename(),'RETRADE_Tax_'+data.year.replace('/','-')+'.'+extension);
   const bytes=fs.readFileSync(await download.path());assert(bytes.length>100);
   if(extension==='pdf'){
    assert(bytes.subarray(0,5).toString()==='%PDF-');assert(bytes.includes(Buffer.from('TAX SUMMARY')));
    assert(bytes.includes(Buffer.from('Total estimated tax')));assert(bytes.includes(Buffer.from(data.box23.toFixed(2))),'PDF includes current profit');
   }else if(extension==='csv'){
    const csv=bytes.toString('utf8');assert(csv.includes('Self Assessment summary'));assert(csv.includes(data.box23.toFixed(2)));assert(csv.includes(data.year));
   }else{
    const wb=XLSX.read(bytes,{type:'buffer',cellNF:true}),ws=wb.Sheets['Tax summary'];assert(ws);
    const rows=XLSX.utils.sheet_to_json(ws,{header:1});
    const profit=rows.findIndex(r=>r[0]==='Taxable profit / (loss)');assert.equal(rows[profit][1],data.box23);assert.equal(ws['B'+(profit+1)].t,'n');assert(ws['B'+(profit+1)].z.includes('£'));
    const count=rows.findIndex(r=>r[0]==='Number of sales');assert.equal(rows[count][1],data.saleCount);assert.equal(ws['B'+(count+1)].z,'0');
   }
   if(process.env.RETRADE_CAPTURE)await download.saveAs(path.join(process.env.RETRADE_CAPTURE,'tax-summary-'+(mobile?'mobile':'desktop')+'.'+extension));
  }
  assert.equal(downloads,3);assert.equal(await page.evaluate(()=>JSON.stringify([DB,_accounts,_taxExportData])),initial,'Downloads do not change Tax figures or business records');
  // Capture the selected year/method before an asynchronous library load or rerender.
  await button.click();await page.evaluate(()=>{window._taxExportData={...window._taxExportData,year:'2099/00',box23:999999};});
  const snapshotDownload=page.waitForEvent('download');await dialog.getByRole('button',{name:/^CSV/}).click();
  assert.equal((await snapshotDownload).suggestedFilename(),'RETRADE_Tax_'+data.year.replace('/','-')+'.csv');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS Tax format chooser, actual PDF/CSV/XLSX downloads, numeric cells, snapshot and no mutations',mobile?'mobile':'desktop');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
