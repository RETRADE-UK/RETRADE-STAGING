/* Synthetic orders only; shared harness blocks every external request. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const useWebkit=process.argv.includes('--webkit');
 const browser=await (useWebkit?webkit:chromium).launch({headless:true,...(!useWebkit?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{for(const mobile of [true,false]){
  const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
  await page.evaluate(()=>{
   _accounts=[{id:'fixed',name:'Fixed supplier',accountType:'supplier',arrangementModel:'fixed_cost',paymentTerms:'on_sale',settlements:[]},{id:'share',name:'Share partner',accountType:'consignment',arrangementModel:'profit_share',defaultSplitPercent:50,settlements:[]}];
   window.bundleFixture=(extra={})=>Object.assign({id:'a',item:'Synthetic storage pack',state:'sold',dateSourced:'2026-10-01',dateListed:'2026-10-02',dateSold:'2026-10-23',salePrice:45,costPrice:25,accountId:'fixed',accountType:'supplier',partnerAgreedAmount:0,accountPaidAmount:null,accountSplitPercent:null,arrangementModelOverride:null,category:'Laptops, Desktops & Tablets',salePlatform:'ebay_biz',soldOnPlatform:'ebay_biz',postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:.36,parts:[],returnHistory:[],refreshHistory:[],bundleId:'order',bundleRef:'Synthetic order',bundleTotal:180},extra);
   window.resetBundle=()=>{DB={'OCT-26':['a','b','c','d'].map(id=>bundleFixture({id})),trips:[],expenses:[]};};resetBundle();
   window.orderNumbers=()=>{const items=DB['OCT-26'],bs=items.map(i=>_saleBreakdown({item:i,sale:'1'})),sum=k=>+bs.reduce((s,b)=>s+(b[k]||0),0).toFixed(2);return {fees:sum('bpf'),listing:sum('listingFee'),cost:sum('itemCost'),partner:sum('partnerSplit'),profit:sum('netProfit'),summary:_grossSummaryForRange({from:'2026-10-23',to:'2026-10-23'}).profit,cashFee:+_cashEventsAll().filter(e=>e.type==='platform_fee').reduce((s,e)=>s+e.amount,0).toFixed(2)};};
  });
  assert.deepEqual(await page.evaluate(()=>orderNumbers()),{fees:16.14,listing:1.44,cost:100,partner:0,profit:62.42,summary:62.42,cashFee:16.14});
  assert.deepEqual(await page.evaluate(()=>{const i=bundleFixture({arrangementModelOverride:'fixed_cost'});return [_itemAcquisitionCost(i),_accountItemDebt(i)];}),[0,0],'Deliberate zero remains zero');
  assert.equal(await page.evaluate(()=>{const fn=_rtArrangementForItem;try{_rtArrangementForItem=undefined;return _itemAcquisitionCost(bundleFixture());}finally{_rtArrangementForItem=fn;}}),25,'First paint resolves the same legacy cost');
  await page.evaluate(()=>openBundleOrderEdit('order'));
  await page.locator('#bundle-listing-mode').selectOption('shared');
  await page.locator('#bundle-listing-total').fill('0.36');
  await page.locator('button[onclick="saveBundleOrderEdit(\'order\')"]').click();
  await page.waitForFunction(()=>!!document.querySelector("#panel-content .rt-bop-hero"));
  await page.waitForFunction(()=>DB['OCT-26'][0].listingFee===.09);
  assert.deepEqual(await page.evaluate(()=>orderNumbers()),{fees:16.14,listing:.36,cost:100,partner:0,profit:63.5,summary:63.5,cashFee:16.14});
  await page.evaluate(()=>openBundlePage('order'));
  assert.match(await page.locator('#panel-content').innerText(),/Your trading profit[\s\S]*63\.50/);
  assert.match(await page.locator('#panel-content').innerText(),/Item \/ fixed partner cost[\s\S]*100\.00/);
  assert.equal(await page.evaluate(()=>DB['OCT-26'].every(i=>{const r=_rowToItem(_itemToRow(i,'OCT-26'));return r.listingFee===.09&&r.refreshHistory.some(e=>e.type==='bundle_listing_fee');})),true,'Allocated fees survive persistence');
  await page.evaluate(()=>openBundleOrderEdit('order'));
  assert.equal(await page.locator('#bundle-listing-mode').inputValue(),'shared');
  await page.locator('#bundle-listing-total').fill('0');
  await page.locator('button[onclick="saveBundleOrderEdit(\'order\')"]').click();
  await page.waitForFunction(()=>!!document.querySelector("#panel-content .rt-bop-hero"));
  assert.equal(await page.evaluate(()=>orderNumbers().listing),0,'Free listing is explicit');
  await page.evaluate(()=>openBundleOrderEdit('order'));
  await page.locator('#bundle-listing-mode').selectOption('separate');
  await page.locator('button[onclick="saveBundleOrderEdit(\'order\')"]').click();
  await page.waitForFunction(()=>!!document.querySelector("#panel-content .rt-bop-hero"));
  assert.equal(await page.evaluate(()=>orderNumbers().listing),1.44,'Separate listings retain their actual charges');
  // Percentage calculations are acyclic, inherit the account default, and never
  // create a negative payable partner share on a loss.
  const share=await page.evaluate(()=>{
   const i=bundleFixture({id:'share-item',bundleId:null,accountId:'share',accountType:'consignment',partnerAgreedAmount:null,costPrice:0,salePlatform:'fb',soldOnPlatform:'fb',salePrice:100,listingFee:0});DB['OCT-26']=[i];
   const result=[calcGrossProfit(i),_accountItemOwed(i),calcNetProfit(i),_saleBreakdown({item:i,sale:'1'}).netProfit];
   i.costPrice=120;result.push(_accountItemOwed(i),calcNetProfit(i));return result;
  });
  assert.deepEqual(share,[100,50,50,50,0,-20]);
  await page.evaluate(()=>{DB['OCT-26'][0].costPrice=0;openBundlePage('order');});
  const more=await page.evaluate(()=>{
   resetBundle();DB['OCT-26'].forEach(i=>{i.salePrice=600;i.bundleTotal=2400;});
   const high=orderNumbers().fees; // band thresholds apply to each £600 item
   resetBundle();DB['OCT-26'].forEach(i=>{i.salePrice=4;i.bundleTotal=16;});const small=orderNumbers().fees;
   resetBundle();const i=DB['OCT-26'][0];const fees=DB['OCT-26'].map(i=>calcPlatformBPF(i,45,0,'ebay_biz',1));
   i.returnHistory=[{saleNo:1,type:'full_seller',refundAmount:45,_dateSoldAtReturn:i.dateSold,_salePriceAtReturn:45,_platformAtReturn:'ebay_biz',_bundleIdAtReturn:'order',_bundleTotalAtReturn:180}];i.isReturned=true;
   const after=DB['OCT-26'].map(i=>calcPlatformBPF(i,45,0,'ebay_biz',1));
   const refund=_refundCreditsForEntry(i,i.returnHistory[0]).platformCredit;
   i.isReturned=false;i.resaleSalePrice=50;i.resaleDateSold='2026-10-24';i.resalePlatform='ebay_biz';
   const resale=calcPlatformBPF(i,50,0,'ebay_biz',2);
   return {high,small,fees,after,refund,resale};
  });
  assert.equal(more.high,209.28);assert.equal(more.small,1.87);assert.deepEqual(more.fees,more.after);assert.equal(more.refund,3.92);assert.equal(more.resale,4.83);
  // New orders use the same allocation writer. Reversing a sale preserves the
  // already-incurred shared listing cost instead of recreating four charges.
  await page.evaluate(()=>{
   closePanel();resetBundle();DB['OCT-26'].forEach(i=>{i.state='listed';i.dateSold=null;i.bundleId=null;i.bundleTotal=null;i.salePrice=54.99;});
   window.originalStock=JSON.parse(JSON.stringify(DB['OCT-26']));
   STOCK_SELECTED=new Set(['a','b','c','d']);openBundleSaleModal();
  });
  await page.locator('#bundle-total').fill('180');
  await page.locator('#bundle-date').fill('2026-10-23');
  await page.locator('#bundle-platform').selectOption('ebay_biz');
  await page.locator('#bundle-listing-mode').selectOption('shared');
  await page.locator('#bundle-listing-total').fill('0.36');
  await page.locator('button[onclick="submitBundleSale()"]').click();
  await page.waitForFunction(()=>!!document.querySelector('#panel-content .rt-bop-hero'));
  assert.deepEqual(await page.evaluate(()=>orderNumbers()),{fees:16.14,listing:.36,cost:100,partner:0,profit:63.5,summary:63.5,cashFee:16.14});
  assert.equal(await page.evaluate(async()=>{
   DB.activityLog=DB['OCT-26'].map((i,n)=>({itemId:i.id,ts:1000+n,fromState:'listed',toState:'sold',before:originalStock[n]}));
   const bid=DB['OCT-26'][0].bundleId;showConfirm=async()=>true;await reverseBundleOrder(bid);
   return DB['OCT-26'].every(i=>i.state==='listed'&&!i.dateSold&&!i.bundleId&&i.listingFee===.09&&i.salePrice===54.99);
  }),true,'Reversal preserves incurred shared listing fees');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS shared order fees, listing allocation/edit/free/persistence, supplier zero conflict, inherited profit share, dashboard/cash reconciliation, bands and return/resale');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
