const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/features/charts/polish.js'),'utf8');
const start=source.indexOf('  function niceStep('),end=source.indexOf('  function fmtForecastMoney(');
assert(start>=0&&end>start);
const api=vm.runInNewContext('function num(v){v=Number(v);return isFinite(v)?v:0;}\n'+source.slice(start,end)+'\n({buildScale,fmtAxisMoney})');
let checked=0;
function check(rev,profit,refunds,target,forecast,expectedMax){
 const before=JSON.stringify([rev,profit,refunds,forecast]);
 const s=api.buildScale(rev,profit,refunds,target,forecast);
 if(expectedMax!==undefined)assert.equal(s.max,expectedMax,JSON.stringify({rev,profit,refunds,target,forecast}));
 assert(s.min<=0&&s.max>=0&&s.max>s.min);
 assert(Number.isFinite(s.step)&&s.step>0);
 assert.equal(s.ticks[0],s.min);assert(s.ticks.at(-1)<=s.max+1e-7);
 assert(s.ticks.some(v=>Math.abs(v)<1e-8),'Keep zero');
 assert(s.ticks.length<=Math.max(3,target)+3,'Do not overfill the axis');
 for(let i=0;i<s.ticks.length;i++){
  assert(Number.isFinite(s.ticks[i]));
  if(i)assert(Math.abs(s.ticks[i]-s.ticks[i-1]-s.step)<1e-7,'Every tick has the SAME increment, including the last');
 }
 const values=[...rev,...profit,...refunds,...(forecast?[forecast.rev,forecast.profit]:[])].map(Number).filter(Number.isFinite);
 for(const n of values)assert(n<=s.max+1e-7&&n>=s.min-1e-7,'No clipping');
 const peak=Math.max(0,...values);
 if(peak>0){
  assert(s.max>peak,'Positive marks must not touch the top');
  assert(s.max+1e-7>=peak*1.05);
  assert(s.max<=Math.max(peak*1.10,peak*1.05+.01)+1e-7,'Retain bounded headroom, allowing a penny');
 }
 assert.equal(JSON.stringify([rev,profit,refunds,forecast]),before);
 checked++;return s;
}
for(const target of [2,3,4]){
 for(const [peak,max] of [[70,75],[69.5,75],[1900,2000],[1950,2100],[1999.99,2100],[2000,2100],[2000.01,2200],[2099.99,2300],[10001,10600],[100,110],[101,110],[1050,1150],[99.99,105],[999.99,1050]])
  check([5,20,peak,15],[1,5,10,3],[],target,null,max);
 const regular=check([60,8,70,50,19],[20,2,37,20,5],[],target,null,75);
 assert.equal(JSON.stringify(regular.ticks),JSON.stringify([0,25,50,75]),'Screenshot range has clean quarters, not £74');
 check([.01,.09],[0,.03],[],target,null,.1);check([5,9.99],[1,2],[],target,null,10.5);
 check([],[],[],target,null,100);check([0,0],[0,0],[],target,null,100);
 check([NaN,Infinity,'bad'],[null,undefined],[],target,null,100);
 check([50,1950],[-225,125],[0,2200.01],target,null,2400);
 check([50,1950],[5,2500.01],[],target,null,2700);
 check([-150,-50],[-225,-25],[],target,null,0);
 check([50,1950],[5,-40],[],target,{rev:2050,profit:-300},2200);
 for(let pence=1;pence<300;pence++)check([pence/100],[],[],target,null);
 for(let peak=5;peak<20000;peak+=37)check([peak],[Math.min(-15,-peak/3)],[],target,null);
}
for(const [v,l] of [[2000,'£2k'],[25,'£25'],[50,'£50'],[75,'£75'],[.01,'£0.01'],[-.01,'−£0.01']])assert.equal(api.fmtAxisMoney(v),l);
console.log('PASS '+checked+' chart scales: uniform nice ticks, bounded headroom, refunds/losses/forecasts and zero');
