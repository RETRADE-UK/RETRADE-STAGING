/* Synthetic source evidence; all network requests are blocked by the harness. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  const {page,context,errors}=await open(browser,{signedIn:true});await settled(page);
  const result=await page.evaluate(()=>{
   const checks=[],check=(name,a,b)=>checks.push({name,actual:a,expected:b,ok:JSON.stringify(a)===JSON.stringify(b)});
   const fresh=(id='one')=>({id,item:'Synthetic camera',state:'sold',dateSourced:'2026-05-01',dateListed:'2026-05-01',dateSold:'2026-05-31',salePrice:100,postage:0,shippingCost:5,packagingCost:1,costPrice:0,promoPercent:0,listingFee:0,salePlatform:'fb',returnHistory:[],parts:[],refreshHistory:[]});
   const reset=(items)=>{DB={'MAY-26':items,trips:[],expenses:[],cashLedger:[],_motorMethod:'mileage'};_accounts=[];};
   const leg=(type,pence,date='2026-06-01',extra={})=>Object.assign({sourceTxnId:'tx-'+type,leg:type,sourceRow:1,date,type,direction:type==='sale_receipt'?'in':'out',amountPence:pence,sourceAmountPence:pence},extra);
   const record=(i,events,covers)=>({type:'verified_cash_events',version:1,status:'active',provider:'ebay',orderId:'order-one',mode:'replace',saleNo:1,source:{sha256:'a'.repeat(64),from:'2026-04-01',to:'2026-10-28'},expected:{sale:{date:i.dateSold,price:i.salePrice,postage:0,platformId:'fb',promoPercent:0,shipping:5,packaging:1},returns:[]},covers,cashEvents:events});
   let i=fresh();reset([i]);const baseline=_buildPeriodReport('hmrc','2026-05-01','2026-05-31');check('Unverified baseline profit',baseline.profit,94);
   i.refreshHistory=[record(i,[leg('sale_receipt',10000),leg('platform_fee',1000),leg('shipping',500,'2026-06-02')],[{type:'sale_receipt'},{type:'platform_fee'},{type:'shipping'}])];
   const before=JSON.stringify(DB);let ledger=_tradingCashEventsAll();check('Evidence accepted',ledger.reviewItems.length,0);
   check('Receipt crosses month',_buildPeriodReport('hmrc','2026-05-01','2026-05-31').income,0);
   check('Uncovered packaging stays in May',_buildPeriodReport('hmrc','2026-05-01','2026-05-31').profit,-1);
   check('June source cash profit',_buildPeriodReport('hmrc','2026-06-01','2026-06-30').profit,85);
   check('UC uses same receipts and costs',_buildPeriodReport('uc','2026-06-01','2026-06-30').profit,85);
   check('SA103 turnover uses cash dates',_buildSA103Rows(_buildTaxCashSummary('2026-06-01','2026-06-30','')).find(r=>r[0]==='15 / S9')[2],100);
   check('Cash source date',_cashEventsAll().find(e=>e.type==='sale_receipt').date,'2026-06-01');
   check('Management sale remains May',_buildPnLSummary('2026-05-01','2026-05-31','').revenue,100);
   check('Readers preserve source',JSON.stringify(DB),before);
   i.salePrice=101;check('Changed sale rejected',_tradingCashEventsAll().reviewItems.length,1);i.salePrice=100;
   i.returnHistory=[{id:'r',saleNo:1,type:'partial_seller',refundAmount:10,loggedAt:'2026-06-10'}];check('Later return invalidates stale evidence',_tradingCashEventsAll().reviewItems.length,1);i.returnHistory=[];
   let h=i.refreshHistory[0];h.cashEvents[0].amountPence=9999;check('Incomplete allocation rejected',_tradingCashEventsAll().reviewItems.length,1);h.cashEvents[0].amountPence=10000;
   h.cashEvents[0].date='2026-02-30';check('Invalid date rejected',_tradingCashEventsAll().reviewItems.length,1);h.cashEvents[0].date='2026-06-01';
   h.cashEvents[0].amountPence=10000.5;check('Fractional pennies rejected',_tradingCashEventsAll().reviewItems.length,1);h.cashEvents[0].amountPence=10000;
   h.cashEvents.push({...h.cashEvents[0]});check('Duplicate source leg rejected',_tradingCashEventsAll().reviewItems.length,1);h.cashEvents.pop();
   h.covers.push({type:'customer_refund',returnId:'source:refund',sourceOnly:true});h.cashEvents.push(leg('customer_refund',700,'2026-07-01',{returnId:'source:refund'}));
   check('Source-only refund accepted',_tradingCashEventsAll().reviewItems.length,0);check('Source-only refund in July',_buildPeriodReport('hmrc','2026-07-01','2026-07-31').profit,-7);
   const members=[fresh('a'),fresh('b'),fresh('c')];reset(members);
   members.forEach((x,j)=>x.refreshHistory=[record(x,[leg('sale_receipt',[333,334,334][j],'2026-06-01',{sourceAmountPence:1001})],[{type:'sale_receipt'}])]);
   check('Shared source conserved',_tradingCashSummary('2026-06-01','2026-06-30').income,10.01);
   members.pop();check('Missing member rejects whole group',_tradingCashEventsAll().reviewItems.length,2);
   reset([fresh()]);i=DB['MAY-26'][0];h=record(i,[],[{type:'platform_fee'}]);i.refreshHistory=[h];
   i.returnHistory=[{id:undefined,saleNo:1,type:'partial_seller',refundAmount:10,loggedAt:'2026-06-10'}];h.expected.returns=[{id:undefined,saleNo:1,type:'partial_seller',refundAmount:10}];check('Missing return identities rejected',_tradingCashEventsAll().reviewItems.length,1);
   i.returnHistory=[];h.expected.returns=[];h.mode='additive';h.saleNo=null;h.covers=[];h.orderId='cancelled';h.cashEvents=[leg('sale_receipt',1000,'2026-05-31'),leg('customer_refund',1000,'2026-06-01')];
   check('Cancelled receipt retained in May',_tradingCashSummary('2026-05-01','2026-05-31').income,110);
   check('Cancelled refund retained in June',_tradingCashSummary('2026-06-01','2026-06-30').returns,10);
   const mapped=_rowToItem({id:'mapped',refresh_history:JSON.stringify([h])});check('Evidence survives row adapter',mapped.refreshHistory[0].orderId,'cancelled');
   reset([fresh()]);i=DB['MAY-26'][0];i.returnHistory=[{id:'r1',saleNo:1,type:'partial_seller',refundAmount:10,loggedAt:'2026-06-10',returnPostage:2}];
   h=record(i,[leg('customer_refund',1000,'2026-07-01',{returnId:'r1'})],[{type:'customer_refund',returnId:'r1'},{type:'fee_refund',returnId:'r1',component:'platform'},{type:'fee_refund',returnId:'r1',component:'promotion'}]);
   h.expected.returns=[{id:'r1',saleNo:1,type:'partial_seller',refundAmount:10}];i.refreshHistory=[h];
   check('Operational return date retained',i.returnHistory[0].loggedAt,'2026-06-10');
   check('Refund cash dated independently',_tradingCashSummary('2026-07-01','2026-07-31').returns,10);
   check('Uncovered return postage retained',_tradingCashSummary('2026-06-01','2026-06-30').returns,2);
   check('Explicit empty credit coverage accepted',_tradingCashEventsAll().reviewItems.length,0);
   i.returnHistory.push({...i.returnHistory[0]});h.expected.returns.push({...h.expected.returns[0]});check('Duplicate return identities rejected',_tradingCashEventsAll().reviewItems.length,1);
   return checks;
  });
  assert.deepEqual(result.filter(x=>!x.ok),[]);assert.deepEqual(errors,[]);console.log('PASS verified cash evidence: '+result.length+' cases');await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
