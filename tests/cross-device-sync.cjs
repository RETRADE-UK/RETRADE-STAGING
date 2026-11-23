/* Real collection/refresh owners with a capped, owner-filtered synthetic API. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/core/application.js','utf8');
function between(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a,start);
  return source.slice(a,b);
}
const oneFunction=name=>{const a=source.indexOf('function '+name+'(');assert.ok(a>=0,name);return source.slice(a,source.indexOf('\n}',a)+2);};
const logic=[
  ...['_jobLotItemAsk','_jobLotItemTotal','_initJobLotPrice','_jobLotMembers','_findItemRecordById'].map(oneFunction),
  between('function _resetBusinessStateForCloudLoad(){','async function _backfillDateSoldAtReturn(){'),
  between('function _dbFingerprint(){','async function _persistChangesPass(){'),
  between('let _cloudRefreshBusy=false;','// DATABASE (entry point'),
  between('function _ownedPreferenceKey(','function _setDefaultPlatform('),
  between('function _applyUserSettings(data){','// Shipping policies'),
  between('function getShippingPolicies(){','function saveShippingPolicy('),
  between('  _hydrateUserSettings=async function(uid){','  window.RETRADE_V148=')
].join('\n');
const copy=v=>JSON.parse(JSON.stringify(v));
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function harness(){
  const history={items:[{id:'old',month:'OCT-26',notes:'cloud',user_id:'one'}]};
  const reads=[],timers=new Set(),cache=new Map();
  let blocked=null,fail=null,timeout=15000;
  const c={
    console:{info(){},warn(){}},document:{visibilityState:'visible',addEventListener(){}},addEventListener(){},
    setTimeout(fn,ms){const id=setTimeout(fn,ms===15000?timeout:ms===650?25:ms);timers.add(id);return id;},
    clearTimeout, setInterval(){return 0;},clearInterval(){},
    localStorage:{getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)},PLATFORMS:{ebay:true,vinted:true},
    SHIPPING_POLICIES_KEY:'retrade_shipping_policies',_refreshShippingPolicyDropdowns(){},
    _v148SettingsOutboxRead:()=>null,_v148FetchSettings:async()=>null,
    _v148SettingsValues:()=>({}),_v148CloudSettingsValues:r=>r,
    _currentUserId:'one',_cloudLoadGeneration:0,_localWriteGeneration:0,_previewMode:false,_dbLoading:false,_schemaVerified:false,
    _persistPromise:null,ALLOW_SCHEMA_FALLBACK:false,DB:{'OCT-26':[{id:'old',notes:'local'}],expenses:[]},_dbSnapshot:{},
    _sourcingRuns:[],_activeSourcingRun:null,_accounts:[],_jobLots:[],_jobLotItems:[],_saleReconciliations:[],_jobLotSchemaAvailable:true,_reconciliationSchemaAvailable:true,
    _ensureSession:async()=>true,_verifySchemaVersion:async()=>{},_ensureDBShape(){},_hydrateItemPhotoUrls:async()=>false,
    _repairRunLinkedDates(){},_refreshNav(){},_initActivityShadow(){},refreshActivePage(){},
    pending:0,_outboxPendingCount:()=>c.pending,_waitForSync:async()=>{},
    allDBKeys:()=>Object.keys(c.DB).filter(k=>/^[A-Z]{3}-\d{2}$/.test(k)),
    _rowToItem:(row,parts=[],returns=[])=>({id:row.id,notes:row.notes,price:row.price,state:row.state,salePrice:row.sale_price,estSalePrice:row.est_sale_price,parts,returns}),
    _rowToRun:r=>r,_rowToAccount:r=>r,
    _sb:{auth:{getSession:async()=>({data:{session:{user:{id:c._currentUserId}}}})}}
  };
  c._sb.from=table=>{
    let uid,after=null,max=Infinity,count=false;
    const query={
      select(fields,opts){assert.equal(fields,'*');count=opts?.count==='exact';return query;},
      eq(key,v){assert.equal(key,'user_id');uid=v;return query;},
      order(key){assert.equal(key,'id');return query;},
      gt(key,v){assert.equal(key,'id');after=v;return query;},
      limit(v){max=v;return query;},
      then(resolve,reject){return (async()=>{
        assert.ok(uid);reads.push({table,after});
        const rows=(history[table]||[]).filter(row=>row.user_id===uid&&(!after||row.id>after)).sort((a,b)=>a.id.localeCompare(b.id));
        if(blocked&&blocked.table===table&&blocked.after===after){
          const gate=blocked;blocked=null;gate.started.resolve();await gate.release.promise;
        }
        if(fail&&fail.table===table&&fail.after===after)return {error:{message:'connection interrupted'}};
        return {data:copy(rows.slice(0,Math.min(max,173))),count:count?rows.length:null,error:null};
      })().then(resolve,reject);}
    };
    return query;
  };
  c.window=c;vm.createContext(c);vm.runInContext(logic,c);c._dbSnapshot=c._dbFingerprint();
  return {c,history,reads,cache,
    set failure(v){fail=v;},set timeout(v){timeout=v;},
    hold(table='items',after=null){blocked={table,after,started:deferred(),release:deferred()};return blocked;},
    close(){timers.forEach(clearTimeout);}
  };
}
(async()=>{
  const mappers=vm.createContext({_currentUserId:'one',btoa,atob});
  vm.runInContext(between('function _rowToItem(','async function _verifySchemaVersion(')+
    between('const _ACCOUNT_META_MARKER=','async function saveAccountToSupabase('),mappers);
  const fixed=mappers._rowToItem({id:'partner-item',month:'OCT-26',arrangement_model_override:'fixed_cost',partner_agreed_amount:0});
  assert.equal(mappers._itemToRow(fixed,'OCT-26').partner_agreed_amount,0);
  assert.equal(mappers._itemToRow(fixed,'OCT-26').arrangement_model_override,'fixed_cost');
  const account=mappers._rowToAccount({id:'partner',account_type:'supplier',arrangement_model:'fixed_cost',payment_timing:'on_sale'});
  assert.equal(mappers._accountToRow(account).payment_timing,'on_sale');
  assert.equal(mappers._accountToRow({id:'legacy',accountType:'consignment'}).payment_timing,'on_sale');
  let h=harness();
  try{
    const {c,history}=h;
    const n=1201;
    history.items=Array.from({length:n},(_,i)=>({id:String(i).padStart(4,'0'),month:'OCT-26',price:i+1,date_listed:'2026-10-01',user_id:'one'}));
    history.items.push({id:'foreign',month:'OCT-26',price:999999,user_id:'two'});
    history.item_returns=history.items.slice(0,n).map(r=>({id:r.id,item_id:r.id,logged_at:'2026-10-04',user_id:'one'}));
    history.expenses=history.items.slice(0,n).map(r=>({id:r.id,date:'2026-10-01',amount:2,user_id:'one'}));
    history.job_lots=[{id:'lot',name:'Camera kit',status:'listed',sale_price:159.99,category:'Digital Cameras & Lenses',promo_percent:.03,price_mode:'linked',price_adjustment:null,user_id:'one'}];
    history.job_lot_items=[{id:'membership',job_lot_id:'lot',item_id:'0000',user_id:'one'}];
    history.items[0].state='listed';history.items[0].sale_price=180;
    await c.loadFromSupabase();
    assert.equal(c._jobLots[0].salePrice,159.99,'Legacy price is retained on cloud hydration');
    assert.equal(c._jobLots[0].priceAdjustment,-20.01);
    assert.equal(c._jobLots[0].category,'Digital Cameras & Lenses');assert.equal(c._jobLots[0].promoPercent,.03);
    assert.equal(c.DB['OCT-26'].length,n);
    assert.equal(c.DB['OCT-26'].reduce((sum,i)=>sum+i.price,0),n*(n+1)/2);
    assert.equal(c.DB['OCT-26'].reduce((sum,i)=>sum+i.returns.length,0),n);
    assert.equal(c.DB.expenses.reduce((sum,e)=>sum+e.amount,0),2*n);
    assert.deepEqual(Array.from(c.DB.expenses,e=>e.id),history.expenses.map(e=>e.id),'Tied dates have stable ID order');
    assert.equal(h.reads.filter(r=>r.table==='trips').length,1,'Empty collections need only one request');
    const complete=c.DB;
    h.failure={table:'expenses',after:'0172'};
    assert.equal(await c._refreshCloudOnResume(true),false);assert.equal(c.DB,complete,'Partial history must never replace a complete view');
    h.failure=null;
    const gate=h.hold('items','0172'),refresh=c._refreshCloudOnResume(true);await gate.started.promise;
    history.items.shift();history.items[210].date_listed='2026-10-02';gate.release.resolve();
    assert.equal(await refresh,true);
    assert.equal(new Set(c.DB['OCT-26'].map(i=>i.id)).size,n,'Concurrent removal before the cursor cannot skip later items');
    assert.equal(await c._refreshCloudOnResume(true),true);
    assert.equal(c.DB['OCT-26'].length,n-1,'The next refresh reflects the deletion');
    const valid=c.DB;
    history.items[4].month='not-a-month';
    assert.equal(await c._refreshCloudOnResume(true),false);assert.equal(c.DB,valid,'Malformed records retain the complete workspace');
    history.items[4].month='OCT-26';
    history.items.push({id:'constructor',month:'OCT-26',user_id:'one'});
    history.item_parts=[{id:'part',item_id:'constructor',user_id:'one'}];
    assert.equal(await c._refreshCloudOnResume(true),true);
    assert.equal(c.DB['OCT-26'].find(i=>i.id==='constructor').parts[0].id,'part');
  }finally{h.close();}
  h=harness();
  try{
    const {c}=h;
    c.pending=1;
    assert.equal(await c._refreshCloudOnResume(true),false);
    assert.equal(h.reads.length,0,'Offline writes defer a passive refresh');
    c.pending=0;
    const gate=h.hold(),refresh=c._refreshCloudOnResume(true);await gate.started.promise;
    c.DB['OCT-26'][0].notes='edit while reading';c._localWriteGeneration++;
    gate.release.resolve();
    assert.equal(await refresh,false);assert.equal(c.DB['OCT-26'][0].notes,'edit while reading');
    assert.match(c._dbSnapshot['item:old'],/local/,'A passive refresh cannot acknowledge an edit');
    const switched=h.hold(),old=c._refreshCloudOnResume(true);await switched.started.promise;
    c._currentUserId='two';switched.release.resolve();assert.equal(await old,false);
    assert.equal(c.DB['OCT-26'][0].notes,'edit while reading','Old account cannot install a snapshot');
    h.cache.set('_rtrade_default_platform','vinted');
    h.cache.set('retrade_shipping_policies','[{"name":"old unscoped value"}]');
    assert.equal(c._getDefaultPlatform(),'ebay');assert.equal(c.getShippingPolicies().length,0);
    const settings={default_platform:'vinted',shipping_policies:[{name:'Tracked parcel'}],tax_other_income:23500};
    const late=deferred();c._v148FetchSettings=()=>late.promise;
    const oldSettings=c._hydrateUserSettings('two');c._currentUserId='one';late.resolve(settings);await oldSettings;
    assert.equal(c.getShippingPolicies().length,0,'An earlier account cannot populate the current settings');
    c._v148FetchSettings=async()=>settings;await c._hydrateUserSettings('one');
    assert.equal(c._getDefaultPlatform(),'vinted');assert.equal(c.getShippingPolicies()[0].name,'Tracked parcel');
    assert.equal(h.cache.get('retrade_tax_other_income_one'),'23500','Existing cloud preferences migrate to owned cache');
    c._v148FetchSettings=async()=>({...settings,shipping_policies:[]});await c._hydrateUserSettings('one');
    assert.equal(c.getShippingPolicies().length,0,'Removing the last policy on another device clears this cache');
    c._v148SettingsOutboxRead=()=>({uid:'one',values:settings});
    c._v148FlushSettingsEntry=async()=>{throw Error('offline');};await c._hydrateUserSettings('one');
    assert.equal(c.getShippingPolicies()[0].name,'Tracked parcel','An existing owned settings outbox survives offline migration');
    Object.assign(c.DB['OCT-26'][0],{photoPath:'one/picture',photo:'old signed URL'});
    const baseline=c._dbFingerprint();c.DB['OCT-26'][0].photo='new signed URL';
    assert.deepEqual(c._dbFingerprint(),baseline);
    h.timeout=20;const delayed=h.hold(),timed=c._refreshCloudOnResume(true);await delayed.started.promise;
    assert.equal(await timed,false);assert.equal(await c._refreshCloudOnResume(true),true,'Retry can commit a new snapshot');
    const fresh=c.DB;delayed.release.resolve();await sleep(5);assert.equal(c.DB,fresh,'Timed-out response must never commit later');
    const readCount=h.reads.length;
    for(let rev=1;rev<=10;rev++){c._queueSyncClockRefresh(rev,'burst');await sleep(6);}
    assert.ok(h.reads.length>readCount,'A steady stream of changes cannot postpone every refresh');
    await sleep(40);assert.equal(vm.runInContext('_syncClockAppliedRevision',c),10);
  }finally{h.close();}
  console.log('PASS complete owner-scoped cloud history, capped pages, financial totals, interrupted reads, local edits, session switches, late timeouts and cross-device signals');
})().catch(error=>{console.error(error);process.exitCode=1;});
