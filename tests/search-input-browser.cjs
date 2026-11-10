/* Real app, synthetic inventory only. The startup harness blocks external I/O. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const wk=process.argv.includes('--webkit');
 const browser=await(wk?webkit:chromium).launch({headless:true,...(!wk?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{
  for(const width of [320,390,1440]){
   const mobile=width<600;
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>{
    const item=(id,name,price)=>({id,gid:'R-SEARCH-'+id,item:name,category:'Other',state:'sold',dateSourced:'2026-10-01',dateListed:'2026-10-02',dateSold:'2026-10-03',salePrice:price,costPrice:10,salePlatform:'fb',defaultPlatform:'fb',soldOnPlatform:'fb',postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:0,parts:[],returnHistory:[]});
    DB={'OCT-26':[item('camera','Camera body',100),item('lens','Lens kit',50)],trips:[],expenses:[]};
    _accounts=[];_jobLots=[];_jobLotItems=[];
    window.__searchBefore=JSON.stringify(DB);
    goToTab('stock',null,{stockState:'all'});
   });
   await page.waitForFunction(()=>document.querySelector('.page.on')?.id==='p-stock'&&!document.getElementById('p-stock').hasAttribute('aria-busy'));
   // Enter through the same mobile field the user reported, not only a renderer call.
   if(mobile){
    await page.locator('.mtb-search').click();
    const source=page.locator('#global-search-mobile');await source.fill('camera');await source.press('Enter');
   }else{
    await page.evaluate(()=>openSearchPage('camera'));
   }
   const input=page.locator('#search-results-query');
   await input.waitFor({state:'visible'});
   assert.equal(await input.inputValue(),'camera');
   assert.equal(await page.locator('[data-testid="search-total-revenue"]').innerText(),'£100.00');
   const originalBack=await page.evaluate(()=>_preSearchPage);

   await input.fill('lens');await input.press('Enter');
   await page.waitForFunction(()=>document.querySelector('[data-testid="search-results-summary"]')?.textContent.includes('"lens"'));
   assert(await input.isVisible(),'Input remains visible after Enter');
   assert.equal(await input.inputValue(),'lens');
   assert.equal(await page.locator('[data-testid="search-total-revenue"]').innerText(),'£50.00');
   assert.equal(await page.locator('#p-search .item-row').count(),1);
   assert.equal(await page.locator('[data-testid="search-results-form"]').count(),1);
   assert.equal(await page.evaluate(()=>_preSearchPage),originalBack,'Repeated search preserves Back destination');
   for(const id of ['global-search','global-search-mobile','side-nav-global-search']){
    const field=page.locator('#'+id);if(await field.count())assert.equal(await field.inputValue(),'lens');
   }

   // A stock/sync refresh must not overwrite a half-written replacement query.
   await input.fill('camera draft');await input.evaluate(e=>e.setSelectionRange(3,6));
   await page.evaluate(()=>renderSearchResults('lens'));
   assert.equal(await input.inputValue(),'camera draft');
   assert(await input.evaluate(e=>document.activeElement===e&&e.selectionStart===3&&e.selectionEnd===6),'Focus and caret survive refresh');

   await input.fill('no-such-product');await input.press('Enter');
   assert(await input.isVisible());assert.equal(await page.locator('#p-search .item-row').count(),0);
   assert((await page.locator('#p-search').innerText()).includes('No results'));
   await input.fill('camera');await page.locator('[data-testid="search-results-form"] button').click();
   assert.equal(await input.inputValue(),'camera');assert.equal(await page.locator('#p-search .item-row').count(),1);
   await input.fill('');await input.press('Enter');assert(await input.isVisible());
   assert.equal(await page.locator('#p-search .item-row').count(),1,'Empty submit leaves existing results available');
   await input.fill('lens');await input.press('Enter');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Search form fits '+width+'px');
   const box=await input.boundingBox();assert(box.width>100&&box.height>=44);
   assert.equal(await input.evaluate(e=>getComputedStyle(e).fontSize),'16px','Avoid iPhone auto-zoom');
   assert.equal(await page.evaluate(()=>JSON.stringify(DB)),await page.evaluate(()=>__searchBefore),'Search never changes financial records');
   await page.locator('#p-search button[onclick="exitSearchPage()"] ').click();
   await page.waitForFunction(expected=>document.querySelector('.page.on')?.id===expected,originalBack);
   assert.deepEqual(errors,[]);
   console.log('PASS persistent editable search',wk?'WebKit':'Chromium',width);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
