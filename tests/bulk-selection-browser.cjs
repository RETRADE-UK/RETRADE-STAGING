/* Synthetic sale-event selection, batch lifecycle corrections and responsive controls. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,webkit}=require('playwright');const {open,settled}=require('./startup-browser.cjs');
const isWebkit=process.argv.includes('--webkit');
async function seed(page){
 await page.evaluate(()=>{
  const make=(id,extra={})=>Object.assign({id,gid:id,item:'Camera '+id,state:'sold',costPrice:20,salePrice:100,dateListed:'2026-10-01',dateSourced:'2026-09-20',dateSold:'2026-10-10',parts:[],returnHistory:[],refreshHistory:[],defaultPlatform:'fb',salePlatform:'fb',soldOnPlatform:'fb',shippingCost:0,postage:5,packagingCost:0,promoPercent:0,listingFee:0},extra);
  const prior={id:'prior',saleNo:1,type:'full_seller',loggedAt:'2026-10-03',_dateSoldAtReturn:'2026-10-02',_salePriceAtReturn:80,_postageAtReturn:0,_platformAtReturn:'fb',_relistedAt:'2026-10-04',_listingFeeAtRelist:1,refundAmount:80};
  DB={'OCT-26':[make('a'),make('b'),make('resale',{dateSold:null,salePrice:120,resaleSalePrice:130,resaleDateSold:'2026-10-12',resalePlatform:'fb',resalePostage:6,resaleShippingCost:4,resaleListingFee:1,returnHistory:[prior]}),make('partial',{returnHistory:[{id:'refund',saleNo:1,type:'partial_seller',loggedAt:'2026-10-11',refundAmount:10}]}),make('paid',{accountId:'partner',accountSettled:true}),make('bundle-a',{bundleId:'group',bundleTotal:200}),make('bundle-b',{bundleId:'group',bundleTotal:200})],trips:[],expenses:[]};
  _accounts=[];_jobLots=[];_jobLotItems=[];_saleReconciliations=[];
  STOCK_SELECTED.clear();STOCK_SELECTION_MODE=false;STOCK_SEARCH='';STOCK_FILTER='all';STOCK_STATE_FILTER='all';STOCK_SOURCED_FILTER='all';
  SELECTED_MONTH='OCT-26';MONTHLY_VIEW='detail';MONTH_FILTER='all';MONTH_SORT='date-sold';MONTH_SEARCH='';SELECTION_MODE=false;SELECTED_ITEMS.clear();
  window.dispatchEvent(new Event('retrade:data-ready'));goToTab('monthly');SELECTED_MONTH='OCT-26';renderMonth();
 });
 await page.waitForFunction(()=>document.querySelector('#p-monthly').dataset.rtSalesView==='detail'&&!document.querySelector('#p-monthly').hasAttribute('aria-busy'));
}
const row=(page,id,sale='s:1')=>page.locator('[data-sale-key="'+id+'|'+encodeURIComponent(sale)+'"]');
async function action(page,name){
 const target=page.locator('[data-month-action="'+name+'"]:visible');
 if(!await target.count())await page.locator('#p-monthly .bulk-actions-menu summary').click();
 await page.locator('[data-month-action="'+name+'"]:visible').click();
}
(async()=>{
 const browser=await (isWebkit?webkit:chromium).launch({headless:true,...(!isWebkit&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:isWebkit?[]:['--no-sandbox']});
 try{
  for(const width of [320,390,600,768,944,1440]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile:width<=600});await settled(page);await page.setViewportSize({width,height:width<=600?640:1000});await page.waitForTimeout(220);await seed(page);
   await page.locator('#p-monthly .select-toggle').click();
   const toolbar=page.locator('.month-selection-toolbar');
   const checkLayout=async()=>{
    const rects=await toolbar.evaluate(el=>({h:el.getBoundingClientRect().height,buttons:[...el.querySelectorAll(':scope > .sel-check,:scope > .sel-exit,.bulk-primary-actions button,.bulk-actions-menu>summary')].filter(e=>e.getClientRects().length).map(e=>({y:e.getBoundingClientRect().top,b:e.getBoundingClientRect().bottom})),overflow:document.documentElement.scrollWidth>innerWidth+1}));
    assert(rects.h<=46,'Selection toolbar is one row at '+width+': '+JSON.stringify(rects));assert(!rects.overflow);assert(rects.buttons.every(b=>Math.abs(b.y-rects.buttons[0].y)<2));
   };
   await checkLayout();
   assert(await page.locator('[data-month-action="undo"]').first().isDisabled());
   assert(await page.locator('#sel-totals-bar').isVisible());
   const first=row(page,'a');await first.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(100);
   const before=await first.evaluate(e=>{window.__selectedRow=e;return {y:e.getBoundingClientRect().top,scroll:scrollY};});
   const hit=await first.locator('input').boundingBox();
   if(width<=600)await page.touchscreen.tap(hit.x+hit.width/2,hit.y+hit.height/2);else await page.mouse.click(hit.x+hit.width/2,hit.y+hit.height/2);
   assert(await first.locator('input').isChecked());
   const after=await first.evaluate(e=>({same:e===window.__selectedRow,y:e.getBoundingClientRect().top,scroll:scrollY}));
   assert(after.same);assert(Math.abs(before.y-after.y)<1&&Math.abs(before.scroll-after.scroll)<1,'Selection preserves rows and scroll: '+JSON.stringify({width,before,after}));await checkLayout();
   // Search removes hidden selections; select-all cannot include filtered-out rows.
   await page.locator('#month-search-input').fill('Camera b');
   assert.equal(await page.locator('[data-month-selection-count]').innerText(),'Select all');
   await page.locator('#p-monthly .sel-check').click();
   assert.equal(await page.evaluate(()=>_selectedMonthEvents().length),3); // b + bundle-a/b
   assert(await page.evaluate(()=>_selectedMonthEvents().every(e=>e.item.item.includes('Camera b'))));
   await page.locator('#month-search-input').fill('Camera a');
   await page.locator('#p-monthly .sel-check').click();
   assert.deepEqual(await page.evaluate(()=>_selectedMonthEvents().map(e=>e.item.id)),['a']);
   await page.locator('#month-search-input').fill('');
   await row(page,'b').locator('input').check();
   const snapshot=await page.evaluate(()=>JSON.stringify(DB));
   await action(page,'undo');assert((await page.locator('#confirm-msg').innerText()).includes('£210.00'));await page.locator('#confirm-cancel').click();
   assert.equal(await page.evaluate(()=>JSON.stringify(DB)),snapshot);
   await action(page,'undo');await page.locator('#confirm-ok').click();await page.waitForFunction(()=>!_selectionActionPending);
   assert.deepEqual(await page.evaluate(()=>DB['OCT-26'].slice(0,2).map(i=>({state:i.state,sold:i.dateSold,cost:i.costPrice,ask:i.salePrice}))),[{state:'listed',sold:null,cost:20,ask:100},{state:'listed',sold:null,cost:20,ask:100}]);
   assert.equal(await page.evaluate(()=>getSaleEventsInMonth('OCT-26').filter(e=>['a','b'].includes(e.item.id)).length),0);
   await seed(page);await page.locator('#p-monthly .select-toggle').click();
   await row(page,'resale','s:1').locator('input').check();
   assert(await page.locator('[data-month-action="undo"]').first().isDisabled(),'Older sale cannot reverse a newer sale');
   assert(!(await row(page,'resale','s:2').locator('input').isChecked()),'Sale cycles are selected independently');
   await row(page,'resale','s:2').locator('input').check();
   await row(page,'partial').locator('input').check();await row(page,'paid').locator('input').check();
   await page.locator('[data-sale-bundle="group"] .item-checkbox-left input').check();
   const history=await page.evaluate(()=>JSON.stringify(DB['OCT-26'].find(i=>i.id==='resale').returnHistory));
   const untouched=await page.evaluate(()=>JSON.stringify(DB['OCT-26'].filter(i=>['partial','paid','bundle-a','bundle-b'].includes(i.id))));
   await action(page,'undo');assert((await page.locator('#confirm-msg').innerText()).includes('5 selected records'));await page.locator('#confirm-ok').click();await page.waitForFunction(()=>!_selectionActionPending);
   assert.equal(await page.evaluate(()=>JSON.stringify(DB['OCT-26'].find(i=>i.id==='resale').returnHistory)),history);
   assert.equal(await page.evaluate(()=>JSON.stringify(DB['OCT-26'].filter(i=>['partial','paid','bundle-a','bundle-b'].includes(i.id)))),untouched);
   assert.deepEqual(await page.evaluate(()=>{const i=DB['OCT-26'].find(i=>i.id==='resale');return [i.state,i.resaleSalePrice,i.resaleListingFee,i.resalePlatform];}),['listed',null,1,'fb']);
   // Recheck after confirmation: do not overwrite an edit from another session.
   await seed(page);await page.locator('#p-monthly .select-toggle').click();await row(page,'a').locator('input').check();
   await action(page,'undo');await page.evaluate(()=>{DB['OCT-26'][0].salePrice=111;void runSelectionAction('month','undo');});
   await page.locator('#confirm-ok').click();await page.waitForFunction(()=>!_selectionActionPending);
   assert.equal(await page.evaluate(()=>DB['OCT-26'][0].state),'sold');assert.equal(await page.evaluate(()=>DB['OCT-26'][0].salePrice),111);
   await page.evaluate(()=>{_saleReconciliations=[{id:'reconciled',targetSaleItemId:'a',attachedItemId:'b'}];_refreshMonthSelection();});
   assert(await page.locator('[data-month-action="undo"]').first().isDisabled(),'Reconciled sales require individual review');
   // Copying multiple appearances of one item creates one fresh inventory record.
   await seed(page);await page.locator('#p-monthly .select-toggle').click();
   await page.evaluate(()=>{const i=DB['OCT-26'].find(i=>i.id==='resale');i.parts=[{id:'part-old',description:'Battery',cost:5,date:'2026-09-20'}];i.purchaseGroupId='old-purchase';i.sourcingRunId='old-run';i.accountPaidAmount=15;i._cloudUpdatedAt='old';});
   await row(page,'resale','s:1').locator('input').check();await row(page,'resale','s:2').locator('input').check();
   const original=await page.evaluate(()=>JSON.stringify(DB['OCT-26'].find(i=>i.id==='resale')));
   await action(page,'duplicate');assert.equal(await page.locator('#confirm-title').innerText(),'Duplicate 1 item to stock?');await page.locator('#confirm-cancel').click();
   assert.equal(await page.evaluate(()=>allDBKeys().flatMap(k=>DB[k]||[]).length),7);
   await action(page,'duplicate');await page.locator('#confirm-ok').click();await page.waitForFunction(()=>!_selectionActionPending&&document.querySelector('#p-stock').classList.contains('on'));
   const copies=await page.evaluate(()=>{const i=allDBKeys().flatMap(k=>DB[k]||[]).find(i=>i.id.startsWith('dup'));return {item:i.item,state:i.state,date:i.dateSourced,today:_todayISO(),cost:i.costPrice,parts:i.parts,history:i.returnHistory,sale:i.dateSold,resale:i.resaleSalePrice,fee:i.listingFee,refee:i.resaleListingFee,paid:i.accountSettled,terms:i.accountPaidAmount,purchase:i.purchaseGroupId,run:i.sourcingRunId,cloud:i._cloudUpdatedAt};});
   assert.equal(copies.item,'Camera resale - 2');assert.equal(copies.state,'sourced');assert.equal(copies.date,copies.today);assert.equal(copies.cost,20);assert.equal(copies.parts[0].cost,5);assert.notEqual(copies.parts[0].id,'part-old');assert.deepEqual(copies.history,[]);assert.equal(copies.sale,null);assert.equal(copies.resale,null);assert.equal(copies.fee,0);assert.equal(copies.refee,0);assert.equal(copies.paid,false);assert.equal(copies.terms,15);assert.equal(copies.purchase,null);assert.equal(copies.run,null);assert.equal(copies.cloud,undefined);
   assert.equal(await page.evaluate(()=>JSON.stringify(DB['OCT-26'].find(i=>i.id==='resale'))),original);
   // Menu remains inside viewport, works by keyboard, closes on Escape/outside.
   await page.locator('#p-stock .select-toggle').click();
   assert.equal(await page.locator('#p-stock [data-stock-action="sold"]').count(),0,'Unlisted queue offers relevant primary actions');
   assert(await page.locator('#p-stock [data-stock-action="duplicate"]').count());
   assert(await page.locator('#p-stock .bulk-selection-toolbar').evaluate(e=>e.getBoundingClientRect().height<=46&&document.documentElement.scrollWidth<=innerWidth+1),'Unlisted selection fits one row at '+width);
   const menu=page.locator('#p-stock .bulk-actions-menu');
   await menu.locator('summary').focus();await page.keyboard.press('Enter');
   assert(await menu.evaluate(e=>e.open));
   const bounds=await menu.locator('.bulk-actions-popover').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
   assert(bounds.y>=0&&bounds.y+bounds.height<=(width<=600?640:1000)+1,'Actions fit vertically');
   await page.keyboard.press('Escape');assert(!(await menu.evaluate(e=>e.open)));
   await menu.locator('summary').click();await page.locator('#p-stock .sel-exit').click();assert.equal(await page.locator('#p-stock .bulk-selection-toolbar').count(),0);
   if(process.env.RETRADE_CAPTURE){await page.locator('#p-stock .select-toggle').click();fs.mkdirSync(process.env.RETRADE_CAPTURE,{recursive:true});await page.locator('#p-stock .rt-list-controls').screenshot({path:process.env.RETRADE_CAPTURE+'/bulk-stock-'+width+'.png'});}
   await page.evaluate(()=>{STOCK_SELECTION_MODE=true;STOCK_STATE_FILTER='all';renderStock();});
   const allMenu=page.locator('#p-stock .bulk-actions-menu');await allMenu.locator('summary').click();await page.waitForTimeout(30);
   const allBounds=await allMenu.locator('.bulk-actions-popover').boundingBox();
   assert(allBounds.y>=0&&allBounds.y+allBounds.height<=(width<=600?640:1000)+1,'Full Stock action menu stays inside short screens');
   const lastAction=allMenu.locator('[data-stock-action="duplicate"]');await lastAction.scrollIntoViewIfNeeded();
   assert(await allMenu.evaluate(e=>e.open),'Scrolling within the menu keeps it open');
   assert.deepEqual(errors,[]);await context.close();console.log('PASS bulk selection / undo / duplicate '+width+'px '+(isWebkit?'WebKit':'Chromium'));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
