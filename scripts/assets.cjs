/* Node-only reader for the browser/SW asset contract; no build dependencies. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'config/assets.js'),'utf8'),context);
const assets=JSON.parse(JSON.stringify(context.RT_ASSETS));
const scripts=['app.js','config/assets.js',...assets.entry,...assets.bindings,assets.launch,assets.core,...assets.critical,...assets.deferred,...assets.lazy];
const shipped=[...scripts,'sw.js','index.html','manifest.webmanifest','CNAME',...assets.styles,...assets.icons,...assets.launchImages];
module.exports={root,assets,scripts,shipped};
