/* Job lot lifecycle and single-listing fees; the shared harness blocks all business traffic. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
const safari=process.argv.includes('--webkit');
const saveSource=fs.readFileSync(path.join(__dirname,'../src/core/application.js'),'utf8').match(/function saveDB\(\)\{[\s\S]*?\n\}/)[0];
(async()=>{
 const browser=await(safari?webkit:chromium).launch({headless:true,...(!safari?{args:['--no-sandbox']}:{} )});
 try{for(const width of [1440,320]){
  const {page,context,errors}=await open(browser,{signedIn:true,mobile:width===320});await settled(page);await page.setViewportSize({width,height:960});
  await page.evaluate(source=>{saveDB=(0,eval)('('+source+')');_previewMode=true;},saveSource);
  await page.evaluate(()=>{
   _accounts=[];_jobLots=[];_jobLotItems=[];_jobLotSchemaAvailable=true;_saleReconciliations=[];_sourcingRuns=[];
   DB={'NOV-26':['a','b'].map((id,n)=>({id,item:n?'Lens':'Camera',state:'sourced',costPrice:n?20:80,estSalePrice:n?40:120,dateSourced:'2026-11-01',purchasePaidDate:'2026-11-01',purchaseGroupId:'purchase1',purchaseGroupName:'Camera kit',category:'Digital Cameras & Lenses',location:'Shelf A',parts:[],returnHistory:[],refreshHistory:[],salePrice:0,dateListed:null,dateSold:null,promoPercent:0,listingFee:0,postage:0,shippingCost:0,packagingCost:0,isReturned:false})),trips:[],expenses:[],activityLog:[]};
   window.lot=_createJobLot('Camera kit',['a','b']);window.beforeListing=JSON.stringify(DB['NOV-26']);openJobLotPage(lot.id);
  });
  assert.equal(await page.evaluate(()=>lot.salePrice),160);
  await page.getByRole('button',{name:'List lot',exact:true}).click();
  await page.locator('#jl-list-price').fill('159.99');
  await page.locator('#jl-list-category').selectOption('Digital Cameras & Lenses');await page.locator('#jl-list-promo').fill('3');
  assert.match(await page.locator('#jl-price-help').innerText(),/discount.*0\.01/);
  assert.match(await page.locator('#jl-fee-preview').innerText(),/Promotion/);
  assert(await page.locator('#panel-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Job lot editor fits viewport');
  if(process.env.RETRADE_CAPTURE){fs.mkdirSync(process.env.RETRADE_CAPTURE,{recursive:true});await page.screenshot({path:path.join(process.env.RETRADE_CAPTURE,'joblot-editor-'+width+'-'+(safari?'webkit':'chromium')+'.png')});}
  await page.locator('#jl-list-save').click();
  assert.deepEqual(await page.evaluate(()=>[lot.status,lot.salePrice,lot.category,lot.promoPercent,JSON.stringify(DB['NOV-26'])===beforeListing]),['listed',159.99,'Digital Cameras & Lenses',.03,true]);
  assert.equal(await page.getByRole('button',{name:'Split into separate items',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Remove',exact:true}).count(),0);
  await page.getByRole('button',{name:'Edit listing',exact:true}).click();
  assert.equal(await page.locator('#jl-list-promo').inputValue(),'3.0');
  await page.locator('#jl-list-price').fill('999');await page.locator('#jl-list-back').click();
  assert.equal(await page.evaluate(()=>lot.salePrice),159.99,'Back discards unsaved edits');
  await page.getByRole('button',{name:'Edit listing',exact:true}).click();await page.keyboard.press('Escape');
  assert(await page.getByRole('button',{name:'Edit listing',exact:true}).isVisible(),'Escape returns to lot');
  await page.evaluate(()=>{DB['NOV-26'][0].estSalePrice=140;saveDB();openJobLotPage(lot.id);});
  assert.equal(await page.evaluate(()=>lot.salePrice),179.99,'Member change carries into discounted total');
  assert.match(await page.locator('#panel-content').innerText(),/179\.99 asking total/);
  await page.getByRole('button',{name:'Edit listing',exact:true}).click();await page.locator('#jl-price-linked').uncheck();await page.locator('#jl-list-save').click();
  await page.evaluate(()=>{DB['NOV-26'][0].estSalePrice=170;saveDB();});
  assert.equal(await page.evaluate(()=>lot.salePrice),179.99,'Explicit fixed price stays fixed');
  const row=await page.evaluate(()=>_jobLotToRow(lot));assert.equal(row.category,'Digital Cameras & Lenses');assert.equal(row.promo_percent,.03);assert.equal(row.price_mode,'fixed');
  await page.evaluate(()=>openJobLotPage(lot.id));await page.getByRole('button',{name:'Withdraw listing',exact:true}).click();
  assert.match(await page.locator('#confirm-msg').innerText(),/keep its items together/);await page.locator('#confirm-ok').click();
  await page.waitForFunction(()=>lot.status==='building');assert.equal(await page.evaluate(()=>_jobLotPhysicalCount(lot.id)),2);
  await page.getByRole('button',{name:'Edit job lot',exact:true}).click();await page.locator('#jl-list-promo').fill('101');await page.locator('#jl-list-save').click();
  assert.equal(await page.evaluate(()=>lot.promoPercent),.03,'Invalid promotion is not saved');await page.locator('#jl-list-cancel').click();
  await page.getByRole('button',{name:'Split into separate items',exact:true}).click();await page.locator('#confirm-ok').click();
  await page.waitForFunction(()=>lot.status==='broken_apart');
  assert.equal(await page.evaluate(()=>DB['NOV-26'].every(i=>_itemLifecycleState(i)==='sourced'&&!_activeJobLotMembership(i.id)&&i.purchaseGroupId==='purchase1')),true);
  assert.equal(await page.evaluate(()=>DB['NOV-26'].reduce((s,i)=>s+i.costPrice,0)),100);
  // One listing crosses the camera category fee threshold; child categories stay intact.
  await page.evaluate(()=>{DB['NOV-26'][0].category='Toys & Games';DB['NOV-26'].forEach(i=>i.estSalePrice=600);window.soldLot=_createJobLot('One listing',['a','b']);soldLot.platform='ebay_biz';soldLot.category='Digital Cameras & Lenses';soldLot.promoPercent=.023;openJobLotSale(soldLot.id);});
  assert.equal(await page.locator('#jl-sale-promo').inputValue(),'2.3');assert.equal(await page.locator('#jl-sale-category').inputValue(),'Digital Cameras & Lenses');
  await page.locator('button[onclick^="confirmJobLotSale"]').click();await page.waitForFunction(()=>soldLot.status==='sold');
  const totals=await page.evaluate(()=>{
    const bs=DB['NOV-26'].map(i=>_saleBreakdown({item:i,sale:'1'})),sum=k=>+bs.reduce((s,b)=>s+b[k],0).toFixed(2);
    return {fee:sum('bpf'),expected:calcEbayBizBPF(1200,'Digital Cameras & Lenses',1200),promo:sum('promoFee'),adExpected:_calcPromoFee('ebay_biz',1200,0,.023),category:DB['NOV-26'][0].category,history:DB['NOV-26'].every(i=>_rowToItem(_itemToRow(i,'NOV-26')).refreshHistory.some(r=>r.type==='joblot_listing'))};
  });assert.equal(totals.fee,totals.expected);assert.equal(totals.promo,totals.adExpected);assert.equal(totals.category,'Toys & Games');assert(totals.history);
  // Splitting returned stock preserves the previous sale and original purchase.
  await page.evaluate(()=>{closePanel(true);const i=DB['NOV-26'][0];i.returnHistory=[{saleNo:1,type:'full_seller',refundAmount:i.salePrice,loggedAt:'2026-11-22'}];i.isReturned=true;i.state='returned';window.returnLot=_createJobLot('Returned camera',['a']);openJobLotPage(returnLot.id);window.saleBefore=_saleCycleSnapshot(i,1);});
  await page.getByRole('button',{name:'Split into separate items',exact:true}).click();await page.locator('#confirm-ok').click();
  await page.waitForFunction(()=>returnLot.status==='broken_apart');
  assert.deepEqual(await page.evaluate(()=>{const s=_saleCycleSnapshot(DB['NOV-26'][0],1);return [s.date,s.price,s.bundleId];}),await page.evaluate(()=>[saleBefore.date,saleBefore.price,saleBefore.bundleId]));
  assert.equal(await page.evaluate(()=>_itemLifecycleState(DB['NOV-26'][0])),'sourced');
  // A second returned sale is also archived before its live slot is cleared.
  assert.deepEqual(await page.evaluate(()=>{
    const i=DB['NOV-26'][0];_applyJobLotSaleLeg(i,{date:'2026-11-23',salePrice:150,platform:'ebay_biz',category:'Digital Cameras & Lenses',bundleId:'second',bundleRef:'Second',bundleTotal:150,promo:.02});
    i.returnHistory.push({saleNo:2,type:'full_seller',refundAmount:150,_dateSoldAtReturn:'2026-11-23',_salePriceAtReturn:150,_bundleIdAtReturn:'second'});i.isReturned=true;i.estSalePrice=140;
    _jobLotUnlistMember(i);const old=_saleCycleSnapshot(i,2);
    const state=_itemLifecycleState(i);_applyJobLotSaleLeg(i,{date:'2026-11-23',salePrice:140,platform:'ebay_biz',category:'Digital Cameras & Lenses',bundleId:'third',bundleRef:'Third',bundleTotal:140,promo:.02});
    return [state,old.price,old.bundleId,_currentResaleCycleNo(i),_saleCycleSnapshot(i,3).price];
  }),['sourced',150,'second',3,140]);
  // Legacy listed lots retain their saved ask on initial hydration.
  assert.deepEqual(await page.evaluate(()=>{
    const l={id:'legacy',status:'listed',salePrice:59.99};_jobLots.push(l);_jobLotItems.push({id:'legacy-member',jobLotId:'legacy',itemId:'b',removedAt:null});
    DB['NOV-26'][1].state='listed';DB['NOV-26'][1].dateSold=null;DB['NOV-26'][1].salePrice=75;
    _initJobLotPrice(l);const before=_jobLotAskingPrice(l);DB['NOV-26'][1].salePrice=85;saveDB();return [before,l.salePrice];
  }),[59.99,69.99]);
  await page.evaluate(()=>{closePanel(true);openStockQuickAdd();});
  assert(await page.locator('#sqa-category').isVisible(),'Category is available before listing');
  await page.locator('#sqa-category').selectOption('Digital Cameras & Lenses');
  await page.locator('#sqa-multiple').click();await page.locator('#confirm-ok').click();await page.waitForSelector('#purchase-multiple');
  assert.equal(await page.locator('.purchase-line').count(),2);assert(await page.locator('#purchase-multiple').isChecked());
  await page.locator('#purchase-multiple').click();await page.waitForSelector('#sqa-category');
  assert.deepEqual(errors,[]);await context.close();console.log('Job lot controls passed at '+width+'px in '+(safari?'WebKit':'Chromium'));
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
