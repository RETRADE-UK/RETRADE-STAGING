/* Exercise the actual layered recovery guards with local-only storage. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync('src/core/application.js','utf8');
const marker=s.indexOf("  var BULK_RECOVERY_LIMIT=100;");
const innerStart=s.lastIndexOf('(function(){',marker),innerEnd=s.indexOf('  // Stable return-event persistence.',marker);
const outerMarker=s.indexOf("  var VERSION='1.4.13-2026-09-02';");
const outerStart=s.lastIndexOf('(function(){',outerMarker),outerEnd=s.indexOf('\n})();',outerMarker)+6;
const storageCode=s.slice(s.indexOf("const OUTBOX_KEY_BASE ="),s.indexOf('// v1.4.3 — synchronous write-ahead durability.'));
function harness(entries,{remote=[],failQuarantine=false,failClear=false}={}){
 const storage=new Map([['retrade_outbox_v1_test',JSON.stringify(entries)]]),notices=[],replayed=[];
 const ctx={console:{info(){},warn(){},error(){}},DB:{'APR-26':remote},_accounts:[],_sourcingRuns:[],_jobLots:[],_jobLotItems:[],_saleReconciliations:[],_dbSnapshot:{},_currentUserId:'test',_lastSyncError:null,
  allDBKeys:()=>['APR-26'],toast:x=>notices.push(x),localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){if(failQuarantine&&k.includes('recovery')||failQuarantine&&k.includes('quarantine'))throw Error('quota');if(failClear&&k==='retrade_outbox_v1_test')throw Error('quota');storage.set(k,v);},removeItem(k){if(failClear&&k==='retrade_outbox_v1_test')throw Error('quota');storage.delete(k);}},
  RETRADE_V14_REVISION:{revisionFor:id=>{const r=remote.find(x=>x.id===(typeof id==='object'?id.id:id));return r?.revision||0;}},
  _recoverOutbox(){const ob=ctx._outboxRead();replayed.push(...Object.keys(ob));ctx._outboxSave({});return Object.keys(ob).length;}
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(storageCode,ctx);vm.runInContext(s.slice(innerStart,innerEnd)+'\n})();',ctx);vm.runInContext(s.slice(outerStart,outerEnd),ctx);
 return {ctx,storage,notices,replayed};
}
const make=(modern,base=0)=>Object.fromEntries(Array.from({length:120},(_,i)=>['item:'+i,{op:'save',type:'item',month:'APR-26',json:JSON.stringify({id:String(i),item:'Pending '+i}),baseRevision:base,...(modern?{v:149}:{})}]));
let h=harness(make(true,1),{remote:Array.from({length:120},(_,i)=>({id:String(i),revision:1}))});
assert.equal(h.ctx._recoverOutbox(),120,'Large valid queue replays normally');assert.equal(h.notices.length,0);assert.equal(h.storage.size,0);
h=harness(make(true));assert.equal(h.ctx._recoverOutbox(),120,'Modern new items survive bulk threshold');
h=harness(make(false));assert.equal(h.ctx._recoverOutbox(),0);assert.equal(h.replayed.length,0);assert.equal(h.notices.length,0);assert.equal(h.storage.size,1,'Original legacy queue preserved in quarantine');
const backup=JSON.parse([...h.storage.values()][0]);assert.equal(Object.keys(backup.entries).length,120);h.ctx._recoverOutbox();assert.equal(h.storage.size,1,'No repeated backup or recurring notice on next recovery');
h=harness(make(false),{failQuarantine:true});assert.equal(h.ctx._recoverOutbox(),0);assert.equal(h.ctx._outboxPendingCount(),120,'Storage failure retains every pending change');assert.equal(h.replayed.length,0);
h=harness(make(false),{failClear:true});assert.equal(h.ctx._recoverOutbox(),0);assert.equal(h.ctx._outboxPendingCount(),120);assert.equal(h.replayed.length,0);
h=harness(make(true,1),{remote:Array.from({length:120},(_,i)=>({id:String(i),revision:2}))});assert.equal(h.ctx._recoverOutbox(),0,'Newer cloud wins even for a modern queue');assert.equal(h.replayed.length,0);assert.equal(h.storage.size,1);
h=harness(make(true,1),{remote:Array.from({length:120},(_,i)=>({id:String(i),revision:2})),failQuarantine:true});assert.equal(h.ctx._recoverOutbox(),0);assert.equal(h.ctx._outboxPendingCount(),120);
console.log('PASS bulk recovery: valid large queues, legacy preservation, idempotency, failed storage, stale cloud guard');
