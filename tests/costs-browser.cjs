/* Synthetic local records only; network is blocked by the shared harness. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{
  for(const mobile of [false,true]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   await page.evaluate(()=>{
    window.dispatchEvent(new Event('retrade:data-ready'));
    const date=new Date().toISOString().slice(0,10);
    DB.trips=[{id:'shared',date,description:'Market trip',mileage:20,ratePerMile:.45,expenses:[{desc:'Parking ticket',amount:4}]},{id:'other-trip',date,description:'Auction visit',mileage:10,expenses:[]}];
    DB.expenses=[{id:'shared',date,description:'Market boxes',category:'Office costs',amount:12},{id:'other-exp',date,description:'Postage labels',category:'Office costs',amount:8},{id:'old',date:'2020-02-01',description:'Old market',amount:2,category:'Office costs'}];
    window.__writes=0;saveDB=()=>{window.__writes++;const preview=_previewMode;_previewMode=false;_stageDurableOutboxNow();_previewMode=preview;};COST_PERIOD='all';COST_CAT_FILTER='all';goToTab('expenses');renderExpenses();
   });
   const search=page.locator('#cost-search');await search.waitFor();
   await search.evaluate(e=>window.__searchNode=e);
   await search.fill('market');assert.equal(await page.locator('#cost-ledger .expense-item').count(),3);
   assert(await search.evaluate(e=>e===window.__searchNode&&document.activeElement===e),'Search keeps focus and input identity');
   await search.fill('parking');assert.equal(await page.locator('#cost-ledger .expense-item').count(),1,'Trip extra descriptions searchable');
   await search.fill('unknown');assert.equal(await page.locator('#cost-ledger .expense-item').count(),0);assert(await page.locator('#cost-ledger').innerText().then(t=>t.includes('No matching')));
   await search.fill('market');await page.locator('#cost-selection-controls .select-toggle,#cost-selection-controls .sel-exit').click();
   assert(!await page.locator('#fab-dial').isVisible(),'Creation FAB hidden before any expense is selected');
   assert(!await page.locator('#cost-delete-selected').isVisible(),'No action until selection');
   await page.locator('#cost-select-all').click();
   assert.equal(await page.locator('#cost-select-all').getAttribute('aria-checked'),'true');
   assert.equal(await page.locator('#cost-selected-count').innerText(),'3 selected');
   assert.equal(await page.locator('[data-cost-key]:checked').count(),3);
   await page.locator('#cost-delete-selected').click();await page.locator('#confirm-cancel').click();assert.equal(await page.evaluate(()=>__writes),0,'Cancel never writes');
   await page.evaluate(()=>setCostPeriod('mtd'));await page.waitForFunction(()=>!COST_SELECTED.size&&COST_VISIBLE.length===2);
   assert.equal(await page.locator('[data-cost-key]:checked').count(),0,'Filter change clears hidden selection');
   await page.locator('#cost-select-all').click();
   await page.evaluate(()=>{_dbSnapshot=_dbFingerprint();_outboxSave({});});
   await page.locator('#cost-delete-selected').click();
   assert((await page.locator('#confirm-msg').innerText()).includes('extra costs'));
   await page.evaluate(()=>{DB.trips.reverse();DB.expenses.reverse();});
   await page.locator('#confirm-ok').click();await page.waitForFunction(()=>__writes===1);
   assert(await page.locator('#fab-dial').isVisible(),'FAB restored after successful batch deletion');
   assert.deepEqual(await page.evaluate(()=>({trips:DB.trips.map(x=>x.id),expenses:DB.expenses.map(x=>x.id)})),{trips:['other-trip'],expenses:['old','other-exp']},'Typed IDs survive reordering and exclude hidden records');
   assert.deepEqual(await page.evaluate(()=>Object.entries(_outboxRead()).filter(([,v])=>v.op==='delete').map(([k])=>k).sort()),['exp:shared','trip:shared'],'Both deletions enter the existing durable outbox');
   await page.locator('#cost-search').fill('');await page.locator('#cost-selection-controls .select-toggle,#cost-selection-controls .sel-exit').click();
   await page.locator('[data-cost-key="exp:other-exp"]').check();
   assert.equal(await page.locator('#cost-select-all').getAttribute('aria-checked'),'mixed');
   await page.locator('#cost-delete-selected').click();await page.evaluate(()=>{DB.expenses.find(x=>x.id==='other-exp').amount=99;});await page.locator('#confirm-ok').click();
   await page.waitForFunction(()=>!COST_DELETE_PENDING);assert.equal(await page.evaluate(()=>__writes),1,'Concurrent edit aborts whole batch');
   await page.locator('#cost-delete-selected').click();await page.evaluate(()=>{_currentUserId='another-user';});await page.locator('#confirm-ok').click();await page.waitForFunction(()=>!COST_DELETE_PENDING);
   assert.equal(await page.evaluate(()=>__writes),1,'Account switch cannot delete');
   await page.evaluate(()=>{_currentUserId='ui-test';renderExpenses();});
   for(const width of (mobile?[320,390,800]:[1440])){
    await page.setViewportSize({width,height:960});await page.evaluate(()=>{COST_SELECTION_MODE=true;renderExpenses();});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Controls fit viewport '+width);
   }
   await page.setViewportSize({width:mobile?390:1440,height:960});
   await page.locator('#cost-select-all').click();
   if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/costs-selection-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
   await page.locator('#cost-selection-controls .sel-exit').click();
   assert(await page.locator('#fab-dial').isVisible(),'Done restores FAB');
   if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/costs-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
   for(const state of ['listed','sourced']){
    await page.evaluate(state=>{goToTab('stock');STOCK_STATE_FILTER=state;STOCK_SEARCH='';renderStock();},state);
    assert(await page.locator('#p-stock').evaluate(p=>{
     const seg=p.querySelector('.stock-state-seg'),bar=p.querySelector('.age-bar-wrap'),controls=p.querySelector('.rt-list-controls');
     return !!bar&&seg.nextElementSibling===bar&&bar.getBoundingClientRect().top>=seg.getBoundingClientRect().bottom&&bar.getBoundingClientRect().bottom<=controls.getBoundingClientRect().top;
    }),'Stock age bar directly follows state row, before search');
    const bucket=page.locator('#p-stock>.age-bar-wrap .age-bar-seg').first();await bucket.click();
    assert(await bucket.getAttribute('class').then(c=>c.includes('active')),'Age segment remains clickable');
   }
   await page.evaluate(()=>{STOCK_SELECTION_MODE=false;renderStock();});
   await page.locator('#p-stock .select-toggle').click();
   assert(!await page.locator('#fab-dial').isVisible(),'Stock selection hides FAB');
   assert(await page.locator('#fab-dial').evaluate(e=>e.inert&&e.getAttribute('aria-hidden')==='true'));
   await page.locator('#p-stock .sel-exit').click();
   assert(await page.locator('#fab-dial').isVisible(),'Stock Done restores FAB');
   await page.locator('#p-stock .select-toggle').click();
   await page.evaluate(()=>goToTab('accounts'));
   assert(await page.locator('#fab-dial').isVisible(),'Navigation restores creation actions');
   assert.deepEqual(errors,[]);await context.close();console.log('PASS cost search, scoped bulk deletion, concurrent safety and Stock indicator',mobile?'mobile':'desktop');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
