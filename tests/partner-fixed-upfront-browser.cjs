/* Synthetic accounts only; the shared harness blocks every external request. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
const engine=process.argv.includes('--webkit')?'webkit':'chromium';

async function openOutstanding(page){
 await page.waitForSelector('.rt-payalloc2');
 if(await page.locator('.rt-payalloc2').evaluate(e=>e.classList.contains('closed')))await page.locator('.rt-payalloc2-head').click();
}

(async()=>{
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{
  // Existing behaviour: known fixed payouts can still be paid before sale from
  // either the Outstanding card or the account-page bulk selection bar.
  for(const mobile of [true,false])for(const surface of ['outstanding','bulk']){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   await page.evaluate(()=>{
    saveDB=()=>{};
    _accounts=[{id:'advance',name:'Synthetic advance partner',accountType:'consignment',arrangementModel:'profit_share',defaultSplitPercent:50,settlements:[]}];
    const item=(id,extra={})=>Object.assign({id,item:'Synthetic stock '+id,accountId:'advance',accountType:'consignment',state:'sourced',costPrice:0,salePrice:40,accountPaidAmount:null,accountSplitPercent:null,accountSettled:false,partnerAgreedAmount:null,arrangementModelOverride:null,dateSold:null,dateListed:null,dateSourced:'2026-10-01',salePlatform:'fb',parts:[],returnHistory:[]},extra);
    DB={'OCT-26':[...Array.from({length:7},(_,n)=>item('legacy-'+n,{accountPaidAmount:3.25})),...Array.from({length:2},(_,n)=>item('cost-'+n,{accountType:'supplier',costPrice:4.5})),item('percentage',{accountSplitPercent:50})],trips:[],expenses:[]};
    openAccountPage('advance');
   });
   await openOutstanding(page);
   await page.locator('[data-payalloc-scope="all"]').click();
   assert.equal(await page.locator('[data-payalloc-id]').count(),9,'All nine existing fixed agreements are payable in All stock');
   assert.equal(await page.locator('[data-payalloc-needs-terms="percentage"]').count(),0,'Unsold profit share is not called outstanding before sale');
   for(const id of ['legacy-0','cost-0'])assert((await page.locator('[data-payalloc-id="'+id+'"]').locator('..').innerText()).includes(id==='legacy-0'?'£3.25':'£4.50'));
   assert((await page.locator('[data-payalloc-scope="sold"]').innerText()).includes('£0.00'));
   assert((await page.locator('[data-payalloc-scope="all"]').innerText()).includes('£31.75'));
   assert.equal(await page.evaluate(()=>{const t=_buildTaxCashSummary('2026-04-06','2027-04-05','');return t.cashGoodsPaid+t.cashPartnerPaid;}),0,'Displaying an advance agreement creates no cash expense');

   if(surface==='outstanding'){
    await page.locator('.payalloc-all').click();
    assert.equal(await page.locator('[data-payalloc-id]:checked').count(),9);
    assert((await page.locator('.rt-payalloc2-summary').innerText()).includes('£31.75 ready'));
    await page.locator('.payalloc-new').click();
   }else{
    await page.evaluate(()=>{_acctToggleSelectMode();_acctSelected=new Set(DB['OCT-26'].map(i=>i.id));_renderAccountPage(_accounts[0]);});
    const pay=page.locator('.rt-partner-v2-pay');await pay.waitFor();assert(await pay.isEnabled());assert((await pay.innerText()).includes('£31.75'));
    assert((await page.locator('.rt-partner-v2-selection-sub').innerText()).includes('9 of 10'));
    await pay.click();
   }

   await page.locator('#payalloc-create-btn').waitFor();
   assert((await page.locator('#payalloc-create-btn').innerText()).includes('£31.75'),'Both entry points confirm the same amount');
   await page.locator('#payalloc-date').fill('2026-10-15');
   await page.locator('#payalloc-create-btn').click();
   await page.waitForFunction(()=>_accounts[0].settlements.length===1&&!document.getElementById('rt-payalloc-modal-backdrop'));
   const result=await page.evaluate(()=>({tx:_accounts[0].settlements[0],items:DB['OCT-26'].map(i=>[i.state,i.dateListed,i.dateSold,i.accountSettled]),tax:_buildTaxCashSummary('2026-04-06','2027-04-05',''),before:_buildTaxCashSummary('2026-04-06','2026-10-14',''),cash:_cashEventsAll().filter(e=>e.type==='partner_settlement').reduce((s,e)=>s+e.amount,0),eligible:__rtPartnerPaymentCandidates('advance').length,selection:_acctSelectMode}));
   assert.equal(result.tx.partnerAmount,31.75);assert.equal(result.tx.items.length,9);assert.equal(result.tx.grossProfit,null);assert.equal(result.tx.yourAmount,0);
   assert(result.items.slice(0,9).every(i=>JSON.stringify(i)===JSON.stringify(['sourced',null,null,true])),'Paying keeps the stock unlisted and unsold');assert.equal(result.items[9][3],false);
   assert.equal(result.tax.cashGoodsPaid,9);assert.equal(result.tax.cashPartnerPaid,22.75);assert.equal(result.before.cashGoodsPaid+result.before.cashPartnerPaid,0);assert.equal(result.cash,31.75);assert.equal(result.eligible,0);
   if(surface==='bulk')assert.equal(result.selection,false);
   await page.evaluate(()=>{DB['OCT-26'][0].state='sold';DB['OCT-26'][0].dateSold='2026-10-16';_renderAccountPage(_accounts[0]);});
   assert.equal(await page.evaluate(()=>__rtPartnerPaymentCandidates('advance').length),0,'A later sale does not create a second partner payment');
   assert.equal(await page.evaluate(()=>{const t=_buildTaxCashSummary('2026-04-06','2027-04-05','');return t.cashGoodsPaid+t.cashPartnerPaid;}),31.75,'An advance cost is deducted only once');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
   await context.close();console.log('PASS '+engine+' advance fixed payment via '+surface+' '+(mobile?'mobile':'desktop'));
  }

  // Mat-style behaviour: fixed payout, pay after sale. Sold items stay selectable
  // even when their payout is missing; selection leads to a payout editor instead
  // of a dead checkbox. Sold and all-stock outstanding totals are separate.
  for(const mobile of [true,false]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   await page.evaluate(()=>{
    saveDB=()=>{};
    _accounts=[{id:'matt',name:"Matt's Drives",accountType:'consignment',arrangementModel:'fixed_cost',paymentTiming:'on_sale',paymentTerms:'on_sale',settlements:[]}];
    const item=(id,extra={})=>Object.assign({id,item:'Drive lot '+id,accountId:'matt',accountType:'consignment',state:'sourced',costPrice:0,salePrice:60,accountPaidAmount:null,accountSplitPercent:null,accountSettled:false,partnerAgreedAmount:null,arrangementModelOverride:'fixed_cost',dateSold:null,dateListed:null,dateSourced:'2026-10-01',salePlatform:'ebay',parts:[],returnHistory:[]},extra);
    DB={'OCT-26':[
      item('m-known',{item:'7× 500GB Seagate bundle',state:'sold',dateSold:'2026-10-07',salePrice:59.99,accountPaidAmount:30,partnerAgreedAmount:30}),
      item('m-missing-1',{item:'10× 320GB WD bundle',state:'sold',dateSold:'2026-10-10',salePrice:49.99}),
      item('m-missing-2',{item:'12× 320GB WD/Toshiba bundle',state:'sold',dateSold:'2026-10-12',salePrice:59.99}),
      item('m-stock-known',{item:'Unsold fixed lot',state:'sourced',partnerAgreedAmount:12,accountPaidAmount:12}),
      item('m-stock-missing',{item:'Unsold payout not set',state:'sourced'})
    ],trips:[],expenses:[]};
    openAccountPage('matt');
   });
   await openOutstanding(page);

   const soldScope=page.locator('[data-payalloc-scope="sold"]'),allScope=page.locator('[data-payalloc-scope="all"]');
   assert((await soldScope.innerText()).includes('£30.00'),'Sold total uses only known sold payouts');
   assert((await soldScope.innerText()).includes('2 need payout'));
   assert((await allScope.innerText()).includes('£42.00'),'All-stock total includes unsold fixed commitments');
   assert((await allScope.innerText()).includes('3 need payout'));
   assert.equal(await page.locator('[data-payalloc-id="m-known"]').count(),1);
   assert.equal(await page.locator('[data-payalloc-needs-terms]').count(),2,'Missing sold payouts remain visible in Sold outstanding');
   assert.equal(await page.locator('[data-payalloc-term-id]:disabled').count(),0,'Missing sold payouts are selectable');

   await page.locator('.payalloc-all').click();
   assert.equal(await page.locator('[data-payalloc-id]:checked,[data-payalloc-term-id]:checked').count(),3);
   assert((await page.locator('.rt-payalloc2-summary').innerText()).includes('2 selected items need a payout'));
   assert(await page.locator('.payalloc-new').isDisabled());
   assert((await page.locator('.payalloc-terms').innerText()).includes('Set 2 payouts'));
   await page.locator('.payalloc-terms').click();

   await page.locator('[data-payalloc-payout="m-missing-1"]').fill('20');
   await page.locator('[data-payalloc-payout="m-missing-2"]').fill('25');
   await page.locator('#payalloc-save-payouts').click();
   await page.waitForFunction(()=>!document.getElementById('rt-payalloc-modal-backdrop')&&DB['OCT-26'][1].partnerAgreedAmount===20&&DB['OCT-26'][2].partnerAgreedAmount===25);
   await page.waitForSelector('.rt-payalloc2');
   if(await page.locator('.rt-payalloc2').evaluate(e=>e.classList.contains('closed')))await page.locator('.rt-payalloc2-head').click();

   assert((await page.locator('[data-payalloc-scope="sold"]').innerText()).includes('£75.00'));
   assert((await page.locator('[data-payalloc-scope="all"]').innerText()).includes('£87.00'));
   assert((await page.locator('[data-payalloc-scope="all"]').innerText()).includes('1 need payout'));
   assert.equal(await page.locator('[data-payalloc-needs-terms]').count(),0,'All sold rows become payable after setting payouts');
   assert.equal(await page.locator('[data-payalloc-id]:checked').count(),3,'Selection survives payout setup');
   assert(!(await page.locator('.payalloc-new').isDisabled()));
   await page.locator('.payalloc-new').click();
   await page.locator('#payalloc-date').fill('2026-10-16');
   assert((await page.locator('#payalloc-create-btn').innerText()).includes('£75.00'));
   await page.locator('#payalloc-create-btn').click();
   await page.waitForFunction(()=>_accounts[0].settlements.length===1&&!document.getElementById('rt-payalloc-modal-backdrop'));

   const paid=await page.evaluate(()=>({amount:_accounts[0].settlements[0].partnerAmount,count:_accounts[0].settlements[0].items.length,sold:DB['OCT-26'].slice(0,3).map(i=>[i.state,i.dateSold,i.accountSettled]),summary:__rtPartnerOutstandingSummary('matt')}));
   assert.equal(paid.amount,75);assert.equal(paid.count,3);
   assert(paid.sold.every(x=>x[0]==='sold'&&x[1]&&x[2]===true),'Payment never changes sold state');
   assert.equal(paid.summary.soldAmount,0);assert.equal(paid.summary.allAmount,12);assert.equal(paid.summary.allNeedsTerms,1);

   await page.locator('[data-payalloc-scope="all"]').click();
   assert.equal(await page.locator('[data-payalloc-id="m-stock-known"]').count(),1);
   assert.equal(await page.locator('[data-payalloc-needs-terms="m-stock-missing"]').count(),1);

   const breakdown=page.locator('.rt-partner-outstanding-breakdown');
   await breakdown.waitFor();
   const positionText=(await breakdown.innerText()).replace(/\s+/g,' ');
   assert(positionText.includes('Sold outstanding £0.00'));
   assert(positionText.includes('All stock £12.00'));

   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
   await context.close();console.log('PASS '+engine+" Matt-style sold/all-stock outstanding "+(mobile?'mobile':'desktop'));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
