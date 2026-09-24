/* Exercise the actual revision/recovery owners with an isolated CAS server.
   No auth, network or business data is used. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/core/application.js'),'utf8');
const guard=source.slice(source.indexOf("(function(){",source.indexOf('RETRADE-UK v1.4 cross-device revision guard')),source.indexOf("console.info('[RETRADE] v1.4.2",source.indexOf('RETRADE-UK v1.4 cross-device revision guard')));
const recovery=source.slice(source.indexOf('  function _v145FindCloudItem'),source.indexOf('  // Boot recovery policy: NEVER'));
function harness({deleted=false,failRetry=false}={}){
 const original={id:'item-a',state:'listed',item:'Camera',notes:'original',salePrice:100,parts:[],returnHistory:[]};
 const local={...original,notes:'local edit'};
 let server=deleted?null:{...original,salePrice:125,revision:2},updates=0,childWrites=0,outbox={};
 const notices=[];
 const context={console:{info(){},warn(){},error(){}},setTimeout,clearTimeout,Map,Set,Promise,Date,Number,JSON,Object,Error,
  _currentUserId:'test',DB:{'SEP-26':[local]},_dbSnapshot:{'item:item-a':JSON.stringify(original)+'|SEP-26'},_persistActiveCurrent:{},
  allDBKeys:()=>['SEP-26'],_findItemRecordById:()=>({month:'SEP-26',item:local}),
  _rowToItem:row=>{const {revision,updated_at,...item}=row;return item;},_itemToRow:item=>({...item}),
  _outboxRead:()=>outbox,_outboxSave:value=>{outbox=value;},
  _sbCall:fn=>fn(),saveItemToSupabase(){},deleteItemFromSupabase(){},
  _replaceChildRowsSafe:async()=>{childWrites++;},toast:message=>notices.push(message),_refreshCloudOnResume:async()=>{},
  _sb:{from(table){let op='select',payload,fields,filters={};const q={select(v){fields=v;return q;},eq(k,v){filters[k]=v;return q;},limit(){return q;},order(){return q;},update(v){op='update';payload=v;return q;},insert(v){op='insert';payload=v;return q;},delete(){op='delete';return q;},then(resolve,reject){return Promise.resolve().then(()=>{
   if(table!=='items')return {data:[],error:null};
   if(op==='select')return {data:server?[{...server}]:[],error:null};
   if(op==='update'){updates++;if(failRetry&&updates===2)server.revision++;if(!server||filters.revision!==server.revision)return {data:[],error:null};server={...server,...payload,revision:server.revision+1};return {data:[{revision:server.revision,updated_at:'2026-09-24T12:00:00Z'}],error:null};}
   if(op==='delete')return {data:[],error:null};
   throw Error('Unexpected insert: deleted cloud items must not be resurrected');
  }).then(resolve,reject);}};return q;}}
 };
 context.window=context;vm.createContext(context);vm.runInContext(guard,context);vm.runInContext(recovery,context);
 context.RETRADE_V14_REVISION._testSetRevision(local,1);
 return {context,local,notices,get server(){return server;},get updates(){return updates;},get childWrites(){return childWrites;}};
}
(async()=>{
 const h=harness();await h.context.saveItemToSupabase('SEP-26',h.local);
 assert.equal(h.server.notes,'local edit');assert.equal(h.server.salePrice,125,'Unedited fields retain the newer cloud value');assert.equal(h.server.revision,3);
 assert.equal(h.updates,2,'Exactly one bounded retry');assert.deepEqual(h.notices,[],'Successful recovery must not show a stale/reload warning');
 assert.equal(h.local.salePrice,125);assert.equal(h.context.RETRADE_V14_REVISION.revisionFor('item-a'),3);
 const gone=harness({deleted:true});await assert.rejects(gone.context.saveItemToSupabase('SEP-26',gone.local),{code:'RETRADE_REVISION_CONFLICT'});assert.equal(gone.server,null);assert.equal(gone.childWrites,0);
 const busy=harness({failRetry:true});await assert.rejects(busy.context.saveItemToSupabase('SEP-26',busy.local),{code:'RETRADE_REVISION_CONFLICT'});assert.equal(busy.updates,2);assert.equal(busy.childWrites,0);assert.equal(busy.local.notes,'local edit','Unresolved edits remain local for the durable writer');
 console.log('PASS sync conflicts: quiet reconciliation, exact revision retry, no resurrection, unresolved edit retained');
})().catch(e=>{console.error(e);process.exitCode=1;});
