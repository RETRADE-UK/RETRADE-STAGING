/* Synthetic accounting regressions; the shared harness blocks external I/O. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const wk=process.argv.includes('--webkit');
 const browser=await(wk?webkit:chromium).launch({headless:true,...(!wk?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{
  const {page,context,errors}=await open(browser,{signedIn:true});await settled(page);
  await page.addScriptTag({url:'http://retrade.test/src/features/partners/statements-accounting-v3.js'});
  await page.evaluate(()=>{
   window.__auditItem=(id,extra={})=>Object.assign({id,item:'Synthetic '+id,state:'sold',dateSourced:'2026-07-01',dateListed:'2026-07-02',dateSold:'2026-07-05',costPrice:0,salePrice:100,salePlatform:'fb',defaultPlatform:'fb',soldOnPlatform:'fb',listingFee:0,postage:0,shippingCost:0,packagingCost:0,promoPercent:0,parts:[],returnHistory:[],refreshHistory:[]},extra);
   window.__auditSet=(items,accounts=[])=>{DB={'JUL-26':items,trips:[],expenses:[],cashLedger:[]};_accounts=accounts;_jobLots=[];_jobLotItems=[];_saleReconciliations=[];};
   window.__auditWrites=0;saveDB=()=>{__auditWrites++;};
   window.__auditLoadCredits=async rows=>{_sb.from=()=>{const q={select:()=>q,eq:()=>q,order:()=>q,then:(ok,no)=>Promise.resolve({data:rows,error:null}).then(ok,no)};return q;};await __rtPartnerAdjustmentsEnsureLoaded(true);};
  });
  const dates=await page.evaluate(()=>{
   const ret={type:'full_seller',saleNo:1,loggedAt:'2026-03-31T12:00:00Z',refundAmount:20,_salePriceAtReturn:20,_platformAtReturn:'fb'};
   const orphan=__auditItem('orphan',{dateSold:null,salePrice:20,costPrice:5,isReturned:true,returnHistory:[ret]});
   const resold=__auditItem('resold',{dateSold:null,salePrice:20,costPrice:5,resaleSalePrice:40,resaleDateSold:'2026-05-17',resalePlatform:'fb',resaleShippingCost:0,resaleListingFee:0,returnHistory:[{...ret,_relistedAt:'2026-04-14'}]});
   __auditSet([orphan,resold]);const before=JSON.stringify(DB),ev=getSaleEventsInRange(null,null);
   const known=__auditItem('known',{dateSold:null,returnHistory:[{...ret,_dateSoldAtReturn:'2026-03-20'}]});
   return {events:ev.map(e=>({id:e.item.id,sale:e.sale,date:e.saleDate,estimated:e.dateEstimated,profit:e.profit})),bounds:getSaleEventsInRange('2026-04-01','2026-05-31').map(e=>e.sale),known:_saleCycleSnapshot(known,1),partial:_saleCycleSnapshot(__auditItem('partial',{dateSold:null,returnHistory:[{...ret,type:'partial_seller'}]}),1),invalid:_saleCycleSnapshot(__auditItem('bad',{dateSold:null,returnHistory:[{...ret,loggedAt:'bad'}]}),1),same:before===JSON.stringify(DB),writes:__auditWrites};
  });
  assert.equal(dates.events.filter(e=>e.sale==='1').length,2,'Both missing original receipts are recovered');
  assert(dates.events.filter(e=>e.sale==='1').every(e=>e.estimated&&e.date==='2026-03-31'));
  assert.deepEqual(dates.bounds,['2'],'Inferred pre-April sales stay outside April-onward activity');
  assert.equal(dates.known.date,'2026-03-20');assert.equal(dates.known.dateEstimated,false);assert.equal(dates.partial,null);assert.equal(dates.invalid,null);
  assert.equal(dates.events.filter(e=>e.id==='orphan').reduce((s,e)=>s+e.profit,0),0,'Full return reverses basis once');
  assert.equal(dates.events.filter(e=>e.id==='resold').reduce((s,e)=>s+e.profit,0),35,'Resale charges the same stock basis once');assert(dates.same);assert.equal(dates.writes,0);

  const stock=await page.evaluate(()=>{
   const account={id:'fixed',accountType:'consignment',arrangementModel:'fixed_cost',settlements:[]};
   const fixed=(id,cost,paid,extra={})=>__auditItem(id,{accountId:'fixed',accountType:'consignment',partnerAgreedAmount:cost,arrangementModelOverride:'fixed_cost',costPrice:cost,accountSettled:paid,state:'listed',dateSold:null,...extra});
   __auditSet([fixed('paid',39,true),fixed('unpaid',39,false),fixed('returned',2.85,true,{dateSold:'2026-07-05',isReturned:true}),fixed('scrapped',39,true,{scrappedAt:'2026-08-01'}),__auditItem('own',{dateSold:null,costPrice:8})],[account]);
   return _cashStockTied();
  });
  assert.equal(stock,49.85,'Paid fixed consignment and returned stock are capital; unpaid/scrapped stock are excluded');
  const margins=await page.evaluate(()=>{__auditSet([__auditItem('small',{costPrice:10,salePrice:100}),__auditItem('large',{costPrice:810,salePrice:900})]);const s=calcYearlyStats('all');__auditSet([]);return {weighted:s.grossMargin,mean:s.avgMargin,profit:s.grossProfit,zero:calcYearlyStats('all').grossMargin};});
  assert.equal(margins.weighted,18);assert.equal(margins.mean,50);assert.equal(margins.profit,180);assert.equal(margins.zero,0);

  const costs=await page.evaluate(()=>{
   const i=__auditItem('signed',{costPrice:20,salePrice:100,parts:[{id:'p',cost:'10',date:'2026-07-03'},{id:'r',cost:'-15',date:'2026-07-04'}]});
   __auditSet([i]);const b=_saleBreakdown(getSaleEventsInRange(null,null)[0]),tax=_taxCashStockAndPartner('2026-07-01','2026-07-31'),cash=calcCashSummary();
   const ret={type:'full_seller',saleNo:1,loggedAt:'2026-07-06',_dateSoldAtReturn:'2026-07-05',_salePriceAtReturn:20,_platformAtReturn:'fb',refundAmount:20,_relistedAt:'2026-07-07'};
   const r=__auditItem('relist',{salePrice:20,returnHistory:[ret],resaleSalePrice:30,resaleDateSold:'2026-07-10',resalePlatform:'fb',resaleListingFee:.36});__auditSet([r]);
   const fallback=_cashEventsAll().filter(e=>e.id.startsWith('relistfee:'));
   r.returnHistory[0]._listingFeeAtRelist=0;const zero=_cashEventsAll().filter(e=>e.id.startsWith('relistfee:'));
   r.returnHistory[0]._listingFeeAtRelist=.36;const explicit=_cashEventsAll().filter(e=>e.id.startsWith('relistfee:'));
   return {parts:b.parts,profit:b.netProfit,tax:tax.goodsPaid,cash:cash.cashAvailable,fallback,zero,explicit};
  });
  assert.equal(costs.parts,-5);assert.equal(costs.profit,85);assert.equal(costs.tax,15);assert.equal(costs.cash,85);
  assert.equal(costs.fallback.length,1);assert.equal(costs.fallback[0].amount,.36);assert.equal(costs.fallback[0].date,'2026-07-07');assert.equal(costs.zero.length,0);assert.equal(costs.explicit.length,1);

  const credit=await page.evaluate(async()=>{
   const item=__auditItem('credited',{accountId:'partner',accountType:'supplier',costPrice:40,partnerAgreedAmount:40,arrangementModelOverride:'fixed_cost',accountSettled:true});
   const account={id:'partner',name:'Synthetic partner',accountType:'supplier',arrangementModel:'fixed_cost',settlements:[{id:'paid',date:'2026-09-01',paid:true,partnerAmount:20,grossPartnerAmount:40,accountAdjustmentAmount:20,accountAdjustmentIds:['credit'],items:[{id:'credited',kind:'supplier',amount:40}]}]};
   __auditSet([item],[account]);await __auditLoadCredits([]);const cashBefore=calcCashSummary().cashAvailable;
   const row={id:'credit',user_id:_currentUserId,account_id:'partner',date:'2026-08-15',kind:'partner_loss_contribution',status:'active',amount:20,item_allocations:[{item_id:'credited',amount:20}],applications:[{settlement_id:'paid',date:'2026-09-01',amount:20}]};
   await __auditLoadCredits([row,{...row,id:'void',amount:80,status:'void'},{...row,id:'other-user',user_id:'other',amount:90}]);
   const periods=[['2026-07-01','2026-07-31'],['2026-08-01','2026-08-31'],['2026-09-01','2026-09-30']];
   const views=periods.map(([from,to])=>{const p=_buildPnLSummary(from,to,''),s=__rtBuildPartnerStatementV3Adjusted('partner',{from,to,label:'test',slug:'test'});return {p:p.netProfit,credit:p.accountCreditProfit,statement:s.totals.retradeEarned,diff:s.totals.reconciliationDifference};});
   const all=calcYearlyStats('all'),tax=_buildTaxCashSummary('2026-07-01','2026-09-30',''),beforeDate=_accountNonCashProfitCredits(null,'2026-08-14'),onDate=_accountNonCashProfitCredits('2026-08-15','2026-08-15');
   const result={cashBefore,cashAfter:calcCashSummary().cashAvailable,all:{profit:all.realisedProfit,revenue:all.totalRev,count:all.soldCount,credit:all.accountCreditProfit},item:calcNetProfit(item),views,tax:tax.netProfit,taxDetail:tax.cashDetail,beforeDate:beforeDate.amount,onDate:onDate.amount,events:onDate.events};
   // Payment timing cannot move a dated, agreed credit into another P&L period.
   account.settlements[0].paid=false;result.unpaidCredit=_accountNonCashProfitCredits().amount;
   DB['JUL-26'].push(__auditItem('own-stock',{costPrice:10,dateSold:null,dateSourced:'2026-09-01'}));DB={...DB};
   result.unpaidTax=_taxCashStockAndPartner('2026-09-01','2026-09-30').goodsPaid;
   account.settlements[0].paid=true;account.settlements[0].date='2026-09-03';
   result.earlyTax=_taxCashStockAndPartner('2026-09-01','2026-09-02').goodsPaid;
   result.paymentDateTax=_taxCashStockAndPartner('2026-09-03','2026-09-03').goodsPaid;
   const savedUser=_currentUserId;_currentUserId='other-user';result.otherUserTax=_taxCashStockAndPartner('2026-09-01','2026-09-30').goodsPaid;_currentUserId=savedUser;
   await __auditLoadCredits([{...row,applications:row.applications.concat(row.applications)}]);result.duplicateTax=_taxCashStockAndPartner('2026-09-01','2026-09-30').goodsPaid;
   await __auditLoadCredits([{...row,applications:[]}]);result.unusedCredit=_accountNonCashProfitCredits().amount;
   await __auditLoadCredits([{...row,status:'void',applications:[]}]);result.voidCredit=_accountNonCashProfitCredits().amount;
   return result;
  });
  assert.equal(credit.cashBefore,80);assert.equal(credit.cashAfter,80,'Noncash credit creates no cash receipt');
  assert.deepEqual(credit.all,{profit:80,revenue:100,count:1,credit:20});assert.equal(credit.item,80,'Linked item attribution and aggregate earnings agree');
  assert.deepEqual(credit.views,[{p:60,credit:0,statement:60,diff:0},{p:20,credit:20,statement:20,diff:0},{p:0,credit:0,statement:0,diff:0}]);
  assert.equal(credit.tax,80,'Cash-basis bridge applies only the net payment, without a second credit benefit');assert.equal(credit.taxDetail.supplierStockPaid,20,'Supplier paid detail is net of the same noncash credit');assert.equal(credit.taxDetail.goodsPaid,credit.taxDetail.ownStockPaid+credit.taxDetail.supplierStockPaid+credit.taxDetail.partsPaid,'Paid purchase components reconcile to their combined total');assert.equal(credit.beforeDate,0);assert.equal(credit.onDate,20);assert.equal(credit.events.length,1);assert.equal(credit.unpaidCredit,20);assert.equal(credit.unusedCredit,20);assert.equal(credit.voidCredit,0);
  assert.equal(credit.unpaidTax,10,'Unpaid/reversed applications do not reduce other cash purchases');assert.equal(credit.earlyTax,10,'Tax credit uses actual transaction payment date');assert.equal(credit.paymentDateTax,20);assert.equal(credit.otherUserTax,50,'Stale loaded credits cannot affect another user');assert.equal(credit.duplicateTax,30,'Duplicate applications cannot exceed the gross-minus-net paid credit');
  const legacy=await page.evaluate(async()=>{
   __auditSet([__auditItem('missing',{dateSold:null,returnHistory:[{type:'full_seller',saleNo:1,loggedAt:'2026-03-31',refundAmount:20}]}),__auditItem('recorded',{returnHistory:[{type:'full_seller',saleNo:1,loggedAt:'2026-07-06',_dateSoldAtReturn:'2026-07-05',refundAmount:100}]})]);
   localStorage.removeItem('retrade_backfill_dsar_v1');const before=JSON.stringify(DB),writes=__auditWrites;await _backfillDateSoldAtReturn();return {same:JSON.stringify(DB)===before,writes:__auditWrites-writes,flag:localStorage.getItem('retrade_backfill_dsar_v1')};
  });
  assert.deepEqual(legacy,{same:true,writes:0,flag:null},'Obsolete migration cannot persist a guessed date or overwrite recorded history');
  const deferred=await page.evaluate(async()=>{
   const item=__auditItem('future',{accountId:'future-partner',accountType:'supplier',costPrice:40,partnerAgreedAmount:40,arrangementModelOverride:'fixed_cost',dateSold:null,state:'listed'});
   const account={id:'future-partner',accountType:'supplier',arrangementModel:'fixed_cost',settlements:[]};
   __auditSet([item],[account]);
   const row={id:'future-credit',user_id:_currentUserId,account_id:account.id,date:'2026-07-10',status:'active',amount:25,item_allocations:[{item_id:item.id,amount:25}],applications:[]};
   await __auditLoadCredits([row,{...row,id:'unallocated',amount:80,item_allocations:[]}]);
   const before={profit:_accountNonCashProfitCredits().amount,available:__rtPartnerAdjustmentsAvailableCredit(account.id),statement:__rtBuildPartnerStatementV3Adjusted(account.id,{from:'2026-07-01',to:'2026-07-31'}).totals.retradeEarned};
   item.dateSold='2026-09-10';item.state='sold';DB={...DB};
   const after={july:_accountNonCashProfitCredits('2026-07-01','2026-07-31').amount,september:_accountNonCashProfitCredits('2026-09-01','2026-09-30').amount,events:_accountNonCashProfitCredits().events,statement:__rtBuildPartnerStatementV3Adjusted(account.id,{from:'2026-09-01',to:'2026-09-30'}).totals.retradeEarned};
   await __auditLoadCredits([{...row,amount:10,item_allocations:[{item_id:item.id,amount:25},{item_id:item.id,amount:25}]}]);const capped=_accountNonCashProfitCredits().amount;
   return {before,after,capped};
  });
  assert.deepEqual(deferred.before,{profit:0,available:105,statement:0},'Unallocated and unsold-stock credits remain balances without realised income');
  assert.equal(deferred.after.july,0);assert.equal(deferred.after.september,25);assert.equal(deferred.after.statement,85);assert.equal(deferred.after.events[0].date,'2026-09-10');assert.equal(deferred.after.events[0].creditDate,'2026-07-10');assert.equal(deferred.capped,10,'Allocation amounts cannot exceed the credit record total');
  const bridge=await page.evaluate(async()=>{
   await __auditLoadCredits([]);
   __auditSet([__auditItem('sold',{costPrice:20}),__auditItem('lost',{dateSold:null,state:'scrapped',scrappedAt:'2026-07-12',costPrice:10})]);
   DB.trips=[{id:'trip',date:'2026-07-09',mileage:100,expenses:[]}];
   DB.expenses=[{id:'fare',date:'2026-07-09',category:'Public transport & parking',amount:4},{id:'entry',date:'2026-07-09',category:'Other business expenses',amount:3}];
   const month=_buildPnLSummary('2026-07-01','2026-07-31',''),all=_buildPnLSummary(null,null,''),summary=calcYearlyStats('all'),comparison=_statsForRange({from:'2026-07-01',to:'2026-07-31'}),cash=calcCashSummary();
   DB.expenses.push({id:'fuel',date:'2026-07-09',category:'Motor, van & travel',amount:12});
   const withFuel=_buildPnLSummary('2026-07-01','2026-07-31',''),fuelSummary=calcYearlyStats('all');
   return {month:month.netProfit,all:all.netProfit,summary:summary.netProfit,comparison:comparison.netProfit,grossMargin:comparison.grossMargin,archive:all.archiveLoss,mileage:month.mileage.cost,travelBox:month.byBox[20],cash:cash.cashAvailable,withFuel:withFuel.netProfit,fuelSummary:fuelSummary.netProfit,excluded:withFuel.motorExcluded,fareExcluded:!!withFuel.byCategory['Public transport & parking'].excluded};
  });
  assert.deepEqual(bridge,{month:63,all:63,summary:63,comparison:63,grossMargin:80,archive:10,mileage:55,travelBox:4,cash:63,withFuel:51,fuelSummary:51,excluded:0,fareExcluded:false},'Profit views agree; noncash mileage and stock loss do not manufacture cash; fares survive the vehicle method');

  const received=await page.evaluate(async()=>{
   const item=__auditItem('refunded',{accountId:'supplier',accountType:'supplier',costPrice:40,partnerAgreedAmount:40,arrangementModelOverride:'fixed_cost',accountSettled:true});
   __auditSet([item],[{id:'supplier',accountType:'supplier',arrangementModel:'fixed_cost',settlements:[{id:'paid',paid:true,date:'2026-07-01',partnerAmount:40,items:[{id:item.id,kind:'supplier',amount:40}]}]}]);
   await __auditLoadCredits([]);const before=calcCashSummary().cashAvailable;
   const row={id:'refund',user_id:_currentUserId,account_id:'supplier',date:'2026-07-10',amount:82,status:'active',item_allocations:[{item_id:item.id,amount:82}],applications:[{type:'cash_refund',date:'2026-07-10',amount:82,destination:'personal'}]};
   await __auditLoadCredits([row]);
   const result={accountProfit:_accountStats('supplier').yourShare,before,after:calcCashSummary().cashAvailable,profit:calcNetProfit(item),tax:_buildTaxCashSummary('2026-07-01','2026-07-31','').netProfit,available:__rtPartnerAdjustmentsAvailableCredit('supplier'),events:__rtPartnerAdjustmentsCashEvents(),month:calcMonthStatsBySale('JUL-26').netProfit,early:_buildTaxCashSummary('2026-07-01','2026-07-09','').otherBusinessIncome};
   await __auditLoadCredits([{...row,applications:row.applications.concat(row.applications)}]);result.capped=__rtPartnerAdjustmentsCashEvents().filter(e=>e.direction==='in').reduce((s,e)=>s+e.amount,0);
   await __auditLoadCredits([{...row,status:'void'}]);result.voided=__rtPartnerAdjustmentsCashEvents().length;
   await __auditLoadCredits([]);__auditSet([]);DB.trips=[{date:'2026-07-06',mileage:1000,expenses:[]},{date:'2026-08-06',mileage:500,expenses:[]}];
   result.uc=_ucMileageSummary('2026-07-06','2026-08-05');result.hmrc=_buildTaxCashSummary('2026-07-06','2026-08-05','').netProfit;result.management=_buildPnLSummary('2026-07-06','2026-08-05','').netProfit;
   result.monthly=calcMonthStatsBySale('JUL-26').netProfit;
   try{_ucMileageSummary('2026-07-01','2026-08-31');result.invalid=false;}catch(_){result.invalid=true;}
   return result;
  });
  assert.equal(received.accountProfit,142);assert.equal(received.before,60);assert.equal(received.after,60);assert.equal(received.profit,142);assert.equal(received.tax,142);assert.equal(received.month,142);assert.equal(received.available,0);assert.equal(received.early,0);assert.equal(received.events.length,2);assert.equal(received.capped,82);assert.equal(received.voided,0);
  assert.equal(received.uc.allowance,416.60);assert.equal(received.uc.miles,1000);assert.equal(received.hmrc,-550);assert.equal(received.management,0);assert.equal(received.monthly,0);assert(received.invalid);

  assert.deepEqual(errors,[]);await context.close();console.log('PASS dated credits, statement periods, no double cash/tax benefit, missing sale cycles, weighted margins, fixed stock, signed parts and relist fees');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
