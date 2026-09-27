/* Compact chrome status and atomic Sales routing, synthetic data/network only. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  const {page,context,errors}=await open(browser,{signedIn:true,mobile:true});await settled(page);
  await page.waitForFunction(()=>window.__rtFeaturesReady);
  for(const [width,id] of [[320,'mobile-sync-badge'],[800,'tablet-sync-status'],[1440,'side-nav-sync']]){
   await page.setViewportSize({width,height:960});await page.evaluate(()=>{goToTab('summary');_syncing=false;_lastSyncError=null;_refreshSideNavSync('synced');});
   const badge=page.locator('#'+id);await badge.waitFor({state:'visible'});
   assert.equal(await page.locator('.rt-sync-status:visible').count(),1,'One visible status');
   const box=await badge.boundingBox();assert(box.width<=44&&box.width>=40);
   await page.evaluate(()=>{_syncing=true;_refreshSideNavSync('saving');});
   assert(await badge.evaluate(e=>getComputedStyle(e.querySelector('.rt-sync-mark')).animationName==='none'),'Short saves do not spin');
   await page.waitForFunction(id=>!document.getElementById(id).classList.contains('is-delayed'),id);
   assert.equal(await badge.locator('.rt-sync-mark').evaluate(e=>getComputedStyle(e).animationName),'rtSyncTurn');
   assert.deepEqual(await badge.boundingBox(),box,'Sync does not shift chrome');
   await page.evaluate(()=>{_syncStatusStarted=Date.now()-16000;_reconcileSyncStatus();});
   assert(await badge.evaluate(e=>e.classList.contains('waiting')));assert.equal(await badge.locator('.rt-sync-mark').evaluate(e=>getComputedStyle(e).animationName),'none');
   await badge.click();assert(await page.getByRole('heading',{name:'Sync pending',exact:true}).isVisible());
   assert(await page.locator('#rt-sync-details').evaluate(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight;}));
   await page.keyboard.press('Escape');assert(await badge.evaluate(e=>document.activeElement===e));
   await page.evaluate(()=>{_syncing=false;_lastSyncError='Synthetic failure';window.__syncRetries=0;window.__realRetry=retradeForceResync;retradeForceResync=()=>__syncRetries++;_refreshSideNavSync('error');});
   await badge.click();await page.getByRole('button',{name:'Retry sync',exact:true}).click();assert.equal(await page.evaluate(()=>__syncRetries),1);
   await page.evaluate(()=>{retradeForceResync=__realRetry;_lastSyncError=null;_refreshSideNavSync('synced');});
   assert(await badge.evaluate(e=>e.classList.contains('synced')));assert.equal(await badge.locator('.rt-sync-mark').evaluate(e=>getComputedStyle(e).animationName),'none');
   await page.keyboard.press('Escape');
   await page.evaluate(()=>document.activeElement?.blur());
   if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/sync-'+width+'.png'});
  }
  await context.setOffline(true);await page.waitForFunction(()=>document.getElementById('side-nav-sync').classList.contains('offline'));
  await context.setOffline(false);await page.waitForFunction(()=>document.getElementById('side-nav-sync').classList.contains('synced'));
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{_syncing=true;_refreshSideNavSync('saving');});await page.waitForTimeout(1300);
  assert.equal(await page.locator('#side-nav-sync .rt-sync-mark').evaluate(e=>getComputedStyle(e).animationName),'none');
  await page.evaluate(()=>{_syncing=false;_refreshSideNavSync('synced');});
  // A stored Yearly preference must never become the default entry route.
  await page.evaluate(()=>{localStorage.setItem(_SK.monthV,'grid');localStorage.setItem(_SK.lastActive,String(Date.now()));MONTHLY_VIEW='grid';_loadUIState();});
  assert.equal(await page.evaluate(()=>MONTHLY_VIEW),'detail');
  for(const width of [390,800,1440]){
   await page.setViewportSize({width,height:960});
   await page.evaluate(()=>{goToTab('monthly');});await page.waitForFunction(()=>!document.getElementById('p-monthly').hasAttribute('aria-busy'));
   await page.evaluate(()=>backToMonthlyGrid(false));await page.waitForFunction(()=>document.getElementById('p-monthly').dataset.rtSalesView==='grid'&&!document.getElementById('p-monthly').hasAttribute('aria-busy'));
   // Repeated navigation clicks toggle; entry from other pages still defaults to Monthly.
   const nav=page.locator('[data-tab="monthly"]:visible').first();
   await nav.click();await page.waitForFunction(()=>document.getElementById('p-monthly').dataset.rtSalesView==='detail'&&!document.getElementById('p-monthly').hasAttribute('aria-busy'));
   await nav.click();await page.waitForFunction(()=>document.getElementById('p-monthly').dataset.rtSalesView==='grid'&&!document.getElementById('p-monthly').hasAttribute('aria-busy'));
   // Delay rendering after a cached Yearly visit; inspect before and during wait.
   await page.evaluate(()=>{goToTab('stock');window.__realQueue=_queueInteractionRender;_queueInteractionRender=fn=>{window.__delayedRender=fn;};goToTab('monthly');});
   assert.equal(await page.locator('#p-monthly .fy-section').count(),0,'Cached Yearly never flashes');
   assert.equal(await page.evaluate(()=>MONTHLY_VIEW),'detail');
   assert.equal(await page.evaluate(()=>SELECTED_MONTH),await page.evaluate(()=>currentMonthKey()));
   await page.waitForSelector('#p-monthly .rt-route-skeleton[data-view="monthly"]');
   assert.equal(await page.locator('#p-monthly .rt-route-skeleton[data-view="yearly"]').count(),0);
   await page.evaluate(()=>{_queueInteractionRender=__realQueue;__delayedRender();});
   assert.equal(await page.locator('#p-monthly').getAttribute('data-rt-sales-view'),'detail');
   // Explicit Yearly remains available and owns its corresponding placeholder.
   await page.evaluate(()=>{_queueInteractionRender=fn=>{window.__delayedRender=fn;};backToMonthlyGrid(false);});
   await page.waitForSelector('#p-monthly .rt-route-skeleton[data-view="yearly"]');
   await page.evaluate(()=>{_queueInteractionRender=__realQueue;__delayedRender();});
   assert.equal(await page.locator('#p-monthly').getAttribute('data-rt-sales-view'),'grid');
   await page.evaluate(()=>{goToMonth('JUL-26');});
   assert.equal(await page.evaluate(()=>SELECTED_MONTH),'JUL-26');
   const staleMonth=await page.evaluate(()=>{goToTab('monthly');return !!document.querySelector('#p-monthly #month-list');});
   assert.equal(staleMonth,false,'A different cached month is removed before paint');
   await page.waitForFunction(()=>!document.getElementById('p-monthly').hasAttribute('aria-busy'));
  }
  assert.deepEqual(errors,[]);await context.close();console.log('PASS compact sync states, retry, offline/reduced motion, Monthly entry and matching Sales skeletons');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
