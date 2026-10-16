/* Synthetic stock creation and bulk listing. All external requests are blocked. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
const isWebkit=process.argv.includes('--webkit');
async function seed(page){
 await page.evaluate(()=>{
  const make=(id,extra={})=>Object.assign({id,gid:'R-'+id,item:'Camera '+id,state:'sourced',dateSourced:'2026-09-20',dateListed:null,dateSold:null,costPrice:20,estSalePrice:90,salePrice:0,promoPercent:.02,category:'Digital Cameras & Lenses',location:'Shelf A',parts:[{id:'part-'+id,description:'Battery',cost:5,date:'2026-09-21'}],returnHistory:[],defaultPlatform:'ebay',notes:'Keep me',photo:'photo-path',purchaseGroupId:'purchase-1',sourcingRunId:'run-1'},extra);
  DB={'SEP-26':[make('a',{accountId:'partner',accountSettled:true,accountPaidAmount:20}),make('b',{category:'',location:'',estSalePrice:null,defaultPlatform:'ebay_biz',_postageMode:'custom',postage:4,shippingCost:3,packagingCost:.5}),make('returned',{returnHistory:[{id:'return-1',type:'full_seller',saleNo:1,refundAmount:80}]}),make('listed',{state:'listed',dateListed:'2026-09-25',salePrice:100})],trips:[],expenses:[]};
  _accounts=[];_jobLots=[];_jobLotItems=[];_sourcingRuns=[];_saleReconciliations=[];
  STOCK_SELECTED.clear();STOCK_SELECTION_MODE=false;STOCK_STATE_FILTER='sourced';STOCK_FILTER='all';STOCK_SOURCED_FILTER='all';STOCK_SEARCH='';
  window.__bulkSaves=0;saveDB=async()=>{window.__bulkSaves++;};
  goToTab('stock',null,{stockState:'sourced'});renderStock();
 });
 await page.waitForFunction(()=>!document.querySelector('#p-stock').hasAttribute('aria-busy'));
}
async function select(page){
 await page.locator('#p-stock .select-toggle').click();
 await page.locator('#p-stock .sel-check').click();
 const action=page.locator('[data-stock-action="list"]:visible');
 if(!await action.count())await page.locator('#p-stock .bulk-actions-menu summary').click();
 await page.locator('[data-stock-action="list"]:visible').click();
 await page.waitForSelector('#bulk-list-form');
}
(async()=>{
 const browser=await (isWebkit?webkit:chromium).launch({headless:true,...(!isWebkit&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:isWebkit?[]:['--no-sandbox']});
 try{for(const width of [320,390,1440]){
  const {page,context,errors}=await open(browser,{signedIn:true,mobile:width<600});await settled(page);await page.setViewportSize({width,height:900});await seed(page);
  const original=await page.evaluate(()=>JSON.stringify(DB));
  await select(page);
  assert.equal(await page.locator('[data-bulk-list-row]').count(),2,'Returned-history item is excluded');
  assert.match(await page.locator('.bulk-list-skipped').innerText(),/1 selected item/);
  assert.equal(await page.locator('#bulk-list-0-price').inputValue(),'90');
  assert.equal(await page.locator('#bulk-list-0-promo').inputValue(),'2');
  await page.locator('#bulk-list-cancel').click();assert.equal(await page.evaluate(()=>JSON.stringify(DB)),original,'Cancel is read-only');
  await page.evaluate(()=>openStockBulkList());
  await page.locator('#bulk-list-date').fill('2026-10-16');
  await page.locator('#bulk-list-save').click();assert.match(await page.locator('#bulk-list-error').innerText(),/marked/);assert.equal(await page.evaluate(()=>window.__bulkSaves),0);
  await page.locator('#bulk-list-1-price').fill('45.25');await page.locator('#bulk-list-1-category').selectOption('Computer Accessories & Parts');await page.locator('#bulk-list-1-location').fill('Box B');
  await page.locator('#bulk-list-0-promo').fill('101');await page.locator('#bulk-list-save').click();assert.equal(await page.evaluate(()=>JSON.stringify(DB)),original);
  await page.locator('.bulk-list-shared summary').click();await page.locator('#bulk-list-promo-all').fill('3.5');await page.locator('#bulk-list-apply').click();
  assert.equal(await page.locator('#bulk-list-0-promo').inputValue(),'3.5');assert.equal(await page.locator('#bulk-list-1-promo').inputValue(),'3.5');
  await page.locator('#bulk-list-0-price').fill('120');await page.locator('#bulk-list-0-rate').selectOption('0');
  assert.match(await page.locator('[data-bulk-list-row="0"] [data-delivery-summary]').innerText(),/£3.42/);
  await page.locator('#bulk-list-date').fill('2026-09-01');await page.locator('#bulk-list-save').click();assert.match(await page.locator('#bulk-list-error').innerText(),/source date/);
  await page.locator('#bulk-list-date').fill('2026-10-16');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No document overflow at '+width);
  assert(await page.locator('#bulk-list-form').evaluate(form=>[...form.querySelectorAll('input,select,button')].filter(el=>el.getClientRects().length).every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})),'Inputs fit at '+width);
  if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/bulk-list-'+width+'.png'});
  await page.locator('#bulk-list-save').click();await page.waitForFunction(()=>window.__bulkSaves===1);
  const result=await page.evaluate(()=>({a:_findItemRecordById('a'),b:_findItemRecordById('b'),skipped:DB['SEP-26'].map(i=>({id:i.id,state:i.state})),selected:[...STOCK_SELECTED]}));
  assert.equal(result.a.month,'OCT-26');assert.equal(result.b.month,'OCT-26');
  assert.equal(result.a.item.state,'listed');assert.equal(result.a.item.salePrice,120);assert.equal(result.a.item.promoPercent,.035);assert.equal(result.a.item.shippingCost,3.42);assert.equal(result.a.item.postage,3.42);assert.equal(result.a.item._sdRateIdx,0);
  assert.equal(result.a.item.dateSold,null);assert.equal(result.a.item.dateSourced,'2026-09-20');assert.equal(result.a.item.accountSettled,true);assert.equal(result.a.item.accountPaidAmount,20);assert.equal(result.a.item.parts[0].id,'part-a');assert.equal(result.a.item.purchaseGroupId,'purchase-1');assert.equal(result.a.item.sourcingRunId,'run-1');assert.equal(result.a.item.photo,'photo-path');
  assert.equal(result.b.item.salePrice,45.25);assert.equal(result.b.item.location,'Box B');assert.equal(result.b.item.shippingCost,3);assert.equal(result.b.item.postage,4);assert.equal(result.b.item.packagingCost,.5);assert.equal(result.b.item.listingFee,.36);
  assert.deepEqual(result.selected,['returned']);assert.deepEqual(result.skipped,[{id:'returned',state:'sourced'},{id:'listed',state:'listed'}]);
  // Another session edits a selected record while the review is open: no partial batch.
  await seed(page);await select(page);await page.locator('#bulk-list-1-price').fill('40');await page.locator('#bulk-list-1-category').selectOption('Other');await page.locator('#bulk-list-1-location').fill('Shelf C');
  await page.evaluate(()=>{DB['SEP-26'][0].notes='Changed elsewhere';});await page.locator('#bulk-list-save').click();assert.match(await page.locator('#bulk-list-error').innerText(),/changed while/);assert.equal(await page.evaluate(()=>window.__bulkSaves),0);
  // Membership created while reviewing must also invalidate the batch.
  await page.locator('#bulk-list-cancel').click();await page.evaluate(()=>{openStockBulkList();_jobLots=[{id:'lot',status:'building'}];_jobLotItems=[{jobLotId:'lot',itemId:'a'}];});
  await page.locator('#bulk-list-1-price').fill('40');await page.locator('#bulk-list-1-category').selectOption('Other');await page.locator('#bulk-list-1-location').fill('Shelf C');await page.locator('#bulk-list-save').click();assert.equal(await page.evaluate(()=>window.__bulkSaves),0);
  // Required details on quick-add, retained when adding another item in the same session.
  await page.evaluate(()=>{closePanel();openStockQuickAdd();});await page.locator('#sqa-title').fill('New camera');await page.locator('#sqa-cost').fill('10');await page.locator('#sqa-next-btn').click();assert.equal(await page.evaluate(()=>window.__bulkSaves),0);
  await page.locator('#sqa-category').selectOption('Digital Cameras & Lenses');await page.locator('#sqa-location').fill('   ');await page.locator('#sqa-next-btn').click();assert.equal(await page.evaluate(()=>window.__bulkSaves),0);
  await page.locator('#sqa-location').fill('Shelf 4');await page.locator('#sqa-next-btn').click();assert.equal(await page.evaluate(()=>window.__bulkSaves),1);assert.equal(await page.locator('#sqa-location').inputValue(),'Shelf 4');assert.equal(await page.locator('#sqa-category').inputValue(),'Digital Cameras & Lenses');
  const created=await page.evaluate(()=>allDBKeys().flatMap(m=>DB[m]||[]).find(i=>i.item==='New camera'));assert.equal(created.state,'sourced');assert.equal(created.location,'Shelf 4');assert.equal(created.category,'Digital Cameras & Lenses');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS bulk list review, validation, lifecycle, cancellation, concurrency and stock creation',width,isWebkit?'WebKit':'Chromium');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
