const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{for(const mobile of [true,false]){
  const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
  await page.evaluate(()=>{DB={'SEP-26':[],expenses:[],trips:[]};_accounts=[];_cashMoves=[];goToTab('stock');});
  await page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));
  await page.locator('#dd-stock-add>button').click();
  await page.locator('#dd-portal').getByText('One purchase · multiple items',{exact:true}).click();
  await page.locator('#purchase-name').fill('Camera bundle');await page.locator('#purchase-date').fill('2026-09-28');await page.locator('#purchase-total').fill('97.25');
  await page.locator('#purchase-title-1').fill('Camera starter kit');await page.locator('#purchase-title-2').fill('55–250mm lens');
  await page.locator('#purchase-split').click();assert.equal(await page.locator('#purchase-cost-1').inputValue(),'48.63');assert.equal(await page.locator('#purchase-cost-2').inputValue(),'48.62');
  await page.locator('#purchase-cost-1').fill('60');await page.locator('#purchase-save').click();assert.match(await page.locator('#purchase-error').innerText(),/exactly/);
  assert.equal(await page.evaluate(()=>DB['SEP-26'].length),0);
  await page.locator('#purchase-cost-2').fill('37.25');await page.locator('#purchase-save').click();
  assert.equal(await page.locator('.purchase-member').count(),2);
  const result=await page.evaluate(()=>{
   const rows=DB['SEP-26'];const ev=_cashEventsAll().filter(e=>e.type==='stock_purchase');
   const roundtrip=rows.map(i=>_rowToItem(_itemToRow(i,'SEP-26'),[],[]));
   return {cost:rows.reduce((s,i)=>s+i.costPrice,0),count:ev.length,amount:ev[0].amount,id:ev[0].id,group:rows[0].purchaseGroupId,roundtrip:roundtrip.map(i=>i.purchaseGroupId),states:rows.map(i=>i.state)};
  });assert.equal(result.cost,97.25);assert.equal(result.count,1);assert.equal(result.amount,97.25);assert.deepEqual(result.roundtrip,[result.group,result.group]);assert.deepEqual(result.states,['sourced','sourced']);
  await page.locator('#purchase-close').click();await page.evaluate(id=>openCashflowTransaction(id),result.id);await page.locator('#cash-transaction-edit').click();assert.equal(await page.locator('.purchase-member').count(),2);
  await page.locator('.purchase-member>button').first().click();assert(await page.locator('.purchase-item-link').isVisible());await page.locator('.purchase-item-link').click();
  // Listing, sale and return history retain identity and do not duplicate acquisition.
  const lifecycle=await page.evaluate(()=>{const i=DB['SEP-26'][0];i.state='sold';i.dateListed='2026-09-28';i.dateSold='2026-09-28';i.salePrice=150;i.salePlatform='fb';const before=calcGrossProfit(i);const group=i.purchaseGroupId;i.purchaseGroupId=null;const after=calcGrossProfit(i);i.purchaseGroupId=group;return {before,after,purchases:_cashEventsAll().filter(e=>e.type==='stock_purchase').map(e=>e.amount)};});assert.equal(lifecycle.before,lifecycle.after);assert.deepEqual(lifecycle.purchases,[97.25]);
  // An altered date must never move somebody else's historical cash payment.
  assert.deepEqual(await page.evaluate(()=>{DB['SEP-26'][0].dateSourced='2026-09-27';return _cashEventsAll().filter(e=>e.type==='stock_purchase').map(e=>e.amount).sort((a,b)=>a-b);}),[37.25,60]);
  await page.evaluate(()=>{closePanel();const a=DB['SEP-26'][0];a.state='listed';a.dateSold=null;a.dateSourced='2026-09-28';DB['SEP-26'].push({...a,id:'new-lens',item:'Another item',purchaseGroupId:null,purchaseGroupName:null,costPrice:5});openPurchaseLink(['new-lens']);});
  await page.locator('#purchase-existing').selectOption(result.group);await page.locator('#purchase-link-save').click();assert.equal(await page.locator('.purchase-member').count(),3);
  assert.equal(await page.evaluate(()=>_cashEventsAll().find(e=>e.type==='stock_purchase').amount),102.25);
  // Unlinking retains all costs, and duplication must not silently join the old purchase.
  await page.locator('.purchase-member>button').filter({hasText:'Unlink'}).last().click();
  await page.getByRole('button',{name:'Unlink',exact:true}).filter({visible:true}).last().click();
  assert.equal(await page.locator('.purchase-member').count(),2);
  assert.equal(await page.evaluate(()=>_cashEventsAll().filter(e=>e.type==='stock_purchase').reduce((s,e)=>s+e.amount,0)),102.25);
  await page.evaluate(()=>{closePanel();duplicateItem('SEP-26',DB['SEP-26'][0].id);});
  assert.equal(await page.evaluate(()=>DB['SEP-26'].at(-1).purchaseGroupId),null);
  await page.evaluate(()=>{const i=DB['SEP-26'].at(-1);i.dateSourced=null;i.dateListed='2026-08-01';openSplitModal('SEP-26',i.id);});
  await page.getByRole('button',{name:'Split into units',exact:true}).click();
  assert.equal(await page.evaluate(()=>{const i=DB['SEP-26'].at(-1);return purchaseGroupMembers(i.purchaseGroupId).length;}),2);
  assert(await page.evaluate(()=>{const i=DB['SEP-26'].at(-1);return purchaseGroupMembers(i.purchaseGroupId).every(r=>r.item.dateSourced==='2026-08-01');}));
  if(process.env.RETRADE_CAPTURE){await page.evaluate(()=>openNewPurchase());await page.screenshot({path:process.env.RETRADE_CAPTURE+'/purchase-'+(mobile?'mobile':'desktop')+'.png'});}
  if(mobile){await page.setViewportSize({width:320,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  assert.deepEqual(errors,[]);await context.close();console.log('PASS purchases: allocation, cash, lifecycle, persistence mapping and linking',mobile?'mobile':'desktop');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
