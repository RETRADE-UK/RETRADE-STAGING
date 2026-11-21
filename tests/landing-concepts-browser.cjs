
/* Browser coverage for two public landing concepts. Only static offline files
 * are served; any external network request fails. No login or DB access. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),site=path.join(root,'_site');
const isWebKit=process.argv.includes('--webkit'),browserEngine=isWebKit?webkit:chromium;
const contentType={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
(async()=>{
  execFileSync(process.execPath,['scripts/build-site.cjs'],{cwd:root});
  const browser=await browserEngine.launch({headless:true});
  try{
    for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
      const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'});
      const missing=[], external=[];
      await context.route('**/*',async route=>{
        const u=new URL(route.request().url());
        if(u.origin!=='http://retrade.test'){external.push(u.href);return route.abort();}
        const rel=u.pathname.replace(/^\/+/,'')+(u.pathname.endsWith('/')?'index.html':'');
        const target=path.resolve(site,rel||'index.html');
        if(!target.startsWith(site+path.sep)||!fs.existsSync(target)){missing.push(rel);return route.fulfill({status:404,body:'Missing'});}
        return route.fulfill({contentType:contentType[path.extname(target)]||'application/octet-stream',body:fs.readFileSync(target)});
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',err=>errors.push(err.message));
      for(const variant of [1,2]){
        await page.goto('http://retrade.test/landing'+variant+'/');
        await page.locator('h1').waitFor();
        assert.match(await page.locator('h1').innerText(),/You find the bargains/);
        assert.match(await page.locator('h1').innerText(),/We track the margins/);
        assert.equal(await page.locator('.feature').count(),4);
        assert.equal(await page.locator('.journey-nav a').count(),4);
        const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2);
        assert(noOverflow,'No horizontal overflow at '+width+' variant '+variant);
        if(width!==768){
          await page.screenshot({path:'/tmp/landing-scroll-concept'+variant+'-'+(isWebKit?'webkit':'chromium')+'-'+width+'-hero.png'});
        }
        await page.locator('#sourcing').scrollIntoViewIfNeeded();
        await page.waitForTimeout(180);
        await page.locator('.journey-nav a[href="#sale"]').click();
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(()=>location.hash),'#sale');
        await page.locator('#sale .visual-open img').evaluate(img=>{img.loading='eager';});
        await page.waitForFunction(()=>{const img=document.querySelector('#sale .visual-open img');return !!img&&img.complete&&img.naturalWidth>1000;});
        if(width!==768){
          await page.screenshot({path:'/tmp/landing-scroll-concept'+variant+'-'+(isWebKit?'webkit':'chromium')+'-'+width+'-sale.png'});
        }
        await page.locator('#sale .visual-open').click();
        await page.locator('#image-dialog[open]').waitFor();
        await page.waitForFunction(()=>{const img=document.querySelector('#image-dialog img');return !!img&&img.complete&&img.naturalWidth>500;});
        await page.locator('#close-dialog').click();
        assert.equal(await page.locator('#image-dialog[open]').count(),0);
        if(variant===2){
          await page.locator('#add-find').click();
          assert.equal(await page.locator('#demo-spend').innerText(),'£47.00');
          await page.locator('#reset-find').click();
          assert.equal(await page.locator('#demo-spend').innerText(),'£41.00');
          await page.locator('[data-stock-filter="unlisted"]').click();
          assert.match(await page.locator('#demo-items').innerText(),/Canon camera strap/);
          await page.locator('#demo-sale-price').evaluate(input=>{input.value='30';input.dispatchEvent(new Event('input',{bubbles:true}));});
          assert.equal(await page.locator('#demo-price').innerText(),'£30.00');
          assert.equal(await page.locator('#demo-profit').innerText(),'£15.15');
          await page.locator('[data-metric="returns"]').click();
          assert.equal(await page.locator('#demo-metric-number').innerText(),'1.7%');
          await page.reload();
          assert.equal(await page.locator('#demo-spend').innerText(),'£41.00','Demo must reset');
        }else{
          assert.equal(await page.locator('.demo-card').count(),0,'Open concept has no demo overlays');
        }
        assert.deepEqual(errors,[]);
      }
      assert.deepEqual(missing,[],'All public assets exist');
      assert.deepEqual(external,[],'No external calls from public variants');
      await context.close();
      console.log('PASS landing concepts '+(isWebKit?'WebKit':'Chromium')+' '+width+'x'+height);
    }
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
