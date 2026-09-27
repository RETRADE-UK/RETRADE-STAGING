/* Loading/animation contract. Synthetic data only; no production requests. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  const {page,context,errors}=await open(browser,{signedIn:true,mobile:true});await settled(page);
  // A first route that finishes quickly must not build/flash a skeleton.
  await page.evaluate(()=>{goToTab('stock');});
  await page.waitForFunction(()=>!document.querySelector('#p-stock').hasAttribute('aria-busy'));
  assert.equal(await page.locator('#p-stock .rt-route-skeleton').count(),0);
  const warm=await page.evaluate(()=>{window.__warmNode=document.querySelector('#p-stock').firstElementChild;_showRoutePending('stock');return true;});
  await page.waitForTimeout(380);
  assert(warm&&await page.evaluate(()=>document.querySelector('#p-stock').firstElementChild===window.__warmNode),'Warm refresh keeps real DOM');
  await page.evaluate(()=>_clearRoutePending(document.getElementById('p-stock')));
  const routes=['summary','stock','monthly','yearly','accounts','cash','tax','data','returns','scrapped','activity','search','expenses','runs'];
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});
   await page.waitForTimeout(400);
   for(const route of routes){
    assert(await page.evaluate(route=>{const name=route==='yearly'?'monthly':route;_deactivatePages();const p=document.getElementById('p-'+name);p.classList.add('on');const before=JSON.stringify(DB);const html=_routeSkeletonMarkup(name,route==='yearly');const unchanged=before===JSON.stringify(DB);p.innerHTML=html;return unchanged;},route),'Skeleton construction is read-only');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' pending fits '+width);
    assert.equal(await page.locator('.page.on .rt-route-skeleton [inert]').count(),1);
    assert(!/£\s*\d/.test(await page.locator('.page.on .rt-route-skeleton').innerText()),'No invented amounts');
    if(route==='stock'||route==='monthly'){
     assert.equal(await page.locator('.page.on .rt-route-skeleton .rt-overview .kpi').count(),4);
     assert(await page.locator('.page.on .rt-overview .kpi').nth(1).evaluate(e=>e.classList.contains('rt-overview-primary')));
    }
    if(route==='stock')assert(await page.evaluate(()=>document.querySelector('.stock-state-seg').getBoundingClientRect().top>=document.querySelector('.stock-kpis').getBoundingClientRect().bottom));
    if(route==='stock'||route==='accounts')assert(await page.locator('.page.on .rt-pending-value').evaluateAll(es=>es.filter(e=>e.getClientRects().length).every(e=>e.getBoundingClientRect().width>50)),'Amount placeholders retain readable widths');
    if(route==='accounts'){
     assert.equal(await page.locator('.page.on .rt-route-skeleton .rt-accounts-overview>div').count(),3);
     assert(await page.locator('.page.on .rt-accounts-overview>div:first-child').evaluate(e=>getComputedStyle(e).backgroundColor!==getComputedStyle(e.querySelector('.rt-pending-value')).backgroundColor),'Outstanding placeholder contrasts with its strip');
    }
    if(route==='tax')assert(await page.locator('.tax-export-bottom').evaluate(e=>e.closest('.tax-workspace').querySelector('[inert]').lastElementChild===e));
    if(process.env.RETRADE_CAPTURE&&width===390)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/skeleton-'+route+'.png'});
   }
  }
  // Delayed placeholders cancel cleanly; an abandoned page cannot reappear.
  await page.evaluate(()=>{const p=document.getElementById('p-stock');p.innerHTML='';_deactivatePages();p.classList.add('on');_showRoutePending('stock');});
  assert.equal(await page.locator('#p-stock .rt-route-skeleton').count(),0);
  await page.waitForSelector('#p-stock .rt-route-skeleton');
  await page.evaluate(()=>{_showRoutePending('cash');_deactivatePages();document.getElementById('p-cash').classList.add('on');});
  assert.equal(await page.evaluate(()=>document.getElementById('p-stock').__rtSlowTimer),0);
  await page.evaluate(()=>_clearRoutePending(document.getElementById('p-cash')));
  // Refund endpoint joins the blue/green endpoints, never the earlier history.
  for(const reduced of [false,true]){
   await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
   await page.setViewportSize({width:390,height:900});
   await page.evaluate(()=>{_deactivatePages();document.getElementById('p-monthly').classList.add('on');MONTHLY_VIEW='grid';MONTHLY_PERIOD='fy:'+_currentFYStart();renderMonthlyPage();});
   await page.waitForSelector('#monthly-profitability-svg .rt-chart-col',{state:'attached'});
   await page.waitForTimeout(300);
   await page.evaluate(()=>{window.__rtSalesMotionReplayToken=(window.__rtSalesMotionReplayToken||0)+1;renderMonthlyProfitabilityChart(()=>({totalRev:400,grossProfit:180,netProfit:150,returnsAmt:30,returnedCount:1}));});
   await page.waitForSelector('#monthly-profitability-svg .rt-sales-endpoint-point',{state:'attached'});
   if(!reduced){
    let samples=0;
    while(true){
     const state=await page.locator('#monthly-profitability-svg').evaluate(svg=>({endpoint:svg.classList.contains('rt-sales-endpoint-stage'),visible:getComputedStyle(svg.querySelector('.rt-sales-endpoint-point')).visibility,dashes:[...svg.querySelectorAll('.rt-chart-partial-dash')].every(d=>d.classList.contains('rt-sales-dash-on'))}));
     if(state.endpoint){assert(state.dashes,'Every forecast dash arrives before endpoint');break;}
     assert.equal(state.visible,'hidden','Refund endpoint waits for final stage');samples++;assert(samples<70,'Animation finishes');await page.waitForTimeout(75);
    }
    assert(samples>2,'Observed hidden endpoint during animation');
   }
   await page.waitForFunction(()=>document.querySelector('#monthly-profitability-svg').classList.contains('rt-sales-sequence-complete'));
   assert.equal(await page.locator('.rt-sales-endpoint-point').evaluate(e=>getComputedStyle(e).visibility),'visible');
   assert.equal(await page.locator('.mcard[aria-current="date"]').count(),1);
  }
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS responsive pending routes, inert/read-only skeletons, warm/fast/cancelled waits and refund endpoint sequencing');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
