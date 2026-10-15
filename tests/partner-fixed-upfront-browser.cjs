/* Synthetic accounts only; the shared harness blocks every external request. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
const engine=process.argv.includes('--webkit')?'webkit':'chromium';
(async()=>{
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{
  for(const mobile of [true,false])for(const surface of ['unsettled','bulk']){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   await page.evaluate(()=>{
    saveDB=()=>{};
    _accounts=[{id:'advance',name:'Synthetic advance partner',accountType:'consignment',arrangementModel:'profit_share',defaultSplitPercent:50,settlements:[]}];
    const item=(id,extra={})=>Object.assign({id,item:'Synthetic stock '+id,accountId:'advance',accountType:'consignment',state:'sourced',costPrice:0,salePrice:40,accountPaidAmount:null,accountSplitPercent:null,accountSettled:false,partnerAgreedAmount:null,arrangementModelOverride:null,dateSold:null,dateListed:null,dateSourced:'2026-10-01',salePlatform:'fb',parts:[],returnHistory:[]},extra);
    DB={'OCT-26':[...Array.from({length:7},(_,n)=>item('legacy-'+n,{accountPaidAmount:3.25})),...Array.from({length:2},(_,n)=>item('cost-'+n,{accountType:'supplier',costPrice:4.5})),item('percentage',{accountSplitPercent:50})],trips:[],expenses:[]};
    openAccountPage('advance');
   });
   await page.waitForSelector('.rt-payalloc2');
   if(await page.locator('.rt-payalloc2').evaluate(e=>e.classList.contains('closed')))await page.locator('.rt-payalloc2-head').click();
   await page.locator('.payalloc-unsold').check();
   assert.equal(await page.locator('[data-payalloc-id]').count(),9,'All nine existing fixed agreements have a payable amount');
   assert.equal(await page.locator('[data-unsettled-stock="percentage"]').count(),1);
   assert((await page.locator('[data-unsettled-stock="percentage"]').innerText()).includes('Profit share needs a sale'));
   for(const id of ['legacy-0','cost-0'])assert((await page.locator('[data-payalloc-id="'+id+'"]').locator('..').innerText()).includes(id==='legacy-0'?'£3.25':'£4.50'));
   assert.equal(await page.evaluate(()=>{const t=_buildTaxCashSummary('2026-04-06','2027-04-05','');return t.cashGoodsPaid+t.cashPartnerPaid;}),0,'Displaying an advance agreement creates no cash expense');
   if(surface==='unsettled'){
    await page.locator('.payalloc-all').click();assert.equal(await page.locator('[data-payalloc-id]:checked').count(),9);
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
   await context.close();console.log('PASS '+engine+' nine-item advance payment via '+surface+' '+(mobile?'mobile':'desktop'));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
