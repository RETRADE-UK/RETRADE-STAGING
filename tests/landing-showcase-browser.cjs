/* Serve the built Pages artifact offline, including the sandboxed sample workspaces. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, webkit } = require('playwright');
const checkWindows = require('./landing-windows.cjs');

const root = path.resolve(__dirname, '..');
const site = path.join(root, '_site');
const origin = 'https://retrade.test';
const isWebKit = process.argv.includes('--webkit');
const engineName = isWebKit ? 'webkit' : 'chromium';
const pageNames = ['Stock', 'Sales', 'Expenses', 'Dashboard'];
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png'
};

async function withPage(browser, options, check) {
  const context = await browser.newContext(options);
  const requests = [];
  const failures = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(url.pathname);
    const file = path.resolve(site, '.' + url.pathname, url.pathname.endsWith('/') ? 'index.html' : '');
    if (request.method() !== 'GET' || url.origin !== origin || !file.startsWith(site + path.sep) ||
        !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      failures.push(request.method() + ' ' + request.url());
      return route.abort();
    }
    if (!request.isNavigationRequest() && request.frame().parentFrame() && !url.pathname.startsWith('/landing1/preview/')) {
      failures.push('Unexpected resource in sandbox: ' + request.url());
      return route.abort();
    }
    return route.fulfill({ contentType: types[path.extname(file)], body: fs.readFileSync(file) });
  });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await check(page, requests);
    assert.deepEqual(failures, [], 'Every resource comes from the isolated Pages artifact');
    assert.equal(context.serviceWorkers().length, 0);
  } catch (error) {
    if (failures.length) console.error('Page or request errors:', failures);
    throw error;
  } finally {
    await context.close();
  }
}

async function checkSelected(page, name) {
  const selected = page.getByRole('tab', { name, exact: true, selected: true });
  await selected.waitFor();
  const panel = page.getByRole('tabpanel', { name, exact: true });
  await panel.waitFor();
  assert.equal(await panel.getAttribute('id'), await selected.getAttribute('aria-controls'));
  assert.equal(await page.getByRole('tab', { selected: true }).count(), 1);
  return panel;
}

async function waitForExample(page, name) {
  const panel = await checkSelected(page, name);
  const selector = 'iframe[title="Interactive ' + name + ' example"]';
  const frame = panel.locator(selector);
  assert.equal(await frame.getAttribute('src'), '/landing1/preview/' + name.toLowerCase() + '/');
  await panel.frameLocator(selector).locator('.page.on .card, .page.on .page-header').first().waitFor({ state: 'attached' });
  assert.equal(await page.locator('iframe').count(), 1);
}

function checkWidth(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
}

async function checkPresentation(page, requests, width) {
  await page.goto(origin + (width === 390 ? '/landing1/' : '/'));
  const heading = page.getByRole('heading', { level: 1 });
  assert.match(await heading.innerText(), /You find the bargains/);
  assert.match(await heading.innerText(), /We track the margins/);
  assert.equal(await page.locator('a[href*="/landing2/"]').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /interactive tour|compare option|landing concepts/i);
  assert.deepEqual(await page.getByRole('tab').allTextContents(), pageNames);
  await checkSelected(page, 'Stock');
  const hero = page.getByRole('link', { name: /Try the Dashboard/i }).locator('img');
  await hero.evaluate(img => img.decode());
  assert.equal(await hero.evaluate(img => new URL(img.currentSrc).pathname),
    '/assets/landing/hero-dashboard' + (width <= 600 ? '-phone' : '') + '.webp',
    'Use the artwork sized for this viewport');
  assert(await checkWidth(page), 'No page overflow at ' + width);
  await page.screenshot({ path: path.join(os.tmpdir(), 'landing-showcase-' + engineName + '-' + width + '-hero.png') });

  // First paint and ordinary scrolling must not boot any app workspace.
  await page.getByRole('tab', { name: 'Stock', exact: true }).scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('iframe').count(), 0);
  assert(!requests.some(file => /^\/(?:landing1\/preview\/|src\/|app\.js$)/.test(file)), 'Workspace runtime loaded without a request to explore');
  const explore = page.getByRole('link', { name: /^Explore the app/i });
  assert.equal(await explore.getAttribute('href'), '#stock');
  await explore.click();
  await waitForExample(page, 'Stock');
  assert.equal(new URL(page.url()).hash, '#stock');
  const stock = page.getByRole('tab', { name: 'Stock', exact: true });
  assert(await stock.evaluate(el => el === document.activeElement));
  assert(await stock.evaluate(el => {
    const box = el.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight;
  }), 'Explore brings Stock navigation into view');
  const documents = requests.filter(file => /^\/landing1\/preview\/[^/]+\/$/.test(file));
  assert.deepEqual([...new Set(documents)], ['/landing1/preview/stock/'], 'Explore downloads Stock alone');

  const startY = await page.evaluate(() => window.scrollY);
  const sales = page.getByRole('tab', { name: 'Sales', exact: true });
  await sales.click();
  await waitForExample(page, 'Sales');
  assert.equal(new URL(page.url()).hash, '#sales');
  await sales.press('ArrowRight');
  await waitForExample(page, 'Expenses');
  const expenses = page.getByRole('tab', { name: 'Expenses', exact: true });
  assert(await expenses.evaluate(el => el === document.activeElement));
  await expenses.press('End');
  await waitForExample(page, 'Dashboard');
  await page.getByRole('tab', { name: 'Dashboard', exact: true }).press('Home');
  await waitForExample(page, 'Stock');
  assert(Math.abs(await page.evaluate(() => window.scrollY) - startY) <= 2,
    'Changing views must leave the document at the same scroll position');

  await page.goBack();
  await waitForExample(page, 'Dashboard');
  await page.goForward();
  await waitForExample(page, 'Stock');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  assert.equal(new URL(page.url()).hash, '#stock', 'Document scrolling never changes the selected page');
  await checkSelected(page, 'Stock');
  await stock.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(os.tmpdir(), 'landing-showcase-' + engineName + '-' + width + '-stock.png') });

  if (width === 390 || width === 1440) await checkWindows(page, width);
  assert(await checkWidth(page));
}

async function checkEntryPoints(page) {
  await page.goto(origin + '/landing2/');
  await page.waitForURL('**/landing1/');
  await checkSelected(page, 'Stock');
  assert.equal(await page.locator('iframe').count(), 0);
  await page.goto(origin + '/#sale');
  await waitForExample(page, 'Sales');
  await page.reload();
  await waitForExample(page, 'Sales');
  await page.goto(origin + '/');
  await page.getByRole('link', { name: /Try the Dashboard/i }).click();
  await waitForExample(page, 'Dashboard');
  await page.goBack();
  await checkSelected(page, 'Stock');
  assert.equal(await page.locator('iframe').count(), 0, 'Back to the hero releases the example');
  await page.getByRole('button', { name: 'Try Stock example' }).click();
  await waitForExample(page, 'Stock');
}

async function checkFallback(page) {
  await page.goto(origin + '/');
  const explore = page.getByRole('link', { name: /^Explore the app/i });
  await explore.click();
  assert.equal(new URL(page.url()).hash, '#stock');
  for (const name of pageNames) {
    const link = page.getByRole('link', { name: name + ' screenshot', exact: true });
    assert(await link.isVisible(), name + ' screenshot is available without scripting');
    const href = await link.getAttribute('href');
    assert.match(href, /\.webp(?:[?#].*)?$/);
    assert(fs.existsSync(path.join(site, new URL(href, origin).pathname)));
  }
  assert.equal(await page.locator('iframe').count(), 0);
  assert(await checkWidth(page));
}

(async () => {
  execFileSync(process.execPath, ['scripts/build-site.cjs'], { cwd: root });
  const browser = await (isWebKit ? webkit : chromium).launch({
    headless: true, executablePath: isWebKit ? undefined : process.env.CHROMIUM_EXECUTABLE
  });
  try {
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) {
      await withPage(browser, { viewport: { width, height }, reducedMotion: 'reduce' },
        (page, requests) => checkPresentation(page, requests, width));
      console.log('PASS landing showcase', engineName, width + 'x' + height);
    }
    await withPage(browser, { viewport: { width: 390, height: 844 } }, checkEntryPoints);
    await withPage(browser, { viewport: { width: 320, height: 568 }, javaScriptEnabled: false }, checkFallback);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
