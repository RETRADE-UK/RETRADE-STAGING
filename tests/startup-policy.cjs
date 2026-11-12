/* Session decisions execute before paint, even when browser storage is blocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script id="rt-theme-first-paint">([\s\S]*?)<\/script>/)[1];
const now=1800000000000;
function boot(previous,blocked=false){
  const classes=new Set(),events={},values=new Map(previous==null?[]:[['rt-last-active-at',String(previous)]]);
  const root={classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},style:{removeProperty(){}},setAttribute(){}};
  const c={Date:{now:()=>now},performance:{now:()=>1},setTimeout(){},localStorage:{getItem:()=>null},
    sessionStorage:{getItem:k=>{if(blocked)throw Error('disabled');return values.get(k);},setItem:(k,v)=>{if(blocked)throw Error('disabled');values.set(k,v);}},
    document:{documentElement:root,querySelectorAll:()=>[],addEventListener:(n,f)=>events[n]=f},
    matchMedia:()=>({matches:false}),addEventListener:(n,f)=>events[n]=f};
  c.window=c;vm.runInNewContext(script,c);return {c,classes,events,values};
}
for(const [last,replay] of [[null,true],[now-5000,false],[now-1799999,false],[now-1800000,true],[now-3600000,true],[now+1000,true],['corrupt',true]]){
  const b=boot(last);assert.equal(b.c.__rtReplayIntro,replay,String(last));assert.equal(b.classes.has('rt-quick-start'),!replay);
  assert(b.classes.has('rt-launch-sealed'),'Data/auth remain behind the first-frame gate');
  b.events.pagehide();assert.equal(b.values.get('rt-last-active-at'),String(now));
}
assert.equal(boot(now-1000,true).c.__rtReplayIntro,true);
console.log('PASS launch session: new session, recent reload, 30-minute boundary, clock skew, corrupt/blocked storage and first-frame gate');
