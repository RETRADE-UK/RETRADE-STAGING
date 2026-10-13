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
 if(expectedMax!==undefined)assert.equal(s.max,expectedMax,'Ceiling for '+JSON.stringify({rev,profit,refunds,target,forecast}));
 assert(s.min<=0&&s.max>=0&&s.max>s.min);
 assert(Number.isFinite(s.step)&&s.step>0);
 assert.equal(s.ticks[0],s.min);assert.equal(s.ticks.at(-1),s.max);
 assert(s.ticks.some(v=>Math.abs(v)<1e-8),'Keep the zero baseline');
 assert(s.ticks.length<=target+3,'Do not replace headroom with excessive grid lines');
 for(let i=0;i<s.ticks.length;i++){
  assert(Number.isFinite(s.ticks[i]));
  if(i)assert(s.ticks[i]>s.ticks[i-1],'Ticks remain strictly increasing');
 }
 const values=[...rev,...profit,...refunds,...(forecast?[forecast.rev,forecast.profit]:[])].map(Number).filter(Number.isFinite);
 for(const n of values)assert(n<=s.max+1e-7&&n>=s.min-1e-7,'No plotted value is clipped');
 const peak=Math.max(0,...values);
 if(peak>0){
  assert(s.max>peak,'The tallest positive mark must not touch the ceiling');
  assert(s.max+1e-7>=peak*1.05,'At least 5% data headroom before rounding');
  assert(s.max<=Math.max(peak*1.10,peak*1.05+.01)+1e-7,'Bound rounding headroom to 10%, allowing one penny');
 }
 assert.equal(JSON.stringify([rev,profit,refunds,forecast]),before,'Never mutate accounting inputs');
 checked++;
 return s;
}
for(const target of [2,3,4]){
 for(const [peak,max] of [[1900,2000],[1950,2100],[1999.99,2100],[2000,2100],[2000.01,2200],[2099.99,2300],[10001,10600],[1900.0000000000002,2000],[100,110],[101,110],[1050,1110],[99.99,105],[999.99,1050]])
  check([35,80,peak,45],[10,25,30,15],[],target,null,max);
 check([31,54,95],[10,20,30],[],target,null,100);
 check([.01,.09],[0,.03],[],target,null,.1);
 check([5,9.99],[1,2],[],target,null,10.5);
 check([],[],[],target,null,100);
 check([0,0],[0,0],[],target,null,100);
 check([NaN,Infinity,'bad'],[null,undefined],[],target,null,100);
 check([50,1950],[-225,125],[0,2200.01],target,null,2400);
 check([50,1950],[5,2500.01],[],target,null,2700);
 check([-150,-50],[-225,-25],[],target,null,0);
 check([50,1950],[5,-40],[],target,{rev:2050,profit:-300},2200);
 for(let pence=1;pence<200;pence++)check([pence/100],[],[],target,null);
 for(let peak=101;peak<20000;peak+=137)check([25,peak],[-15,40],[0,10],target,null);
}
for(const [value,label] of [[2000,'£2k'],[2100,'£2.1k'],[1110,'£1.11k'],[1050,'£1.05k'],[10100,'£10.1k'],[10.5,'£10.5'],[.01,'£0.01'],[-.01,'−£0.01'],[1000100,'£1.0001m']])
 assert.equal(api.fmtAxisMoney(value),label,'Refined ceilings retain accurate labels');
console.log('PASS '+checked+' dashboard scales: bounded 5% headroom, tight rounding, small/empty values, losses, refunds and forecasts');
