/* Copy only declared public runtime files; archives, tests, docs and experiments
 * stay in GitHub but never enter this deployment artifact. */
const fs=require('node:fs'),path=require('node:path');
const {root,shipped}=require('./assets.cjs');
const out=path.join(root,'_site');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const file of shipped){const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log(`Built ${shipped.length} public files in _site/`);
