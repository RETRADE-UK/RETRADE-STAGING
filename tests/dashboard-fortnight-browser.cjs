/* Fourteen-day dashboard: real period selection, daily totals, sparse/negative
   data, adjoining comparison windows and responsive hit/label geometry.
   Uses the isolated startup harness; no business services are contacted. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
const engine=process.argv.includes('--webkit')?webkit:chromium;
(async()=>{
 const browser=await engine.launch({headless:true,...(engine===chromium?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{
  for(const width of [320,390,768,1440]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile:width<560,timezoneId:'Europe/London'});
   await settled(page);await page.setViewportSize({width,height:1000});await page.waitForTimeout(250);
   await page.clock.setFixedTime(new Date('2026-10-16T12:00:00Z'));
   const expected=await page.evaluate(()=>{
    _accounts=[];DB={'OCT-26':[],trips:[],expenses:[]};
    for(let i=-1;i<=14;i++){
     if(i===4)continue; // one real zero-sales day must retain its slot
     const day=dateAdd('2026-10-03',i),price=20+Math.max(0,i),cost=i===7?70:10;
     DB['OCT-26'].push({id:'fortnight-'+i,item:'Synthetic daily sale '+i,state:'sold',category:'Other',dateSourced:day,dateListed:day,dateSold:day,salePrice:price,costPrice:cost,postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:0,salePlatform:'fb',defaultPlatform:'fb',returnHistory:[],parts:[]});
    }
    renderSummary();
    return Array.from({length:14},(_,i)=>i===4?0:20+i);
   });
   const select=page.getByLabel('Dashboard period');
   assert.deepEqual(await select.locator('option').evaluateAll(els=>els.slice(0,3).map(e=>e.value)),['7d','14d','30d']);
   await select.selectOption('14d');
   await page.waitForFunction(()=>!document.getElementById('p-summary').hasAttribute('data-rt-period-pending')&&Array.from(document.querySelectorAll('#p-summary svg')).some(s=>s.getClientRects().length&&s.__rtPolishedSnapshot?.opts.drawKey==='14d'));
   const state=await page.evaluate(()=>{
    const svg=Array.from(document.querySelectorAll('#p-summary svg')).find(s=>s.getClientRects().length&&s.__rtPolishedSnapshot);
    const snap=svg.__rtPolishedSnapshot,cols=Array.from(svg.querySelectorAll('.rt-chart-col rect'));
    const bars=Array.from(svg.querySelectorAll('.rt-chart-primary-bar:not(.rt-chart-profit-bar)')).sort((a,b)=>+a.getAttribute('x')-+b.getAttribute('x'));
    const labels=Array.from(svg.querySelectorAll('.rt-fortnight-date'));
    const boxes=labels.map(e=>e.getBBox()),sw=svg.viewBox.baseVal.width;
    const x=e=>+e.getAttribute('x'),w=e=>+e.getAttribute('width');
    return {id:svg.id,range:getSummaryDateRange(),previous:_prevPeriodRange(_prevPeriodKey('14d')),comparison:calcSummaryDeltas().label,saved:localStorage.getItem(_SK.sumPer),labels:snap.labels,rev:snap.revData,profit:snap.profitData,gross:calcSummaryGrossStats().revenue,handlers:window.__chartClickHandlers,
      columns:cols.length,bands:cols.map(w),barCount:bars.length,minGap:Math.min(...bars.slice(1).map((b,i)=>x(b)-x(bars[i])-w(bars[i]))),
      widths:bars.map(w),profitInset:Array.from(svg.querySelectorAll('.rt-chart-profit-bar')).every(p=>{const b=bars.find(r=>r.style.getPropertyValue('--bar-i')===p.style.getPropertyValue('--bar-i'));return b&&x(p)>x(b)&&x(p)+w(p)<x(b)+w(b);}),
      labelCount:labels.length,labelDates:labels.map(e=>e.textContent),labelsFit:boxes.every(b=>b.x>=0&&b.x+b.width<=sw+.5),labelsSeparate:boxes.slice(1).every((b,i)=>b.x>=boxes[i].x+boxes[i].width+3),
      overflow:document.documentElement.scrollWidth>innerWidth+1,forecast:svg.querySelectorAll('.rt-chart-forecast-shell').length};
   });
   assert.deepEqual(state.range,{from:'2026-10-03',to:'2026-10-16'});
   assert.deepEqual(state.previous,{from:'2026-09-19',to:'2026-10-02'});
   assert.equal(state.comparison,'vs prev 14 days');assert.equal(state.saved,'14d');
   assert.equal(state.columns,14);assert.equal(state.labels.length,14);
   assert.deepEqual(state.rev,expected,'The boundary days count once; earlier/future sales do not leak in');
   assert.equal(state.gross,expected.reduce((s,v)=>s+v,0),'Chart and revenue KPI reconcile');
   assert(state.profit[7]<0,'A loss stays below zero');
   assert.equal(state.handlers[4],null,'Empty days do not open unrelated records');
   assert.deepEqual(state.handlers[0].args.slice(1),['2026-10-03','2026-10-03']);
   assert.deepEqual(state.handlers[13].args.slice(1),['2026-10-16','2026-10-16']);
   assert.equal(state.barCount,13);assert(state.minGap>=3,'Bars remain visibly separated: '+JSON.stringify(state));
   assert(state.profitInset);assert(Math.max(...state.widths)<=38.1);
   assert(state.bands.every(v=>Math.abs(v-state.bands[0])<.2),'Every day has equal space');
   assert(state.labelCount>=2&&state.labelCount<=14);
   assert.equal(state.labelDates[0],state.labels[0]);assert.equal(state.labelDates.at(-1),state.labels.at(-1));
   assert(state.labelsFit&&state.labelsSeparate,'Dates fit without overlapping: '+JSON.stringify(state));
   assert(!state.overflow);assert.equal(state.forecast,0);
   const svg=page.locator('#'+state.id);await svg.scrollIntoViewIfNeeded();
   await svg.locator('.rt-chart-col').nth(4).hover();
   assert((await svg.locator('..').locator('.rt-chart-scrub-tip').innerText()).includes(state.labels[4]),'Zero day remains readable');
   await svg.locator('.rt-chart-col').last().hover();
   assert((await svg.locator('..').locator('.rt-chart-scrub-tip').innerText()).includes(state.labels[13]));
   await page.evaluate(()=>{showRangeSnapshot=(...args)=>{window.__selectedDailyRange=args;};});
   await svg.locator('.rt-chart-col').last().click();
   assert.deepEqual((await page.evaluate(()=>window.__selectedDailyRange)).slice(1),['2026-10-16','2026-10-16']);
   for(const [period,count] of [['7d',7],['30d',30],['14d',14]]){
    await page.getByLabel('Dashboard period').selectOption(period);
    await page.waitForFunction(({period,count})=>!document.getElementById('p-summary').hasAttribute('data-rt-period-pending')&&Array.from(document.querySelectorAll('#p-summary svg')).some(s=>s.getClientRects().length&&s.__rtPolishedSnapshot?.opts.drawKey===period&&s.__rtPolishedSnapshot.labels.length===count),{period,count});
   }
   // Calendar boundaries, leap day and the UK clock change must retain 14 dates.
   for(const [today,from,priorTo] of [['2026-03-05','2026-02-20','2026-02-19'],['2024-03-05','2024-02-21','2024-02-20'],['2026-10-27','2026-10-14','2026-10-13']]){
    await page.clock.setFixedTime(new Date(today+'T12:00:00Z'));
    assert.deepEqual(await page.evaluate(()=>[_periodDateRange('14d').from,_periodDateRange('14d').to,_prevPeriodRange('_prev14d').to]),[from,today,priorTo]);
   }
   assert.deepEqual(errors,[]);await context.close();console.log('PASS fourteen-day dashboard '+width+'px');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
