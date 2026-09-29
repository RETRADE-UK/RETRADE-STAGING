/* Synthetic quota/denied-storage tests. No external account or data access. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{for(const mobile of [false,true]){
  const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
  const first=await page.evaluate(()=>{
   const key='retrade_outbox_quarantine_v149_ui-test_123';
   localStorage.setItem(key,JSON.stringify({entries:{'item:old':{json:'unchanged recovery evidence'}}}));
   localStorage.setItem('retrade_outbox_quarantine_v149_other-user_123','foreign');
   localStorage.setItem('supabase-auth-token','do not touch');
   window._testStorageSet=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){if(k===_outboxKey()&&localStorage.getItem(key))throw new DOMException('Quota full','QuotaExceededError');return _testStorageSet.call(this,k,v);};
   const ok=_outboxSave({'item:new':{json:'first edit'}});
   _outboxSave({'item:new':{json:'latest edit'},'item:second':{json:'second edit'}});
   return {ok,copy:_syncStatusCopy('pending')};
  });
  assert.equal(first.ok,false);assert.match(first.copy.join(' '),/only in this open session/);
  await page.waitForFunction(()=>!localStorage.getItem('retrade_outbox_quarantine_v149_ui-test_123')&&JSON.parse(localStorage.getItem(_outboxKey())||'{}')['item:new']?.json==='latest edit');
  const archived=await page.evaluate(async()=>({data:await RETRADE_LOCAL_RECOVERY.export('ui-test'),foreign:localStorage.getItem('retrade_outbox_quarantine_v149_other-user_123'),auth:localStorage.getItem('supabase-auth-token'),pending:_outboxPendingCount()}));
  assert.equal(archived.data.archived.length,1);assert.match(archived.data.archived[0].raw,/unchanged recovery evidence/);assert.equal(archived.foreign,'foreign');assert.equal(archived.auth,'do not touch');assert.equal(archived.pending,2);
  await page.reload();await settled(page);
  assert.equal(await page.evaluate(async()=>(await RETRADE_LOCAL_RECOVERY.export('ui-test')).archived.length),1,'Archived bytes survive reload');
  // An archive write failure must not remove the original evidence.
  assert.equal(await page.evaluate(async()=>{
   const key='retrade_stale_recovery_v1413_ui-test_456';localStorage.setItem(key,'preserve me');
   const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(){throw new DOMException('Archive quota','QuotaExceededError');};
   try{await RETRADE_LOCAL_RECOVERY.relieve('ui-test');return localStorage.getItem(key);}finally{IDBObjectStore.prototype.add=add;}
  }),'preserve me');
  // A second tab/version changing a key during archiving is not erased.
  assert.equal(await page.evaluate(async()=>{
   const key='retrade_stale_recovery_v1413_ui-test_456',add=IDBObjectStore.prototype.add;
   IDBObjectStore.prototype.add=function(v){localStorage.setItem(key,'new evidence');return add.call(this,v);};
   try{await RETRADE_LOCAL_RECOVERY.relieve('ui-test');return localStorage.getItem(key);}finally{IDBObjectStore.prototype.add=add;}
  }),'new evidence');
  const denied=await page.evaluate(()=>{
   const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
   _outboxSave({'item:old':{json:'older pending'}});
   Storage.prototype.setItem=function(k,v){if(k===_outboxKey())throw new DOMException('Storage disabled','SecurityError');return set.call(this,k,v);};
   Storage.prototype.removeItem=function(k){if(k===_outboxKey())throw new DOMException('Storage disabled','SecurityError');return remove.call(this,k);};
   const failed=_outboxSave({'item:new':{json:'new pending'}}),prune=_outboxSave({}),pending=_outboxPendingCount();
   _refreshSideNavSync('synced');const state=_syncPresentationState;
   _currentUserId='other-user';const foreignPending=_outboxPendingCount();_currentUserId='ui-test';
   Storage.prototype.setItem=set;Storage.prototype.removeItem=remove;
   const retry=_outboxSave(_outboxRead());return {failed,prune,pending,state,foreignPending,retry};
  });
  assert.equal(denied.failed,false);assert.equal(denied.prune,false);assert.equal(denied.pending,2);assert.equal(denied.state,'error');assert.equal(denied.foreignPending,0);assert.equal(denied.retry,true);
  assert.deepEqual(errors,[]);await context.close();console.log('PASS local saving: archive commit, exact bytes, reload, denied storage, user isolation and latest intent',mobile?'mobile':'desktop');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
