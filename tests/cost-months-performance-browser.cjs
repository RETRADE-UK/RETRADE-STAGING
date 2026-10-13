/* Real UI, synthetic records only. The shared harness blocks every external request. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  for(const mobile of [false,true]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile,timezoneId:'Europe/London'});await settled(page);
   const keys=await page.evaluate(()=>{
    const now=new Date(),date=(offset)=>{const d=new Date(now.getFullYear(),now.getMonth()-offset,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';};
    DB.trips=[{id:'current-trip',date:date(0),description:'Market trip',mileage:10,expenses:[]}];
    DB.expenses=[0,1,2,4].map((offset,i)=>({id:'month-'+i,date:date(offset),description:'Market supplies '+i,amount:10+i,category:i===0?'Other':'Software & subscriptions'}));
    COST_PERIOD='all';COST_CAT_FILTER='all';COST_SEARCH='';COST_SELECTION_MODE=false;_costMonthScope='';
    goToTab('expenses');renderExpenses();return [0,1,2,4].map(n=>date(n).slice(0,7));
   });
   await page.waitForFunction(()=>!document.querySelector('#p-expenses').hasAttribute('aria-busy'));
   const group=k=>page.locator('[data-cost-month="'+k+'"]');
   const header=k=>group(k).locator('.cost-month-toggle');
   assert.equal(await page.locator('.cost-month-toggle').count(),4);
   assert.equal(await header(keys[0]).getAttribute('aria-expanded'),'true','Newest visible month starts open');
   for(const k of keys.slice(1))assert.equal(await header(k).getAttribute('aria-expanded'),'false','History starts collapsed');
   assert.equal(await page.locator('#cost-ledger .expense-item:visible').count(),2);
   assert.equal(await page.locator('.ledger-month-label .lm-total:visible').count(),4,'Collapsed totals stay visible');
   const totals=await page.locator('.cost-total-val').innerText();
   await page.locator('#cost-search').evaluate(e=>window.__costSearchNode=e);
   await header(keys[1]).focus();await page.keyboard.press('Enter');
   assert.equal(await header(keys[1]).getAttribute('aria-expanded'),'true','Native keyboard disclosure');
   assert(await header(keys[1]).evaluate(e=>document.activeElement===e),'Toggle retains focus');
   assert.equal(await header(keys[0]).getAttribute('aria-expanded'),'true','Opening history does not force another month shut');
   await page.keyboard.press('Space');assert.equal(await header(keys[1]).getAttribute('aria-expanded'),'false');
   await header(keys[1]).click();await page.evaluate(()=>renderExpenses(true));
   assert.equal(await header(keys[1]).getAttribute('aria-expanded'),'true','Choice survives refresh');
   assert(await page.locator('#cost-search').evaluate(e=>e===window.__costSearchNode),'Disclosure keeps input identity');
   await page.locator('#cost-search').fill('market');
   assert.equal(await page.locator('.cost-month-toggle').count(),0,'Search has no hidden matches');
   assert.equal(await page.locator('#cost-ledger .expense-item:visible').count(),5);
   await page.locator('#cost-search').fill('no match');assert.equal(await page.locator('#cost-ledger .expense-item').count(),0);
   await page.locator('#cost-search').fill('');
   assert.equal(await header(keys[1]).getAttribute('aria-expanded'),'true','Clearing search restores choices');
   assert.equal(await header(keys[2]).getAttribute('aria-expanded'),'false');
   await page.locator('#cost-selection-controls .select-toggle').click();
   assert.equal(await page.locator('.cost-month-toggle').count(),0);
   assert.equal(await page.locator('#cost-ledger .expense-item:visible').count(),5,'All bulk-selection candidates visible');
   await page.locator('#cost-select-all').click();assert.equal(await page.locator('[data-cost-key]:checked:visible').count(),5);
   await page.locator('#cost-selection-controls .sel-exit').click();
   assert.equal(await header(keys[1]).getAttribute('aria-expanded'),'true');
   assert.equal(await page.locator('.cost-total-val').innerText(),totals,'Disclosure does not change deductions');
   for(const period of ['mtd','lastMonth']){
    await page.evaluate(p=>setCostPeriod(p),period);
    await page.waitForFunction(()=>document.querySelector('#p-expenses [data-cost-period].active').dataset.costPeriod===COST_PERIOD&&!document.querySelector('#p-expenses').hasAttribute('data-rt-filter-pending'));
    assert.equal(await page.locator('.ledger-month').count(),1);
    assert.equal(await page.locator('.cost-month-toggle').count(),0,'Single month does not need collapsing');
    assert(await page.locator('#cost-ledger .expense-item:visible').count()>0);
   }
   await page.evaluate(()=>{COST_PERIOD='last90';renderExpenses();});
   assert.equal(await page.locator('.cost-month-toggle').count(),3,'90-day view excludes the older fixture');
   assert.equal(await header(keys[0]).getAttribute('aria-expanded'),'true');
   assert.equal(await header(keys[1]).getAttribute('aria-expanded'),'false');
   await page.evaluate(()=>{COST_PERIOD='all';COST_CAT_FILTER='Software & subscriptions';renderExpenses();});
   assert.equal(await header(keys[1]).getAttribute('aria-expanded'),'true','Newest matching month opens even when current month is filtered out');
   assert.equal(await header(keys[2]).getAttribute('aria-expanded'),'false');
   await header(keys[1]).click();await page.evaluate(()=>{_currentUserId='another-synthetic-user';renderExpenses();});
   assert.equal(await header(keys[1]).getAttribute('aria-expanded'),'true','Disclosure state cannot leak between accounts');
   await page.evaluate(()=>{_currentUserId='ui-test';COST_CAT_FILTER='all';renderExpenses();});
   for(const width of (mobile?[320,390,800]:[1440])){
    await page.setViewportSize({width,height:960});
    const geom=await page.evaluate(()=>({width:document.documentElement.scrollWidth,minHeight:Math.min(...Array.from(document.querySelectorAll('.cost-month-toggle'),e=>e.getBoundingClientRect().height))}));
    assert(geom.width<=width+1,'Month headers fit '+width+'px');assert(geom.minHeight>=44,'Comfortable disclosure tap targets');
   }
   await page.setViewportSize({width:mobile?390:1440,height:1000});
   if(process.env.RETRADE_CAPTURE){fs.mkdirSync(process.env.RETRADE_CAPTURE,{recursive:true});await page.screenshot({path:process.env.RETRADE_CAPTURE+'/cost-months-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});}
   const financial=await page.evaluate(()=>{
    const fy=_currentFYStart(),key='APR-'+String(fy).slice(-2),prevKey='MAR-'+String(fy).slice(-2);
    const item=(id,price,cost,date)=>({id,item:'Synthetic '+id,state:'sold',dateSourced:fy+'-04-01',dateListed:fy+'-04-01',dateSold:date,salePrice:price,costPrice:cost,postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:0,salePlatform:'fb',parts:[],returnHistory:[]});
    DB={[key]:[item('small',100,10,fy+'-04-01'),item('large',1000,700,fy+'-04-20')],[prevKey]:[item('history',200,50,fy+'-03-31')],trips:[],expenses:[{id:'software',date:fy+'-04-30',amount:50,category:'Software & subscriptions'}]};
    DB[key][1].returnHistory=[{id:'refund',type:'partial_seller',saleNo:1,loggedAt:fy+'-05-01',refundAmount:100}];
    DB[key].push({...item('write-off',0,25,null),state:'scrapped',scrappedAt:fy+'-06-01'});
    _accounts=[];MONTHLY_PERIOD='fy:'+fy;
    window.dispatchEvent(new Event('retrade:data-ready'));goToTab('monthly');MONTHLY_VIEW='grid';renderMonthlyGrid();
    const range=_monthlyPeriodResolve(MONTHLY_PERIOD),p=_buildPnLSummary(range.from,range.to,range.label);
    const refund=p.events.filter(e=>e.isReturnAdjustment).reduce((s,e)=>s+Math.max(0,-Number(e.salePrice||0)),0);
    return {fy,profit:fmt(p.netProfit),net:p.netProfit,margin:(p.netProfit/(p.revenue-refund)*100).toFixed(1)+'% net margin',sold:p.soldCount,archive:p.archiveLoss};
   });
   await page.waitForFunction(()=>!document.querySelector('#p-monthly').hasAttribute('aria-busy'));
   assert.equal(financial.archive,25,'Fixture must include a write-off omitted by legacy month rollups');
   const fyRow=page.locator('[data-fy-section="'+financial.fy+'"]');
   assert.equal(await fyRow.locator('[data-fy-net-profit]').innerText(),financial.profit);
   assert.equal(await page.locator('#monthly-money-flow .mf-net .mf-val').innerText(),financial.profit);
   assert.equal(await fyRow.locator('[data-fy-net-margin]').textContent(),financial.margin);
   assert((await page.locator('#monthly-money-flow .mf-foot').innerText()).includes(financial.margin));
   assert(!(await fyRow.innerText()).includes('avg margin'));
   assert.equal(financial.net,215,'£1100 receipts less £710 stock, £100 refund, £50 overhead and £25 write-off');
   if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/performance-net-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
   await page.evaluate(fy=>setMonthlyPeriod('fy:'+(fy-1)),financial.fy);
   await page.waitForFunction(()=>!document.querySelector('#p-monthly').hasAttribute('data-rt-period-pending'));
   assert.equal(await page.locator('[data-fy-section="'+(financial.fy-1)+'"] [data-fy-net-profit]').innerText(),await page.locator('#monthly-money-flow .mf-net .mf-val').innerText());
   const noSales=await page.evaluate(()=>{
    const fy=_currentFYStart();DB={trips:[],expenses:[{id:'only-cost',date:fy+'-04-15',amount:30,category:'Other'}]};
    MONTHLY_PERIOD='fy:'+fy;window.dispatchEvent(new Event('retrade:data-ready'));renderMonthlyGrid();return {fy,profit:fmt(-30)};
   });
   assert.equal(await page.locator('[data-fy-section="'+noSales.fy+'"] [data-fy-net-profit]').innerText(),noSales.profit);
   assert.equal(await page.locator('#monthly-money-flow .mf-net .mf-val').innerText(),noSales.profit,'Expense-only periods still show their loss');
   assert.equal(await page.locator('[data-fy-net-margin]').count(),0,'Zero revenue has no misleading percentage');
   assert(!/NaN|Infinity/.test(await page.locator('#monthly-money-flow').innerText()));
   assert.deepEqual(errors,[]);await context.close();
   console.log('PASS cost-month disclosure/search/selection and canonical FY net profit/margin',mobile?'mobile':'desktop');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
