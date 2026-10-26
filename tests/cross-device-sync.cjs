/* Actual refresh/commit owners with deferred synthetic reads. No network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/core/application.js','utf8');
const loaderStart=source.indexOf('function _resetBusinessStateForCloudLoad(){');
const loaderEnd=source.indexOf('async function _backfillDateSoldAtReturn(){',loaderStart);
assert(loaderStart>=0&&loaderEnd>loaderStart,'Cloud loader extraction boundaries must exist');
const loader=source.slice(loaderStart,loaderEnd);
const fingerprints=source.slice(source.indexOf('function _dbFingerprint(){'),source.indexOf('async function _persistChangesPass(){'));
const sync=source.slice(source.indexOf('let _cloudRefreshBusy=false;'),source.indexOf('// DATABASE (entry point'));
const pause=ms=>new Promise(r=>setTimeout(r,ms)),copy=x=>JSON.parse(JSON.stringify(x));
function harness({timeout=15000}={}){
  let cloud=[{id:'one',month:'OCT-26',notes:'cloud',revision:2}],pending={},readGate=null,renders=0,reads=0;
  const revisions=new Map([['one',1]]),timers=new Set();
  const c={console:{info(){},warn(){},error(){}},Promise,Date,Set,Map,Number,Object,JSON,Error,
    setTimeout(fn,ms){const id=setTimeout(fn,ms===15000?timeout:ms);timers.add(id);return id;},clearTimeout,
    setInterval(){return 0;},clearInterval(){},document:{visibilityState:'visible',addEventListener(){}},addEventListener(){},
    _currentUserId:'test',_previewMode:false,_dbLoading:false,_schemaVerified:true,_suppressActivityCapture:false,_persistPromise:null,
    DB:{'OCT-26':[{id:'one',notes:'old'}],trips:[],expenses:[],cashLedger:[],activityLog:[]},_dbSnapshot:{},
    _sourcingRuns:[],_activeSourcingRun:null,_accounts:[],_jobLots:[],_jobLotItems:[],_saleReconciliations:[],_jobLotSchemaAvailable:true,_reconciliationSchemaAvailable:true,ALLOW_SCHEMA_FALLBACK:false,
    _ensureSession:async()=>true,_verifySchemaVersion:async()=>{},_ensureDBShape(){},_hydrateItemPhotoUrls:async()=>false,_backfillDateSoldAtReturn(){},_repairRunLinkedDates(){},_refreshNav(){},_initActivityShadow(){},_hydrateUserSettings:async()=>{},_reconcileSyncStatus(){},refreshActivePage(){renders++;},
    allDBKeys:()=>Object.keys(c.DB).filter(k=>/^\w{3}-\d{2}$/.test(k)),_rowToItem(row){revisions.set(row.id,row.revision);return {id:row.id,notes:row.notes};},_rowToRun:r=>r,_rowToAccount:r=>r,
    _outboxRead:()=>copy(pending),_outboxPendingCount:()=>Object.keys(pending).length,
    _getDefaultPlatform:()=>'',getShippingPolicies:()=>[],_taxRegion:()=>'',_taxOtherIncome:()=>0,
    RETRADE_V14_REVISION:{revisionFor:id=>revisions.get(id)||0,restorePendingBase:(item,rev)=>revisions.set(item.id,rev)},
    _sb:{auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})},}
  };
  c._sb.from=table=>{const q={select(){return q;},eq(){return q;},order(){return q;},then(resolve,reject){return Promise.resolve().then(async()=>{const rows=table==='items'?copy(cloud):[];if(table==='items'){reads++;if(readGate){const gate=readGate;readGate=null;await gate;}}return {data:rows,error:null};}).then(resolve,reject);}};return q;};
  c.window=c;vm.createContext(c);vm.runInContext(fingerprints+loader+sync,c);c._dbSnapshot=c._dbFingerprint();
  return {c,revisions,set cloud(v){cloud=v;},get reads(){return reads;},get renders(){return renders;},set pending(v){pending=v;},hold(){let release;readGate=new Promise(r=>release=r);return release;},close(){timers.forEach(clearTimeout);}};
}
(async()=>{
  let h=harness();
  try{
    h.c.DB['OCT-26'][0].displayOnly='derived by renderer';
    h.c.DB.expenses.push({id:'pending',amount:5});h.pending={'exp:pending':{op:'save'}};
    assert.equal(await h.c._refreshCloudOnResume(true),true);
    assert.equal(h.c.DB['OCT-26'][0].notes,'cloud','Unrelated remote record arrives with failed local work');
    assert.equal(h.c.DB['OCT-26'][0].displayOnly,undefined,'Unstaged presentation changes do not mask cloud rows');
    assert.equal(h.c.DB.expenses[0].amount,5);assert.equal(h.c._dbSnapshot['exp:pending'],undefined,'Unsent work is never acknowledged');
    const release=h.hold(),refresh=h.c._refreshCloudOnResume(true);await pause(5);
    h.c.DB['OCT-26'][0].notes='during read';h.pending={'item:one':{op:'save'}};
    release();await refresh;
    assert.equal(h.c.DB['OCT-26'][0].notes,'during read');assert.match(h.c._dbSnapshot['item:one'],/cloud/);
    assert.equal(h.revisions.get('one'),2,'Pending edit retains its original CAS revision');
    h.cloud=[{id:'one',month:'OCT-26',notes:'new remote',revision:3}];
    await h.c._refreshCloudOnResume(true);
    assert.equal(h.revisions.get('one'),2,'Refresh cannot silently upgrade the pending write base');
    h.c.DB['OCT-26'][0].photo='one-url';const before=h.c._dbFingerprint();h.c.DB['OCT-26'][0].photo='new-url';
    assert.deepEqual(h.c._dbFingerprint(),before,'Signed photo refresh is not a business edit');
  }finally{h.close();}
  h=harness({timeout:20});
  try{
    const release=h.hold(),refresh=h.c._refreshCloudOnResume(true);await pause(30);
    assert.equal(await refresh,false);assert.equal(h.c.DB['OCT-26'][0].notes,'old');
    release();await pause(10);assert.equal(h.c.DB['OCT-26'][0].notes,'old','Timed-out response cannot commit later');
    assert.equal(await h.c._refreshCloudOnResume(true),true,'Timeout releases the refresh lane');
  }finally{h.close();}
  h=harness();
  try{
    const release=h.hold(),refresh=h.c._refreshCloudOnResume(true);await pause(5);h.c._currentUserId='other';release();
    assert.equal(await refresh,false);assert.equal(h.c.DB['OCT-26'][0].notes,'old','Old-account load cannot commit');
  }finally{h.close();}
  h=harness();
  try{
    for(let n=1;n<=10;n++){h.c._queueSyncClockRefresh(n,'burst');await pause(30);}
    assert(h.reads>0,'Continuous signals cannot postpone every refresh');
    await pause(150);assert.equal(vm.runInContext('_syncClockAppliedRevision',h.c),10,'Latest signal also applies');
  }finally{h.close();}
  console.log('PASS cloud refresh: pending isolation, concurrent edits, CAS base, photo URLs, late timeout, account isolation and non-starving signals');
})().catch(e=>{console.error(e);process.exitCode=1;});
