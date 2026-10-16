/* Real account UI and accounting; all records and I/O are synthetic. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
const engine=process.argv.includes('--webkit')?'webkit':'chromium';
(async()=>{
 const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{
  for(const mobile of [true,false]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   await page.evaluate(()=>{
    saveDB=()=>{};_jobLots=[];_jobLotItems=[];
    _accounts=[{id:'potential',name:'Potential regression',accountType:'supplier',arrangementModel:'fixed_cost',paymentTiming:'on_sale',settlements:[]}];
    window.potentialItem=(id,extra={})=>Object.assign({id,item:'Synthetic '+id,accountId:'potential',accountType:'supplier',state:'listed',dateSourced:'2026-10-01',dateListed:'2026-10-01',dateSold:null,salePrice:80,costPrice:20,partnerAgreedAmount:20,accountPaidAmount:20,arrangementModelOverride:'fixed_cost',accountSettled:false,defaultPlatform:'fb',salePlatform:'fb',postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:0,parts:[],returnHistory:[]},extra);
    DB={'OCT-26':[...Array.from({length:6},(_,n)=>potentialItem('active-'+n)),...Array.from({length:5},(_,n)=>potentialItem('legacy-'+n,{dateSold:'2026-07-07'}))],trips:[],expenses:[]};
    window.potentialBefore=JSON.stringify(DB);openAccountPage('potential');
   });
   const card=page.locator('#p-item .rt-partner-summary-v3-card[data-kind="potential"]');
   await card.waitFor();
   await page.waitForFunction(()=>document.querySelector('#p-item [data-kind="potential"] .rt-partner-summary-v3-sub')?.textContent.includes('6 listed items'));
   assert.equal(await card.locator('.rt-partner-summary-v3-value').innerText(),'£360.00');
   assert.deepEqual(await page.evaluate(()=>{const s=_accountStats('potential');return [s.listedCount,s.forecastListedCount,s.soldCount,s.forecastYourShare,JSON.stringify(DB)===potentialBefore];}),[6,6,5,360,true]);
   const repaired=await page.evaluate(()=>{
    const count=_migrateItemStates(),rows=DB['OCT-26'].map(i=>_itemToRow(i,'OCT-26'));
    DB['OCT-26']=rows.map(r=>_rowToItem(r,[],[]));openAccountPage('potential');
    return {count,again:_migrateItemStates(),sold:DB['OCT-26'].filter(i=>i.id.startsWith('legacy')).map(i=>[i.state,i.dateSold]),potential:_accountStats('potential').forecastYourShare};
   });
   assert.equal(repaired.count,5);assert.equal(repaired.again,0);assert.equal(repaired.potential,360);
   assert(repaired.sold.every(x=>x[0]==='sold'&&x[1]==='2026-07-07'));
   // Real platform fees, fixed consignment amounts, and losses use the same
   // economics as item forecasts; a second UI formula cannot inflate them.
   const mixed=await page.evaluate(()=>{
    DB['OCT-26']=[
     potentialItem('fees',{salePrice:100,salePlatform:'ebay_biz',defaultPlatform:'ebay_biz',promoPercent:.03,listingFee:.36,shippingCost:3.65,packagingCost:.5,parts:[{id:'part',cost:2}]}),
     potentialItem('fixed-partner',{accountType:'consignment'}),
     potentialItem('loss',{salePrice:10}),
     potentialItem('returned',{isReturned:true,dateSold:'2026-09-01'}),
     potentialItem('disposed',{scrappedAt:'2026-10-01'}),
     potentialItem('old-resale',{resaleSalePrice:80,resaleDateSold:'2026-09-02'}),
     potentialItem('estimate',{state:'sourced',salePrice:999,estSalePrice:50}),
     potentialItem('unpriced',{state:'sourced',salePrice:999,estSalePrice:null})
    ];
    const active=DB['OCT-26'].slice(0,3);
    const expected=active.reduce((s,i)=>s+calcEstProfit(i),0)+_estPotentialNet(Object.assign({},DB['OCT-26'][6],{salePrice:0}));
    const snapshot=JSON.stringify(DB);openAccountPage('potential');
    const s=_accountStats('potential');
    return {expected:+expected.toFixed(2),actual:s.forecastYourShare,listed:s.forecastListedCount,unlisted:s.forecastUnlistedCount,unchanged:snapshot===JSON.stringify(DB),loss:calcEstProfit(active[2])};
   });
   assert.equal(mixed.actual,mixed.expected);assert.equal(mixed.listed,3);assert.equal(mixed.unlisted,1);assert.equal(mixed.loss,-10);assert(mixed.unchanged);
   await page.waitForFunction(()=>document.querySelector('#p-item [data-kind="potential"] .rt-partner-summary-v3-sub')?.textContent.includes('3 listed + 1 estimated unlisted item'));
   assert.equal(await card.locator('.rt-partner-summary-v3-value').innerText(),'£'+mixed.expected.toFixed(2));
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Account potential UI passed ('+engine+'): desktop/mobile, legacy sold, reload, real fees, fixed amounts, negative profit and unlisted estimates.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
