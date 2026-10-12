const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/features/charts/polish.js'),'utf8');
const start=source.indexOf('  function niceStep('),end=source.indexOf('  function fmtForecastMoney(');
assert(start>=0&&end>start,'Load the scale from its existing runtime owner');
const api=vm.runInNewContext('function num(v){v=Number(v);return isFinite(v)?v:0;}\n'+source.slice(start,end)+'\n({buildScale,fmtAxisMoney})');
let checked=0;
function check(rev,profit,refunds,target,forecast,expectedMax){
 const before=JSON.stringify([rev,profit,refunds,forecast]);
 const s=api.buildScale(rev,profit,refunds,target,forecast);
 assert.equal(s.max,expectedMax,'Ceiling for '+JSON.stringify({rev,profit,refunds,target,forecast}));
 assert(s.min<=0&&s.max>=0&&s.max>s.min);
 assert(Number.isFinite(s.step)&&s.step>0);
 assert.equal(s.ticks[0],s.min);assert.equal(s.ticks.at(-1),s.max);
 assert(s.ticks.some(v=>Math.abs(v)<1e-8),'Keep the zero baseline');
 assert(s.ticks.length<=target+3,'Do not replace headroom with excessive grid lines');
 for(let i=0;i<s.ticks.length;i++){
  assert(Number.isFinite(s.ticks[i]));
  if(i)assert(s.ticks[i]>s.ticks[i-1],'Ticks remain strictly increasing');
 }
 for(const v of [...rev,...profit,...refunds,...(forecast?[forecast.rev,forecast.profit]:[])]){
  const n=Number(v);if(!Number.isFinite(n))continue;
  assert(n<=s.max+1e-7&&n>=s.min-1e-7,'No plotted value is clipped');
 }
 assert.equal(JSON.stringify([rev,profit,refunds,forecast]),before,'Never mutate accounting inputs');
 checked++;
 return s;
}
for(const target of [2,3,4]){
 for(const [peak,max] of [[1900,1900],[1950,2000],[1999.99,2000],[2000,2000],[2000.01,2100],[2099.99,2100],[10001,10100],[1900.0000000000002,1900]])
  check([35,80,peak,45],[10,25,100,15],[],target,null,max);
 check([31,54,95],[10,20,30],[],target,null,100);
 check([.01,.09],[0,.03],[],target,null,.09);
 check([5,9.99],[1,2],[],target,null,10);
 check([],[],[],target,null,100);
 check([0,0],[0,0],[],target,null,100);
 check([NaN,Infinity,'bad'],[null,undefined],[],target,null,100);
 check([50,1950],[-225,125],[0,2200.01],target,null,2300);
 check([50,1950],[5,2500.01],[],target,null,2600);
 check([-150,-50],[-225,-25],[],target,null,0);
 check([50,1950],[5,-40],[],target,{rev:2050,profit:-300},2100);
}
for(const target of [2,3,4])for(let peak=101;peak<20000;peak+=137){
 check([25,peak],[-15,40],[0,10],target,null,Math.ceil(peak/100)*100);
}
assert.equal(api.fmtAxisMoney(2000),'£2k');
assert.equal(api.fmtAxisMoney(2100),'£2.1k');
assert.equal(api.fmtAxisMoney(10100),'£10.1k','Do not round a tightened ceiling back down in its label');
console.log('PASS '+checked+' dashboard chart scales: tight ceilings, small/empty values, losses, refunds, forecasts and responsive tick counts');
