/* Audit v1.2: first navigation during module loading, route-specific loading
   surfaces, stable chrome and truthful sync status. Synthetic local data only. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  const early=await open(browser,{signedIn:true,mobile:true,slowFeatures:true});
  await early.page.waitForFunction(()=>window.__rtLaunchSettled&&!window.__rtFeaturesReady);
  await early.page.evaluate(()=>goToTab('accounts'));
  await early.page.waitForTimeout(400);
  assert(await early.page.locator('#p-accounts .rt-route-skeleton').isVisible(),'Early Partners navigation waits for its presentation owners');
  await early.page.evaluate(()=>{goToTab('cash');goToTab('monthly');});
  await settled(early.page);
  await early.page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));
  assert.equal(await early.page.locator('.page.on').getAttribute('id'),'p-monthly','Late module completion cannot restore an abandoned route');
  assert.deepEqual(early.errors,[]);await early.context.close();
  console.log('PASS early navigation and cancelled destination during slow feature loading');

  for(const mobile of [true,false]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   for(const tab of ['summary','stock','monthly','accounts','cash','tax','data','returns','scrapped','activity','search','expenses','runs']){
    await page.evaluate(t=>goToTab(t),tab);
    await page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));
    const state=await page.evaluate(()=>{
     const fab=document.querySelector('.fab-main'),nav=document.getElementById(innerWidth<701?'bottom-nav':'side-nav');
     const r=fab.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
     return {pages:document.querySelectorAll('.page.on').length,hit:fab===hit||fab.contains(hit),nav:nav.getClientRects().length>0,overflow:document.documentElement.scrollWidth>innerWidth+1,line:getComputedStyle(document.querySelector('.page.on'),'::before').content};
    });
    assert.equal(state.pages,1,tab+' has one active page');assert(state.hit,tab+' FAB receives taps');assert(state.nav,tab+' retains navigation');
    assert(!state.overflow,tab+' does not overflow');assert(['none','normal'].includes(state.line),tab+' has no secondary blinking line');
   }
   // Force a meaningful wait to inspect the actual destination's loading layout.
   for(const [tab,view,selector,count] of [['monthly','detail','.sales-kpis-v2 .kpi',4],['monthly','grid','.monthly-charts-row',1],['tax',null,'.tax-kpi:visible',mobile?3:4],['cash',null,'.rt-cash-primary',1]]){
    await page.evaluate(({tab,view})=>{if(view)MONTHLY_VIEW=view;_deactivatePages();const p=document.getElementById('p-'+tab);p.innerHTML='';p.classList.add('on');_showRoutePending(tab);}, {tab,view});
    await page.waitForSelector('.rt-route-skeleton');
    assert.equal(await page.locator('.rt-route-skeleton '+selector).count(),count);
    if(view==='grid')assert(await page.locator('#monthly-profitability-svg').evaluate(e=>e.getBoundingClientRect().height>=220),'Yearly skeleton preserves full chart height');
    assert(!/£\s*\d/.test(await page.locator('.rt-route-skeleton').innerText()),'Loading does not invent money');
    if(view==='grid')assert(await page.locator('.monthly-charts-row').evaluate(e=>e.getBoundingClientRect().top<document.querySelector('.mgrid').getBoundingClientRect().top),'Yearly chart precedes month cards');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Loading layout fits viewport');
    if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/pending-'+tab+'-'+(view||'')+'-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
    await page.evaluate(t=>{({monthly:renderMonthlyPage,tax:renderTax,cash:renderCash})[t]();document.getElementById('p-'+t).removeAttribute('aria-busy');_syncFabVisibility();},tab);
    if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/ready-'+tab+'-'+(view||'')+'-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
   }
   await page.evaluate(()=>{_syncing=true;_lastSyncError=null;_refreshSideNavSync('saving');});
   if(mobile){await page.waitForSelector('#mobile-sync-badge.saving:not(.is-delayed)');assert.equal(await page.locator('#mobile-sync-badge .rt-sync-mark').evaluate(e=>getComputedStyle(e).animationName),'rtSyncTurn');}
   await page.evaluate(()=>{_syncStatusStarted=Date.now()-16000;_reconcileSyncStatus();});
   if(mobile){await page.waitForSelector('#mobile-sync-badge.waiting');assert.equal(await page.locator('#mobile-sync-badge .rt-sync-mark').evaluate(e=>getComputedStyle(e).animationName),'none','Long waits stop spinning without claiming cloud success');}
   await page.evaluate(()=>{_syncing=false;_refreshSideNavSync('synced');});
   assert(await page.locator('#mobile-sync-badge').evaluate(e=>e.classList.contains('synced')&&!e.classList.contains('saving')),'Completed sync becomes a static confirmation');
   assert.deepEqual(errors,[]);await context.close();console.log('PASS route chrome, current loading layouts and bounded sync indicator',mobile?'mobile':'desktop');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
