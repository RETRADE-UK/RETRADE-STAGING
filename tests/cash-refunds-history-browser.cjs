/* Synthetic regression only. The shared browser harness blocks external I/O. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const useWebkit=process.argv.includes('--webkit');
 const browser=await (useWebkit?webkit:chromium).launch({headless:true,...(!useWebkit?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{
  const {page,context,errors}=await open(browser,{signedIn:true});await settled(page);
  await page.evaluate(()=>{
   const date='2026-10-10';
   window.__cashFixtureDate=date;
   window.__cashFixtureWrites=0;saveDB=()=>{window.__cashFixtureWrites++;};
   _accounts=[{id:'supplier',name:'Synthetic supplier',accountType:'supplier',arrangementModel:'fixed_cost',settlements:[
    {id:'historical',date,paid:true,historicalReconstruction:true,partnerAmount:40,items:[{id:'paid-stock',amount:40,kind:'supplier'}]},
    {id:'ordinary',date,paid:true,partnerAmount:20,grossPartnerAmount:30,accountAdjustmentAmount:10,items:[]},
    {id:'unpaid-history',date,paid:false,historicalReconstruction:true,partnerAmount:60,items:[]}
   ]}];
   const stock=(id,cost,sale,paid)=>({id,item:'Synthetic '+id,accountId:'supplier',accountType:'supplier',partnerAgreedAmount:cost,arrangementModelOverride:'fixed_cost',costPrice:cost,state:'sold',dateSourced:date,dateListed:date,dateSold:date,salePrice:sale,salePlatform:'fb',soldOnPlatform:'fb',defaultPlatform:'fb',listingFee:0,postage:0,shippingCost:0,packagingCost:0,promoPercent:0,accountSettled:paid,parts:[],returnHistory:[],refreshHistory:[]});
   DB={'OCT-26':[stock('paid-stock',40,100,true),stock('unpaid-stock',60,150,false)],
    expenses:[
     {id:'purchase',date,amount:100,description:'Synthetic equipment'},
     {id:'refund',date:'2026-10-12',amount:-30,description:'Synthetic equipment refund'},
     {id:'refund-text',date:'2026-10-13',amount:'-10',description:'Synthetic partial refund'},
     {id:'zero',date,amount:0},{id:'empty',date,amount:null}
    ],
    trips:[{id:'trip',date,mileage:200,expenses:[{amount:12,description:'Synthetic parking'},{date:'2026-10-15',amount:-3,description:'Synthetic parking refund'},{amount:0}]}],
    cashLedger:[
     {id:'opening',date,type:'opening_balance',amount:1000,direction:'in'},
     {id:'history-mirror',date,type:'partner_settlement',amount:40,direction:'out',systemEvent:true},
     {id:'normal-mirror',date,type:'partner_settlement',amount:20,direction:'out',systemEvent:true}
    ]};
   _jobLots=[];_jobLotItems=[];_saleReconciliations=[];
  });
  const get=()=>page.evaluate(()=>{
   const c=calcCashSummary();
   return {cash:c.cashAvailable,overheads:c.cashOverheads,liabilities:c.unpaidLiabilities.total,profit:calcYearlyStats('all').realisedProfit,
    expenses:c.events.filter(e=>e.source==='expense').map(e=>({id:e.id,date:e.date,direction:e.direction,amount:e.amount,type:e.type})),
    settlements:c.events.filter(e=>e.type==='partner_settlement').map(e=>({id:e.id,amount:e.amount})),stockPurchases:c.events.filter(e=>e.type==='stock_purchase').length,
    reconstruction:_rtCashHistoricalReconstructionTotal(),writes:__cashFixtureWrites};
  });
  const before=await page.evaluate(()=>JSON.stringify({DB,accounts:_accounts}));
  const actual=await get();
  assert.equal(actual.cash,1121,'Refunds are inflows and the historical paid payment is counted once');
  assert.equal(actual.overheads,69,'Cash overheads net positive and negative real expenses, excluding mileage');
  assert.equal(actual.liabilities,60,'Unpaid supplier debt remains reserved and is not a cash payment');
  assert.equal(actual.profit,150,'Supplier cost is recognised once in profit independently of payment timing');
  assert.equal(actual.stockPurchases,0,'Supplier acquisition must not also count as a paid purchase');
  assert.equal(actual.reconstruction,40,'Diagnostic total includes only paid reconstructed transactions');
  assert.deepEqual(actual.settlements,[{id:'settlement:historical',amount:40},{id:'settlement:ordinary',amount:20}],'Mirrors and gross pre-credit allocation do not create second cash movements');
  assert.deepEqual(actual.expenses,[
   {id:'expense:purchase',date:'2026-10-10',direction:'out',amount:100,type:'expense'},
   {id:'tripexp:trip:0',date:'2026-10-10',direction:'out',amount:12,type:'trip_expense'},
   {id:'expense:refund',date:'2026-10-12',direction:'in',amount:30,type:'expense'},
   {id:'expense:refund-text',date:'2026-10-13',direction:'in',amount:10,type:'expense'},
   {id:'tripexp:trip:1',date:'2026-10-15',direction:'in',amount:3,type:'trip_expense'}
  ],'Refunds retain source IDs/types for edit navigation and actual refund dates');
  assert.equal(await page.evaluate(()=>JSON.stringify({DB,accounts:_accounts})),before,'Reading cash totals cannot mutate history');
  assert.equal(actual.writes,0);
  await page.evaluate(()=>{_accounts[0].settlements[0].historicalReconstruction=false;});
  const ordinary=await get();assert.equal(ordinary.cash,actual.cash);assert.equal(ordinary.profit,actual.profit);assert.equal(ordinary.liabilities,actual.liabilities,'Provenance does not alter accounting');
  await page.evaluate(()=>{_accounts[0].settlements[0].paid=false;DB['OCT-26'][0].accountSettled=false;});
  const reversed=await get();assert.equal(reversed.cash,1161,'Unpaid/reversed settlement restores its cash');assert.equal(reversed.liabilities,100);assert.equal(reversed.profit,150);
  await page.evaluate(()=>{_accounts[0].settlements[0].paid=true;_accounts[0].settlements[0].historicalReconstruction=true;DB['OCT-26'][0].accountSettled=true;DB.cashLedger=DB.cashLedger.filter(x=>x.type!=='partner_settlement');});
  const noMirrors=await get();assert.equal(noMirrors.cash,1121,'Canonical payments count identically with or without ledger display mirrors');
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS cash refunds, trip refunds, reconstructed payments, mirrors, reversals, credit cash, liabilities and immutable reads');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
