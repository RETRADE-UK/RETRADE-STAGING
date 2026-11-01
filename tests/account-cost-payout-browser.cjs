/* All I/O is synthetic and external requests are blocked by the shared harness. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
const engine=process.argv.includes('--webkit')?'webkit':'chromium';
(async()=>{
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{
  for(const mobile of [true,false]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   await page.evaluate(()=>{
    saveDB=()=>{};
    _accounts=[{id:'fixed',name:'Fixed account',accountType:'consignment',arrangementModel:'fixed_cost',paymentTiming:'upfront',paymentTerms:'upfront',settlements:[]},{id:'share',name:'Share account',accountType:'consignment',arrangementModel:'profit_share',defaultSplitPercent:50,paymentTiming:'on_sale',paymentTerms:'on_sale',settlements:[]}];
    window.costFixture=(extra={})=>Object.assign({id:'one',item:'Synthetic fixed cost',category:ITEM_CATEGORIES[0],location:'Test shelf',accountId:'fixed',accountType:'consignment',state:'listed',dateSourced:'2026-10-01',dateListed:'2026-10-02',dateSold:null,salePrice:100,costPrice:30,accountPaidAmount:30,partnerAgreedAmount:30,arrangementModelOverride:'fixed_cost',accountSplitPercent:null,accountSettled:false,salePlatform:'fb',defaultPlatform:'fb',parts:[{id:'part',description:'Repair',cost:5,date:'2026-10-03'}],returnHistory:[],refreshHistory:[]},extra);
    window.termsSnapshot=()=>JSON.stringify([
     _accounts.map(a=>[a.id,a.accountType,a.arrangementModel,a.defaultSplitPercent,a.paymentTiming,a.paymentTerms,a.settlements]),
     ((i)=>[i.id,i.accountId,i.accountType,i.arrangementModelOverride,i.partnerAgreedAmount,i.accountPaidAmount,i.accountSplitPercent,i.costPrice,i.accountSettled,i.salePrice,i.state,i.dateSold,i.parts,i.returnHistory,i.refreshHistory])(DB['OCT-26'][1])
    ]);
    DB={'OCT-26':[costFixture()],trips:[],expenses:[]};openItemPage('OCT-26','one');
   });
   // Existing duplicate fields correct on read without rewriting data or payment history.
   const economics=await page.evaluate(()=>{
    const out=[];
    for(const accountType of ['supplier','consignment','hybrid'])for(const state of ['sourced','listed','sold']){
     const i=costFixture({accountType,state,dateSold:state==='sold'?'2026-10-10':null});
     const before=JSON.stringify(i),profit=state==='sold'?calcNetProfit(i):calcEstProfit(i);
     out.push({accountType,state,profit,debt:_accountItemDebt(i),unchanged:before===JSON.stringify(i)});
    }
    return out;
   });
   assert.equal(await page.evaluate(()=>{const i=costFixture({salePrice:0,estSalePrice:100,state:'sourced'}),own=Object.assign({},i,{accountId:null,accountType:null,accountPaidAmount:null,accountSplitPercent:null,partnerAgreedAmount:null,arrangementModelOverride:null,costPrice:30});return _estPotentialNet(i)-_estPotentialNet(own);}),0,'Unlisted estimate deducts the shared amount once');
   assert(economics.every(r=>r.profit===65&&r.debt===30&&r.unchanged),JSON.stringify(economics));
   assert.equal(await page.evaluate(()=>{const resolver=window._rtArrangementForItem;try{window._rtArrangementForItem=undefined;return calcNetProfit(costFixture({state:'sold',dateSold:'2026-10-10'}));}finally{window._rtArrangementForItem=resolver;}}),65,'First render is correct before partner presentation loads');
   assert.equal(await page.locator('.ip-cost-token .ip-token-val').innerText(),'£35.00');
   assert.equal(await page.locator('#ip-partner-fixed').inputValue(),'30');
   assert.equal(await page.locator('#ip-buy-cost').isEditable(),true,'Fixed cost remains editable beside the terms card');
   await page.locator('#ip-buy-cost').fill('35');
   assert.equal(await page.locator('#ip-partner-fixed').inputValue(),'35','Cost edits immediately update the terms amount');
   await page.locator('#ip-partner-fixed').fill('40');
   assert.equal(await page.locator('#ip-buy-cost').inputValue(),'40','Shared cost is filled immediately');
   assert.equal(await page.locator('.ip-cost-token .ip-token-val').innerText(),'£45.00');
   assert.equal(await page.evaluate(()=>DB['OCT-26'][0].costPrice),30,'Preview does not persist');
   await page.locator('.ip-cost-form button[type=submit]').click();
   assert.deepEqual(await page.evaluate(()=>{const i=DB['OCT-26'][0],j=_rowToItem(_itemToRow(i,'OCT-26'));j.parts=i.parts;return [i.costPrice,i.partnerAgreedAmount,i.accountPaidAmount,j.costPrice,j.partnerAgreedAmount,calcEstProfit(j)];}),[40,40,40,40,40,55]);
   // Zero is a deliberate free acquisition, not a fallback to a stale buy price.
   await page.locator('#ip-partner-fixed').fill('0');await page.locator('.ip-cost-form button[type=submit]').click();
   assert.equal(await page.evaluate(()=>calcEstProfit(DB['OCT-26'][0])),95);
   await page.locator('#ip-partner-fixed').fill('40');await page.locator('.ip-cost-form button[type=submit]').click();
   // A general edit must retain the agreement and synchronise its buy price.
   await page.evaluate(()=>{const i=DB['OCT-26'][0];i.state='sourced';i.dateListed=null;_editStockItem('OCT-26',i);});
   await page.locator('#edit-stock-cost').fill('25');await page.locator('button[onclick="_saveStockEdit(\'OCT-26\',\'one\')"]').click();
   assert.deepEqual(await page.evaluate(()=>{const i=DB['OCT-26'][0];return [i.costPrice,i.partnerAgreedAmount,i.accountPaidAmount,i.arrangementModelOverride];}),[25,25,25,'fixed_cost']);
   // Set payout from the account and set cost in bulk use that same value.
   await page.evaluate(()=>openAccountPage('fixed'));
   await page.waitForFunction(()=>_acctCurrentAcct()?.id==='fixed');
   await page.evaluate(()=>{_acctToggleSelectMode();_acctToggleSelect('one');_acctBulkSetCost();});
   await page.locator('#bulk-cost-input').fill('30');await page.locator('button[onclick="_acctBulkSetCostConfirm()"]').click();
   // Wait for the observable save result; keep all three amount assertions.
   await page.waitForFunction(()=>!document.getElementById('slide-panel').classList.contains('on')&&DB['OCT-26'][0].costPrice===30);
   assert.deepEqual(await page.evaluate(()=>{const i=DB['OCT-26'][0];return [i.costPrice,i.partnerAgreedAmount,i.accountPaidAmount];}),[30,30,30]);
   // Payment before sale is one outflow; selling later creates no new payout.
   await page.evaluate(()=>{openAccountPage('fixed');__rtPartnerOpenPayment('fixed',['one']);});
   await page.locator('#payalloc-date').fill('2026-10-08');await page.locator('#payalloc-create-btn').click();
   await page.waitForFunction(()=>_accounts[0].settlements.length===1&&!document.getElementById('rt-payalloc-modal-backdrop'));
   const paid=await page.evaluate(()=>{
    const i=DB['OCT-26'][0],payment=JSON.stringify(_accounts[0].settlements);
    i.state='sold';i.dateSold='2026-10-10';
    const tax=_buildTaxCashSummary('2026-04-06','2027-04-05',''),b=_saleBreakdown(_saleEventForCycle(i,'OCT-26',_saleCycleSnapshot(i,1)));
    const cash=_cashEventsAll().filter(e=>e.direction==='out').reduce((s,e)=>s+e.amount,0);
    return {profit:calcNetProfit(i),breakdown:b.netProfit,costs:b.itemCost+b.partnerSplit+b.parts,tax:tax.cashGoodsPaid+tax.cashPartnerPaid,cash,candidates:__rtPartnerPaymentCandidates('fixed').length,unchanged:payment===JSON.stringify(_accounts[0].settlements)};
   });
   assert.deepEqual(paid,{profit:65,breakdown:65,costs:35,tax:35,cash:35,candidates:0,unchanged:true});
   // A later return/resale keeps the paid fixed agreement exactly once.
   const returned=await page.evaluate(()=>{
    const i=DB['OCT-26'][0];i.isReturned=true;i.state='returned';
    i.returnHistory=[{id:'ret',saleNo:1,type:'full_seller',refundAmount:100,loggedAt:'2026-10-11',_dateSoldAtReturn:'2026-10-10',_salePriceAtReturn:100,_platformAtReturn:'fb'}];
    const loss=calcNetProfit(i);i.isReturned=false;i.state='sold';i.resaleSalePrice=110;i.resaleDateSold='2026-10-12';i.resalePlatform='fb';
    return [loss,calcNetProfit(i),__rtPartnerPaymentCandidates('fixed').length];
   });
   assert.deepEqual(returned,[-30,75,0]);
   // Preserve historical paid profit shares and real hybrid upfront + percentage deals.
   assert.deepEqual(await page.evaluate(()=>{
    const historical=costFixture({accountId:'share',accountType:'consignment',arrangementModelOverride:'profit_share',partnerAgreedAmount:null,costPrice:10,accountPaidAmount:30,accountSplitPercent:50,dateSold:'2026-10-10',state:'sold',accountSettled:true});
    const hybrid=costFixture({accountId:'share',accountType:'hybrid',arrangementModelOverride:'profit_share',partnerAgreedAmount:null,accountPaidAmount:null,costPrice:10,accountSplitPercent:50,dateSold:'2026-10-10',state:'sold'});
    return [calcNetProfit(historical),calcNetProfit(hybrid)];
   }),[55,42.5]);
   // Add-stock form: either field updates the other before saving a new item.
   await page.evaluate(()=>openStockQuickAdd('fixed'));
   await page.locator('#sqa-title').fill('New linked stock');
   await page.locator('#sqa-category').selectOption({index:1});await page.locator('#sqa-location').fill('Test shelf');
   await page.locator('#sqa-cost').fill('12.50');
   assert.equal(await page.locator('#rt-partner-fixed').inputValue(),'12.50');
   await page.locator('#rt-partner-fixed').fill('15.25');
   assert.equal(await page.locator('#sqa-cost').inputValue(),'15.25');
   await page.evaluate(()=>submitStockQuickAdd());
   assert.deepEqual(await page.evaluate(()=>{const i=allItems().find(i=>i.item==='New linked stock');return i&&[i.costPrice,i.accountPaidAmount,i.partnerAgreedAmount,i.arrangementModelOverride];}),[15.25,15.25,15.25,'fixed_cost']);
   await page.evaluate(()=>{closePanel();openItemPage('OCT-26','one');});
   assert(await page.locator('#ip-partner-fixed').isEditable(),'Recorded payments do not lock item terms');

   // Every account type supports independent item terms; round trips preserve overrides.
   for(const accountType of ['supplier','consignment']){
    await page.evaluate(type=>{
     _accounts[0].accountType=type;
     // Quick-add uses today's month; discard its earlier fixture across month boundaries.
     DB={'OCT-26':[costFixture({accountType:type}),costFixture({id:'other',accountType:type})],trips:[],expenses:[]};
     _accounts[0].settlements=[];openItemPage('OCT-26','one');
    },accountType);
    const defaults=await page.evaluate(()=>termsSnapshot());
    await page.locator('#ip-partner-method').selectOption('percent');
    assert.equal(await page.locator('#ip-buy-cost').inputValue(),'0');
    assert.equal(await page.locator('#ip-buy-cost').isEditable(),false,'Profit share locks item cost at zero');
    await page.locator('#ip-partner-percent').fill('40');
    await page.locator('.ip-cost-form button[type=submit]').click();
    assert.deepEqual(await page.evaluate(()=>{const i=DB['OCT-26'][0],j=_rowToItem(_itemToRow(i,'OCT-26'));j.parts=i.parts;return [j.costPrice,j.accountPaidAmount,j.partnerAgreedAmount,j.accountSplitPercent,j.arrangementModelOverride,j.accountType,calcEstProfit(j)];}),[0,null,null,40,'profit_share','consignment',57]);
    assert.equal(await page.locator('#ip-partner-method').inputValue(),'percent');
    assert.equal(await page.locator('#ip-buy-cost').isEditable(),false);
    await page.evaluate(()=>_setItemPurchaseCost(DB['OCT-26'][0],99));
    assert.equal(await page.evaluate(()=>DB['OCT-26'][0].costPrice),0,'General edits cannot introduce a profit-share cost');
    await page.locator('#ip-partner-method').selectOption('fixed');
    await page.locator('#ip-buy-cost').fill('20');
    assert.equal(await page.locator('#ip-partner-fixed').inputValue(),'20');
    await page.locator('.ip-cost-form button[type=submit]').click();
    assert.deepEqual(await page.evaluate(()=>{const i=DB['OCT-26'][0];return [i.costPrice,i.partnerAgreedAmount,i.accountPaidAmount,i.accountSplitPercent,calcEstProfit(i)];}),[20,20,20,null,75]);
    assert.equal(await page.evaluate(()=>termsSnapshot()),defaults,'Other items and account defaults are untouched');
   }
   // A paid supplier item can change terms without losing or rewriting its actual payment.
   await page.evaluate(()=>{
    _accounts[0].accountType='supplier';
    _accounts[0].settlements=[{id:'paid-terms',date:'2026-10-08',paid:true,kind:'supplier',partnerAmount:30,items:[{id:'one',kind:'supplier',amount:30}]}];
    DB['OCT-26']=[costFixture({accountType:'supplier',dateSold:'2026-10-10',state:'sold',accountSettled:true})];
    openItemPage('OCT-26','one');
   });
   const payment=await page.evaluate(()=>JSON.stringify(_accounts[0].settlements));
   await page.locator('#ip-partner-method').selectOption('percent');
   await page.locator('#ip-partner-percent').fill('50');
   await page.locator('.ip-cost-form button[type=submit]').click();
   assert.deepEqual(await page.evaluate(()=>{
    const i=DB['OCT-26'][0],tax=_buildTaxCashSummary('2026-04-06','2027-04-05',''),rows=__rtPartnerPaymentCandidates('fixed');
    return [i.costPrice,calcNetProfit(i),i.accountSettled,rows[0]?.remaining,rows[0]?.legacy,_accountStats('fixed').unsettledOwed,_cashUnpaidSoldLiabilities().total,tax.cashGoodsPaid+tax.cashPartnerPaid,_cashEventsAll().filter(e=>e.direction==='out').reduce((s,e)=>s+e.amount,0)];
   }),[0,47.5,false,17.5,false,17.5,17.5,35,35]);
   assert.equal(await page.evaluate(()=>JSON.stringify(_accounts[0].settlements)),payment);
   await page.locator('#ip-partner-method').selectOption('fixed');
   await page.locator('#ip-partner-fixed').fill('40');
   await page.locator('.ip-cost-form button[type=submit]').click();
   assert.deepEqual(await page.evaluate(()=>[calcNetProfit(DB['OCT-26'][0]),__rtPartnerPaymentCandidates('fixed')[0]?.remaining]),[55,10]);
   assert.equal(await page.evaluate(()=>JSON.stringify(_accounts[0].settlements)),payment);

   for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No overflow at '+width);
    if(width>360)assert(await page.evaluate(()=>Math.abs(document.getElementById('ip-partner-method').getBoundingClientRect().bottom-document.getElementById('ip-partner-fixed').getBoundingClientRect().bottom)<1),'Aligned controls with wrapping labels');
   }
   if(process.env.RETRADE_CAPTURE){fs.mkdirSync(process.env.RETRADE_CAPTURE,{recursive:true});await page.screenshot({path:process.env.RETRADE_CAPTURE+'/account-cost-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});}
   assert.deepEqual(errors,[]);await context.close();console.log('PASS '+engine+' shared cost/payout: legacy records, forms, persistence, payment, tax, return/resale and layout '+(mobile?'mobile':'desktop'));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

