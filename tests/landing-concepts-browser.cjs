
/* Public workspace tour, served from the build with all external traffic blocked. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const screenshotPrefix = path.join(require('node:os').tmpdir(), 'landing-scroll-');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const checkWindows=require('./landing-windows.cjs');
const root=path.resolve(__dirname,'..'),site=path.join(root,'_site');
const isWebKit=process.argv.includes('--webkit'),browserEngine=isWebKit?webkit:chromium;
const contentType={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
(async()=>{
  execFileSync(process.execPath,['scripts/build-site.cjs'],{cwd:root});
  const browser=await browserEngine.launch({headless:true});
  try{
    for(const [width,height] of [[320,720],[390,844],[768,1024],[1440,900]]){
      const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
      const missing=[], external=[];
      await context.route('**/*',async route=>{
        const u=new URL(route.request().url());
        if(route.request().method()!=='GET'||u.origin!=='https://retrade.test'){external.push(u.href);return route.abort();}
        const rel=u.pathname.replace(/^\/+/,'')+(u.pathname.endsWith('/')?'index.html':'');
        if(!route.request().isNavigationRequest() && route.request().frame().parentFrame()&&!/^landing1\/preview\/(workspace|dashboard|sales|stock|expenses)-[a-f0-9]+\.(js|css)$/.test(rel)){
          external.push(rel);return route.abort();
        }
        const target=path.resolve(site,rel||'index.html');
        if(!target.startsWith(site+path.sep)||!fs.existsSync(target)){missing.push(rel);return route.fulfill({status:404,body:'Missing'});}
        return route.fulfill({contentType:contentType[path.extname(target)]||'application/octet-stream',body:fs.readFileSync(target)});
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',err=>errors.push(err.message));
      const crashes = [];
      page.on('crash', () => crashes.push('Page crashed'));
      await page.goto('https://retrade.test/landing2/');
      await page.waitForURL('**/landing1/');
      await page.frameLocator('#dashboard iframe').getByLabel('Dashboard period').waitFor();
      assert.equal(await page.locator('#detail iframe[src]').count(), 0, 'Only the dashboard boots above the fold');
      assert.equal(await page.locator('[role="tab"]').count(), 3);
      assert.equal(await page.getByRole('tab', { name: 'Stock' }).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('a[href*="/landing2/"]').count(), 0);
      assert.equal(await page.locator('iframe').count(), 2);
      const skip = page.locator('#dashboard .skip-link');
      assert((await skip.boundingBox()).width <= 1, 'Keyboard shortcut is visually hidden at rest');
      await page.keyboard.press('Tab');
      await skip.focus();
      const positions = await skip.evaluate(el => [el.getBoundingClientRect().bottom, el.closest('figure').querySelector('iframe').getBoundingClientRect().top]);
      assert(positions[0] <= positions[1], 'Focused shortcut stays above the frame');
      await page.locator('.hero-actions .ghost-link').click();
      assert.equal(new URL(page.url()).hash, '#workspace');
      await page.waitForFunction(() => Math.abs(document.querySelector('#workspace').getBoundingClientRect().top) < 16);
      await checkWindows(page,width);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      assert.deepEqual(errors, []);
      assert.deepEqual(crashes, []);
      await page.screenshot({ path: screenshotPrefix+'workspace-'+(isWebKit?'webkit':'chromium')+'-'+width+'.png' });
      assert.equal(context.serviceWorkers().length, 0, 'Public examples never install a worker');
      assert.deepEqual(missing,[],'All public assets exist');
      assert.deepEqual(external,[],'No external calls from public variants');
      await context.close();
      console.log('PASS workspace tour '+(isWebKit?'WebKit':'Chromium')+' '+width+'x'+height);
    }
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
