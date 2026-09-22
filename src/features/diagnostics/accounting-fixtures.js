/* Optional diagnostic fixtures. Loaded on demand, never during normal startup. */
function runFinancialRegressionTests(){
  const near=function(a,b){return Math.abs((Number(a)||0)-(Number(b)||0))<0.011;};
  const results=[];
  const check=function(name,actual,expected){
    const ok=near(actual,expected);
    results.push({name:name,ok:ok,actual:+Number(actual).toFixed(2),expected:+Number(expected).toFixed(2)});
    return ok;
  };
  const base=function(platform){return{
    id:'TEST',item:'Regression item',defaultPlatform:platform,soldOnPlatform:platform,
    salePlatform:platform,state:'sold',dateSold:'2026-08-01',salePrice:100,postage:0,
    costPrice:40,shippingCost:4,packagingCost:1,promoPercent:0.02,
    parts:[],listingFee:0,returnHistory:[]
  };};

  // 1 — eBay private normal sale: buyer-facing item amount less BPF, costs + ad.
  let i=base('ebay');
  let expected=100-calcPlatformBPF(i,100,0,'ebay')-_calcPromoFee('ebay',100,0,0.02)-40-4-1;
  check('eBay private · normal sale',calcGrossProfit(i),expected);

  // 2 — eBay Business normal sale: FVF includes buyer-paid postage.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.postage=5;
  expected=105-calcPlatformBPF(i,100,5,'ebay_biz')-_calcPromoFee('ebay_biz',100,5,0.02)-40-4-1;
  check('eBay Business · normal sale',calcGrossProfit(i),expected);

  // 3 — seller-handled partial refund: principal out, eligible fee/ad credit in.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.postage=5;
  i.returnHistory=[{type:'partial_seller',saleNo:1,refundAmount:20,loggedAt:'2026-08-02'}];
  expected=105-_netPlatformFeeAfterRefunds(i,1,'ebay_biz',100,5)
    -_netPromoFeeAfterRefunds(i,1,'ebay_biz',100,5,0.02)-20-40-4-1;
  check('eBay Business · seller partial refund',calcGrossProfit(i),expected);

  // 4 — eBay-decided partial refund: principal out, no eligible fee/ad credit.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.postage=5;
  i.returnHistory=[{type:'partial_ebay',saleNo:1,refundAmount:20,loggedAt:'2026-08-02'}];
  expected=105-calcPlatformBPF(i,100,5,'ebay_biz')-_calcPromoFee('ebay_biz',100,5,0.02)-20-40-4-1;
  check('eBay Business · eBay partial refund',calcGrossProfit(i),expected);

  // 5 — Depop: current UK processing fee + optional boost, no legacy 10% seller fee.
  i=base('depop');
  expected=100-calcPlatformBPF(i,100,0,'depop')-_calcPromoFee('depop',100,0,0.02)-40-4-1;
  check('Depop UK · normal sale',calcGrossProfit(i),expected);

  // 6 — eBay Business full seller-handled return: stock cost is recoverable;
  // only retained fee + fulfilment/return costs remain as lifetime loss.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.postage=5;i.isReturned=true;i.dateSold=null;
  i.returnHistory=[{type:'full_seller',saleNo:1,refundAmount:105,returnPostage:2,loggedAt:'2026-08-03',_salePriceAtReturn:100,_dateSoldAtReturn:'2026-08-01',_postageAtReturn:5,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0.02}];
  expected=-(_netPlatformFeeAfterRefunds(i,1,'ebay_biz',100,5)+_netPromoFeeAfterRefunds(i,1,'ebay_biz',100,5,0.02)+4+1+2);
  check('eBay Business · full seller return',calcGrossProfit(i),expected);

  // 7 — eBay stepped in: no eligible eBay fee/ad credit, so those charges stay lost.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.postage=5;i.isReturned=true;i.dateSold=null;
  i.returnHistory=[{type:'full_ebay',saleNo:1,refundAmount:105,returnPostage:2,loggedAt:'2026-08-03',_salePriceAtReturn:100,_dateSoldAtReturn:'2026-08-01',_postageAtReturn:5,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0.02}];
  expected=-(calcPlatformBPF(i,100,5,'ebay_biz')+_calcPromoFee('ebay_biz',100,5,0.02)+4+1+2);
  check('eBay Business · eBay stepped-in full return',calcGrossProfit(i),expected);

  // 8 — multiple seller partials combine proportionally without double credit.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.postage=5;
  i.returnHistory=[
    {type:'partial_seller',saleNo:1,refundAmount:10,loggedAt:'2026-08-02'},
    {type:'partial_seller',saleNo:1,refundAmount:15,loggedAt:'2026-08-03'}
  ];
  expected=105-_netPlatformFeeAfterRefunds(i,1,'ebay_biz',100,5)
    -_netPromoFeeAfterRefunds(i,1,'ebay_biz',100,5,0.02)-25-40-4-1;
  check('eBay Business · two partial refunds',calcGrossProfit(i),expected);

  // 9 — chronological P&L: sale + full return must reconcile to lifetime GP,
  // including the COGS credit when the stock comes back.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.postage=5;i.isReturned=true;i.dateSold=null;
  const r1={type:'full_seller',saleNo:1,refundAmount:105,returnPostage:2,loggedAt:'2026-08-03',_salePriceAtReturn:100,_dateSoldAtReturn:'2026-08-01',_postageAtReturn:5,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0.02};
  i.returnHistory=[r1];
  const sale1Ev={item:i,sale:'1',isReturnAdjustment:false};
  const ret1Ev={item:i,sale:'R',isReturnAdjustment:true,returnEntry:r1};
  expected=_saleBreakdown(sale1Ev).netProfit+_saleBreakdown(ret1Ev).netProfit;
  check('Statement events · full return reconcile',expected,calcGrossProfit(i));

  // 10 — return → resale: COGS is charged, reversed, then charged once more.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.postage=4;i.dateSold=null;i.salePrice=90;
  i.resaleSalePrice=90;i.resaleDateSold='2026-08-10';i.resalePlatform='ebay_biz';i.resalePostage=4;i.resaleShippingCost=3.5;i.resalePackagingCost=1;i.resalePromoPercent=0.01;
  const rr={type:'full_seller',saleNo:1,refundAmount:105,returnPostage:2,loggedAt:'2026-08-03',_salePriceAtReturn:100,_dateSoldAtReturn:'2026-08-01',_postageAtReturn:5,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0.02,_salePriceAtRelist:100,_postageAtRelist:5,_shippingCostAtRelist:4,_packagingCostAtRelist:1,_promoPercentAtRelist:0.02,_relistedAt:'2026-08-05'};
  i.returnHistory=[rr];
  const evs=[{item:i,sale:'1',isReturnAdjustment:false},{item:i,sale:'R',isReturnAdjustment:true,returnEntry:rr},{item:i,sale:'2',isReturnAdjustment:false}];
  expected=evs.reduce(function(sum,ev){return sum+_saleBreakdown(ev).netProfit;},0);
  check('Statement events · return + resale reconcile',expected,calcGrossProfit(i));

  // 11 — Sale 2 full return: the second COGS is credited and the item is stock again.
  i.isReturned=true;
  const r2={type:'full_seller',saleNo:2,refundAmount:94,returnPostage:2.5,loggedAt:'2026-08-12',_salePriceAtReturn:90,_dateSoldAtReturn:'2026-08-10',_postageAtReturn:4,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0.01};
  i.returnHistory=[rr,r2];
  const evs2=[{item:i,sale:'1',isReturnAdjustment:false},{item:i,sale:'R',isReturnAdjustment:true,returnEntry:rr},{item:i,sale:'2',isReturnAdjustment:false},{item:i,sale:'R',isReturnAdjustment:true,returnEntry:r2}];
  expected=evs2.reduce(function(sum,ev){return sum+_saleBreakdown(ev).netProfit;},0);
  check('Statement events · Sale 2 full return reconcile',expected,calcGrossProfit(i));

  // 12 — supplier account tracking must never deduct supplier cost twice.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.accountId='SUP';i.accountType='supplier';i.accountPaidAmount=40;i.accountSettled=true;
  check('Supplier account · no double deduction',calcNetProfit(i),calcGrossProfit(i));

  // 13 — consignment split is deducted once from gross profit.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.costPrice=0;i.accountId='CON';i.accountType='consignment';i.accountSplitPercent=50;
  expected=calcGrossProfit(i)*0.5;
  check('Consignment account · 50% split once',calcNetProfit(i),expected);

  // 13b — pre-sale estimate deducts the partner share exactly once while
  // costPrice stays at £0.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.state='listed';i.dateSold=null;i.costPrice=0;i.accountId='CON';i.accountType='consignment';i.accountSplitPercent=50;
  const estGross=calcEstGrossProfit(i);
  check('Consignment estimate · partner split deducted once',calcEstProfit(i),estGross*0.5);

  // 13c — returned + relisted stock: live listing price wins over a stale
  // sourcing estimate, and recovered stock basis is consumed exactly once.
  i=base('ebay_biz');
  i.category='Digital Cameras & Lenses';i.state='listed';i.dateSold=null;i.isReturned=false;
  i.salePrice=189.99;i.estSalePrice=270;i.costPrice=121.49;i.shippingCost=3.65;i.packagingCost=0;i.promoPercent=0.03;
  i.listingFee=0.72;i.resaleListingFee=0.36;
  i.returnHistory=[{type:'full_seller',saleNo:1,refundAmount:189.99,returnPostage:0,loggedAt:'2026-09-05',
    _salePriceAtReturn:189.99,_dateSoldAtReturn:'2026-08-23',_postageAtReturn:0,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0.03,
    _salePriceAtRelist:189.99,_postageAtRelist:0,_shippingCostAtRelist:3.65,_packagingCostAtRelist:0,_promoPercentAtRelist:0.03,
    _listingFeeAtReturn:0.72,_listingFeeAtRelist:0.36,_platformAtRelist:'ebay_biz',_relistedAt:'2026-09-05'}];
  const returnedBase=calcGrossProfit(i);
  const nextSale=189.99-calcPlatformBPF(i,189.99,0,'ebay_biz')-_calcPromoFee('ebay_biz',189.99,0,0.03)-3.65-121.49;
  check('Relist estimate · live ask + stock basis once',calcEstGrossProfit(i),returnedBase+nextSale);

  // 14 — ordinary disposal permanently loses paid acquisition + parts cash.
  i={id:'CASH-SCRAP',item:'Cash scrap',scrappedAt:'2026-08-20',scrapReason:'scrapped',costPrice:40,parts:[{cost:5}]};
  check('Cash · scrapped stock capital loss',_cashRemovedItemNet(i),45);

  // 15 — supplier return restores the refunded cash, while unrecovered parts remain lost.
  i={id:'CASH-RET',item:'Supplier return',scrappedAt:'2026-08-20',scrapReason:'supplier_return',supplierRefund:40,costPrice:40,parts:[{cost:5}]};
  check('Cash · supplier refund nets unrecovered parts',_cashRemovedItemNet(i),5);

  // 16 — unpaid SOLD supplier debt is recognised in profit but must remain in cash.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.accountId='SUP';i.accountType='supplier';i.accountSettled=false;i.costPrice=40;
  const _oldKeys=typeof allDBKeys==='function'?allDBKeys:null;
  const _oldDB=DB;
  try{
    DB={TEST:[i],expenses:[],trips:[],cashLedger:[]};
    window.allDBKeys=function(){return ['TEST'];};
    check('Cash · unpaid sold supplier liability stays in cash',_cashUnpaidSoldLiabilities().supplier,40);
    i.accountSettled=true;
    check('Cash · settled sold supplier liability leaves cash',_cashUnpaidSoldLiabilities().supplier,0);
  }finally{
    DB=_oldDB;
    if(_oldKeys)window.allDBKeys=_oldKeys;
  }

  // 17 — unpaid consignment split likewise remains cash until settlement.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.accountId='CON';i.accountType='consignment';i.accountSettled=false;i.costPrice=0;i.accountSplitPercent=50;
  try{
    DB={TEST:[i],expenses:[],trips:[],cashLedger:[]};
    window.allDBKeys=function(){return ['TEST'];};
    const owe=_accountItemOwed(i)||0;
    check('Cash · unpaid consignment share stays in cash',_cashUnpaidSoldLiabilities().partner,owe);
    i.accountSettled=true;
    check('Cash · settled consignment share leaves cash',_cashUnpaidSoldLiabilities().partner,0);
  }finally{
    DB=_oldDB;
    if(_oldKeys)window.allDBKeys=_oldKeys;
  }

  // 18 — consignment already paid, then returned: the partner payout stays a
  // sunk lifetime cost and must not disappear while the unit is back in stock.
  i=base('ebay_biz');i.category='Laptops, Desktops & Tablets';i.costPrice=0;i.accountId='CON';i.accountType='consignment';
  i.accountSettled=true;i.accountPaidAmount=30;i.isReturned=true;i.dateSold=null;
  i.returnHistory=[{type:'full_seller',saleNo:1,refundAmount:100,returnPostage:2,loggedAt:'2026-08-03',_salePriceAtReturn:100,_dateSoldAtReturn:'2026-08-01',_postageAtReturn:0,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0.02}];
  check('Consignment · paid share survives return',calcNetProfit(i),+(calcGrossProfit(i)-30).toFixed(2));

  // 19 — when that same unit resells, the already-paid partner amount is still
  // deducted exactly once, not charged again for Sale 2.
  i.resaleSalePrice=90;i.resaleDateSold='2026-08-10';i.resalePlatform='ebay_biz';i.resalePostage=0;i.resaleShippingCost=3;i.resalePackagingCost=1;i.resalePromoPercent=0;
  i.isReturned=false;
  check('Consignment · paid share not doubled on resale',calcNetProfit(i),+(calcGrossProfit(i)-30).toFixed(2));

  const failed=results.filter(function(r){return !r.ok;});
  if(failed.length)console.error('[RETRADE financial regression] FAILED',failed);
  else console.info('[RETRADE financial regression] '+results.length+' checks passed');
  return {ok:failed.length===0,passed:results.length-failed.length,failed:failed.length,results:results};
}

function runStockLifecycleRegressionTests(){
  const results=[];
  const check=function(name,ok,detail){results.push({name:name,ok:!!ok,detail:detail||''});};
  const cents=function(xs){return Math.round((xs||[]).reduce(function(s,v){return s+(Number(v)||0);},0)*100);};

  let a=_jobLotAllocation(99.99,4.25,6.17,1.03,[10,20,30]);
  check('Job Lot · sale allocation exact',cents(a.sale)===9999,a.sale.join(', '));
  check('Job Lot · buyer postage allocation exact',cents(a.postage)===425,a.postage.join(', '));
  check('Job Lot · shipping allocation exact',cents(a.shipping)===617,a.shipping.join(', '));
  check('Job Lot · packaging allocation exact',cents(a.packaging)===103,a.packaging.join(', '));

  const first={
    id:'JL-FIRST',item:'First-sale child',state:'listed',salePrice:80,costPrice:30,
    dateSold:null,isReturned:false,returnHistory:[],parts:[],defaultPlatform:'ebay_biz',
    shippingCost:0,packagingCost:0,postage:0,promoPercent:0
  };
  _applyJobLotSaleLeg(first,{date:'2026-08-23',salePrice:55,postage:2,shipping:3,packaging:.5,promo:0,platform:'ebay_biz',bundleId:'B1',bundleRef:'JOB-1',bundleTotal:95});
  check('Job Lot · first-sale child uses Sale 1',first.dateSold==='2026-08-23'&&first.salePrice===55&&!first.resaleSalePrice,
    JSON.stringify({dateSold:first.dateSold,salePrice:first.salePrice,resaleSalePrice:first.resaleSalePrice||0}));

  const returned={
    id:'JL-RETURN',item:'Returned child',state:'returned',salePrice:100,costPrice:40,
    dateSold:null,isReturned:true,parts:[],defaultPlatform:'ebay_biz',soldOnPlatform:'ebay_biz',
    shippingCost:4,packagingCost:1,postage:5,promoPercent:0,
    returnHistory:[{type:'full_seller',saleNo:1,refundAmount:105,returnPostage:2,loggedAt:'2026-08-10',
      _salePriceAtReturn:100,_dateSoldAtReturn:'2026-08-01',_postageAtReturn:5,_platformAtReturn:'ebay_biz',
      _salePriceAtRelist:100,_postageAtRelist:5,_shippingCostAtRelist:4,_packagingCostAtRelist:1,_promoPercentAtRelist:0}]
  };
  _applyJobLotSaleLeg(returned,{date:'2026-08-23',salePrice:40,postage:1,shipping:2,packaging:.5,promo:0,platform:'ebay_biz',bundleId:'B1',bundleRef:'JOB-1',bundleTotal:95});
  check('Job Lot · returned child preserves Sale 1',returned.salePrice===100&&returned.resaleSalePrice===40&&returned.resaleDateSold==='2026-08-23'&&!returned.isReturned,
    JSON.stringify({sale1:returned.salePrice,sale2:returned.resaleSalePrice,resaleDate:returned.resaleDateSold}));
  check('Job Lot · Sale 2 bundle identity isolated',!returned.bundleId&&returned.resaleBundleId==='B1',
    JSON.stringify({sale1Bundle:returned.bundleId||null,sale2Bundle:returned.resaleBundleId||null}));

  check('Bundle helpers · mixed resale price',_bundleMemberSalePrice(returned,'B1')===40,'price '+_bundleMemberSalePrice(returned,'B1'));
  check('Bundle helpers · mixed resale postage',_bundleMemberPostage(returned,'B1')===1,'postage '+_bundleMemberPostage(returned,'B1'));
  const oldSaleEvent={item:returned,sale:'1',isReturned:false,isReturnAdjustment:false};
  const newSaleEvent={item:returned,sale:'2',isReturned:false,isReturnAdjustment:false};
  check('Bundle events · old Sale 1 not regrouped',_eventBundleId(oldSaleEvent)===null,'bundle '+(_eventBundleId(oldSaleEvent)||'none'));
  check('Bundle events · Sale 2 groups correctly',_eventBundleId(newSaleEvent)==='B1','bundle '+(_eventBundleId(newSaleEvent)||'none'));
  const legacyBundle={bundleId:'OLD',salePrice:75,postage:3,resaleSalePrice:90,resalePostage:4,returnHistory:[{type:'full_seller',saleNo:1}]};
  check('Bundle events · old bundle stays Sale 1 after later standalone resale',_bundleMemberSalePrice(legacyBundle,'OLD')===75&&_bundleMemberPostage(legacyBundle,'OLD')===3,
    JSON.stringify({price:_bundleMemberSalePrice(legacyBundle,'OLD'),postage:_bundleMemberPostage(legacyBundle,'OLD')}));

  // v1.3 — repeat-return lifecycle must not stop at Sale 2. A Sale 2 full
  // return that has been relisted advances the single live resale slot to Sale 3.
  const cycle3={
    salePrice:100,dateSold:null,resaleSalePrice:null,resaleDateSold:null,isReturned:false,
    returnHistory:[
      {type:'full_seller',saleNo:1,_dateSoldAtReturn:'2026-08-01',_salePriceAtReturn:100,_relistedAt:'2026-08-05'},
      {type:'full_seller',saleNo:2,_dateSoldAtReturn:'2026-08-10',_salePriceAtReturn:90,_relistedAt:'2026-08-15'}
    ]
  };
  check('Lifecycle · Sale 2 return advances to Sale 3',typeof _currentResaleSaleNo==='function'&&_currentResaleSaleNo(cycle3)===3,
    'next '+(typeof _currentResaleSaleNo==='function'?_currentResaleSaleNo(cycle3):'helper unavailable'));

  const failed=results.filter(function(r){return !r.ok;});
  if(failed.length)console.error('[RETRADE stock lifecycle regression] FAILED',failed);
  else console.info('[RETRADE stock lifecycle regression] '+results.length+' checks passed');
  return {ok:failed.length===0,passed:results.length-failed.length,failed:failed.length,results:results};
}

function runCashLedgerRegressionTests(){
  const results=[];
  const near=function(a,b){return Math.abs((Number(a)||0)-(Number(b)||0))<0.011;};
  const check=function(name,ok,detail){results.push({name:name,ok:!!ok,detail:detail||''});};
  const oldDB=DB;
  const oldAccounts=(typeof _accounts!=='undefined')?_accounts.slice():[];
  const baseLedger=function(){return [{id:'OPEN',type:'opening_balance',amount:1000,direction:'in',date:'2026-08-01',description:'Opening'}];};
  const baseItem=function(){return {id:'C1',item:'Cash test',state:'listed',dateSourced:'2026-08-01',dateListed:'2026-08-02',salePrice:180,costPrice:100,shippingCost:5,packagingCost:1,postage:0,promoPercent:0,parts:[{id:'P1',description:'Repair',cost:10,date:'2026-08-01'}],listingFee:0,defaultPlatform:'ebay_biz',salePlatform:'ebay_biz',returnHistory:[]};};
  const reset=function(items){
    DB={trips:[],expenses:[],cashLedger:baseLedger(),'AUG-26':items||[]};
    if(typeof _accounts!=='undefined'){_accounts.length=0;}
  };
  try{
    reset([]);
    DB.cashLedger.push({id:'CON',type:'owner_contribution',amount:50,direction:'in',date:'2026-08-02'});
    DB.cashLedger.push({id:'DRAW',type:'owner_draw',amount:20,direction:'out',date:'2026-08-03'});
    DB.cashLedger.push({id:'ADJ',type:'adjustment',amount:10,direction:'out',date:'2026-08-04'});
    let c=calcCashSummary();
    check('Cash ledger · manual movements exact',near(c.cashAvailable,1020),'cash '+c.cashAvailable);

    let i=baseItem();reset([i]);c=calcCashSummary();
    check('Cash ledger · sourced own stock leaves cash',near(c.cashAvailable,890),'cash '+c.cashAvailable);
    check('Cash ledger · stock + part each occur once',c.events.filter(function(e){return e.type==='stock_purchase';}).length===1&&c.events.filter(function(e){return e.type==='part_purchase';}).length===1,JSON.stringify(c.events.map(function(e){return e.type;})));

    i.dateSold='2026-08-03';i.state='sold';reset([i]);c=calcCashSummary();
    const saleEvents=c.events.filter(function(e){return e.itemId===i.id&&['sale_receipt','platform_fee','shipping','packaging'].includes(e.type);});
    const expectedSale=1000-100-10+saleEvents.reduce(function(sum,e){return sum+(e.direction==='out'?-e.amount:e.amount);},0);
    check('Cash ledger · sale receipt and selling cash reconcile',near(c.cashAvailable,expectedSale),'cash '+c.cashAvailable+' expected '+expectedSale.toFixed(2));
    check('Cash ledger · one sale receipt',saleEvents.filter(function(e){return e.type==='sale_receipt';}).length===1,'receipts '+saleEvents.filter(function(e){return e.type==='sale_receipt';}).length);

    const fr={type:'full_seller',saleNo:1,refundAmount:180,returnPostage:4,loggedAt:'2026-08-05',_dateSoldAtReturn:'2026-08-03',_salePriceAtReturn:180,_postageAtReturn:0,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0,_shippingCostAtReturn:5,_packagingCostAtReturn:1};
    i.returnHistory=[fr];i.dateSold=null;i.isReturned=true;i.state='returned';reset([i]);c=calcCashSummary();
    check('Cash ledger · full return creates refund once',c.events.filter(function(e){return e.type==='customer_refund';}).length===1,'refunds '+c.events.filter(function(e){return e.type==='customer_refund';}).length);
    check('Cash ledger · return postage creates outflow',c.events.some(function(e){return e.type==='return_postage'&&near(e.amount,4);}),JSON.stringify(c.events.filter(function(e){return /refund|return/.test(e.type);}).map(function(e){return [e.type,e.amount,e.direction];})));

    // Repeat lifecycle: two full returns followed by Sale 3. The ledger must
    // contain exactly three receipts and two customer refunds — never overwrite.
    i=baseItem();i.costPrice=40;i.parts=[{id:'P1',cost:5,date:'2026-08-01'}];i.salePrice=100;i.dateSold=null;i.state='sold';
    i.returnHistory=[
      {type:'full_seller',saleNo:1,refundAmount:100,returnPostage:3,loggedAt:'2026-08-05',_dateSoldAtReturn:'2026-08-03',_salePriceAtReturn:100,_postageAtReturn:0,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0,_shippingCostAtReturn:4,_packagingCostAtReturn:1,_relistedAt:'2026-08-06',_platformAtRelist:'ebay_biz',_listingFeeAtRelist:0},
      {type:'full_seller',saleNo:2,refundAmount:110,returnPostage:3,loggedAt:'2026-08-10',_dateSoldAtReturn:'2026-08-08',_salePriceAtReturn:110,_postageAtReturn:0,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0,_shippingCostAtReturn:4,_packagingCostAtReturn:1,_relistedAt:'2026-08-11',_platformAtRelist:'ebay_biz',_listingFeeAtRelist:0}
    ];
    i.shippingCost=4;i.packagingCost=1;i.resaleSalePrice=120;i.resaleDateSold='2026-08-13';i.resalePlatform='ebay_biz';i.resalePostage=0;i.resaleShippingCost=4;i.resalePackagingCost=1;i.resalePromoPercent=0;i.isReturned=false;
    reset([i]);c=calcCashSummary();
    check('Cash ledger · Sale 3 keeps all three receipts',c.events.filter(function(e){return e.type==='sale_receipt'&&e.itemId===i.id;}).length===3,'receipts '+c.events.filter(function(e){return e.type==='sale_receipt'&&e.itemId===i.id;}).length);
    check('Cash ledger · Sale 3 keeps both historic refunds',c.events.filter(function(e){return e.type==='customer_refund'&&e.itemId===i.id;}).length===2,'refunds '+c.events.filter(function(e){return e.type==='customer_refund'&&e.itemId===i.id;}).length);

    // Supplier stock does not leave cash at receipt; its paid settlement does.
    const sup=baseItem();sup.id='SUPITEM';sup.item='Supplier stock';sup.costPrice=60;sup.parts=[];sup.accountId='SUP';sup.accountType='supplier';sup.dateSold=null;sup.salePrice=100;
    reset([sup]);
    if(typeof _accounts!=='undefined')_accounts.push({id:'SUP',name:'Supplier',type:'supplier',settlements:[]});
    let ev=_cashEventsAll();
    check('Cash ledger · unpaid supplier stock is not a purchase outflow',!ev.some(function(e){return e.itemId===sup.id&&e.type==='stock_purchase';}),JSON.stringify(ev.filter(function(e){return e.itemId===sup.id;})));
    if(typeof _accounts!=='undefined')_accounts[0].settlements.push({id:'ST1',date:'2026-08-06',paid:true,partnerAmount:60,items:[{itemId:sup.id,amount:60}]});
    c=calcCashSummary();
    check('Cash ledger · paid supplier settlement leaves cash once',c.events.filter(function(e){return e.type==='partner_settlement'&&e.id==='settlement:ST1';}).length===1&&near(c.cashAvailable,940),'cash '+c.cashAvailable);

    // Business expense and trip sub-expense are cash; HMRC mileage allowance is not.
    reset([]);DB.expenses=[{id:'E1',date:'2026-08-07',amount:25,description:'Tape'}];DB.trips=[{id:'T1',date:'2026-08-08',mileage:100,expenses:[{amount:6,description:'Parking'}]}];
    c=calcCashSummary();
    check('Cash ledger · real expenses reduce cash, mileage allowance does not',near(c.cashAvailable,969),'cash '+c.cashAvailable);
  }finally{
    DB=oldDB;
    if(typeof _accounts!=='undefined'){_accounts.length=0;oldAccounts.forEach(function(a){_accounts.push(a);});}
  }
  const failed=results.filter(function(r){return !r.ok;});
  if(failed.length)console.error('[RETRADE cash ledger regression] FAILED',failed);else console.info('[RETRADE cash ledger regression] '+results.length+' checks passed');
  return {ok:failed.length===0,passed:results.length-failed.length,failed:failed.length,results:results};
}

function runSummaryCycleRegressionTests(){
  const results=[];
  const near=function(a,b){return Math.abs((Number(a)||0)-(Number(b)||0))<0.011;};
  const check=function(name,ok,detail){results.push({name:name,ok:!!ok,detail:detail||''});};
  const oldDB=DB;
  const oldAccounts=(typeof _accounts!=='undefined')?_accounts.slice():[];
  try{
    if(typeof _accounts!=='undefined')_accounts.length=0;
    const i={id:'SUM3',item:'Summary Sale 3',category:'Laptops, Desktops & Tablets',state:'sold',dateSourced:'2026-08-01',dateListed:'2026-08-02',salePrice:100,costPrice:40,shippingCost:4,packagingCost:1,postage:0,promoPercent:0,parts:[],listingFee:0,defaultPlatform:'ebay_biz',salePlatform:'ebay_biz',dateSold:null,isReturned:false,
      returnHistory:[
        {type:'full_seller',saleNo:1,refundAmount:100,returnPostage:3,loggedAt:'2026-08-05',_dateSoldAtReturn:'2026-08-03',_salePriceAtReturn:100,_postageAtReturn:0,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0,_shippingCostAtReturn:4,_packagingCostAtReturn:1,_relistedAt:'2026-08-06',_salePriceAtRelist:110,_postageAtRelist:0,_shippingCostAtRelist:4,_packagingCostAtRelist:1,_promoPercentAtRelist:0,_platformAtRelist:'ebay_biz',_listingFeeAtRelist:0},
        {type:'full_seller',saleNo:2,refundAmount:110,returnPostage:3,loggedAt:'2026-08-10',_dateSoldAtReturn:'2026-08-08',_salePriceAtReturn:110,_postageAtReturn:0,_platformAtReturn:'ebay_biz',_promoPercentAtReturn:0,_shippingCostAtReturn:4,_packagingCostAtReturn:1,_relistedAt:'2026-08-11',_salePriceAtRelist:120,_postageAtRelist:0,_shippingCostAtRelist:4,_packagingCostAtRelist:1,_promoPercentAtRelist:0,_platformAtRelist:'ebay_biz',_listingFeeAtRelist:0}
      ],resaleSalePrice:120,resaleDateSold:'2026-08-13',resalePlatform:'ebay_biz',resalePostage:0,resaleShippingCost:4,resalePackagingCost:1,resalePromoPercent:0,resaleListingFee:0};
    DB={trips:[],expenses:[],cashLedger:[],'AUG-26':[i]};
    const ev=getSaleEventsInRange('2026-08-01','2026-08-31');
    const sales=ev.filter(function(x){return !x.isReturnAdjustment;});
    const returns=ev.filter(function(x){return x.isReturnAdjustment;});
    check('Summary Sale-N · three sales retained',sales.length===3&&sales.map(function(x){return Number(x.sale);}).join(',')==='1,2,3','sales '+sales.map(function(x){return x.sale;}).join(','));
    check('Summary Sale-N · two returns retained',returns.length===2&&returns.map(function(x){return Number(x.returnEntry.saleNo);}).join(',')==='1,2','returns '+returns.map(function(x){return x.returnEntry.saleNo;}).join(','));
    const s=calcYearlyStats('all');
    check('Summary Sale-N · sold count is transactions',s.soldCount===3,'sold '+s.soldCount);
    check('Summary Sale-N · refund cohort counts two full refunds',s.fullRefundCount===2&&s.refundDenom===3,'refunds '+s.fullRefundCount+' / '+s.refundDenom);
    check('Summary Sale-N · refund rate is 66.7%',Math.abs(s.refundItemRate-66.6667)<0.1,'rate '+s.refundItemRate);
    check('Summary Sale-N · average sale uses all cycles',near(s.avgSale,110),'avg '+s.avgSale);
    const eventProfit=ev.reduce(function(sum,x){return sum+_saleBreakdown(x).netProfit;},0);
    check('Summary Sale-N · realised profit reconciles to events',near(s.realisedProfit,eventProfit),'summary '+s.realisedProfit+' events '+eventProfit.toFixed(2));
    check('Summary Sale-N · current revenue is net of dated full refunds',near(s.totalRev,120),'revenue '+s.totalRev);
    check('Summary Sale-N · days-to-sell uses each listing cycle',s.avgDays===2,'days '+s.avgDays);
    const cat=(s.byCat||[]).find(function(x){return x.cat==='Laptops, Desktops & Tablets';});
    check('Summary Sale-N · category analytics retain all cycles',!!cat&&cat.sold===3,'cat '+JSON.stringify(cat||null));
    const late=_statsForRange({from:'2026-08-12',to:'2026-08-31'});
    check('Summary Sale-N · later range sees Sale 3 only',late.soldCount===1&&near(late.totalRev,120),'late '+JSON.stringify(late));
    const aug=calcMonthStatsBySale('AUG-26');
    check('Summary Sale-N · monthly sold count retains all cycles',aug.soldCount===3,'monthly sold '+aug.soldCount);
    check('Summary Sale-N · monthly revenue reconciles Sale-N returns',near(aug.totalRev,120),'monthly revenue '+aug.totalRev);
    check('Summary Sale-N · legacy days helper is Sale-N aware',calcDaysToSell(i)===2,'days helper '+calcDaysToSell(i));
  }finally{
    DB=oldDB;
    if(typeof _accounts!=='undefined'){_accounts.length=0;oldAccounts.forEach(function(a){_accounts.push(a);});}
  }
  const failed=results.filter(function(r){return !r.ok;});
  if(failed.length)console.error('[RETRADE summary cycle regression] FAILED',failed);else console.info('[RETRADE summary cycle regression] '+results.length+' checks passed');
  return {ok:failed.length===0,passed:results.length-failed.length,failed:failed.length,results:results};
}
