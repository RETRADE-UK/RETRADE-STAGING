const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  const {page,context,errors}=await open(browser,{signedIn:true,mobile:true});await settled(page);
  await page.evaluate(()=>{
   DB={'SEP-26':[1,2,3].map(n=>({id:'sale-'+n,item:'Camera and accessories '+n,state:'sold',dateSourced:'2026-09-01',dateListed:'2026-09-02',dateSold:n===1?'2026-09-20':'2026-09-22',salePrice:100*n,costPrice:20,postage:0,shippingCost:0,parts:[],returnHistory:[],salePlatform:'fb'})),trips:[],expenses:[]};
   _accounts=[];SELECTED_MONTH='SEP-26';MONTHLY_VIEW='detail';MONTH_SORT='date-listed';MONTH_FILTER='all';MONTH_SEARCH='';
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
   await page.locator('#p-monthly .select-toggle').click();
   assert(!await page.locator('#fab-dial').isVisible(),'Sales selection hides FAB before picking rows '+width);
   assert(await page.locator('#fab-dial').evaluate(e=>e.inert&&e.getAttribute('aria-hidden')==='true'));
   await page.locator('#p-monthly .sel-check').click();
   assert(!await page.locator('#fab-dial').isVisible(),'Selected totals keep FAB hidden '+width);
   await page.locator('#p-monthly .sel-exit').click();
   assert(await page.locator('#fab-dial').isVisible(),'Done restores Sales FAB '+width);
   if(process.env.RETRADE_CAPTURE){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:process.env.RETRADE_CAPTURE+'/sales-'+width+'.png',fullPage:true});}
  }
  await page.locator('#p-monthly .sort-select').selectOption('profit');
  await page.waitForFunction(()=>!document.querySelector('#month-list .rt-sales-day'));
  assert.equal(await page.locator('#month-list .rt-sales-day').count(),0);
  assert.equal(await page.locator('#month-list .sales-date-tag').count(),3,'Dates survive non-date sorting');
  assert.equal(await page.evaluate(()=>_salesDayOrderCount([{isReturnAdjustment:true}])),0,'Return-only day is not an order');
  await page.locator('#p-monthly .select-toggle').click();
  await page.evaluate(()=>goToTab('stock'));
  assert(await page.locator('#fab-dial').isVisible(),'Leaving Sales selection restores destination FAB');
  await page.evaluate(()=>{goToTab('monthly');SELECTED_MONTH='SEP-26';renderMonth();});
  await page.locator('#month-list .item-row').first().click();
  assert(await page.locator('#p-item').evaluate(el=>el.classList.contains('on')),'Sales still opens item');
  await page.evaluate(()=>{
   exitItemPage();
   const base=DB['SEP-26'][0];
   DB={...DB,'SEP-26':Array.from({length:90},(_,i)=>({...base,id:'paged-'+i,item:'Paged sale '+i,
     dateSold:'2026-09-22',salePrice:100+i,bundleId:[39,47].includes(i)?'one-order':null}))};
   MONTH_SORT='date-sold';MONTH_FILTER='returned';MONTH_SEARCH='';renderMonth();
  });
  const list=page.locator('#month-list'),pager=list.locator('.month-list-pager').first();
  const salesKpis=await page.locator('#p-monthly .kpi-value').allTextContents();
  assert.equal(await list.locator(':scope > .item-row').count(),40);
  assert.match(await list.locator('.rt-sales-day-count').innerText(),/89 orders/,'Day total includes every page');
  assert.equal(await list.locator('[data-sale-bundle="one-order"]').count(),1,'Non-adjacent members share one order');
  await pager.getByRole('button',{name:'Next'}).click();
  assert.match(await page.locator(':focus').innerText(),/Page 2 of 3/);
  assert.equal(await list.locator('[data-sale-bundle="one-order"]').count(),0,'Bundle does not repeat');
  assert.deepEqual(await page.locator('#p-monthly .kpi-value').allTextContents(),salesKpis);
  await page.locator('#p-monthly .select-toggle').click();
  await page.locator('#p-monthly .sel-check').click();
  assert.equal(await page.evaluate(()=>_selectedBulkRecords('month').length),90,'Bulk actions retain the full filtered month');
  await page.locator('#p-monthly .sel-exit').click();
  const row=list.locator('[data-sale-key]').nth(18),rowKey=await row.getAttribute('data-sale-key');
  await row.scrollIntoViewIfNeeded();
  const previousScroll=await page.evaluate(()=>scrollY);
  await row.click();await page.evaluate(()=>exitItemPage());
  await page.waitForFunction(y=>Math.abs(scrollY-y)<3,previousScroll);
  assert.equal(await list.locator('[data-sale-key]').nth(18).getAttribute('data-sale-key'),rowKey);
  await page.locator('#p-monthly input.inlist-search-input').fill('Paged sale 89');
  assert.equal(await list.locator('[data-sale-key]').count(),1,'Search reaches the last page');
  await page.locator('#p-monthly input.inlist-search-input').fill('');
  assert.match(await pager.innerText(),/Page 1 of 3/);
  await page.locator('#p-monthly .sort-select').selectOption('price');
  await page.waitForFunction(()=>document.querySelector('#month-list [data-sale-key]')?.dataset.saleKey.startsWith('paged-89|'));
  assert.deepEqual(errors,[]);await context.close();console.log('PASS Sales date groups, persistent tags, responsive layouts and item navigation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
