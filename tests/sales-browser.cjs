const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  const {page,context,errors}=await open(browser,{signedIn:true,mobile:true});await settled(page);
  await page.evaluate(()=>{
   DB={'SEP-26':[1,2,3].map(n=>({id:'sale-'+n,item:'Camera and accessories '+n,state:'sold',dateSourced:'2026-09-01',dateListed:'2026-09-02',dateSold:n===1?'2026-09-20':'2026-09-22',salePrice:100*n,costPrice:20,postage:0,shippingCost:0,parts:[],returnHistory:[],salePlatform:'fb'})),trips:[],expenses:[]};
   _accounts=[];SELECTED_MONTH='SEP-26';MONTHLY_VIEW='detail';MONTH_SORT='date-sold';MONTH_FILTER='all';MONTH_SEARCH='';
   goToTab('monthly');SELECTED_MONTH='SEP-26';renderMonth();
  });
  await page.waitForFunction(()=>!document.getElementById('p-monthly').hasAttribute('aria-busy'));
  assert.equal(await page.locator('#month-list .rt-sales-day').count(),2);
  assert.equal(await page.locator('#month-list .sales-date-tag').count(),3);
  assert((await page.locator('#month-list .rt-sales-day').first().innerText()).includes('Tue 22 Sep'));
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sales overflow '+width);
   for(const tag of await page.locator('#month-list .sales-date-tag').all())assert(await tag.isVisible(),'Date visible '+width);
   if(process.env.RETRADE_CAPTURE){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:process.env.RETRADE_CAPTURE+'/sales-'+width+'.png',fullPage:true});}
  }
  await page.locator('#p-monthly .sort-select').selectOption('profit');
  await page.waitForFunction(()=>!document.querySelector('#month-list .rt-sales-day'));
  assert.equal(await page.locator('#month-list .rt-sales-day').count(),0);
  assert.equal(await page.locator('#month-list .sales-date-tag').count(),3,'Dates survive non-date sorting');
  assert.equal(await page.evaluate(()=>_salesDayOrderCount([{isReturnAdjustment:true}])),0,'Return-only day is not an order');
  await page.locator('#month-list .item-row').first().click();
  assert(await page.locator('#p-item').evaluate(el=>el.classList.contains('on')),'Sales still opens item');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS Sales date groups, persistent tags, responsive layouts and item navigation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
