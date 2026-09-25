/* Tax regressions run the real application with isolated auth/data/network. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const {page,context,errors}=await open(browser,{signedIn:true,timezoneId:'Europe/London'});await settled(page);
  const results=await page.evaluate(()=>{
   const out=[],check=(name,actual,expected)=>{out.push({name,actual,expected,ok:Math.abs(actual-expected)<0.011});};
   const reset=()=>{DB={'APR-26':[],trips:[],expenses:[],_taxYear:2026,_taxMethod:'actual_manual'};_accounts=[];};
   const item=(x={})=>Object.assign({id:'own',item:'Test camera',state:'sold',dateSourced:'2026-04-10',dateListed:'2026-04-11',dateSold:'2026-04-20',salePrice:200,costPrice:80,postage:0,shippingCost:10,packagingCost:2,promoPercent:0,listingFee:0,salePlatform:'fb',parts:[],returnHistory:[]},x);
   const annual=()=>_buildTaxCashSummary('2026-04-06','2027-04-05','');
   const reconcile=name=>{const a=annual(),ms=_taxYearPeriods(2026).map(p=>_buildTaxCashSummary(p.from,p.to,''));check(name+' monthly profit',ms.reduce((s,m)=>s+m.netProfit,0),a.netProfit);check(name+' monthly income',ms.reduce((s,m)=>s+m.totalBusinessIncome,0),a.totalBusinessIncome);check(name+' expense boxes',a.box17+Object.values(a.byBox).reduce((s,n)=>s+n,0),a.totalBusinessIncome-a.netProfit);};
   reset();DB['APR-26']=[item()];DB.expenses=[{id:'e',date:'2026-04-30',category:'Other',amount:8}];
   check('Own purchase cash expense',annual().cashGoodsPaid,80);check('Own profit includes selling costs and overhead',annual().netProfit,100);
   check('Month-end expense included',calcMonthStatsBySale('APR-26').netProfit,100);reconcile('own');
   DB['APR-26'].push(item({id:'unsold',state:'sourced',dateSold:null,salePrice:0,costPrice:50}));
   check('Unsold purchase deductible once',annual().netProfit,50);check('Unsold does not lower sales profit',calcMonthStatsBySale('APR-26').netProfit,100);reconcile('unsold');
   reset();DB['APR-26']=[item({dateSourced:'2026-03-01',parts:[{cost:20,date:'2026-05-10'},{cost:5,date:null}]})];
   check('Repair date respected, historical stock excluded',annual().cashGoodsPaid,20);check('Repair month',_buildTaxCashSummary('2026-05-01','2026-05-31','').cashGoodsPaid,20);reconcile('repair');
   reset();DB['APR-26']=[item({id:'supplier',accountId:'a',accountType:'supplier',accountSettled:false})];
   _accounts=[{id:'a',accountType:'supplier',settlements:[]}];check('Unpaid supplier purchase excluded',annual().cashGoodsPaid,0);
   _accounts[0].settlements=[{id:'p1',paid:true,date:'2026-05-01',items:[{id:'supplier',kind:'supplier',amount:30}],partnerAmount:30},{id:'p2',paid:true,date:'2026-06-01',items:[{id:'supplier',kind:'supplier',amount:50}],partnerAmount:50}];
   check('Paid allocations override stale flag',annual().cashGoodsPaid,80);check('Partial payment month',_buildTaxCashSummary('2026-05-01','2026-05-31','').cashGoodsPaid,30);reconcile('supplier');
   reset();DB['APR-26']=[item({id:'hybrid',accountId:'a',accountType:'hybrid',costPrice:50,accountSettled:true,accountPaidAmount:40})];
   _accounts=[{id:'a',accountType:'hybrid',settlements:[{id:'p',paid:true,date:'2026-05-01',partnerAmount:40,items:[{id:'hybrid',amount:40}]}]}];
   check('Hybrid upfront',annual().cashGoodsPaid,50);check('Legacy allocation kind falls back to account',annual().cashPartnerPaid,40);reconcile('hybrid');
   reset();DB['APR-26']=[item({state:'scrapped',dateSold:null,salePrice:0,scrappedAt:'2026-05-01',scrapReason:'supplier_return',supplierRefund:60})];
   check('Refund income once',annual().otherBusinessIncome,60);check('Returned-to-supplier net cash loss',annual().netProfit,-20);reconcile('supplier refund');
   reset();DB.trips=[{id:'t1',date:'2026-04-20',mileage:9900,expenses:[]},{id:'t2',date:'2026-05-20',mileage:200,expenses:[]}];
   check('Annual mileage tiers',annual().mileage.cost,5525);check('May uses remaining first tier',_buildTaxCashSummary('2026-05-01','2026-05-31','').mileage.cost,80);reconcile('mileage');
   check('Expanded mileage export matches period',_expandedExpenseRows(_buildPnLSummary('2026-05-01','2026-05-31','')).total,80);
   DB.expenses=[{id:'fuel',date:'2026-06-01',amount:60,category:'Motor, van & travel'}];reconcile('motor mileage method');DB._motorMethod='actual';reconcile('motor actual method');check('Actual motor excludes mileage',annual().netProfit,-60);
   reset();DB['APR-26']=[item({dateSold:'2027-04-05',dateSourced:'2027-04-01'})];check('Closing April days included',annual().netProfit,108);reconcile('final April');
   reset();DB['APR-26']=[item({isReturned:true,returnHistory:[{id:'r',type:'full_seller',saleNo:1,loggedAt:'2026-05-01',refundAmount:200,returnPostage:5,_salePriceAtReturn:200,_dateSoldAtReturn:'2026-04-20'}]})];reconcile('full return');
   reset();DB['APR-26']=[item({returnHistory:[{id:'r',type:'partial_seller',saleNo:1,loggedAt:'2026-05-01',refundAmount:20}]})];check('Partial refund deducted once',annual().netProfit,88);reconcile('partial refund');
   reset();DB['APR-26']=[item({salePlatform:'ebay_biz',dateSold:'2026-03-20',dateSourced:'2026-03-01',isReturned:true,returnHistory:[{id:'r',type:'full_seller',saleNo:1,loggedAt:'2026-05-01',refundAmount:200,_salePriceAtReturn:200,_dateSoldAtReturn:'2026-03-20',_platformAtReturn:'ebay_biz'}]})];reconcile('prior-year fee refund');
   const refundSummary=annual(),filingRows=_buildSA103Rows(refundSummary);check('SA103 books retain fee credits',filingRows.find(r=>r[1]==='TOTAL ALLOWABLE EXPENSES')[2],refundSummary.totalBusinessIncome-refundSummary.netProfit);
   // A representative UI fixture with activity on both tax-year boundaries.
   reset();DB['APR-26']=[item({salePrice:5000,costPrice:1600}),item({id:'closing',dateSold:'2027-04-05',dateSourced:'2027-04-01'})];
   DB.expenses=[{id:'overhead',date:'2026-04-30',amount:400,category:'Software & subscriptions'}];DB._taxOtherIncome=36000;
   goToTab('tax');renderTax();
   return out;
  });
  assert(results.every(r=>r.ok),'Financial regression: '+JSON.stringify(results.filter(r=>!r.ok)));console.log('PASS tax accounting',results.length,'assertions');
  await page.waitForFunction(()=>!document.getElementById('p-tax').hasAttribute('aria-busy'));
  if(process.env.RETRADE_CAPTURE)fs.mkdirSync(process.env.RETRADE_CAPTURE,{recursive:true});
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:900});
   await page.locator('#tax-reconciliation summary').click();
   const geometry=await page.evaluate(()=>{
    const p=document.querySelector('#p-tax'),rows=[...p.querySelectorAll('.tax-bridge-row')].filter(e=>e.getClientRects().length);
    return {viewport:innerWidth,body:document.documentElement.scrollWidth,overlap:rows.some(r=>{const a=r.firstElementChild.getBoundingClientRect(),b=r.lastElementChild.getBoundingClientRect();return a.right>b.left-5;})};
   });
   assert(geometry.body<=width+1,'Tax overflow '+JSON.stringify(geometry));assert(!geometry.overlap,'Tax labels overlap figures '+width);
   await page.locator('#tax-reconciliation summary').click();
   if(process.env.RETRADE_CAPTURE&&(width===390||width===1440))await page.screenshot({path:process.env.RETRADE_CAPTURE+'/tax-'+width+'.png',fullPage:true});
  }
  await page.locator('.tax-method-card').first().click();assert.equal(await page.locator('.tax-method-card').first().getAttribute('aria-pressed'),'true');
  const ta=await page.evaluate(()=>_taxExportData);assert.equal(ta.expenseLines.length,1);assert.equal(ta.expenseLines[0][0],'Trading allowance');
  await page.locator('.tax-method-card').nth(1).click();await page.locator('#tax-other-income').fill('40000');await page.locator('#tax-other-income').press('Tab');
  assert.equal(await page.evaluate(()=>_taxExportData.otherIncome),40000);
  await page.locator('#tax-year').selectOption('2025');assert.equal(await page.evaluate(()=>_taxExportData.year),'2025/26');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS tax responsive layout, method/year controls and export state');
  const mobile=await open(browser,{signedIn:true,mobile:true,timezoneId:'America/Los_Angeles'});await settled(mobile.page);
  assert.equal(await mobile.page.evaluate(()=>calcTieredTrips([{date:'2026-04-06',mileage:100}])[0].mileageCost),55,'Tax-year mileage boundary is timezone-independent');
  await mobile.page.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');document.body.setAttribute('data-theme','dark');goToTab('tax');});
  await mobile.page.waitForFunction(()=>!document.getElementById('p-tax').hasAttribute('aria-busy'));
  await mobile.page.locator('#tax-reconciliation summary').tap();
  await mobile.page.locator('.tax-method-card').nth(1).tap();
  assert.equal(await mobile.page.locator('#tax-reconciliation').getAttribute('open'),'','Expanded sections survive a method change');
  await mobile.page.locator('#tax-other-income').tap();
  assert(await mobile.page.locator('#tax-other-income').evaluate(e=>document.activeElement===e),'Mobile tax input receives focus');
  assert(await mobile.page.locator('#tax-other-income').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16),'No iOS input zoom');
  if(process.env.RETRADE_CAPTURE){await mobile.page.evaluate(()=>window.scrollTo(0,0));await mobile.page.screenshot({path:process.env.RETRADE_CAPTURE+'/tax-mobile-dark.png',fullPage:true});}
  assert.deepEqual(mobile.errors,[]);await mobile.context.close();console.log('PASS mobile touch, dark Tax layout and non-UK timezone boundary');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
