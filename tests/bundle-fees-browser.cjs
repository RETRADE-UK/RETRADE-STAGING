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
  // Paying a legacy fixed-cost item must preserve its economic cost. A failed
  // save restores both the payment status and the pre-payment agreement field.
  await page.evaluate(()=>{__rtPartnerOpenPayment('fixed',['a','b','c','d']);window.savedBundleSave=saveDB;saveDB=()=>{throw new Error('Synthetic payment save failure');};});
  await page.locator('#payalloc-create-btn').click();
  await page.waitForFunction(()=>!document.getElementById('payalloc-create-btn').disabled);
  assert.equal(await page.evaluate(()=>DB['OCT-26'].every(i=>!i.accountSettled&&i.partnerAgreedAmount===0)&&_accounts[0].settlements.length===0),true,'Failed payment rolls back cost and settlement');
  await page.evaluate(()=>{saveDB=window.savedBundleSave;});
  await page.locator('#payalloc-create-btn').click();
  await page.waitForFunction(()=>!document.getElementById('rt-payalloc-modal-backdrop'));
  assert.equal(await page.evaluate(()=>DB['OCT-26'].every(i=>i.accountSettled&&i.partnerAgreedAmount===25)),true,'Successful payment freezes the resolved cost');
  assert.equal(await page.evaluate(()=>orderNumbers().cost),100,'Paying never removes stock cost from profit');
  await page.evaluate(()=>{_accounts[0].settlements=[];resetBundle();});
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
  // Combine recorded sales through the real Sales toolbar, including a resale.
  await page.evaluate(()=>{
   closePanel();resetBundle();const [a,b]=DB['OCT-26'];DB['OCT-26']=[a,b];
   for(const i of [a,b])Object.assign(i,{bundleId:null,bundleRef:null,bundleTotal:null,postage:2,shippingCost:3.25});
   b.dateSold=null;b.resaleSalePrice=45;b.resaleDateSold=a.dateSold;b.resaleShippingCost=4;b.resalePostage=2;b.resalePlatform='ebay_biz';
   b.returnHistory=[{id:'previous',type:'full_seller',saleNo:1,refundAmount:45,loggedAt:'2026-10-07',_dateSoldAtReturn:'2026-10-06',_salePriceAtReturn:45,_platformAtReturn:'ebay_biz',_relistedAt:'2026-10-09'}];
   window.beforeHistory=JSON.stringify(b.returnHistory);
   SELECTED_MONTH='OCT-26';MONTHLY_VIEW='detail';MONTH_FILTER='all';MONTH_SEARCH='';SELECTION_MODE=false;SELECTED_ITEMS.clear();
   window.dispatchEvent(new Event('retrade:data-ready'));goToTab('monthly');SELECTED_MONTH='OCT-26';renderMonth();
  });
  await page.locator('#p-monthly .select-toggle').click();
  const checkSale=(id,n)=>page.locator('[data-sale-key="'+id+'|s%3A'+n+'"] input').check();
  await checkSale('a',1);
  const bundleAction=page.locator('[data-month-action="bundle"]');
  assert(await bundleAction.isDisabled());
  await checkSale('b',2);
  async function review(){
   await page.locator('#p-monthly .bulk-actions-menu summary').click();
   await bundleAction.click();
  }
  await review();
  const form=page.locator('#recorded-bundle-form');
  assert.equal(await form.locator('input').count(),1);
  assert.match(await form.innerText(),/£90\.00/);assert.match(await form.innerText(),/£7\.25/);
  await form.getByRole('button',{name:'Cancel'}).click();
  assert.equal(await page.evaluate(()=>DB['OCT-26'][0].bundleId),null);
  await review();
  const delivery=page.getByLabel('Your bundle delivery cost (£)');
  await delivery.fill('3.555');assert.equal(await delivery.evaluate(el=>el.checkValidity()),false);
  await delivery.fill('3.55');
  await page.evaluate(()=>{DB['OCT-26'][0].shippingCost=3.35;});
  await form.getByRole('button',{name:'Create bundle sale'}).click();
  assert.match(await form.getByRole('alert').innerText(),/changed/);
  assert.equal(await page.evaluate(()=>DB['OCT-26'][1].resaleBundleId),undefined);
  await form.getByRole('button',{name:'Cancel'}).click();
  await review();await delivery.fill('3.55');
  await form.getByRole('button',{name:'Create bundle sale'}).click();
  await page.waitForFunction(()=>!!document.querySelector('#panel-content .rt-bop-hero'));
  assert.equal(await page.locator('#p-monthly [data-sale-bundle]').count(),1);
  const result=await page.evaluate(()=>{
   const [a,b]=DB['OCT-26'],bid=a.bundleId,sa=_saleCycleSnapshot(a,1),sb=_saleCycleSnapshot(b,2);
   const summary=_bundleSummary(bid),events=_tradingCashEventsAll().events.filter(e=>e.date===a.dateSold);
   const sum=type=>Math.round(events.filter(e=>e.type===type).reduce((s,e)=>s+e.amount,0)*100);
   return {same:bid===b.resaleBundleId,total:a.bundleTotal,items:summary.count,receipts:summary.revenue,shipping:summary.shipping,
    split:[sa.shipping,sb.shipping].sort(),cashReceipts:sum('sale_receipt'),cashDelivery:sum('shipping'),
    fees:sum('platform_fee'),grossProfit:a.grossProfit===calcGrossProfit(a)&&b.grossProfit===calcGrossProfit(b),
    previous:JSON.stringify(b.returnHistory)===beforeHistory,persisted:_rowToItem(_itemToRow(b,'OCT-26')).resaleBundleId===bid};
  });
  assert.equal(result.same,true);assert.equal(result.items,2);assert.equal(result.total,90);assert.equal(result.receipts,94);
  assert.equal(result.shipping,3.55);assert.deepEqual(result.split,[1.77,1.78]);assert.equal(result.cashReceipts,9400);assert.equal(result.cashDelivery,355);
  assert.equal(result.fees,Math.round(await page.evaluate(()=>{const [a,b]=DB['OCT-26'];return 100*(calcPlatformBPF(a,45,2,'ebay_biz',1)+calcPlatformBPF(b,45,2,'ebay_biz',2));})));
  assert(result.grossProfit&&result.previous&&result.persisted);
  await page.locator('#panel-content').getByRole('button',{name:'Separate sales',exact:true}).click();
  await page.waitForFunction(()=>!DB['OCT-26'][0].bundleId);
  assert.deepEqual(await page.evaluate(()=>DB['OCT-26'].map(i=>[i.state,i.resaleDateSold?i.resaleShippingCost:i.shippingCost])),[['sold',3.35],['sold',4]]);
  await page.evaluate(()=>{
   const [a,b]=DB['OCT-26'];a.bundleId=b.resaleBundleId='fee-test';a.bundleTotal=b.resaleBundleTotal=90;
   a.salePlatform=b.resalePlatform='depop';
  });
  assert.equal(await page.evaluate(()=>DB['OCT-26'].reduce((p,i,k)=>p+Math.round(100*calcPlatformBPF(i,45,2,'depop',k+1)),0)),303,'A single processing fee on the £94 order');
  assert.equal(await page.evaluate(()=>{
   const [a,b]=DB['OCT-26'];a.salePlatform=b.resalePlatform='vinted';return _bundleSummary('fee-test').revenue;
  }),90,'Postage collected by the platform is excluded from seller receipts');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS shared order fees, listing allocation/edit/free/persistence, supplier zero conflict, inherited profit share, dashboard/cash reconciliation, bands and return/resale');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
