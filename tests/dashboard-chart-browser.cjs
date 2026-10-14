const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const engine=process.argv.includes('--webkit')?webkit:chromium;
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await engine.launch({headless:true,...(engine===chromium?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{
  for(const width of [320,390,498,768,944,1440,1920]){
   const mobile=width<560;
   const {page,context,errors}=await open(browser,{signedIn:true,mobile,timezoneId:'UTC'});await settled(page);
   await page.setViewportSize({width,height:mobile?844:1000});
   // Let the 150ms KPI breakpoint redraw finish before injecting chart fixtures.
   await page.waitForTimeout(250);
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('#p-summary svg')).some(s=>s.getClientRects().length&&s.__rtPolishedSnapshot));
   for(const [peak,ceiling] of [[70,75],[1950,2100],[2000,2100],[2000.01,2200],[1900,2000],[95,100],[1050,1150],[1000100,1050200]]){
    const actual=await page.evaluate(({peak})=>{
     const svg=Array.from(document.querySelectorAll('#p-summary svg')).find(s=>s.getClientRects().length&&s.__rtPolishedSnapshot);
     const options=Object.assign({},svg.__rtPolishedSnapshot.opts,{partialLast:false,drawKey:'axis-regression-'+peak,tertiaryData:[0,0,0,0],tertiaryCounts:[0,0,0,0]});
     _renderChartInto(svg,['1/1','1/2','1/3','1/4'],[5,20,peak,15],[1,5,10,3],[],options);
     const axis=svg.querySelector('.rt-polished-axis');
     const ys=Array.from(axis.querySelectorAll('line'),el=>Number(el.getAttribute('y1')));
     const bars=Array.from(svg.querySelectorAll('.rt-chart-primary-bar:not(.rt-chart-profit-bar)'));
     const heights=bars.map(el=>Number(el.getAttribute('height')));
     const top=svg.id.endsWith('-mobile')?14:16,bottom=Math.max(...ys);
     const regular=ys.slice(1).every((v,i)=>i===0||Math.abs((ys[i]-v)-(ys[i-1]-ys[i]))<.2);
     const labelsFit=Array.from(axis.querySelectorAll('text')).every(el=>el.getBBox().x>=1);
     const hitStart=Number(svg.querySelector('.rt-chart-col rect').getAttribute('x'));
     const gridStart=Number(axis.querySelector('line').getAttribute('x1'));
     return {regular,maximum:Number(svg.dataset.scaleMax),labelsFit,hitStart,gridStart,labels:Array.from(axis.querySelectorAll('text'),el=>el.textContent),height:Math.max(...heights),plotHeight:bottom-top,barCount:bars.length,gap:Math.min(...bars.map(el=>Number(el.getAttribute('y'))))-top};
    },{peak});
    assert.equal(actual.maximum,ceiling,'Correct independent padded domain');
    assert(actual.regular,'Uniform grid spacing all the way to the final tick');
    if(peak===70)assert.deepEqual(actual.labels,['£0','£25','£50','£75'],'Screenshot axis is clean and uniform');
    assert.equal(actual.barCount,4);
    assert(actual.labelsFit,'Money labels fit inside the SVG at '+width+'px');
    assert(Math.abs(actual.hitStart-actual.gridStart)<.1,'Hit columns stay aligned with the adjusted gutter');
    assert(Math.abs(actual.height/actual.plotHeight-peak/ceiling)<.002,'Bars use the same scale as the axis');
    assert(actual.gap/actual.plotHeight>=.047,'Visible breathing room above the tallest bar');
    assert(actual.gap/actual.plotHeight<=.092,'No excessive empty space from coarse rounding');
   }
   const sparse=await page.evaluate(()=>{
    const svg=Array.from(document.querySelectorAll('#p-summary svg')).find(s=>s.getClientRects().length&&s.__rtPolishedSnapshot);
    const options=Object.assign({},svg.__rtPolishedSnapshot.opts,{partialLast:true,drawKey:'current_fy',tertiaryData:[0,0,0,0],tertiaryCounts:[0,0,0,0]});
    SUMMARY_PERIOD='current_fy';
    _renderChartInto(svg,['Apr','May','Jun','Jul'],[0,80,0,45],[0,0,0,15],[],options);
    const index=el=>Number(el.style.getPropertyValue('--bar-i'));
    const top=svg.id.endsWith('-mobile')?14:16;
    const shells=Array.from(svg.querySelectorAll('.rt-chart-forecast-shell'));
    return {forecastIndices:shells.map(index),actualIndices:Array.from(svg.querySelectorAll('.rt-chart-actual-overlay'),index),withinScale:shells.every(el=>Number(el.getAttribute('y'))>top)};
   });
   assert.deepEqual(sparse.forecastIndices,[3,3],'Empty earlier buckets must not hide the current-month forecast');
   assert.deepEqual(sparse.actualIndices,[3,3],'Keep actual overlays on the same final bucket');
   assert(sparse.withinScale,'Visible forecasts also have headroom');
   await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'));
   const svgId=await page.evaluate(()=>{
    const svg=Array.from(document.querySelectorAll('#p-summary svg')).find(s=>s.getClientRects().length&&s.__rtPolishedSnapshot);
    const opts=Object.assign({},svg.__rtPolishedSnapshot.opts,{drawKey:'current_fy',tertiaryData:[0,0,0,20],tertiaryCounts:[0,0,0,1]});
    const savedEvents=getSaleEventsInRange,savedBreakdown=_saleBreakdown;
    try{
     // £100 revenue / £20 profit per day: 17.5 remaining days = £1,750 / £350.
     getSaleEventsInRange=()=>Array.from({length:14},(_,i)=>({saleDate:new Date(Date.UTC(2026,9,13-i)).toISOString().slice(0,10)}));
     _saleBreakdown=()=>({salePrice:100,postage:0,netProfit:20});
     SUMMARY_PERIOD='current_fy';
     _renderChartInto(svg,['Jul','Aug','Sep','Oct'],[1900,2200,3600,2611],[300,600,800,397],[],opts);
    }finally{getSaleEventsInRange=savedEvents;_saleBreakdown=savedBreakdown;}
    return svg.id;
   });
   const svg=page.locator('#'+svgId),column=svg.locator('.rt-chart-col').last();
   await svg.scrollIntoViewIfNeeded();
   await column.hover();
   // Tooltip is parent-owned and can precede the SVG after a resize.
   const values=()=>page.evaluate(id=>{
    const svg=document.getElementById(id),tip=svg.parentElement.querySelector('.rt-chart-scrub-tip');
    const r=svg.getBoundingClientRect(),t=tip.getBoundingClientRect();
    const fc=tip.querySelector('.tip-forecast');
    const textBoxes=Array.from(tip.querySelectorAll('strong')).map(el=>el.getBoundingClientRect());
    const clipping=[];for(let el=tip.parentElement;el;el=el.parentElement){
     const cs=getComputedStyle(el);if(/hidden|clip|auto|scroll/.test(cs.overflowX+' '+cs.overflowY)){
      const b=el.getBoundingClientRect();if(t.left<b.left-1||t.right>b.right+1||t.top<b.top-1||t.bottom>b.bottom+1)clipping.push(el.className);
     }
    }
    return {visible:getComputedStyle(tip).display!=='none',text:tip.textContent,actual:Array.from(tip.children).filter(el=>el.classList.contains('tip-row')).map(el=>el.querySelector('strong').textContent),forecast:fc?Array.from(fc.querySelectorAll('strong'),el=>el.textContent):[],contained:t.left>=r.left&&t.right<=r.right&&t.top>=r.top&&t.bottom<=r.bottom,clipping,textFits:textBoxes.every(b=>b.left>=t.left&&b.right<=t.right),oldLabels:svg.querySelectorAll('.rt-dashboard-hover-forecast,.rt-chart-forecast-label,.rt-chart-col title').length};
   },svgId);
   let readout=await values();
   assert(readout.visible,'One readout is visible at '+width);
   assert.deepEqual(readout.actual,['£2,611','£397','−£20']);
   assert.deepEqual(readout.forecast,['£4,361','£747']);
   assert(readout.text.includes('Actual so far')&&readout.text.includes('Forecast · month end'));
   assert(readout.contained,'Readout fits inside plot at '+width+': '+JSON.stringify(readout));
   assert(readout.textFits,'Complete amounts fit at '+width);
   assert.deepEqual(readout.clipping,[],'No clipping ancestor at '+width);
   assert.equal(readout.oldLabels,0,'No competing SVG/native forecast tooltip');
   if(process.env.CHART_CAPTURE_DIR){
    require('node:fs').mkdirSync(process.env.CHART_CAPTURE_DIR,{recursive:true});
    await page.screenshot({path:process.env.CHART_CAPTURE_DIR+'/forecast-'+width+'.png'});
   }
   await svg.locator('.rt-chart-col').nth(1).hover();
   assert.deepEqual((await values()).forecast,[],'Historical months have no forecast');
   if(mobile){
    const box=await column.boundingBox();
    await column.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:7,clientX:box.x+box.width/2,clientY:box.y+box.height/2,buttons:1});
    assert.deepEqual((await values()).forecast,['£4,361','£747'],'Touch immediately includes forecast');
    await page.clock.setFixedTime(new Date('2026-10-14T12:00:00.300Z'));
    await column.dispatchEvent('pointerup',{pointerType:'touch',pointerId:7,clientX:box.x+box.width/2,clientY:box.y+box.height/2,buttons:0});
    assert(await svg.evaluate(el=>el.__wasScrub()),'Holding must not open the month');
   }
   await page.evaluate(id=>{
    const svg=document.getElementById(id);SUMMARY_PERIOD='30d';
    _renderChartInto(svg,['1','2','3'],[10,20,30],[2,4,6],[],Object.assign({},svg.__rtPolishedSnapshot.opts,{drawKey:'30d',partialLast:false}));
   },svgId);
   await svg.locator('.rt-chart-col').last().hover();
   assert.deepEqual((await values()).forecast,[],'Period changes cannot retain a stale forecast');
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS dashboard scales and unified forecast readout: seven widths, complete amounts, containment, touch and period changes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
