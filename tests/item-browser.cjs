/* Item edits run in the isolated startup harness; no real data or API writes. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const {page,context,errors}=await open(browser,{signedIn:true,mobile:true});await settled(page);
  await page.waitForFunction(()=>window.__rtPartnerArrangementsV2Ready);
  await page.evaluate(()=>{
   window.itemSaves=0;saveDB=function(){window.itemSaves++;};
   DB={'SEP-26':[],trips:[],expenses:[]};
   window.itemFixture=function(overrides={}){return Object.assign({id:'item-test',gid:'R-001',item:'Canon EOS camera kit',state:'listed',dateSourced:'2026-09-01',dateListed:'2026-09-03',dateSold:null,costPrice:50,salePrice:200,shippingCost:2,postage:0,packagingCost:1,promoPercent:0,listingFee:0,parts:[],returnHistory:[],defaultPlatform:'ebay_biz',salePlatform:'ebay_biz',_postageMode:'custom'},overrides);};
   _accounts=[{id:'partner',name:'Partner example',accountType:'consignment',arrangementModel:'profit_share',defaultSplitPercent:50,settlements:[]},{id:'supplier',name:'Supplier example',accountType:'supplier',arrangementModel:'fixed_cost',settlements:[]}];
   localStorage.setItem(SHIPPING_POLICIES_KEY,JSON.stringify([{name:'Tracked parcel',yourCost:3.4,buyerPays:4.99},{name:'Free delivery',yourCost:3.4,buyerPays:0}]));
   DB['SEP-26']=[itemFixture()];openItemPage('SEP-26','item-test');
  });
  await page.locator('#ip-policy-sel-item-test').selectOption('Tracked parcel');
  assert.deepEqual(await page.evaluate(()=>({ship:DB['SEP-26'][0].shippingCost,post:DB['SEP-26'][0].postage,saves:itemSaves})),{ship:3.4,post:4.99,saves:1});
  assert.equal(await page.locator('#ip-policy-sel-item-test').inputValue(),'Tracked parcel');
  await page.evaluate(()=>renderItemPage('SEP-26','item-test'));
  assert.equal(await page.locator('#ip-policy-sel-item-test').inputValue(),'Tracked parcel','Selection survives rebuild');
  await page.locator('#ip-ship-item-test').fill('6');await page.locator('#ip-ship-item-test').press('Tab');
  assert.equal(await page.locator('#ip-policy-sel-item-test').inputValue(),'','Manual amounts are custom');
  await page.locator('#ip-policy-sel-item-test').selectOption('Free delivery');
  assert.equal(await page.locator('#ip-post-item-test').inputValue(),'0','Zero buyer amount is retained');
  await page.locator('#ip-policy-sel-item-test').selectOption('__clear_postage__');
  assert.deepEqual(await page.evaluate(()=>[DB['SEP-26'][0].shippingCost,DB['SEP-26'][0].postage]),[0,0]);
  await page.evaluate(()=>{DB['SEP-26'][0]=itemFixture({dateSold:'2026-09-05',resaleSalePrice:220,resaleDateSold:'2026-09-20',resaleShippingCost:7,resalePostage:8});renderItemPage('SEP-26','item-test');});
  await page.locator('#ip-policy-sel-item-test').selectOption('Tracked parcel');
  assert.deepEqual(await page.evaluate(()=>{const i=DB['SEP-26'][0];return [i.shippingCost,i.postage,i.resaleShippingCost,i.resalePostage];}),[2,0,3.4,4.99],'Policy changes only the current resale');
  await page.evaluate(()=>{DB['SEP-26'][0]=itemFixture();editItem('SEP-26','item-test');});
  await page.locator('#edit-shipping-policy').selectOption('Tracked parcel');
  assert.deepEqual(await page.evaluate(()=>['edit-shipping-c','edit-postage-c'].map(id=>document.getElementById(id).value)),['3.40','4.99']);
  await page.locator('#edit-shipping-policy').selectOption('__clear_postage__');
  assert.equal(await page.locator('#edit-postage-c').inputValue(),'0.00');
  await page.evaluate(()=>{closePanel();openQuickAdd();});
  // The quick listing form renders postage after choosing a shipping platform.
  await page.locator('#qa-platform-row [data-platform="ebay_biz"]').tap();
  {
   await page.locator('#qa-shipping-policy').selectOption('Tracked parcel');
   assert.equal(await page.locator('#qa-postage').inputValue(),'4.99');
   await page.locator('#qa-shipping-policy').selectOption('__clear_postage__');assert.equal(await page.locator('#qa-shipping').inputValue(),'0.00');
  }
  await page.evaluate(()=>{closePanel();DB['SEP-26'][0]=itemFixture({costPrice:0,accountId:'partner',accountType:'consignment',accountSplitPercent:50});renderItemPage('SEP-26','item-test');});
  const totals=await page.evaluate(()=>{const i=DB['SEP-26'][0];return {gross:calcEstGrossProfit(i),net:calcEstProfit(i)};});
  assert(Math.abs(totals.net-totals.gross/2)<.011);
  assert((await page.locator('.ip-profit-token').innerText()).includes(totals.net.toFixed(2)),'Headline includes partner deduction');
  assert((await page.locator('.ip-section-pnl').innerText()).includes('Partner share'),'Receipt includes partner deduction');
  await page.locator('#ip-partner-method').selectOption('fixed');await page.locator('#ip-partner-fixed').fill('40');await page.locator('.ip-cost-form button[type=submit]').tap();
  assert.deepEqual(await page.evaluate(()=>{const i=DB['SEP-26'][0];return [i.accountPaidAmount,i.accountSplitPercent,i.partnerAgreedAmount,calcEstProfit(i),+(calcEstGrossProfit(i)-40).toFixed(2)];}),[40,null,40,+(totals.gross-40).toFixed(2),+(totals.gross-40).toFixed(2)]);
  await page.evaluate(()=>{const i=DB['SEP-26'][0];i.dateSold='2026-09-20';i.state='sold';renderItemPage('SEP-26','item-test');});
  const roundtrip=await page.evaluate(()=>{const i=DB['SEP-26'][0],row=_itemToRow(i,'SEP-26'),copy=_rowToItem(row);return [copy.accountPaidAmount,copy.partnerAgreedAmount,calcNetProfit(i),calcGrossProfit(i)-40];});
  assert.equal(roundtrip[0],40);assert.equal(roundtrip[1],40);assert(Math.abs(roundtrip[2]-roundtrip[3])<.011);
  assert((await page.locator('.ip-profit-token').innerText()).includes(roundtrip[2].toFixed(2)),'Sold headline is net, not gross');
  await page.evaluate(()=>{const i=DB['SEP-26'][0];i.accountSettled=true;renderItemPage('SEP-26','item-test');});
  assert(await page.locator('#ip-partner').isDisabled());assert(await page.locator('#ip-partner-fixed').isDisabled());
  await page.evaluate(()=>{DB['SEP-26'][0].costPrice=25;renderItemPage('SEP-26','item-test');});
  await page.locator('.ip-cost-form button[type=submit]').tap();
  assert.equal(await page.evaluate(()=>DB['SEP-26'][0].costPrice),25,'Saving locked terms preserves historical acquisition cost');
  await page.evaluate(()=>{DB['SEP-26'][0]=itemFixture({accountId:'supplier',accountType:'supplier',costPrice:0,accountPaidAmount:0});renderItemPage('SEP-26','item-test');});
  await page.locator('#ip-buy-cost').fill('75');await page.locator('.ip-cost-form button[type=submit]').tap();
  assert.deepEqual(await page.evaluate(()=>{const i=DB['SEP-26'][0];return [i.costPrice,i.accountPaidAmount,i.partnerAgreedAmount,_estimatedPartnerCutFromProfit(i,100)];}),[75,75,75,0],'Supplier purchase counts once');
  await page.locator('#ip-partner').selectOption('partner');
  assert.deepEqual(await page.evaluate(()=>{const i=DB['SEP-26'][0];return [i.partnerAgreedAmount,i.arrangementModelOverride,i.costPrice];}),[null,null,0],'Reassignment removes old canonical terms');
  await page.evaluate(()=>{DB['SEP-26'][0]=itemFixture({accountId:'partner',accountType:'hybrid',costPrice:50,accountSplitPercent:50});renderItemPage('SEP-26','item-test');});
  await page.locator('#ip-partner-percent').fill('30');await page.locator('.ip-cost-form button[type=submit]').tap();
  const hybrid=await page.evaluate(()=>{const i=DB['SEP-26'][0];return [i.costPrice,i.accountSplitPercent,calcEstProfit(i),+(calcEstGrossProfit(i)*.7).toFixed(2)];});
  assert.deepEqual(hybrid.slice(0,2),[50,30]);assert(Math.abs(hybrid[2]-hybrid[3])<.011,'Hybrid upfront + partner share counted once');
  await page.locator('.ip-section-details .ip-section-header').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('.ip-section-details .ip-section-header').getAttribute('aria-expanded'),'true');
  await page.locator('#ip-policy-sel-item-test').selectOption('Tracked parcel');
  assert.equal(await page.locator('.ip-section-details .ip-section-header').getAttribute('aria-expanded'),'true','Policy saves preserve disclosure state');
  await page.locator('.ip-section-details .ip-section-header').tap();
  await page.evaluate(()=>{const i=DB['SEP-26'][0];i.isReturned=false;i.dateSold=null;i.returnHistory=[{id:'r',saleNo:1,type:'full_seller',refundAmount:200,loggedAt:'2026-09-05',_dateSoldAtReturn:'2026-09-04',_salePriceAtReturn:200,_platformAtReturn:'ebay_biz',_relistedAt:'2026-09-06',_salePriceAtRelist:200,_shippingCostAtRelist:2,_postageAtRelist:0,_packagingCostAtRelist:1}];renderItemPage('SEP-26','item-test');});
  const expected=await page.evaluate(()=>calcEstProfit(DB['SEP-26'][0]));
  assert((await page.locator('#rl-lifetime').innerText()).includes(Math.abs(expected).toFixed(2)),'Relist projection includes partner payout');
  await page.locator('#rl-promo-input').fill('5');
  const projection=await page.evaluate(()=>({net:document.getElementById('rl-lifetime').textContent,partner:document.getElementById('rl-partner').textContent}));
  assert(!projection.net.includes('NaN')&&!projection.partner.includes('NaN'),'Scenario preview keeps finite net and partner values');
  await page.evaluate(()=>{DB['SEP-26'][0]=itemFixture({accountId:'partner',accountType:'consignment',costPrice:0,accountSplitPercent:50});renderItemPage('SEP-26','item-test');document.getElementById('toast').classList.remove('on');window.scrollTo(0,0);});
  await page.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');document.body.setAttribute('data-theme','dark');renderItemPage('SEP-26','item-test');});
  if(process.env.RETRADE_CAPTURE)fs.mkdirSync(process.env.RETRADE_CAPTURE,{recursive:true});
  for(const width of [320,390,768,1024,1440]){
   await page.setViewportSize({width,height:900});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Item page overflow '+width);
   await page.evaluate(()=>window.scrollTo(0,0));
   if(process.env.RETRADE_CAPTURE&&(width===390||width===1440))await page.screenshot({path:process.env.RETRADE_CAPTURE+'/item-'+width+'.png',fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>_refreshSideNavSync('saving'));
  await page.waitForFunction(()=>document.getElementById('mobile-sync-badge').classList.contains('saving'));
  const status=await page.locator('#mobile-sync-badge').evaluate(el=>{const r=el.getBoundingClientRect();return {inHeader:el.parentElement.id==='mobile-top-bar',top:r.top,bottom:r.bottom,labelWidth:el.querySelector('.rt-sync-label').getBoundingClientRect().width};});
  assert(status.inHeader&&status.top>=0&&status.bottom<180&&status.labelWidth<=1,'No page-bottom sync text: '+JSON.stringify(status));
  await page.evaluate(()=>_refreshSideNavSync('synced'));assert.equal(await page.locator('#mobile-sync-badge').innerText(),'');
  await page.evaluate(()=>{window.retries=0;retradeForceResync=()=>{window.retries++;};_refreshSideNavSync('error');});
  await page.locator('#mobile-sync-badge .rt-sync-retry').tap();assert.equal(await page.evaluate(()=>retries),1);
  await page.setViewportSize({width:320,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Error status fits narrow header');
  await page.evaluate(()=>{_refreshSideNavSync('synced');DB['SEP-26'][0]=itemFixture({state:'sourced',salePrice:0,estSalePrice:200,accountId:'partner',accountType:'consignment',costPrice:0,accountSplitPercent:50});renderItemPage('SEP-26','item-test');});
  assert(await page.locator('#ip-partner-percent').isVisible(),'Unlisted stock also has partner editor');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS item policy atomicity/current sale, partner edits/persistence/net totals, responsive layout and header sync');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
