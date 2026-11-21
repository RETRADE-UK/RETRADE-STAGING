/* Copy only declared public runtime files; archives, tests, docs and experiments
 * stay in GitHub but never enter this deployment artifact. */
const fs=require('node:fs'),path=require('node:path');
const {root,shipped}=require('./assets.cjs');
const out=path.join(root,'_site');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const file of shipped){const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
const shell=fs.readFileSync(path.join(root,'index.html'),'utf8')
  .replace('<html lang="en">','<html lang="en" data-workspace-routes>')
  .replaceAll('="./','="/').replace("href='./manifest.webmanifest'","href='/manifest.webmanifest'");
for(const route of ['login','signup','dashboard']){
  fs.mkdirSync(path.join(out,route),{recursive:true});
  fs.writeFileSync(path.join(out,route,'index.html'),shell);
}
fs.copyFileSync(path.join(root,'marketing/landing/index.html'),path.join(out,'index.html'));
for (const route of ['landing1','landing2']) {
  fs.mkdirSync(path.join(out,route),{recursive:true});
  fs.copyFileSync(path.join(root,'marketing/landing',route+'.html'),path.join(out,route,'index.html'));
}
fs.mkdirSync(path.join(out,'start'));
fs.writeFileSync(path.join(out,'start/index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>RETRADE</title><script src="/assets/landing/entry.js"></script><a href="/">Open RETRADE</a></html>');
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log(`Built ${shipped.length} public files in _site/`);
