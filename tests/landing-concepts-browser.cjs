
/* Browser coverage for two public landing concepts. Only static offline files
 * are served; any external network request fails. No login or DB access. */
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
        if(!route.request().isNavigationRequest() && route.request().frame().parentFrame()&&!/^landing1\/preview\/workspace-[a-f0-9]+\.(js|css)$/.test(rel)){
          external.push(rel);return route.abort();
        }
        const target=path.resolve(site,rel||'index.html');
        if(!target.startsWith(site+path.sep)||!fs.existsSync(target)){missing.push(rel);return route.fulfill({status:404,body:'Missing'});}
        return route.fulfill({contentType:contentType[path.extname(target)]||'application/octet-stream',body:fs.readFileSync(target)});
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',err=>errors.push(err.message));
      for(const variant of [1,2]){
        await page.goto('https://retrade.test/landing'+variant+'/');
        await page.locator('h1').waitFor();
        assert.match(await page.locator('h1').innerText(),/You find the bargains/);
        assert.match(await page.locator('h1').innerText(),/We track the margins/);
        assert.equal(await page.locator('.feature').count(),variant === 1 ? 3 : 7);
        assert.equal(await page.locator('.journey-nav a').count(),variant === 1 ? 4 : 7);
        if (variant === 1) {
          await page.frameLocator('#dashboard iframe').getByLabel('Dashboard period').waitFor();
          assert.equal(await page.locator('iframe[data-src][src]').count(), 0,
            'Below-fold workspaces must not boot during initial presentation');
        }
        const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2);
        assert(noOverflow,'No horizontal overflow at '+width+' variant '+variant);
        if(width!==768){
          await page.screenshot({path:screenshotPrefix+'concept'+variant+'-'+(isWebKit?'webkit':'chromium')+'-'+width+'-hero.png'});
        }
        await page.locator('.journey-nav a[href="#sale"]').click();
        await page.waitForFunction(() => document.querySelector('.journey-nav a[href="#sale"]').getAttribute('aria-current') === 'location');
        assert.equal(await page.evaluate(() => location.hash), '#sale');
        if (variant === 2) {
          await page.locator('#sale summary').click();
          const salesImage = page.getByRole('button', { name: 'Expand Sales screenshot' });
          await salesImage.scrollIntoViewIfNeeded();
          await page.waitForFunction(() => document.querySelector('#sale picture img, #sale .visual-open img')?.naturalWidth > 500);
          await salesImage.click();
          await page.locator('#image-dialog[open]').waitFor();
          await page.waitForFunction(() => document.querySelector('#image-dialog img').naturalWidth > 500);
          await page.locator('#close-dialog').click();
          assert.equal(await page.locator('#image-dialog[open]').count(), 0);
          await page.waitForFunction(() => document.activeElement.getAttribute('aria-label') === 'Expand Sales screenshot');
          await page.getByRole('button', { name: 'By category' }).click();
          assert.match(await page.locator('#expenses .workspace-list').innerText(), /Stock purchases/);
          assert.match(await page.locator('#expenses .workspace-foot').innerText(), /£2,110.00/);
          await page.evaluate(() => {
            Object.defineProperty(navigator, 'clipboard', {
              configurable: true, value: { writeText: async value => { window.copiedAmount = value; } }
            });
          });
          await page.getByRole('button', { name: 'Copy box 21' }).click();
          await page.waitForFunction(() => window.copiedAmount === '2040.00');
          assert.match(await page.locator('#tax [role=status]').innerText(), /Box 21 copied/);
          await page.evaluate(() => {
            navigator.clipboard.writeText = async () => { throw new Error('Clipboard denied'); };
          });
          await page.getByRole('button', { name: 'Copy box 20' }).click();
          await page.waitForFunction(() => document.querySelector('#tax [role=status]').textContent.includes('2110.00'));
          const dashboard = page.locator('#dashboard');
          assert.match(await dashboard.innerText(), /£1,977.00/);
          for (const [range, revenue] of [['7 days', '£451.00'], ['14 days', '£972.00'], ['CY', '£16,853.90']]) {
            await dashboard.getByRole('button', { name: range, exact: true }).click();
            assert((await dashboard.innerText()).includes(revenue), range);
          }
          await page.locator('#add-find').click();
          assert.equal(await page.locator('#demo-spend').innerText(), '£47.00');
          await page.getByRole('button', { name: 'Unlisted · 3' }).click();
          assert.match(await page.locator('#stock .workspace-list').innerText(), /24 days unlisted/);
          const sales = page.locator('#sale');
          await sales.getByRole('combobox', { name: 'Sort sales' }).selectOption('profit');
          assert.match(await sales.locator('.workspace-row').first().innerText(), /Socket and spanner/);
          await sales.getByRole('button', { name: 'Returned' }).click();
          assert.equal(await sales.locator('.workspace-row').count(), 1);
          assert.match(await sales.locator('.workspace-row').innerText(), /Partial refund/);
          await page.reload();
          assert.equal(await page.locator('#demo-spend').innerText(), '£41.00');
          assert.equal(await sales.locator('.workspace-row').count(), 5);
          assert.equal(await dashboard.getByRole('button', { name: '30 days' }).getAttribute('aria-pressed'), 'true');
        } else {
          await checkWindows(page, width);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'No overflow after interactions');
        assert.deepEqual(errors,[]);
      }
      assert.equal(context.serviceWorkers().length, 0, 'Public examples never install a worker');
      assert.deepEqual(missing,[],'All public assets exist');
      assert.deepEqual(external,[],'No external calls from public variants');
      await context.close();
      console.log('PASS landing concepts '+(isWebKit?'WebKit':'Chromium')+' '+width+'x'+height);
    }
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
