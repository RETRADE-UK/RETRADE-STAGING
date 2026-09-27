/* Pointer-driven regressions: exercise visible controls, never invoke their
   handlers directly. Data/auth/network stay isolated by the startup harness. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const mobile of [true,false]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   const act=async selector=>{const el=page.locator(selector);await el.waitFor({state:'visible'});await (mobile?el.tap():el.click());};
   const nav=tab=>`${mobile?'#bottom-nav':'#side-nav'} [data-tab="${tab}"]`;
   const route=async tab=>{await act(nav(tab));await page.waitForFunction(t=>document.querySelector('.page.on')?.id==='p-'+t&&!document.querySelector('.page.on').hasAttribute('aria-busy'),tab);};
   const assertHit=async selector=>{
    const hit=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {top:top?.outerHTML.slice(0,220),hit:el===top||el.contains(top),x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight};});
    assert(hit.hit&&hit.x>=0&&hit.y>=0&&hit.right<=hit.w&&hit.bottom<=hit.h,selector+' must receive a tap at its on-screen centre: '+JSON.stringify(hit));
   };
   // Closed toast/option layers must not intercept the main action.
   await page.evaluate(()=>toast('Sync status notification',''));
   for(const action of ['list','sourced','expense','trip']){
    await assertHit('.fab-main');await act('.fab-main');await page.waitForSelector('#fab-dial.open');
    const selector=`#fab-dial-options button[onclick="runFabOption('${action}')"]`;
    await page.locator(selector).click({trial:true});await assertHit(selector);await act(selector);
    await page.waitForSelector('#slide-panel.on');
    const input=page.locator('#panel-content input:not([type="hidden"]):not([disabled]):not([aria-hidden="true"])').first();
    await input.click();assert(await input.evaluate(el=>document.activeElement===el),'Visible form field must focus');
    await act('#slide-panel [aria-label="Close panel"]');
    await page.waitForFunction(()=>!document.getElementById('slide-panel').classList.contains('on'));
    assert.equal(await page.evaluate(()=>document.body.style.position),'','Closing the form releases scrolling');
    assert(await page.locator('#fab-dial-options').evaluate(el=>el.inert),'Closed options are inert');
   }
   for(const tab of ['stock','monthly','summary'])await route(tab);
   await page.evaluate(()=>{document.body.style.minHeight='2400px';window.scrollTo(0,600);});
   await assertHit('.fab-main');await act('.fab-main');await route('stock');
   assert.equal(await page.locator('#fab-dial').evaluate(el=>el.classList.contains('open')),false,'Navigation dismisses the dial');
   await act('.fab-main');await act('.fab-main');
   assert.equal(await page.locator('#fab-backdrop').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
   await route('summary');
   if(mobile){
    await act('#bnt-more');await page.waitForSelector('#more-sheet',{state:'visible'});
    await act('#more-sheet [data-sheet-tab="tax"]');
    await page.waitForFunction(()=>document.querySelector('.page.on')?.id==='p-tax');
    await assertHit('.fab-main');await act('.fab-main');await page.waitForSelector('#fab-dial.open');await act('.fab-main');
    await route('summary');await assertHit('.fab-main');
    await act('.mtb-search');await page.locator('#global-search-mobile').click();await page.locator('#global-search-mobile').fill('Camera');await route('stock');
    await assertHit('.fab-main');
   }else{
    await act('#side-nav [data-tab="tax"]');await page.waitForFunction(()=>document.querySelector('.page.on')?.id==='p-tax');await route('summary');await assertHit('.fab-main');
   }
   assert.deepEqual(errors,[]);console.log('PASS pointer interactions',mobile?'mobile':'desktop');await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
