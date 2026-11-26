/* Copy only declared public runtime files; archives, tests, docs and experiments
 * stay in GitHub but never enter this deployment artifact. */
const fs=require('node:fs'),path=require('node:path');
const {root,assets,shipped}=require('./assets.cjs');
const {renderLanding, renderPage, routes} = require('../marketing/site/layout.cjs');
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
// Price the fixed sample with the same category table and fee engine as the item page.
const feeContext = require('node:vm').createContext({});
for (const file of ['report-engine', 'accounting-engine']) {
  require('node:vm').runInContext(fs.readFileSync(path.join(root, 'src/domain', file + '.js'), 'utf8'), feeContext);
}
const jacketFee = feeContext._calcEbayBizFeeComponents(32, 'Clothes, Shoes & Accessories', 32);
const landing = renderLanding(fs.readFileSync(path.join(root, 'marketing/landing/landing1.html'), 'utf8'))
  .replace('{{PRIVATE_FEE}}', Math.round(100 * feeContext.calcEbayBPF(32)))
  .replace('{{DEPOP_FEE}}', Math.round(100 * feeContext.calcDepopBPF({}, 32, 0)))
  .replace('{{EBAY_FEE_PENCE}}', Math.round(100 * jacketFee.total))
  .replace('{{EBAY_CREDIT_PENCE}}', Math.round(100 * jacketFee.eligibleRefundableGross));
// Keep the review address out of search on both hosts.
const production = assets.environment === 'production';
const home = production
  ? landing.replace('<meta name="robots" content="noindex,nofollow">', '<link rel="canonical" href="https://retrade-uk.com/">')
  : landing;
fs.writeFileSync(path.join(out, 'index.html'), home);
fs.mkdirSync(path.join(out, 'landing1'));
fs.writeFileSync(path.join(out, 'landing1/index.html'), landing);
for (const route of routes) {
  const directory = path.join(out, route);
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'index.html'), renderPage(route, production));
}
// GitHub Pages serves static files. Preserve shared links to the retired concept.
fs.mkdirSync(path.join(out, 'landing2'));
fs.writeFileSync(path.join(out, 'landing2/index.html'), `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>RETRADE</title><script src="/assets/landing/entry.js?v=20261123-showcase"></script>
<noscript><meta http-equiv="refresh" content="0;url=/landing1/"></noscript></head>
<body><a href="/landing1/">Continue to RETRADE</a></body></html>`);
require('../marketing/landing/build-previews.cjs')(out);
fs.mkdirSync(path.join(out,'start'));
fs.writeFileSync(path.join(out,'start/index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>RETRADE</title><script src="/assets/landing/entry.js"></script><a href="/">Open RETRADE</a></html>');
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log(`Built ${shipped.length} public files in _site/`);
