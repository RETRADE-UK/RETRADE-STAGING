/* Loader requests and late-navigation guards with a tiny DOM, no network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {root,assets}=require('../scripts/assets.cjs');
const path=require('node:path');
function harness(){
 const scripts=[],timers=new Map();let sequence=0;
 const page={classList:{contains:()=>true},replaceChildren(){this.replaced=(this.replaced||0)+1;}};
 const scope={RT_ASSETS:assets,Promise,Error,Array,Object,encodeURIComponent,_currentUserId:'a',__rtViewNavigationEpoch:1,
 setTimeout(fn){timers.set(++sequence,fn);return sequence;},clearTimeout(id){timers.delete(id);},
 document:{head:{appendChild(s){scripts.push(s);}},createElement(){return {remove(){this.removed=true;}};},getElementById(){return page;}},
 _showRoutePending(){},_clearRoutePending(){}};scope.window=scope;
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/platform/view-loader.js'),'utf8'),scope);
 function register(key,overrides={}){scope.__rtRegisterView(key,Object.fromEntries(assets.views[key].functions.map(n=>[n,overrides[n]||(()=>{})])));}
 return {scope,scripts,timers,page,register};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const h=harness(),w=h.scope;
 assert.equal(w.__rtViewReady('tax'),false);
 const first=w.__rtEnsureView('tax'),again=w.__rtEnsureView('tax');assert.strictEqual(first,again);assert.equal(h.scripts.length,1);
 assert(h.scripts[0].src.endsWith('?v='+assets.build));h.register('tax');h.scripts[0].onload();await first;
 await w.__rtEnsureView('tax');assert.equal(h.scripts.length,1);assert(w.__rtViewReady('tax'));
 const failed=w.__rtEnsureView('data');h.scripts[1].onerror();await assert.rejects(failed);assert(h.scripts[1].removed);
 const retry=w.__rtEnsureView('data');assert.equal(h.scripts.length,3);h.register('data');h.scripts[2].onload();await retry;
 const slow=w.__rtEnsureView('stock');[...h.timers.values()][0]();await assert.rejects(slow,/timed out/);
 const broken=w.__rtEnsureView('stock');h.scripts.at(-1).onload();await assert.rejects(broken,/initialise/);
 assert.throws(()=>w.__rtRegisterView('item',{}),/Incomplete/);
 const k=harness();let calls=[];k.scope.renderItemPage=id=>calls.push(id);
 k.scope.__rtCallView('item','_renderItemPageInner',null,['old'],'item','renderItemPage');
 k.scope.__rtCallView('item','_renderItemPageInner',null,['new'],'item','renderItemPage');
 assert.equal(k.scripts.length,1);k.register('item');k.scripts[0].onload();await tick();assert.deepEqual(calls,['new']);
 for(const change of ['navigation','user']){
  const c=harness();let renders=0;c.scope.renderItemPage=()=>renders++;
  c.scope.__rtCallView('item','_renderItemPageInner',null,[],'item','renderItemPage');
  if(change==='navigation')c.scope.__rtViewNavigationEpoch++;else c.scope._currentUserId='b';
  c.register('item');c.scripts[0].onload();await tick();assert.equal(renders,0,change+' cancels late replay');
 }
 const m=harness();m.register('item',{_renderItemPageInner:function(v){return this.base+v;}});
 assert.equal(m.scope.__rtCallView('item','_renderItemPageInner',{base:3},[4],'item','renderItemPage'),7,'Loaded functions preserve receiver, arguments and synchronous return');
 for(const [key,definition] of Object.entries(assets.views)){
  assert.equal([...assets.deferred,...assets.lazy].filter(p=>p===definition.file).length,1,key+' has one loading owner');
  const registered=harness();vm.runInNewContext(fs.readFileSync(path.join(root,definition.file),'utf8'),registered.scope);assert(registered.scope.__rtViewReady(key));
 }
 assert(assets.lazy.includes(assets.views.tax.file)&&assets.lazy.includes(assets.views.data.file));
 assert(fs.statSync(path.join(root,assets.core)).size<1420000,'Core transfer budget prevents old view bodies being copied back');
 console.log('PASS view modules: single request, retry, timeout, registration, stale navigation/user, latest item, synchronous API and ownership');
})().catch(error=>{console.error(error);process.exitCode=1;});
