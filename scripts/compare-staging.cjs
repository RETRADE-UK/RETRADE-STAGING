/* Usage: node scripts/compare-staging.cjs ../staging
   Keep shared fixes byte-identical after removing the declared staging hooks. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,assets,shipped}=require('./assets.cjs');
const staging=path.resolve(process.argv[2]||'../retrade-staging');
assert.equal(assets.environment,'production','Run comparison from the live checkout');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(staging,'config/assets.js'),'utf8'),ctx);
const other=JSON.parse(JSON.stringify(ctx.RT_ASSETS));assert.equal(other.environment,'staging');
assert.equal(other.build,assets.build+'-staging','Release generations must match');
const normalised={...other,build:assets.build,environment:assets.environment,bindings:[],deferred:other.deferred.filter(f=>f!=='src/platform/staging-auth.js'),lazy:other.lazy.filter(f=>!['src/features/monitors/cloud.js','src/features/monitors/page.js'].includes(f)),styles:other.styles.filter(f=>f!=='assets/styles/monitors.css'),legacy:{...other.legacy}};
delete normalised.legacy['staging-supabase.js'];delete normalised.legacy['staging-dev-auth.js'];assert.deepEqual(normalised,assets,'Unexpected manifest drift');
function normalise(file,text){
 text=text.replaceAll(other.build,assets.build);
 if(file==='index.html')text=text.split('\n').filter(line=>!/assets\/styles\/monitors\.css|data-tab="monitors"|data-sheet-tab="monitors"|id="p-monitors"/.test(line)).join('\n');
 if(file==='src/core/application.js'){
  text=text.replace(/  \/\/ Revoke this browser's push capability before ending the account session\.\n  if\('serviceWorker' in navigator\)\{\n[^\n]+\n  }\n/,'');
  text=text.replaceAll('  if(window.RETRADE_MONITORS)window.RETRADE_MONITORS.unmount();\n','');
  text=text.replace(",monitors:'Monitors'",'');
  text=text.replace("  else if(name==='monitors')_renderTab(renderMonitors);\n",'');
  text=text.replace(/\/\/ Monitors load only after an explicit authenticated navigation\.[\s\S]+?\n(?=let _itemPageOrigin=)/,'');
 }
 if(file==='sw.js')text=text.split('\n// Push has no app data cache.')[0].trimEnd()+'\n';
 return text;
}
for(const file of shipped.filter(p=>!['config/assets.js','CNAME'].includes(p))){
 const live=fs.readFileSync(path.join(root,file));const stage=fs.readFileSync(path.join(staging,file));
 if(['src/core/application.js','index.html','sw.js'].includes(file))assert.equal(normalise(file,stage.toString()),normalise(file,live.toString()),`Shared source drift: ${file}`);
 else assert(live.equals(stage),`Shared file drift: ${file}`);
}
console.log('PASS live/staging parity: shared runtime identical; isolated binding, monitor hooks and matching release tags');
