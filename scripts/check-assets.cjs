const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {root,assets,scripts,shipped}=require('./assets.cjs');
assert.equal(new Set(scripts).size,scripts.length,'A script must have one loading owner');
const allowed=new Set(shipped);
const ignored=require('node:child_process').spawnSync('git',['check-ignore','--stdin'],{cwd:root,input:shipped.join('\n')+'\n',encoding:'utf8'});
assert.equal(ignored.stdout.trim(),'','Deployable files must not be hidden by gitignore');
for(const file of shipped){assert(!file.includes('..')&&!path.isAbsolute(file));assert(fs.existsSync(path.join(root,file)),`Missing asset: ${file}`);assert(!/archive|experiments/.test(file),`Inactive code shipped: ${file}`);}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk(path.join(root,'src')).filter(f=>f.endsWith('.js')))assert(allowed.has(path.relative(root,file)),`Unowned source: ${file}`);
for(const file of [...scripts,'sw.js',...walk(path.join(root,'scripts')).filter(f=>f.endsWith('.cjs')),...walk(path.join(root,'tests')).filter(f=>f.endsWith('.cjs'))])execFileSync(process.execPath,['--check',path.resolve(root,file)]);
for(const file of scripts.concat('index.html')){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 for(const match of source.matchAll(/["']\.\/([^"'\s]+\.(?:js|css|png|webmanifest))(?:\?[^"']*)?["']/g))assert(allowed.has(match[1]),`${file} refers to undeclared ${match[1]}`);
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="\.\/[^"\s]+\.(?:js|css)\?v=([^"\s]+)"/g))assert.equal(match[1],assets.build,'Startup asset build tag drift');
for(const file of assets.entry.concat(assets.styles,assets.launchImages))assert(html.includes(file),`Entry asset missing from HTML: ${file}`);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));for(const i of manifest.icons)assert(allowed.has(i.src.replace(/^\.\//,'')));
const tracked=execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'}).split('\n');
for(const file of tracked)assert(!/(^|\/)(\.env($|\.)|retrade-(backup|export).*\.json$|.*\.backup\.json$)/.test(file)&&file!=='archive/legacy-site/data.json',`Local data tracked: ${file}`);
const cname=fs.readFileSync(path.join(root,'CNAME'),'utf8').trim();
if(assets.environment==='staging'){
 assert.equal(cname,'test.retrade-uk.com');assert.deepEqual(assets.bindings,['src/platform/staging-binding.js']);assert(assets.deferred.includes('src/platform/staging-auth.js'));
 const binding=fs.readFileSync(path.join(root,assets.bindings[0]),'utf8');assert(binding.includes('https://dvnrxmdejxfuazmpnudj.supabase.co'));
}else{assert.equal(assets.environment,'production');assert.equal(cname,'retrade-uk.com');assert.equal(assets.bindings.length,0);assert(!scripts.some(s=>/staging|gesture|interaction-system/.test(s)));}
console.log(`Asset/syntax/isolation checks passed: ${scripts.length} scripts, ${shipped.length} deployable files (${assets.environment})`);
