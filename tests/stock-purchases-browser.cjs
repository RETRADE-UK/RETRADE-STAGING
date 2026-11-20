/* Real Stock purchase flows with synthetic records and all external traffic blocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
const safari=process.argv.includes('--webkit');

const item=(id,extra={})=>Object.assign({id,gid:'R-'+id,item:'Camera '+id,state:'sourced',
  dateSourced:'2026-11-10',purchasePaidDate:null,dateListed:null,dateSold:null,
  costPrice:50,estSalePrice:100,salePrice:0,defaultPlatform:'fb',salePlatform:'fb',
  shippingCost:0,postage:0,packagingCost:0,promoPercent:0,listingFee:0,
  category:'Digital Cameras & Lenses',location:'Shelf A',notes:'Keep this note',
  parts:[],refreshHistory:[],returnHistory:[],isReturned:false},extra);

async function seed(page,rows){
  await page.evaluate(rows=>{
    closePanel(true);_currentUserId='ui-test';
    DB={'NOV-26':rows,expenses:[],trips:[]};
    _accounts=[];_cashMoves=[];_jobLots=[];_jobLotItems=[];_saleReconciliations=[];
    _sourcingRuns=[];_activeSourcingRun=null;
    STOCK_SELECTED.clear();STOCK_SELECTION_MODE=false;STOCK_SEARCH='';STOCK_FILTER='all';
    STOCK_STATE_FILTER='all';STOCK_SOURCED_FILTER='all';STOCK_GROUPED=false;
    window.__purchaseWrites=0;
    saveDB=()=>{
      __purchaseWrites++;
      const preview=_previewMode;_previewMode=false;
      try{_stageDurableOutboxNow();}finally{_previewMode=preview;}
      return true;
    };
    _dbSnapshot=_dbFingerprint();_outboxSave({});
    window.dispatchEvent(new Event('retrade:data-ready'));
    goToTab('stock');STOCK_STATE_FILTER='all';renderStock();
  },rows);
  await page.waitForFunction(()=>document.querySelector('#p-stock.on')&&!document.querySelector('#p-stock').hasAttribute('aria-busy'));
}
async function field(page,selector,value){
  await page.waitForFunction(()=>document.getElementById('slide-panel').getAnimations({subtree:true}).every(a=>a.playState!=='running'));
  await page.locator(selector).fill(value);
  assert.equal(await page.locator(selector).inputValue(),value);
}
async function select(page,ids){
  await page.locator('#p-stock .select-toggle').click();
  for(const id of ids)await page.locator('[data-stock-item="'+id+'"] input[type="checkbox"]').check();
}
async function action(page,key){
  const target=page.locator('#p-stock [data-stock-action="'+key+'"]:visible');
  if(!await target.count())await page.locator('#p-stock .bulk-actions-menu summary').click();
  await page.locator('#p-stock [data-stock-action="'+key+'"]:visible').click();
}
async function assign(page,ids,name='Camera bundle',date='2026-11-09'){
  await page.evaluate(ids=>openPurchaseLink(ids),ids);
  await field(page,'#purchase-name',name);
  await field(page,'#purchase-paid-date',date);
}
async function split(page,id,costs,titles=['Camera starter kit','Tamron lens']){
  await page.evaluate(id=>openPurchaseSplit(id),id);
  await field(page,'#purchase-split-name','Camera and lens purchase');
  for(let n=0;n<costs.length;n++){
    if(n>1)await page.locator('#purchase-add').click();
    await field(page,'#purchase-title-'+(n+1),titles[n]||'Separate item '+(n+1));
    await field(page,'#purchase-cost-'+(n+1),costs[n]);
  }
}
async function snapshot(page){return page.evaluate(()=>JSON.stringify(DB));}
async function noOverflow(page){
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Purchase form must fit the viewport');
  assert(await page.locator('#panel-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Purchase form must not have horizontal scrolling');
}
async function saveGroup(page,selector){
  await page.locator(selector).click();
  await page.waitForFunction(()=>document.querySelectorAll('.purchase-member').length>0);
}
async function capture(page,label,width){
  if(!process.env.RETRADE_CAPTURE)return;
  fs.mkdirSync(process.env.RETRADE_CAPTURE,{recursive:true});
  await page.screenshot({path:path.join(process.env.RETRADE_CAPTURE,label+'-'+width+'-'+(safari?'webkit':'chromium')+'.png')});
}

(async()=>{
  const browser=await(safari?webkit:chromium).launch({headless:true,
    ...(!safari&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),
    args:safari?[]:['--no-sandbox']});
  try{
    for(const width of [1440,320]){
      const {page,context,errors,missingAssets}=await open(browser,{signedIn:true,mobile:width===320});
      await settled(page);await page.setViewportSize({width,height:width===320?844:1000});

      // Use the visible Stock selection controls for separately entered items.
      const separate=[item('a',{item:'Canon starter kit',costPrice:80.01,dateSourced:'2026-11-10'}),
        item('b',{item:'Tamron 70–300mm lens',costPrice:23.49,dateSourced:'2026-11-12'})];
      await seed(page,separate);
      const annualBefore=await page.evaluate(()=>_buildPeriodReport('hmrc','2026-04-06','2027-04-05').totalExpenses);
      await page.locator('#p-stock .select-toggle').click();
      assert(await page.locator('[data-stock-action="purchase"]').first().isDisabled());
      assert(await page.locator('[data-stock-action="splitPurchase"]').first().isDisabled());
      await page.locator('[data-stock-item="a"] input[type="checkbox"]').check();
      assert(!await page.locator('[data-stock-action="splitPurchase"]').first().isDisabled());
      await page.locator('[data-stock-item="b"] input[type="checkbox"]').check();
      assert(await page.locator('[data-stock-action="splitPurchase"]').first().isDisabled(),'Split operates on one existing bundle');
      await action(page,'purchase');
      assert.equal(await page.locator('#purchase-paid-date').inputValue(),'','Different sourcing dates require a confirmed payment date');
      await field(page,'#purchase-name','Canon camera & Tamron purchase');
      await field(page,'#purchase-paid-date','2026-11-09');
      await noOverflow(page);await capture(page,'stock-assign-payment',width);await saveGroup(page,'#purchase-link-save');
      const linked=await page.evaluate(()=>{
        const rows=DB['NOV-26'],events=_cashEventsAll().filter(e=>e.type==='stock_purchase');
        return {rows,events,manual:_cashMoves,annual:_buildPeriodReport('hmrc','2026-04-06','2027-04-05').totalExpenses,
          paymentDay:_buildPeriodReport('hmrc','2026-11-09','2026-11-09').totalExpenses,
          sourceDay:_buildPeriodReport('hmrc','2026-11-10','2026-11-12').totalExpenses,
          writes:__purchaseWrites,outbox:Object.keys(_outboxRead()).sort(),
          mapped:rows.map(i=>{const row=_itemToRow(i,'NOV-26');const back=_rowToItem(row,[],[]);return{group:row.purchase_group_id,name:row.purchase_group_name,paid:row.purchase_paid_date,backGroup:back.purchaseGroupId,backName:back.purchaseGroupName,backPaid:back.purchasePaidDate};})};
      });
      assert.equal(linked.rows.length,2);assert.equal(linked.events.length,1);assert.equal(linked.events[0].amount,103.5);
      assert.equal(linked.events[0].date,'2026-11-09');assert.equal(linked.events[0].dateEstimated,false);
      assert.deepEqual(linked.events[0].itemIds.sort(),['a','b']);assert.deepEqual(linked.manual,[]);
      assert.deepEqual(linked.rows.map(i=>i.costPrice),[80.01,23.49]);
      assert.deepEqual(linked.rows.map(i=>i.dateSourced),['2026-11-10','2026-11-12']);
      assert.deepEqual(linked.rows.map(i=>i.purchasePaidDate),['2026-11-09','2026-11-09']);
      assert.equal(linked.annual,annualBefore);assert.equal(linked.paymentDay,103.5);assert.equal(linked.sourceDay,0);
      assert.equal(linked.writes,1);assert.deepEqual(linked.outbox,['item:a','item:b']);
      const group=linked.rows[0].purchaseGroupId;assert(group);assert.equal(linked.rows[1].purchaseGroupId,group);
      linked.mapped.forEach(r=>assert.deepEqual(r,{group,name:'Canon camera & Tamron purchase',paid:'2026-11-09',backGroup:group,backName:'Canon camera & Tamron purchase',backPaid:'2026-11-09'}));
      const beforeInspect=await snapshot(page);
      await page.evaluate(id=>{closePanel(true);openCashflowTransaction(id);},linked.events[0].id);
      assert.equal(await page.locator('[data-cash-purchase-item]').count(),2);
      assert.match(await page.locator('#panel-content').innerText(),/£103\.50/);
      assert.equal(await snapshot(page),beforeInspect,'Inspecting a purchase does not rewrite it');

      // A third existing item can join the same payment without copying costs.
      await seed(page,[...linked.rows,item('c',{costPrice:6.5,dateSourced:'2026-11-15'})]);
      await page.evaluate(()=>openPurchaseLink(['c']));
      await page.locator('#purchase-existing').selectOption(group);
      assert.equal(await page.locator('#purchase-paid-date').inputValue(),'2026-11-09');
      assert(await page.locator('#purchase-paid-date').evaluate(el=>el.readOnly||el.disabled),'Existing payment date is protected');
      await saveGroup(page,'#purchase-link-save');
      assert.deepEqual(await page.evaluate(()=>_cashEventsAll().filter(e=>e.type==='stock_purchase').map(e=>({amount:e.amount,date:e.date,count:e.itemIds.length}))),[{amount:110,date:'2026-11-09',count:3}]);
      assert.equal(await page.evaluate(()=>DB['NOV-26'][2].dateSourced),'2026-11-15');

      // An open group view must not unlink an item since reassigned elsewhere.
      await seed(page,linked.rows);await page.evaluate(id=>openPurchaseGroup(id),group);
      await page.evaluate(()=>{DB['NOV-26'][0].purchaseGroupId='replacement-payment';DB['NOV-26'][0].purchaseGroupName='Changed payment';});
      const reassigned=await snapshot(page);
      await page.locator('.purchase-member').first().getByRole('button',{name:'Unlink '+linked.rows[0].item,exact:true}).click();
      assert.match(await page.locator('#purchase-error').innerText(),/chang|reopen|review/i);
      assert.equal(await page.locator('#confirm-modal.open').count(),0,'Stale membership is rejected before confirming');
      assert.equal(await snapshot(page),reassigned,'An old purchase view cannot unlink the new payment');
      assert.equal(await page.evaluate(()=>__purchaseWrites),0);

      // One purchase with more than one dated payment is not silently rewritten.
      await seed(page,[item('g1',{purchaseGroupId:'mixed',purchaseGroupName:'Two payment dates',purchasePaidDate:'2026-11-01'}),
        item('g2',{purchaseGroupId:'mixed',purchaseGroupName:'Two payment dates',purchasePaidDate:'2026-11-02'}),item('loose')]);
      await page.evaluate(()=>openPurchaseLink(['loose']));
      assert.equal(await page.locator('#purchase-existing option[value="mixed"]').count(),0);
      assert.equal(await page.evaluate(()=>__purchaseWrites),0);
      await field(page,'#purchase-name','Cannot create a one-item shared payment');
      await field(page,'#purchase-paid-date','2026-11-09');
      await page.locator('#purchase-link-save').click();
      assert.match(await page.locator('#purchase-error').innerText(),/two|2|at least/i);
      assert.equal(await page.evaluate(()=>__purchaseWrites),0);

      await seed(page,[item('dated',{purchaseGroupId:'mixed-evidence',purchaseGroupName:'Mixed date evidence',purchasePaidDate:'2026-11-10'}),
        item('estimated',{purchaseGroupId:'mixed-evidence',purchaseGroupName:'Mixed date evidence',purchasePaidDate:null,dateSourced:'2026-11-10'})]);
      const mixedEvidence=await page.evaluate(()=>_cashEventsAll().filter(e=>e.type==='stock_purchase'));
      assert.equal(mixedEvidence.length,1);assert.equal(mixedEvidence[0].dateEstimated,true,'A grouped payment discloses estimated members even when an explicit date is encountered first');
      assert.equal(mixedEvidence[0].amount,100);

      // New purchases allocate integer pennies and record source/payment dates separately.
      await seed(page,[]);await page.evaluate(()=>openNewPurchase());
      await field(page,'#purchase-name','New camera and lens purchase');
      await field(page,'#purchase-date','2026-11-11');await field(page,'#purchase-paid-date','2026-11-08');
      await field(page,'#purchase-total','97.25');
      await field(page,'#purchase-title-1','Canon camera');await field(page,'#purchase-title-2','Telephoto lens');
      for(const n of [1,2]){
        await page.locator('#purchase-'+n+'-category').selectOption('Digital Cameras & Lenses');
        await field(page,'#purchase-'+n+'-location','Shelf '+n);
      }
      await page.locator('#purchase-split').click();
      assert.equal(await page.locator('#purchase-cost-1').inputValue(),'48.63');
      assert.equal(await page.locator('#purchase-cost-2').inputValue(),'48.62');
      await field(page,'#purchase-cost-1','60');await page.locator('#purchase-save').click();
      assert.match(await page.locator('#purchase-error').innerText(),/exact|match|allocat/i);
      assert.equal(await page.evaluate(()=>DB['NOV-26'].length),0);assert.equal(await page.evaluate(()=>__purchaseWrites),0);
      await field(page,'#purchase-cost-2','37.25');await saveGroup(page,'#purchase-save');
      assert.deepEqual(await page.evaluate(()=>DB['NOV-26'].map(i=>[i.costPrice,i.dateSourced,i.purchasePaidDate])),[[60,'2026-11-11','2026-11-08'],[37.25,'2026-11-11','2026-11-08']]);
      assert.deepEqual(await page.evaluate(()=>_cashEventsAll().filter(e=>e.type==='stock_purchase').map(e=>[e.amount,e.date])),[[97.25,'2026-11-08']]);

      // Split an existing quantity-one bundle with custom titles and costs.
      const bundle=item('bundle',{item:'Canon and Tamron camera bundle',quantity:1,state:'listed',dateListed:'2026-11-10',
        costPrice:103.5,purchasePaidDate:'2026-11-09',listingFee:.36,
        parts:[{id:'original-part',description:'Replacement cap',cost:7,date:'2026-11-11'}],
        refreshHistory:[{id:'original-note',type:'manual_note',note:'Original history must stay on the original item'}]});
      await seed(page,[bundle]);
      const beforeSplit=await page.evaluate(()=>({cash:calcCashSummary().outflows,tax:_buildPeriodReport('hmrc','2026-11-01','2026-11-30').totalExpenses}));
      await select(page,['bundle']);await action(page,'splitPurchase');
      await field(page,'#purchase-split-name','Canon + Tamron purchase');
      await field(page,'#purchase-title-1','Canon 700D camera starter kit');await field(page,'#purchase-cost-1','83.50');
      await field(page,'#purchase-title-2','Tamron 70–300mm lens');await field(page,'#purchase-cost-2','20.00');
      await noOverflow(page);await capture(page,'stock-split-purchase',width);await saveGroup(page,'#purchase-save');
      const splitRows=await page.evaluate(()=>DB['NOV-26']);
      assert.equal(splitRows.length,2);assert.equal(splitRows[0].id,'bundle');assert.notEqual(splitRows[1].id,'bundle');
      assert.notEqual(splitRows[0].gid,splitRows[1].gid);
      assert.deepEqual(splitRows.map(i=>i.item),['Canon 700D camera starter kit','Tamron 70–300mm lens']);
      assert.deepEqual(splitRows.map(i=>i.costPrice),[83.5,20]);assert(splitRows[0].purchaseGroupId);
      assert.equal(splitRows[1].purchaseGroupId,splitRows[0].purchaseGroupId);
      assert.deepEqual(splitRows.map(i=>i.dateSourced),['2026-11-10','2026-11-10']);
      assert.deepEqual(splitRows.map(i=>i.purchasePaidDate),['2026-11-09','2026-11-09']);
      assert.deepEqual(splitRows[0].parts,bundle.parts);assert.deepEqual(splitRows[1].parts,[]);
      assert(splitRows[0].refreshHistory.some(h=>h.id==='original-note'));
      assert(!splitRows[1].refreshHistory.some(h=>h.id==='original-note'));
      assert.equal(splitRows[0].listingFee,.36);assert.equal(Number(splitRows[1].listingFee)||0,0);
      assert.equal(splitRows[1].state,'sourced');assert.equal(splitRows[1].dateSold,null);
      assert.equal(splitRows[1]._cloudRevision,undefined);assert.equal(splitRows[1]._cloudUpdatedAt,undefined);
      assert.deepEqual(await page.evaluate(()=>({cash:calcCashSummary().outflows,tax:_buildPeriodReport('hmrc','2026-11-01','2026-11-30').totalExpenses})),beforeSplit,'Splitting neither repeats repairs/listing fees nor changes cash/tax costs');
      assert.deepEqual(await page.evaluate(()=>_cashEventsAll().filter(e=>e.type==='stock_purchase').map(e=>[e.amount,e.date])),[[103.5,'2026-11-09']]);
      assert.equal(await page.evaluate(()=>__purchaseWrites),1);
      assert.deepEqual(await page.evaluate(()=>Object.keys(_outboxRead()).sort()),splitRows.map(i=>'item:'+i.id).sort());

      // Listed stock uses its current asking amount rather than an older estimate.
      await seed(page,[item('listed-asking',{state:'listed',dateListed:'2026-11-10',salePrice:230,estSalePrice:200,costPrice:100})]);
      await split(page,'listed-asking',['50','50']);await saveGroup(page,'#purchase-save');
      assert.deepEqual(await page.evaluate(()=>{const rows=DB['NOV-26'];return {asking:rows[0].salePrice,estimates:rows.map(i=>i.estSalePrice),total:rows.reduce((sum,i)=>sum+i.estSalePrice,0)};}),{asking:115,estimates:[115,115],total:230});

      // Missing source evidence stays missing; equal splits conserve every penny.
      await seed(page,[item('undated',{costPrice:100.01,dateSourced:null,dateListed:'2026-11-10'})]);
      await split(page,'undated',['0','0','0']);await page.locator('#purchase-split').click();
      assert.deepEqual(await page.locator('[data-cost]').evaluateAll(els=>els.map(el=>el.value)),['33.34','33.34','33.33']);
      await saveGroup(page,'#purchase-save');
      assert.deepEqual(await page.evaluate(()=>DB['NOV-26'].map(i=>[i.dateSourced,i.purchasePaidDate])),[[null,null],[null,null],[null,null]]);
      assert.equal(await page.evaluate(()=>Math.round(DB['NOV-26'].reduce((sum,i)=>sum+i.costPrice,0)*100)),10001);
      assert.equal(await page.evaluate(()=>_buildPeriodReport('hmrc','2026-11-01','2026-11-30').totalExpenses),0,'Listing dates do not become purchase evidence');

      // Cancellation and rejected forms never mutate stock or stage a write.
      await seed(page,[item('one'),item('two')]);
      let before=await snapshot(page);await assign(page,['one','two']);await page.keyboard.press('Escape');
      assert.equal(await snapshot(page),before);assert.equal(await page.evaluate(()=>__purchaseWrites),0);
      await split(page,'one',['25','25']);await page.keyboard.press('Escape');
      assert.equal(await snapshot(page),before);assert.equal(await page.evaluate(()=>__purchaseWrites),0);

      await assign(page,['one','two']);await page.evaluate(()=>{DB['NOV-26'][0].notes='Changed in another session';});
      before=await snapshot(page);await page.locator('#purchase-link-save').click();
      assert.match(await page.locator('#purchase-error').innerText(),/chang|reopen|review/i);
      assert.equal(await snapshot(page),before);assert.equal(await page.evaluate(()=>__purchaseWrites),0);
      await page.evaluate(()=>closePanel(true));
      await split(page,'one',['25','25']);await page.evaluate(()=>{DB['NOV-26'][0].costPrice=51;});
      before=await snapshot(page);await page.locator('#purchase-save').click();
      assert.match(await page.locator('#purchase-error').innerText(),/chang|reopen|review/i);
      assert.equal(await snapshot(page),before);assert.equal(await page.evaluate(()=>__purchaseWrites),0);

      await seed(page,[item('one'),item('two')]);await assign(page,['one','two']);
      await page.evaluate(()=>{_currentUserId='different-user';});before=await snapshot(page);
      await page.locator('#purchase-link-save').click();
      assert.equal(await snapshot(page),before);assert.equal(await page.evaluate(()=>__purchaseWrites),0,'An open form is bound to the original signed-in owner');

      await seed(page,[item('one'),item('two')]);await assign(page,['one','two']);
      before=await snapshot(page);await page.evaluate(()=>{saveDB=()=>{__purchaseWrites++;return false;};});
      await page.locator('#purchase-link-save').click();
      assert.match(await page.locator('#purchase-error').innerText(),/sav|storage|retry|again/i);
      assert.equal(await snapshot(page),before,'Explicit failure restores original items');
      assert.equal(await page.evaluate(()=>__purchaseWrites),1);

      for(const failure of ['false','throw']){
        await seed(page,[item('one')]);await split(page,'one',['30','20']);
        before=await snapshot(page);await page.evaluate(failure=>{saveDB=()=>{__purchaseWrites++;if(failure==='throw')throw new Error('Synthetic failure before staging');return false;};},failure);
        await page.locator('#purchase-save').click();
        assert.match(await page.locator('#purchase-error').innerText(),/sav|storage|retry|again/i);
        assert.equal(await snapshot(page),before,'A failed split before staging cannot leave partial children or a reduced original');
        assert.equal(await page.evaluate(()=>__purchaseWrites),1);
        assert.deepEqual(await page.evaluate(()=>Object.keys(_outboxRead())),[]);
      }

      // saveDB stages its outbox before painting. A later rendering failure
      // must keep memory aligned with the complete durable pending mutation.
      await seed(page,[item('staged',{photo:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',photoPath:'ui-test/synthetic-camera.jpg'})]);await split(page,'staged',['30','20']);
      await page.evaluate(()=>{
        window.__stalePurchaseSubmit=document.getElementById('purchase-save');
        saveDB=()=>{
          __purchaseWrites++;
          const preview=_previewMode;_previewMode=false;
          try{_stageDurableOutboxNow();}finally{_previewMode=preview;}
          throw new Error('Synthetic renderer failure after complete durable staging');
        };
      });
      await saveGroup(page,'#purchase-save');
      const staged=await page.evaluate(()=>{
        const rows=DB['NOV-26'],queue=_outboxRead(),fingerprints=_dbFingerprint();
        return {rows,keys:Object.keys(queue).sort(),complete:Object.entries(queue).every(([key,entry])=>entry.op==='save'&&entry.json+'|'+entry.month===fingerprints[key]),writes:__purchaseWrites};
      });
      assert.equal(staged.rows.length,2);assert.deepEqual(staged.rows.map(i=>i.costPrice),[30,20]);
      assert.equal(staged.rows[0].id,'staged');assert(staged.rows[0].purchaseGroupId);
      assert.equal(staged.rows[1].purchaseGroupId,staged.rows[0].purchaseGroupId);
      assert.deepEqual(staged.keys,staged.rows.map(i=>'item:'+i.id).sort());
      assert(staged.complete,'Every pending item must exactly match the displayed split');assert.equal(staged.writes,1);
      const pending=await snapshot(page);
      await page.evaluate(()=>__stalePurchaseSubmit.onclick.call(__stalePurchaseSubmit));
      assert.equal(await snapshot(page),pending,'A repeated submit cannot duplicate already-staged children');
      assert.equal(await page.evaluate(()=>__purchaseWrites),1);

      // Historical sales, third-party stock and grouped orders need their own owners.
      const protectedRows=[
        item('blocked',{state:'sold',dateSold:'2026-11-15',salePrice:100}),
        item('blocked',{returnHistory:[{id:'return',type:'partial_seller',refundAmount:5,loggedAt:'2026-11-15'}]}),
        item('blocked',{accountId:'supplier',accountType:'supplier'}),
        item('blocked',{bundleId:'sale-order',bundleTotal:100})
      ];
      for(const protectedItem of protectedRows){
        await seed(page,[protectedItem]);before=await snapshot(page);
        await page.evaluate(()=>openPurchaseSplit('blocked'));
        assert.equal(await page.locator('#slide-panel.on #purchase-save').count(),0,'Protected records cannot open a split form');
        assert.equal(await snapshot(page),before);assert.equal(await page.evaluate(()=>__purchaseWrites),0);
      }
      await seed(page,[item('blocked')]);
      await page.evaluate(()=>{_jobLots=[{id:'lot',name:'Job lot',status:'building'}];_jobLotItems=[{jobLotId:'lot',itemId:'blocked',removedAt:null}];openPurchaseSplit('blocked');});
      assert.equal(await page.locator('#slide-panel.on #purchase-save').count(),0);assert.equal(await page.evaluate(()=>__purchaseWrites),0);

      assert.deepEqual(errors,[]);assert.deepEqual(missingAssets,[]);
      await context.close();
      console.log('PASS stock purchase payments, custom splits, accounting, durable mapping, stale/save guards '+width+'px '+(safari?'WebKit':'Chromium'));
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
