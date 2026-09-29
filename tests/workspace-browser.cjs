/* Collection UX regression: globally ordered sourcing runs, stable search and
   compact headers. All data/requests use the isolated browser harness. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  for(const mobile of [true,false]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   await page.evaluate(()=>{STOCK_STATE_FILTER='all';STOCK_FILTER='stale';_saveUIState();goToTab('stock');});
   await page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));
   assert.deepEqual(await page.evaluate(()=>[STOCK_STATE_FILTER,STOCK_FILTER]),['listed','all'],'Stock entry clears remembered population and age filters');
   await page.locator('[data-stock-state="all"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-stock-state="all"].is-active'));
   await page.waitForFunction(()=>document.querySelector('#p-stock .stock-kpis').textContent.includes('Potential profit'));
   assert.deepEqual(await page.locator('#p-stock .kpi-label').allTextContents(),['Capital tied up','Potential profit','Listed asking','Needs attention']);
   await page.locator(mobile?'#bottom-nav [data-tab="stock"]':'.side-nav-item[data-tab="stock"]').click();
   await page.waitForFunction(()=>STOCK_STATE_FILTER==='listed'&&document.querySelector('[data-stock-state="listed"].is-active'));
   await page.evaluate(()=>{_activeSourcingRun=null;_goToSourcedStock();});
   await page.waitForFunction(()=>STOCK_STATE_FILTER==='sourced'&&document.querySelector('[data-stock-state="sourced"].is-active'));
   await page.evaluate(()=>openDashboardStock('returned'));
   assert.equal(await page.evaluate(()=>STOCK_STATE_FILTER),'returned','Intentional Dashboard drill-down is preserved');
   const totals=await page.evaluate(()=>{
    const item=(id,state,price,cost,extra={})=>({id,item:id,state,salePrice:price,costPrice:cost,salePlatform:'fb',dateSourced:'2026-09-01',dateListed:new Date().toISOString().slice(0,10),parts:[],returnHistory:[],refreshHistory:[],...extra});
    _accounts=[];DB={'SEP-26':[item('listed','listed',100,20),item('loss','listed',10,200,{dateListed:'2020-01-01'}),item('unlisted','sourced',0,30,{estSalePrice:80}),item('return','returned',900,15,{isReturned:true}),item('sold','sold',1000,400,{dateSold:'2026-09-01'}),item('removed','listed',1000,500,{scrappedAt:'2026-09-01'})],trips:[],expenses:[]};
    const before=JSON.stringify(DB),profit=80-190+_estPotentialNet(DB['SEP-26'][2]);
    goToTab('stock');setStockStateFilter('all');renderStock();
    return {before,expected:[fmtK(265),fmtK(profit),fmtK(110),fmtK(245)]};
   });
   assert.deepEqual(await page.locator('#p-stock .kpi-value').allTextContents(),totals.expected,'All-stock totals exclude sold/removed/returned estimates and retain expected losses');
   assert.equal(await page.evaluate(()=>JSON.stringify(DB)),totals.before,'KPI inspection does not change records');
   const lotSnapshot=await page.evaluate(()=>{
    DB['SEP-26'].push({id:'lot-child',item:'Lot member',state:'listed',costPrice:80,salePrice:100,parts:[],returnHistory:[],refreshHistory:[]});
    _jobLotSchemaAvailable=true;
    _jobLots=[{id:'aged-lot',name:'Old camera lot',status:'listed',salePrice:100,platform:'fb',dateListed:'2020-01-01',dateCreated:'2020-01-01'}];
    _jobLotItems=[{jobLotId:'aged-lot',itemId:'lot-child',costBasisAtAdd:50}];
    goToTab('stock');renderStock();
    return JSON.stringify([DB,_jobLots,_jobLotItems]);
   });
   const aged=page.locator('#p-stock .kpi').filter({has:page.locator('.kpi-label', {hasText:'Aged capital'})});
   assert.equal(Number((await aged.locator('.kpi-value').innerText()).replace(/[£,]/g,'')),250,'Aged lots use membership cost once, alongside individual stock');
   assert((await aged.locator('.kpi-foot').innerText()).includes('2 of 3 stale'),'Age counts include job lots as listing units');
   await aged.click();
   assert.equal(await page.evaluate(()=>STOCK_FILTER),'stale','Aged capital still drills into stale listings');
   await page.locator('[data-stock-state="all"]').click();
   await page.waitForFunction(()=>document.querySelector('#p-stock .stock-kpis').textContent.includes('Needs attention'));
   assert.equal(Number((await page.locator('#p-stock .kpi').filter({has:page.locator('.kpi-label',{hasText:'Needs attention'})}).locator('.kpi-value').innerText()).replace(/[£,]/g,'')),295,'All attention capital counts the aged lot once');
   assert.equal(await page.evaluate(()=>JSON.stringify([DB,_jobLots,_jobLotItems])),lotSnapshot,'Job lot KPI inspection never mutates business records');
   await page.evaluate(()=>{_jobLots=[];_jobLotItems=[];goToTab('stock');});
   // Realistic five-chip Stock controls must fit beside the desktop sidebar.
   for(const width of [390,768,1024,1258,1440,1920]){
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>{goToTab('stock');STOCK_STATE_FILTER='listed';renderStock();});
    await page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));
    const clipped=await page.locator('#p-stock .rt-list-controls').evaluate(el=>[...el.querySelectorAll('input,button,select')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility==='visible').some(e=>{const r=e.getBoundingClientRect();return r.x<0||r.right>innerWidth+1;}));
    assert(!clipped,'Stock toolbar remains visible at '+width);
    assert(await page.locator('#p-stock .filter-chips').evaluate(e=>getComputedStyle(e).display==='none'),'Stock age chips stay behind the dropdown');
    await page.locator('#p-stock .filter-pill-dd-btn').click();
    assert(await page.locator('#p-stock .filter-pill-dd-menu').isVisible(),'Age filter opens at '+width);
    await page.keyboard.press('Escape');
    assert(!await page.locator('#p-stock .filter-pill-dd-menu').isVisible(),'Escape closes age filter');
    const stockBox=await page.locator('#p-stock').boundingBox();
    for(const tab of ['stock','monthly']){
     if(tab==='monthly'){await page.evaluate(()=>goToTab('monthly'));await page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));}
     await page.waitForTimeout(400); // Allow the page entrance transform to settle before measuring.
     const geometry=await page.locator('.page.on .rt-list-controls').evaluate(el=>{
      const rect=s=>el.querySelector(s).getBoundingClientRect();
      const search=rect('.inlist-search'),select=rect('.select-toggle'),sort=rect('.sort-select');
      const picker=el.querySelector('.filter-pill-dd-btn');
      return {search:search.toJSON(),select:select.toJSON(),sort:sort.toJSON(),picker:picker&&picker.getClientRects().length?picker.getBoundingClientRect().toJSON():null};
     });
     for(const r of [geometry.search,geometry.select,geometry.sort,geometry.picker].filter(Boolean))assert(Math.abs(r.height-44)<1,tab+' controls have consistent touch height at '+width);
     assert(Math.abs(geometry.search.y-geometry.select.y)<1,tab+' Select aligns with search at '+width);
     if(geometry.picker)assert(Math.abs(geometry.picker.y-geometry.sort.y)<1,tab+' dropdowns align at '+width);
     if(width>1280)assert(geometry.search.width<=321,tab+' desktop search leaves space for chips');
    }
    const salesBox=await page.locator('#p-monthly').boundingBox();
    assert(Math.abs(stockBox.x-salesBox.x)<1&&Math.abs(stockBox.width-salesBox.width)<1,'Sales and Stock use the same margins at '+width);
    await page.evaluate(()=>backToMonthlyGrid(false));
    await page.waitForTimeout(500);
    if(width>860){
     const chart=await page.locator('.monthly-profitability-card').boundingBox(),flow=await page.locator('.money-flow-card').boundingBox();
     assert(Math.abs(chart.y-flow.y)<1&&Math.abs(chart.height-flow.height)<1,'Performance cards align at '+width);
    }

   }
   await page.evaluate(()=>{
    _activeSourcingRun=null;window._RUNS_SEARCH='';window._RUNS_SORT='newest';
    _sourcingRuns=[
     {id:'old',name:'Hook summer sale',location:'Hook',status:'ended',dateStarted:'2026-05-02',dateEnded:'2026-05-02'},
     {id:'new',name:'Reading autumn run',location:'Reading',status:'ended',dateStarted:'2026-09-22',dateEnded:'2026-09-22T15:00:00.000Z'},
     {id:'middle',name:'Basingstoke sale',location:'Basingstoke',status:'ended',dateStarted:'2026-07-01',dateEnded:'2026-07-01'},
     {id:'free',name:'Free stock collection',location:'Hook',status:'ended',dateStarted:'2026-06-01',dateEnded:'2026-06-01'}
    ];
    const item=(id,run,price,cost,state='sold')=>({id,item:id,sourcingRunId:run,state,dateSourced:'2026-05-01',dateListed:'2026-09-01',dateSold:state==='sold'?'2026-09-23':null,salePrice:price,costPrice:cost,postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:0,parts:[],returnHistory:[],salePlatform:'fb'});
    DB={'SEP-26':[item('Camera','old',300,100),item('Lens','old',200,50),item('Laptop','new',150,200),item('Speaker','middle',50,10),item('Gift','free',10,0),item('Unlisted adapter','middle',0,5,'sourced')],trips:[],expenses:[]};
    _accounts=[];goToTab('runs');renderRunsPage();
   });
   await page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));
   const dataBefore=await page.evaluate(()=>JSON.stringify(DB));
   const ids=()=>page.locator('#p-runs .run-history-row:visible').evaluateAll(es=>es.map(e=>e.dataset.runid));
   const sorts={newest:['new','middle','free','old'],oldest:['old','free','middle','new'],items:['middle','old','new','free'],spend:['new','old','middle','free'],profit:['old','middle','free','new'],roi:['middle','old','new','free']};
   for(const [sort,expected] of Object.entries(sorts)){
    await page.getByLabel('Sort sourcing runs').selectOption(sort);
    assert.deepEqual(await ids(),expected,sort+' reorders across months');
    assert.equal(await page.evaluate(()=>localStorage.getItem(_SK.runsSort)),sort,'Sort preference persists');
   }
   await page.getByLabel('Search sourcing runs').fill('Hook');
   assert.deepEqual(await ids(),['old','free']);
   assert(await page.getByLabel('Search sourcing runs').evaluate(e=>e===document.activeElement),'Search keeps focus');
   await page.getByLabel('Sort sourcing runs').selectOption('newest');
   assert.equal(await page.getByLabel('Search sourcing runs').inputValue(),'Hook');
   assert.deepEqual(await ids(),['free','old']);
   await page.getByLabel('Search sourcing runs').fill('no match');
   assert(await page.locator('#runs-empty-search').isVisible());
   await page.getByLabel('Search sourcing runs').fill('');
   for(const width of mobile?[320,390,768]:[1440]){
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sourcing fits '+width);
    if(width<=720){
     const layout=await page.locator('#p-runs').evaluate(p=>{const cards=[...p.querySelectorAll('.runs-kpis-stack>.kpi')].map(e=>e.getBoundingClientRect()),search=p.querySelector('.runs-history-controls .inlist-search').getBoundingClientRect(),sort=p.querySelector('.past-runs-sort').getBoundingClientRect();return {cards:cards.map(r=>({x:r.x,y:r.y,w:r.width,b:r.bottom})),searchY:search.y,sortY:sort.y};});
     assert(layout.cards[0].w>layout.cards[1].w*1.8&&layout.cards[1].y>=layout.cards[0].b,'Sourcing lead KPI spans both supporting cards');
     assert(Math.abs(layout.cards[1].y-layout.cards[2].y)<1,'Supporting KPIs align');
     assert(Math.abs(layout.searchY-layout.sortY)<8,'Search and sort share a row');
    }
    if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/sourcing-'+width+'.png',fullPage:true});
   }
   assert.equal(await page.evaluate(()=>JSON.stringify(DB)),dataBefore,'Inspecting/sorting/searching never writes business data');
   await page.locator('[data-runid="old"]').press('Enter');
   assert(await page.locator('#p-item').evaluate(e=>e.classList.contains('on')),'Keyboard opens source run');
   assert((await page.locator('#p-item').innerText()).includes('Hook summer sale'));

   for(const width of mobile?[320,390,768]:[1024,1440]){
    await page.setViewportSize({width,height:900});
    for(const tab of ['summary','yearly','accounts','tax','monthly','stock']){
     await page.evaluate(t=>{if(t==='yearly'){goToTab('monthly');backToMonthlyGrid(false);}else if(t==='monthly'){goToTab('monthly');MONTHLY_VIEW='detail';SELECTED_MONTH='SEP-26';renderMonth();}else goToTab(t);},tab);
     await page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),tab+' fits '+width);
     if(width<=390&&['summary','yearly','accounts'].includes(tab)){
      const geometry=await page.evaluate(()=>{
       const p=document.querySelector('.page.on');const title=p.querySelector('.summary-title,.page-title');
       const controls=p.querySelector('.summary-period-sel,.page-actions,.page-header>.btn');
       const r=document.createRange();r.selectNodeContents(title);const t=r.getBoundingClientRect(),c=controls.getBoundingClientRect();
       return {overlap:t.right>c.left+1,sameRow:t.top<c.bottom&&t.bottom>c.top};
      });
      assert(!geometry.overlap,tab+' title has room at '+width);assert(geometry.sameRow,tab+' header stays on one row at '+width);
     }
     if(tab==='monthly'){
      assert(await page.getByLabel('Choose sales month').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Full month title fits '+width);
      await page.getByLabel('Search sales').fill('Camera');
      await page.waitForFunction(()=>document.querySelectorAll('#month-list .item-row').length===1);
      assert.equal(await page.locator('#month-list .item-row').count(),1);
      await page.getByLabel('Search sales').fill('');
      await page.locator('#p-monthly .select-toggle').click();
      await page.locator('#month-list input[type=checkbox]').first().check();
      assert(await page.locator('#sel-totals-bar').isVisible(),'Selection summary still works');
      await page.locator('#p-monthly .sel-exit').click();
      await page.getByLabel('Choose sales month').click();
      assert(await page.locator('#month-picker-list').isVisible(),'Month picker works');
      await page.getByLabel('Choose sales month').click();
     }
    }
   }
   assert.deepEqual(errors,[]);await context.close();console.log('PASS workspace ordering, saved sort, search, details and headers',mobile?'mobile/tablet':'desktop');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
