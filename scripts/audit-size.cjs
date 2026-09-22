/* Reproducible uncompressed transfer inventory; not an FPS benchmark. */
const fs=require('node:fs'),path=require('node:path');
const {root,assets,shipped}=require('./assets.cjs');
function bytes(paths){return paths.reduce((sum,p)=>sum+fs.statSync(path.join(root,p)).size,0)}
for(const [name,files] of Object.entries({initial:['app.js','config/assets.js',...assets.entry,...assets.bindings,assets.launch,assets.core,...assets.critical],deferred:assets.deferred,onDemand:assets.lazy,styles:assets.styles,images:assets.icons.concat(assets.launchImages),deployable:shipped}))console.log(`${name}: ${files.length} files, ${bytes(files).toLocaleString('en-GB')} bytes`);
