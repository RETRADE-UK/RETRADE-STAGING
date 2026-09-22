/* Actual Chromium worker migration, served only over local loopback. All remote
 * traffic is blocked or replaced by synthetic authentication. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const {root,assets}=require('../scripts/assets.cjs');
const {mockAuth,fixture,settled}=require('./startup-browser.cjs');
(async()=>{
 let legacy=true;const misses=[];
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/legacy-test.html'){res.setHeader('Content-Type','text/html');return res.end('<title>Upgrade test</title>');}
  if(url.pathname==='/sw.js'&&legacy){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,'tests/fixtures/legacy-service-worker.js')));}
  if(legacy){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/html');return res.end(url.pathname.endsWith('.js')?'/* legacy cached asset */':'<!doctype html><title>Legacy</title>');}
  const file=path.join(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){misses.push(url.pathname);res.statusCode=404;return res.end('Missing');}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'text/plain');
  if(url.pathname==='/'+assets.core)return res.end(fs.readFileSync(file,'utf8')+fixture);
  if(url.pathname==='/'||url.pathname==='/index.html')return res.end(fs.readFileSync(file,'utf8').replace(/ integrity="[^"]*"/g,''));
  res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.origin===origin)return route.continue();
   if(u.pathname.includes('/supabase-js@'))return route.fulfill({contentType:'text/javascript',body:`(${mockAuth.toString()})({user:{id:'ui-test',email:'ui@example.test',user_metadata:{full_name:'Test User'}}});`});
   return route.abort();
  });
  await page.goto(origin+'/legacy-test.html');
  await page.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js?legacy=1');await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  legacy=false;
  await page.goto(origin+'/');await settled(page);
  await page.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'));
  assert.equal(await page.evaluate(()=>window.__rtBuildId),assets.build);
  await page.evaluate(async path=>{const r=await fetch('./'+path);if(!r.ok)throw Error('Core unavailable');},assets.core);
  await context.setOffline(true);
  assert(await page.evaluate(async path=>(await (await fetch('./'+path)).text()).includes('function setSummaryPeriod'),assets.core),'Relocated core must work offline');
  assert.deepEqual(errors,[]);assert.deepEqual(misses,[]);
  console.log('PASS real service-worker upgrade: legacy controller → relocated runtime → new controller → offline core');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
