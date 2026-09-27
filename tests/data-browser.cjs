/* Reports UI uses synthetic records and blocked networking, including downloads. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  const {page,context,errors}=await open(browser,{signedIn:true});await settled(page);
  await page.evaluate(()=>{goToTab('data');});
  await page.waitForFunction(()=>!document.querySelector('#p-data').hasAttribute('aria-busy'));
  // Complete existing legacy relist normalization before checking read-only UI.
  await page.waitForFunction(()=>window.__rtFeaturesReady);
  await page.evaluate(()=>_cashEventsAll());
  const before=await page.evaluate(()=>JSON.stringify(DB));
  for(const width of [320,390,768,1024,1440,1920]){
   await page.setViewportSize({width,height:1080});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Data fits '+width);
   assert(await page.locator('#p-data .data-card button:visible,#p-data select:visible,#p-data input:visible').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})),'Controls fit '+width);
   if([390,1440].includes(width)){
    const rectangles=()=>page.locator('#p-data .data-report,#p-data .data-support-grid>.data-card').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height];}));
    const loaded=await rectangles();
    await page.evaluate(()=>{document.getElementById('p-data').innerHTML=_routeSkeletonMarkup('data',false);});
    const pending=await rectangles();assert.equal(pending.length,loaded.length);
    pending.forEach((r,i)=>r.forEach((v,j)=>assert(Math.abs(v-loaded[i][j])<2,'Data skeleton matches card geometry')));
    await page.evaluate(()=>renderData());
   }
   if(process.env.RETRADE_CAPTURE&&[390,1440].includes(width))await page.screenshot({path:process.env.RETRADE_CAPTURE+'/data-'+width+'.png',fullPage:true});
  }
  // Real CSV report download from each report card.
  for(const title of ['Monthly sales','Annual summary','Current stock','Custom date range']){
   const card=page.locator('.data-report').filter({has:page.getByRole('heading',{name:title,exact:true})});
   const downloadPromise=page.waitForEvent('download');await card.getByRole('button',{name:'CSV',exact:true}).click();
   const dl=await downloadPromise;assert(dl.suggestedFilename().endsWith('.csv'));assert.equal(await dl.failure(),null);
  }
  const backupPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download backup',exact:true}).click();
  const backup=await backupPromise;assert(backup.suggestedFilename().endsWith('.json'));assert.equal(await backup.failure(),null);
  for(const [label,id] of [['Restore backup','import-file'],['Import items','import-excel']]){
   const chooserPromise=page.waitForEvent('filechooser');await page.getByRole('button',{name:label,exact:true}).click();
   const chooser=await chooserPromise;assert.equal(await chooser.element().getAttribute('id'),id);
  }
  await page.locator('.data-maintenance>summary').click();
  await page.getByRole('button',{name:'Run data check',exact:true}).click();
  assert((await page.locator('#integrity-check-out').innerText()).length>0);
  assert((await page.locator('#data-return-check').innerText()).length>0);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(DB))),JSON.parse(before),'Reports and checks preserve normalized records');
  await page.getByText('Device diagnostics',{exact:true}).click();
  await page.getByText('On-device error log',{exact:true}).waitFor({state:'visible'});
  await page.getByRole('button',{name:'Activity log',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.page.on').id==='p-activity');
  await page.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');document.body.setAttribute('data-theme','dark');});
  // Empty data has no phantom monthly export.
  await page.evaluate(()=>{DB={trips:[],expenses:[]};goToTab('data');renderData();});
  assert(await page.locator('.data-report').first().getByRole('button',{name:'CSV',exact:true}).isDisabled());
  // Desktop overview puts the statement before reconciliation, alongside the estimate.
  // Narrow layouts retain the established single-column reading order.
  for(const width of [390,1024,1200,1440,1920]){
   await page.setViewportSize({width,height:1080});
   await page.evaluate(()=>{goToTab('tax');setTaxWorkspaceView('overview');});
   await page.waitForFunction(()=>!document.querySelector('#p-tax').hasAttribute('aria-busy'));
   const geometry=await page.evaluate(()=>{const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width};};return {compare:r('tax-comparison'),income:r('tax-income-expenses'),stock:r('tax-purchases'),settings:r('tax-estimate')};});
   if(width>=1281){
    assert(Math.abs(geometry.income.x-geometry.compare.x)<2,'Statement and reconciliation share the wide column');
    assert(geometry.compare.y>=geometry.income.bottom,'Reconciliation follows the statement');
    assert(geometry.settings.x>=geometry.income.right-2,'Estimate occupies the right rail');
    assert(Math.abs(geometry.settings.y-geometry.income.y)<2,'Estimate and statement align');
    assert(Math.abs(geometry.stock.x-geometry.settings.x)<2,'Payment detail stays in the right rail');
    assert(geometry.stock.y>=geometry.settings.bottom&&geometry.stock.y-geometry.settings.bottom<25,'Payment detail follows estimate');
    assert(geometry.settings.width<geometry.income.width,'Statement has the most space');
    const exportRect=await page.locator('.tax-export-bottom').boundingBox();
    const layoutRect=await page.locator('.tax-layout').boundingBox();
    assert(Math.abs(exportRect.width-layoutRect.width)<2,'Export fills the bottom row');
    assert(exportRect.y>=layoutRect.y+layoutRect.height,'Export follows all content');
    assert(await page.locator('#tax-income-expenses').evaluate(e=>e.open),'Desktop income detail is visible');
    assert(await page.locator('#tax-estimate').evaluate(e=>e.open),'Desktop estimate is visible');
    assert(await page.locator('#tax-purchases').evaluate(e=>e.open),'Desktop payment detail is visible');
   }else{
    assert(geometry.income.y>=geometry.compare.bottom,'Mobile/tablet keeps income below comparison');
    assert(geometry.stock.y>=geometry.income.bottom,'Mobile/tablet keeps payment detail after income');
   }
   if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/tax-'+width+'.png',fullPage:true});
   await page.getByRole('button',{name:'Monthly',exact:true}).click();
   const size=await page.evaluate(()=>({card:document.getElementById('tax-monthly-summary').getBoundingClientRect().width,layout:document.querySelector('.tax-layout').getBoundingClientRect().width}));
   assert(Math.abs(size.card-size.layout)<2,'Monthly fills width');
  }
  assert.deepEqual(errors,[]);await context.close();console.log('PASS Data responsive controls, CSV/backup downloads, imports, checks, Activity and desktop Tax');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
