/* Exercise the Pages artifact and the app's real auth controls with isolated fixtures. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {chromium, webkit} = require('playwright');
const {mockAuth, fixture} = require('./startup-browser.cjs');
const root = path.resolve(__dirname, '..');
const site = path.join(root, '_site');
const origin = 'http://retrade.test';
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json'};

(async function () {
  execFileSync(process.execPath, ['scripts/build-site.cjs'], {cwd: root});
  const isWebKit = process.argv.includes('--webkit');
  const browser = await (isWebKit ? webkit : chromium).launch({
    headless:true, executablePath:isWebKit ? undefined : process.env.CHROMIUM_EXECUTABLE
  });
  try {
    const context = await browser.newContext({viewport:{width:1370,height:850}, reducedMotion:'reduce', serviceWorkers:'block'});
    const missing = [];
    const requestedImages = new Set();
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/supabase-js@')) {
        return route.fulfill({contentType:'text/javascript',body:'('+mockAuth.toString()+')(null);'});
      }
      if (url.origin !== origin) return route.abort();
      const file = path.join(site,url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''));
      if (!fs.existsSync(file)) {
        missing.push(url.pathname);
        return route.fulfill({status:404,body:'Missing asset'});
      }
      const ext = path.extname(file);
      if (ext === '.webp') requestedImages.add(url.pathname);
      let body = fs.readFileSync(file);
      if (ext === '.html') body = body.toString().replace(/ integrity="[^"]*"/g,'');
      if (url.pathname === '/src/core/application.js') body = body.toString() + fixture;
      return route.fulfill({contentType:types[ext],body});
    });
    const page = await context.newPage();
    await page.goto(origin + '/');
    assert.match(await page.locator('h1').innerText(), /on every flip/);
    assert.equal(await page.locator('video').count(),0);
    assert.equal(await page.locator('.story').count(),4);
    await page.waitForLoadState('networkidle');
    for (const chapter of ['stock','sale']) {
      assert(!requestedImages.has('/assets/landing/' + chapter + '-preview.webp'),
        'An unopened chapter should not download on the homepage: ' + chapter);
    }
    // The tour replaces its placeholder when the chapter is revealed. WebKit
    // may abort decode() on that outgoing image during the source change.
    async function waitForChapterImage(id) {
      await page.waitForFunction(chapter => {
        const image = document.querySelector('#'+chapter+' .screen-image');
        return image?.complete && image.naturalWidth > 0 && image.currentSrc &&
          new URL(image.currentSrc).pathname === '/assets/landing/'+chapter+'-preview.webp';
      }, id);
    }
    for (const id of ['sourcing','stock','sale','dashboard']) {
      await page.locator('.jump a[href="#'+id+'"]').click();
      await page.waitForFunction(id => !document.getElementById(id).hidden &&
        document.querySelector('.jump [aria-selected="true"]')?.getAttribute('href') === '#'+id, id);
      assert.equal(await page.locator('.story:visible').count(),1);
      await waitForChapterImage(id);
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#tab-stock').click();
    await page.locator('#stock figure').scrollIntoViewIfNeeded();
    await waitForChapterImage('stock');
    assert.match(await page.locator('#stock figure').getAttribute('data-phone-src'),/stock-phone\.webp/);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.goto(origin+'/signup/');
    const signup=page.locator('#auth-screen-signup');
    await signup.waitFor({state:'visible'});
    await page.reload();
    await signup.waitFor({state:'visible'});
    await signup.getByRole('button',{name:'Back to sign in'}).click();
    await page.waitForURL('**/login/');
    await page.goBack();
    await signup.waitFor({state:'visible'});
    await page.goto(origin+'/dashboard/');
    await page.waitForURL('**/login/');
    await page.locator('#auth-email').fill('ui@example.test');
    await page.locator('#auth-pass').fill('test-password');
    await page.locator('#auth-btn').click();
    await page.waitForURL('**/dashboard/');
    await page.locator('#p-summary.on').waitFor({state:'visible'});
    await page.goto(origin+'/?code=synthetic-callback');
    await page.waitForURL('**/login/?code=synthetic-callback');
    await page.goto(origin+'/start/?utm_source=review#tour');
    await page.waitForURL('**/?utm_source=review#tour');
    assert.deepEqual(missing,[]);
    await context.close();
    console.log('PASS public tour, mobile screens, sign-up history, dashboard guard, sign-in and legacy links');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
