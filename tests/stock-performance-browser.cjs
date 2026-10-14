/* Synthetic-only interaction and financial reconciliation coverage. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  for(const width of [320,390,1440]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile:width<600});await settled(page);
   await page.setViewportSize({width,height:960});
   await page.evaluate(()=>{
    const make=(id,state)=>({id,gid:id,item:'Camera '+id,state,costPrice:20,salePrice:state==='listed'?70:0,dateListed:state==='listed'?'2026-10-01':null,dateSourced:'2026-10-01',parts:[],returnHistory:[],refreshHistory:[],defaultPlatform:'fb',platform:'fb',shippingCost:0,postage:0,packagingCost:0,promoPercent:0,listingFee:0});
    DB={'OCT-26':[make('a','listed'),make('b','listed'),make('c','sourced'),make('d','sourced')],trips:[],expenses:[]};
    _accounts=[];_jobLots=[];_jobLotItems=[];STOCK_SELECTION_MODE=false;STOCK_SELECTED.clear();STOCK_STATE_FILTER='all';STOCK_FILTER='all';STOCK_SOURCED_FILTER='all';STOCK_SEARCH='';STOCK_GROUPED=false;
    window.dispatchEvent(new Event('retrade:data-ready'));goToTab('stock',null,{stockState:'all'});renderStock();
   });
   await page.waitForFunction(()=>!document.querySelector('#p-stock').hasAttribute('aria-busy'));
   await page.locator('#p-stock .select-toggle').click();
   const actions=page.locator('#p-stock [data-stock-action]');
   assert((await actions.count())>=7,'Every action has space before the first selection');
   for(const control of await actions.all()){assert(await control.isVisible());assert(await control.isDisabled());}
   assert(await page.locator('#sel-totals-bar').isVisible(),'Zero selected totals reserve their space too');
   const formats=await actions.evaluateAll(els=>els.map(e=>{const s=getComputedStyle(e);return {height:e.getBoundingClientRect().height,radius:s.borderRadius,font:s.fontSize,weight:s.fontWeight};}));
   formats.forEach(f=>assert.deepEqual(f,formats[0],'All stock actions share control format'));
   const platform=page.locator('[data-stock-action="platform"]');
   assert.equal(await platform.locator('option').first().innerText(),'🏪 Platform');
   assert.equal(await platform.evaluate(e=>getComputedStyle(e).textAlignLast),'center');
   assert(await platform.evaluate(e=>{const s=getComputedStyle(e);return s.paddingLeft===s.paddingRight;}),'Platform label is centred within symmetric padding');

   const row=id=>page.locator('[data-stock-item="'+id+'"]');
   await row('a').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(80);
   const before=await row('a').evaluate(el=>{window.__firstStockRow=el;return {y:el.getBoundingClientRect().top,scroll:scrollY,toolbar:document.querySelector('.stock-selection-toolbar').getBoundingClientRect().height};});
   const hit=await row('a').locator('input').boundingBox();
   assert(await row('a').locator('input').evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}),'Checkbox is reachable before the audit');
   if(width<600)await page.touchscreen.tap(hit.x+hit.width/2,hit.y+hit.height/2);else await page.mouse.click(hit.x+hit.width/2,hit.y+hit.height/2);
   assert(await row('a').locator('input').isChecked());
   const after=await row('a').evaluate(el=>({same:el===window.__firstStockRow,y:el.getBoundingClientRect().top,scroll:scrollY,toolbar:document.querySelector('.stock-selection-toolbar').getBoundingClientRect().height}));
   assert(after.same,'Selecting must not rebuild the stock rows');
   assert(Math.abs(before.y-after.y)<=1&&Math.abs(before.scroll-after.scroll)<=1,'First selection does not push the list or scroll: '+JSON.stringify({width,before,after}));
   assert.equal(after.toolbar,before.toolbar,'Toolbar height is already reserved');
   assert(await page.locator('[data-stock-action="withdraw"]').isEnabled());
   assert(await page.locator('[data-stock-action="bundle"]').isDisabled());
   await row('b').locator('input').check();
   assert(await page.locator('[data-stock-action="bundle"]').isEnabled());
   assert.equal(await page.locator('.stock-selection-toolbar').evaluate(e=>e.getBoundingClientRect().height),before.toolbar,'Second selection does not add another row of actions');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Toolbar fits '+width+'px');
   await row('c').locator('input').check();
   const baseline=await page.evaluate(()=>JSON.stringify(DB));
   await page.locator('[data-stock-action="withdraw"]').click();
   await page.locator('#confirm-cancel').click();assert.equal(await page.evaluate(()=>JSON.stringify(DB)),baseline,'Cancel makes no changes');
   await page.locator('[data-stock-action="withdraw"]').click();
   assert((await page.locator('#confirm-msg').innerText()).includes('1 other selected item'));
   await page.locator('#confirm-ok').click();
   await page.waitForFunction(()=>STOCK_STATE_FILTER==='sourced'&&!STOCK_SELECTION_MODE);
   const result=await page.evaluate(()=>({states:DB['OCT-26'].map(i=>i.state),asking:DB['OCT-26'].slice(0,2).map(i=>i.salePrice),cost:DB['OCT-26'].map(i=>i.costPrice)}));
   assert.deepEqual(result.states,['sourced','sourced','sourced','sourced']);assert.deepEqual(result.asking,[0,0]);assert.deepEqual(result.cost,[20,20,20,20]);
   const names=await page.evaluate(()=>{
    const m='OCT-26',src=DB[m][2];src.item='Canon camera';src.parts=[{id:'original-part',desc:'Battery',cost:5}];
    duplicateItem(m,src.id,'panel');closePanel();
    let clone=DB[m].at(-1);
    // Actual database mapping loses legacy copy metadata; title must suffice.
    const row=_itemToRow(clone,m);clone=_rowToItem(row,[],[]);DB[m].pop();DB['SEP-26']=[clone];
    duplicateItem(m,src.id,'panel');closePanel();duplicateItem('SEP-26',clone.id,'panel');closePanel();
    return {titles:[clone.item,DB[m].at(-1).item,DB['SEP-26'].at(-1).item],states:[clone.state,DB[m].at(-1).state,DB['SEP-26'].at(-1).state],source:src.item};
   });
   assert.deepEqual(names.titles,['Canon camera - 2','Canon camera - 3','Canon camera - 4']);assert.deepEqual(names.states,['sourced','sourced','sourced']);assert.equal(names.source,'Canon camera');
   const financial=await page.evaluate(()=>{
    const fy=_currentFYStart(),key='APR-'+String(fy).slice(-2);
    const sale=(id,price,cost)=>({id,item:id,state:'sold',dateSourced:fy+'-04-01',dateListed:fy+'-04-01',dateSold:fy+'-04-15',salePrice:price,costPrice:cost,salePlatform:'fb',defaultPlatform:'fb',postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:0,parts:[],returnHistory:[],refreshHistory:[]});
    DB={[key]:[sale('first',100,10),sale('second',1000,700)],trips:[],expenses:[{id:'fee',date:fy+'-04-20',amount:50,category:'Other'}]};
    DB[key][1].returnHistory=[{id:'r',type:'partial_seller',saleNo:1,loggedAt:fy+'-05-01',refundAmount:100}];
    DB[key].push({...sale('writeoff',0,25),state:'scrapped',dateSold:null,scrappedAt:fy+'-06-01'});
    _accounts=[];MONTHLY_PERIOD='fy:'+fy;MONTHLY_VIEW='grid';MONTH_SEARCH='';const before=JSON.stringify(DB);
    window.dispatchEvent(new Event('retrade:data-ready'));goToTab('monthly');MONTHLY_VIEW='grid';renderMonthlyGrid();
    return {fy,before,expected:215};
   });
   await page.waitForFunction(()=>!document.querySelector('#p-monthly').hasAttribute('aria-busy'));
   const sums=await page.locator('[data-fy-section="'+financial.fy+'"]').evaluate(el=>{
    const money=s=>Number(s.replace(/[^\d.−-]/g,'').replace('−','-'));
    return {header:money(el.querySelector('[data-fy-net-profit]').textContent),months:Array.from(el.querySelectorAll('[data-month-net-profit]'),e=>({key:e.dataset.monthNetProfit,net:money(e.textContent)}))};
   });
   assert.equal(sums.header,215);assert.equal(+sums.months.reduce((a,m)=>a+m.net,0).toFixed(2),215);
   assert.equal(sums.months.find(m=>m.key.startsWith('MAY-')).net,-100);assert.equal(sums.months.find(m=>m.key.startsWith('JUN-')).net,-25,'Write-off-only month is visible');
   assert.equal(await page.locator('#monthly-money-flow .mf-net .mf-val').innerText(),'£215.00');
   assert.equal(await page.evaluate(()=>JSON.stringify(DB)),financial.before);
   await page.locator('[data-month-net-profit="JUN-'+String(financial.fy).slice(-2)+'"]').click();
   await page.waitForFunction(()=>document.querySelector('#p-monthly').dataset.rtSalesView==='detail');
   assert.equal(await page.locator('#p-monthly .kpi-realised .kpi-value').innerText(),await page.evaluate(()=>fmtK(-25)),'Month drill-down retains its write-off');
   if(process.env.RETRADE_CAPTURE){fs.mkdirSync(process.env.RETRADE_CAPTURE,{recursive:true});await page.screenshot({path:process.env.RETRADE_CAPTURE+'/stock-performance-'+width+'.png',fullPage:true});}
   assert.deepEqual(errors,[]);await context.close();console.log('PASS stock flow, stable selection and monthly reconciliation '+width+'px');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
