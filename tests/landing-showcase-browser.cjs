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
const pageNames = ['Dashboard', 'Sales', 'Stock', 'Expenses'];
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
  assert.doesNotMatch(await page.locator('body').innerText(), /interactive tour|track your flips across|try the dashboard|from the first haul to the books/i);
  await waitForExample(page, 'Dashboard');
  const tabs = page.getByRole('tablist').getByRole('tab');
  assert.deepEqual((await tabs.allTextContents()).slice(0, 4), pageNames);
  assert.equal(await tabs.count(), 5);
  const taxes = tabs.nth(4);
  assert.match(await taxes.innerText(), /taxes/i);
  assert.match(await taxes.innerText(), /soon/i);
  assert(await taxes.isDisabled());

  const hero = page.locator('.hero');
  const signup = hero.getByRole('link', { name: /sign up for free/i });
  assert.equal(await signup.getAttribute('href'), '/signup/');
  assert.equal(await hero.getByRole('link').count(), 1);
  const frame = page.locator('iframe');
  const { y: demoTop, height: demoHeight } = await frame.boundingBox();
  const signupBox = await signup.boundingBox();
  const navBox = await page.getByRole('tablist').boundingBox();
  const benefits = await page.locator('#benefits').boundingBox();
  const finish = page.locator('main a[href="/signup/"]').last();
  const finishBox = await finish.boundingBox();
  assert(navBox.y >= signupBox.y + signupBox.height && demoTop >= navBox.y + navBox.height - 1);
  assert(demoTop < await page.evaluate(() => innerHeight), 'Visitors see the working demo on first load at ' + width);
  assert(benefits.y >= demoTop + demoHeight - 1 && finishBox.y >= benefits.y + benefits.height - 1,
    'Visitors can scroll from the demo to the benefits and final sign-up link');
  assert(await finish.isVisible());
  assert(await checkWidth(page), 'No page overflow at ' + width);
  assert(await tabs.evaluateAll(elements => elements.every((tab, index) => {
    const box = tab.getBoundingClientRect();
    const first = elements[0].getBoundingClientRect();
    const previous = index && elements[index - 1].getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth + 1 && box.height >= 44 &&
      Math.abs(box.top - first.top) <= 1 && (!previous || box.left >= previous.right - 1);
  })), 'All five tabs fit in order in one touch-friendly row at ' + width);
  await page.screenshot({ path: path.join(os.tmpdir(), 'landing-showcase-' + engineName + '-' + width + '-hero.png') });

  const taxesBox = await taxes.boundingBox();
  await page.mouse.click(taxesBox.x + taxesBox.width / 2, taxesBox.y + taxesBox.height / 2);
  await checkSelected(page, 'Dashboard');
  assert.equal(new URL(page.url()).hash, '');
  const previewDocuments = () => requests.filter(file => /^\/landing1\/preview\/[^/]+\/$/.test(file));
  assert.deepEqual(previewDocuments(), ['/landing1/preview/dashboard/'], 'Only the live Dashboard is loaded initially');
  assert(!requests.some(file => file.startsWith('/landing1/preview/view-')),
    'Dashboard does not download the other page scripts');
  assert(!requests.some(file => file.startsWith('/assets/landing/') && file.endsWith('.webp')),
    'The scripted page does not download a marketing screenshot');

  const startY = await page.evaluate(() => window.scrollY);
  const sales = page.getByRole('tab', { name: 'Sales', exact: true });
  await sales.click();
  await waitForExample(page, 'Sales');
  assert.equal(new URL(page.url()).hash, '#sales');
  await sales.press('ArrowRight');
  await waitForExample(page, 'Stock');
  const stock = page.getByRole('tab', { name: 'Stock', exact: true });
  assert(await stock.evaluate(el => el === document.activeElement));
  await stock.press('End');
  await waitForExample(page, 'Expenses');
  const expenses = page.getByRole('tab', { name: 'Expenses', exact: true });
  await expenses.press('ArrowRight');
  await waitForExample(page, 'Dashboard');
  assert(Math.abs(await page.evaluate(() => window.scrollY) - startY) <= 2,
    'Changing views must leave the document at the same scroll position');
  assert.deepEqual(previewDocuments(), ['dashboard', 'sales', 'stock', 'expenses', 'dashboard'].map(name => '/landing1/preview/' + name + '/'),
    'Only the requested view loads on each selection');

  await page.goBack();
  await waitForExample(page, 'Expenses');
  await page.goForward();
  await waitForExample(page, 'Dashboard');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  assert.equal(new URL(page.url()).hash, '#dashboard', 'Document scrolling never changes the selected page');
  await checkSelected(page, 'Dashboard');
  await stock.click();
  await waitForExample(page, 'Stock');
  await page.screenshot({ path: path.join(os.tmpdir(), 'landing-showcase-' + engineName + '-' + width + '-stock.png') });

  if (width === 390 || width === 1440) await checkWindows(page, width);
  assert(await checkWidth(page));
}

async function checkEntryPoints(page) {
  await page.goto(origin + '/landing2/');
  await page.waitForURL('**/landing1/');
  await waitForExample(page, 'Dashboard');
  await page.goto(origin + '/#sale');
  await waitForExample(page, 'Sales');
  await page.reload();
  await waitForExample(page, 'Sales');
  await page.goto(origin + '/#tour');
  await waitForExample(page, 'Stock');
  await page.goto(origin + '/#taxes');
  await waitForExample(page, 'Dashboard');
  await page.goto(origin + '/');
  await page.getByRole('tab', { name: 'Stock', exact: true }).click();
  await waitForExample(page, 'Stock');
  await page.goBack();
  await waitForExample(page, 'Dashboard');
}

async function checkFallback(page) {
  await page.goto(origin + '/');
  const poster = page.locator('#workspace-panel img');
  assert(await poster.isVisible(), 'The Dashboard has a fallback when JavaScript is disabled');
  assert.match(await poster.getAttribute('alt'), /dashboard/i);
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
