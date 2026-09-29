/* Retired conflict snapshots must not crowd the synchronous write-ahead queue.
   Move only this user's known quarantine keys, only after IndexedDB commits,
   and only if their exact localStorage bytes have not changed meanwhile. */
(function(){
  'use strict';
  const busy=new Map();
  const prefixes=['retrade_outbox_quarantine_v149_','retrade_return_conflicts_v149_','retrade_stale_recovery_v1413_'];
  function belongs(key,uid){return prefixes.some(p=>key.startsWith(p+uid+'_')&&/^\d+$/.test(key.slice((p+uid+'_').length)));}
  function snapshots(uid){
    const rows=[];
    for(let n=0;n<localStorage.length;n++){
      const key=localStorage.key(n);
      if(key&&belongs(key,uid)){const raw=localStorage.getItem(key);if(raw!==null)rows.push({key,raw});}
    }
    return rows;
  }
  function open(){return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('Local archive unavailable'));return;}
    const request=indexedDB.open('retrade-local-recovery',1);
    let finished=false;
    const timeout=setTimeout(()=>finish(new Error('Local archive timed out')),5000);
    function finish(error,db){if(finished){if(db)db.close();return;}finished=true;clearTimeout(timeout);error?reject(error):resolve(db);}
    request.onupgradeneeded=()=>{const store=request.result.createObjectStore('snapshots',{keyPath:'id'});store.createIndex('uid','uid');};
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();finish(null,request.result);};
    request.onerror=()=>finish(request.error||new Error('Local archive failed'));
    request.onblocked=()=>finish(new Error('Local archive blocked'));
  });}
  async function archive(uid){
    const rows=snapshots(uid);if(!rows.length)return 0;
    const db=await open();
    try{
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('snapshots','readwrite',{durability:'strict'});
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Local archive aborted'));tx.onerror=()=>{};
        const store=tx.objectStore('snapshots');
        const nonce=Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
        rows.forEach((r,n)=>store.add({id:uid+':'+Date.now()+':'+n+':'+nonce,uid,key:r.key,raw:r.raw,archivedAt:new Date().toISOString()}));
      });
      let moved=0;
      rows.forEach(r=>{if(localStorage.getItem(r.key)===r.raw){localStorage.removeItem(r.key);moved++;}});
      return moved;
    }finally{db.close();}
  }
  async function read(uid){
    const db=await open();
    try{return await new Promise((resolve,reject)=>{
      const request=db.transaction('snapshots','readonly').objectStore('snapshots').index('uid').getAll(uid);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });}finally{db.close();}
  }
  window.RETRADE_LOCAL_RECOVERY={
    relieve(uid){
      if(!uid)return Promise.resolve(0);
      if(busy.has(uid))return busy.get(uid);
      const task=archive(uid).catch(e=>{console.warn('[RETRADE] local archive unavailable:',e.message);return 0;}).finally(()=>busy.delete(uid));
      busy.set(uid,task);return task;
    },
    async export(uid){
      if(!uid)throw new Error('Sign in before exporting recovery records');
      return {format:'RETRADE_LOCAL_RECOVERY_V1',userId:uid,exportedAt:new Date().toISOString(),archived:await read(uid),local:snapshots(uid)};
    }
  };
})();
