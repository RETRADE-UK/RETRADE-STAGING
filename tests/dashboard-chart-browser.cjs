const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  for(const mobile of [true,false]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('#p-summary svg')).some(s=>s.getClientRects().length&&s.__rtPolishedSnapshot));
   for(const [peak,ceiling,label] of [[1950,2000,'£2k'],[2000.01,2100,'£2.1k'],[1900,1900,'£1.9k'],[95,100,'£100']]){
    const actual=await page.evaluate(({peak})=>{
     const svg=Array.from(document.querySelectorAll('#p-summary svg')).find(s=>s.getClientRects().length&&s.__rtPolishedSnapshot);
     const snapshot=svg.__rtPolishedSnapshot;
     const options=Object.assign({},snapshot.opts,{partialLast:false,drawKey:'axis-regression-'+peak,tertiaryData:[0,0,0,0],tertiaryCounts:[0,0,0,0]});
     _renderChartInto(svg,['1/1','1/2','1/3','1/4'],[35,80,peak,45],[10,25,30,15],[],options);
     const axis=svg.querySelector('.rt-polished-axis');
     const ys=Array.from(axis.querySelectorAll('line'),el=>Number(el.getAttribute('y1')));
     const bars=Array.from(svg.querySelectorAll('.rt-chart-primary-bar:not(.rt-chart-profit-bar)'));
     const heights=bars.map(el=>Number(el.getAttribute('height')));
     return {labels:Array.from(axis.querySelectorAll('text'),el=>el.textContent),height:Math.max(...heights),plotHeight:Math.max(...ys)-Math.min(...ys),barCount:bars.length};
    },{peak});
    assert.equal(actual.labels.at(-1),label,'Exact tight ceiling on '+(mobile?'mobile':'desktop'));
    assert.equal(actual.barCount,4);
    assert(Math.abs(actual.height/actual.plotHeight-peak/ceiling)<.002,'Bars use the same tight scale as the axis');
   }
   const sparse=await page.evaluate(()=>{
    const svg=Array.from(document.querySelectorAll('#p-summary svg')).find(s=>s.getClientRects().length&&s.__rtPolishedSnapshot);
    const options=Object.assign({},svg.__rtPolishedSnapshot.opts,{partialLast:true,drawKey:'current_fy',tertiaryData:[0,0,0,0],tertiaryCounts:[0,0,0,0]});
    SUMMARY_PERIOD='current_fy';
    _renderChartInto(svg,['Apr','May','Jun','Jul'],[0,80,0,45],[0,0,0,15],[],options);
    const index=el=>Number(el.style.getPropertyValue('--bar-i'));
    const top=Math.min(...Array.from(svg.querySelectorAll('.rt-polished-axis line'),el=>Number(el.getAttribute('y1'))));
    const shells=Array.from(svg.querySelectorAll('.rt-chart-forecast-shell'));
    return {forecastIndices:shells.map(index),actualIndices:Array.from(svg.querySelectorAll('.rt-chart-actual-overlay'),index),withinScale:shells.every(el=>Number(el.getAttribute('y'))>=top-.1)};
   });
   assert.deepEqual(sparse.forecastIndices,[3,3],'Empty earlier buckets must not hide the current-month forecast');
   assert.deepEqual(sparse.actualIndices,[3,3],'Keep actual overlays on the same final bucket');
   assert(sparse.withinScale,'The tight ceiling must contain every visible forecast');
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS dashboard tight ceilings, period redraws, bar/axis geometry and sparse forecasts on mobile and desktop');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
