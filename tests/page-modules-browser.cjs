/* Real entrypoint, isolated fixtures: first paint, lazy pages and stale load intents. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
const {assets,root}=require('../scripts/assets.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const engine=process.argv.includes('--webkit')?webkit:chromium;
 const browser=await engine.launch({headless:true,...(engine===chromium&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{
  for(const mobile of [false,true]){
   const {page,context,errors,missingAssets}=await open(browser,{signedIn:true,partnerData:true,mobile,reduced:true});
   await settled(page);
   const startup=await page.evaluate(()=>({tax:__rtViewReady('tax'),data:__rtViewReady('data'),item:__rtViewReady('item'),
    reveal:__rtLaunchPerf.startedAt+__rtLaunchPerf.revealAt,
    views:performance.getEntriesByType('resource').filter(r=>r.name.includes('/src/views/')).map(r=>({url:r.name,start:r.startTime}))}));
   assert.equal(startup.tax,false);assert.equal(startup.data,false);assert.equal(startup.item,true);
   assert(startup.views.length>=6);assert(startup.views.every(r=>r.start>=startup.reveal-10),'Secondary view transfers start after Dashboard reveal');
   let taxRequests=0,dataRequests=0;
   await context.route('**/src/views/tax.js?*',async route=>{taxRequests++;await delay(800);await route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,assets.views.tax.file))});});
   await page.evaluate(()=>{window.__viewOriginalUser=_currentUserId;goToTab('tax');_currentUserId='changed-user';});
   await page.waitForFunction(()=>__rtViewReady('tax'));
   assert.equal(await page.evaluate(()=>typeof window._taxPeriodReports),'undefined','Changed user cancels a delayed route render');
   await page.evaluate(()=>{_currentUserId=__viewOriginalUser;goToTab('tax');});
   await page.locator('#tax-period-reports .tax-report-download').first().waitFor();
   assert.equal(taxRequests,1);
   await context.route('**/src/views/data.js?*',async route=>{
    dataRequests++;if(dataRequests===1)return route.abort();
    await delay(800);await route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,assets.views.data.file))});
   });
   await page.evaluate(()=>goToTab('data'));
   const retry=page.locator('#p-data .rt-view-error').getByRole('button',{name:'Try again'});await retry.waitFor();
   await retry.click();await page.evaluate(()=>goToTab('stock'));
   await page.waitForFunction(()=>__rtViewReady('data'));
   assert.equal(await page.locator('.page.on').getAttribute('id'),'p-stock');
   assert.equal(await page.locator('#p-data .rt-view-error').count(),1,'Hidden route is not rebuilt after leaving');
   await page.evaluate(()=>goToTab('data'));await page.locator('#p-data .data-report').first().waitFor();
   assert.equal(dataRequests,2,'Retry succeeds once; revisits reuse the loaded module');
   assert.deepEqual(errors,[]);assert.deepEqual(missingAssets,[]);
   await context.close();console.log('PASS deferred first paint, lazy Tax/Data, user guard, failed load, retry and navigation cancellation',mobile?'mobile':'desktop');
  }
  const early=await open(browser,{signedIn:true,partnerData:true,mobile:true,reduced:true});let itemRequests=0;
  await early.context.route('**/src/views/item.js?*',async route=>{itemRequests++;await delay(1600);await route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,assets.views.item.file))});});
  await early.page.waitForFunction(()=>window.__rtLaunchSettled&&!__rtViewReady('item'));
  const expected=await early.page.evaluate(()=>{
   const key=currentMonthKey(),items=DB[key].filter(i=>String(i.id).startsWith('audit-'));
   openItemPage(key,items[0].id);openItemPage(key,items[1].id);return items[1].item;
  });
  await early.page.waitForFunction(expected=>document.querySelector('#p-item .ip-title')?.textContent===expected,expected);
  await settled(early.page);assert.equal(itemRequests,1);assert.equal(await early.page.locator('#p-item .ip-title').innerText(),expected);
  assert.deepEqual(early.errors,[]);assert.deepEqual(early.missingAssets,[]);await early.context.close();
  console.log('PASS early item opening shares the background request and preserves the latest selection');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
