/* Usage: node scripts/compare-staging.cjs ../retrade-staging */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,assets,shipped}=require('./assets.cjs');
const staging=path.resolve(process.argv[2]||'../retrade-staging');
assert.equal(assets.environment,'production','Run comparison from the live checkout');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(staging,'config/assets.js'),'utf8'),ctx);
const other=JSON.parse(JSON.stringify(ctx.RT_ASSETS));assert.equal(other.environment,'staging');
const normalised={...other,build:assets.build,environment:assets.environment,bindings:[],deferred:other.deferred.filter(f=>f!=='src/platform/staging-auth.js'),legacy:{...other.legacy}};
delete normalised.legacy['staging-supabase.js'];delete normalised.legacy['staging-dev-auth.js'];assert.deepEqual(normalised,assets,'Unexpected manifest drift');
for(const file of shipped.filter(p=>!['config/assets.js','index.html','CNAME'].includes(p)))assert(fs.readFileSync(path.join(root,file)).equals(fs.readFileSync(path.join(staging,file))),`Shared file drift: ${file}`);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),otherHtml=fs.readFileSync(path.join(staging,'index.html'),'utf8').replaceAll('1.5.60-staging','1.5.60');assert.equal(otherHtml,html,'Unexpected HTML drift');
console.log('PASS live/staging parity: shared runtime identical; only declared environment differences');
