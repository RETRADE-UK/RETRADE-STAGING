const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{for(const mobile of [true,false]){
  const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
  await page.evaluate(()=>{
   window.__detailWrites=0;saveDB=()=>{window.__detailWrites++;};
   const date=_todayISO();const month=currentMonthKey();window.__detailMonth=month;
   const items=Array.from({length:4},(_,n)=>({id:'item:'+n,item:'Payment item '+(n+1),accountId:'account:1',accountType:'supplier',state:'listed',costPrice:39,salePrice:80,dateSourced:date,dateListed:date,parts:[],returnHistory:[],accountSettled:true}));
   items.push({id:'own',item:'Own stock example',state:'sold',costPrice:20,salePrice:60,dateSourced:date,dateListed:date,dateSold:date,salePlatform:'fb',parts:[],returnHistory:[]});
   DB={[month]:items,expenses:[{id:'expense:1',date,description:'Packing supplies',amount:12,category:'Postage & packaging'}],trips:[{id:'trip:1',date,description:'Market sourcing',mileage:10,ratePerMile:.45,expenses:[{desc:'Entry ticket',amount:4}]}],cashLedger:[{id:'manual:1',date,type:'owner_contribution',direction:'in',amount:100,description:'Owner funding'}]};
   _accounts=[{id:'account:1',name:'Payment example',accountType:'supplier',settlements:[{id:'payment:156',date,paid:true,partnerAmount:156,items:items.slice(0,4).map(i=>({id:i.id,month,amount:39,kind:'supplier'})),note:'Four items'}]}];
   _rtCashHistoryWindow1509.reset();goToTab('cash');
  });
  await page.waitForSelector('.rt-cash-ledger');
  const visibleRow=id=>page.locator('.rt-cash-ledger [data-cash-event="'+id+'"]:visible');
  const rowContains=(id,text)=>page.waitForFunction(({id,text})=>[...document.querySelectorAll('.rt-cash-ledger [data-cash-event]')].some(e=>e.dataset.cashEvent===id&&e.textContent.includes(text)),{id,text});
  const cashBefore=await page.evaluate(()=>calcCashSummary().events.reduce((n,e)=>n+(e.direction==='out'?-e.amount:e.amount),0));
  await visibleRow('settlement:payment:156').click();
  assert.equal(await page.locator('[data-settlement-item]').count(),4);
  assert.deepEqual(await page.locator('.rt-settle-item strong').allTextContents(),['£39.00','£39.00','£39.00','£39.00']);
  assert((await page.locator('#panel-content').innerText()).includes('£156.00'));
  assert.equal(await page.evaluate(()=>window.__detailWrites),0,'Inspecting a payment never mutates data');
  await page.locator('[data-settlement-item="0"]').click();
  assert((await page.locator('#p-item .ip-title').innerText()).includes('Payment item 1'));
  await page.evaluate(()=>exitItemPage());
  assert.equal(await page.locator('.page.on').getAttribute('id'),'p-cash','Item back returns to Cashflow');
  await visibleRow('settlement:payment:156').click();
  await page.locator('.rt-payment-edit summary').click();
  const yesterday=await page.evaluate(()=>{const d=new Date();d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);});
  await page.locator('#settlement-action-date').fill(yesterday);await page.locator('#settlement-detail-note').fill('Corrected bank reference');
  const allocations=await page.evaluate(()=>JSON.stringify(_accounts[0].settlements[0].items));
  await page.locator('#settlement-save-details').click();
  assert.deepEqual(await page.evaluate(()=>{const t=_accounts[0].settlements[0];return [t.date,t.note,t.partnerAmount,JSON.stringify(t.items)];}),[yesterday,'Corrected bank reference',156,allocations]);
  assert.equal(await page.evaluate(()=>calcCashSummary().events.reduce((n,e)=>n+(e.direction==='out'?-e.amount:e.amount),0)),cashBefore,'Metadata edits cannot change the cash amount');
  assert.equal(await page.evaluate(()=>_cashEventsAll().filter(e=>e.type==='partner_settlement').length),1,'Updating the audit record must not duplicate a cash movement');
  await page.evaluate(()=>closePanel());
  await rowContains('settlement:payment:156',yesterday);

  // Search must retain its input and interactive results; keyboard opens details.
  await page.locator('#cashflow-search').fill('Packing supplies');
  await page.waitForFunction(()=>document.querySelector('.rt-cash-ledger .rt-cash-desc')?.textContent==='Packing supplies');
  assert.equal(await page.locator('.rt-cash-ledger [role="button"]:visible').count(),1);
  await visibleRow('expense:expense:1').focus();await page.keyboard.press('Enter');
  await page.locator('#cash-transaction-edit').click();await page.locator('#exp-amt').fill('15');
  await page.getByRole('button',{name:'Update Expense',exact:true}).click();
  assert.equal(await page.evaluate(()=>DB.expenses[0].amount),15);
  await rowContains('expense:expense:1','15.00');
  await page.evaluate(()=>clearCashflowFilters());
  await visibleRow('manual:manual:1').click();await page.locator('#cash-transaction-edit').click();
  await page.locator('#cash-amt').fill('110');await page.getByRole('button',{name:'Update',exact:true}).click();
  assert.equal(await page.evaluate(()=>DB.cashLedger.find(x=>x.id==='manual:1').amount),110);
  await visibleRow('tripexp:trip:1:0').click();
  assert((await page.locator('#panel-content').innerText()).includes('Entry ticket'));
  await page.locator('#cash-transaction-edit').click();assert.equal(await page.locator('#trip-desc').inputValue(),'Market sourcing');
  await page.evaluate(()=>closePanel());
  await visibleRow('sale:own:1').click();await page.locator('#cash-transaction-edit').click();
  assert((await page.locator('#p-item .ip-title').innerText()).includes('Own stock example'));await page.evaluate(()=>exitItemPage());
  assert.equal(await page.locator('#panel-title').innerText(),'Transaction details','Item Back restores the source transaction');
  await page.locator('#cash-transaction-close').click();

  // Gross allocations can exceed cash when a non-cash credit is applied.
  await page.evaluate(()=>{const t=_accounts[0].settlements[0];t.accountAdjustmentAmount=16;t.grossPartnerAmount=156;t.partnerAmount=140;renderCash();});
  await visibleRow('settlement:payment:156').click();
  assert.deepEqual(await page.locator('.rt-settle-reconcile-row strong').allTextContents(),['£156.00','−£16.00','£140.00']);
  assert.equal(await page.locator('[data-settlement-item]').count(),4);
  await page.locator('.rt-payment-edit summary').click();
  await page.evaluate(()=>{showConfirm=async()=>true;});await page.locator('#settlement-paid-action').click();
  await page.waitForFunction(()=>!_accounts[0].settlements[0].paid);
  assert.equal(await page.evaluate(()=>_cashEventsAll().filter(e=>e.type==='partner_settlement').length),0);
  await page.waitForFunction(()=>!document.querySelector('.rt-cash-ledger [data-cash-event="settlement:payment:156"]'));
  assert.equal(await page.evaluate(()=>_accounts[0].settlements[0].items.length),4,'Reversal retains the allocation');
  await page.evaluate(()=>closePanel());
  await page.locator('#cashflow-search').fill('No matching record');
  await page.waitForFunction(()=>document.getElementById('cashflow-results').innerText.includes('No matching movements'));
  assert.equal(await page.locator('.rt-cash-ledger [role="button"]:visible').count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS cashflow source details, four-item payment, edits, filtering, reconciliation and reversal',mobile?'mobile':'desktop');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
