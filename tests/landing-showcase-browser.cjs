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
const saleExamples = [
  { key: 'everyday', image: 'sale-jeans', name: /Levi.+501/i, amounts: [32, 8.50, 23.50] },
  { key: 'repair', image: 'sale-repair', name: /Dyson V7/i, amounts: [65, 15, 18, 6, 26] },
  { key: 'return', image: 'sale-return', name: /coffee grinder/i, amounts: [30, 8, 4.41, 3.50, 8.34] }
];
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png'
};

async function withPage(browser, options, check) {
  const context = await browser.newContext(options);
  const requests = [];
  const failures = [];
  const overrides = [];
  const interceptOnce = (matches, respond) => overrides.push({ matches, respond });
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
    const index = overrides.findIndex(override => override.matches(url.pathname));
    let body;
    if (index >= 0) body = await overrides.splice(index, 1)[0].respond();
    return route.fulfill({ contentType: types[path.extname(file)], body: body ?? fs.readFileSync(file) });
  });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await check(page, requests, interceptOnce);
    assert.deepEqual(failures, [], 'Every resource comes from the isolated Pages artifact');
    assert.equal(context.serviceWorkers().length, 0);
  } catch (error) {
    if (failures.length) console.error('Page or request errors:', failures);
    throw error;
  } finally {
    await context.unrouteAll({ behavior: 'wait' });
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
  const frame = panel.locator(selector + '[data-active]');
  await frame.waitFor({ state: 'visible' });
  assert.equal(await frame.getAttribute('src'), '/landing1/preview/' + name.toLowerCase() + '/');
  await panel.frameLocator(selector + '[data-active]').locator('.page.on .card, .page.on .page-header').first().waitFor({ state: 'attached' });
  assert.equal(await page.locator('iframe[data-active]').count(), 1);
  assert(await panel.locator('iframe:not([data-active])').evaluateAll(frames => frames.every(frame =>
    frame.getAttribute('aria-hidden') === 'true' && frame.tabIndex < 0 && frame.inert)));
  return (await frame.elementHandle()).contentFrame();
}

async function checkWidth(page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.scrollWidth;
    if (width <= innerWidth + 1) return null;
    const elements = [...document.body.querySelectorAll('*')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width && (box.right > innerWidth + 1 || box.left < -1 ||
        element.scrollWidth > element.clientWidth + 1);
    }).map(element => {
      const box = element.getBoundingClientRect();
      return {
        element: element.id || element.className || element.tagName.toLowerCase(),
        left: Math.round(box.left), right: Math.round(box.right),
        client: element.clientWidth, scroll: element.scrollWidth
      };
    });
    return { viewport: innerWidth, document: width, elements };
  });
  assert.equal(overflow, null, 'Horizontal page overflow: ' + JSON.stringify(overflow));
}

async function checkTabRow(tabs) {
  assert(await tabs.evaluateAll(elements => elements.every((tab, index) => {
    const box = tab.getBoundingClientRect();
    const first = elements[0].getBoundingClientRect();
    const previous = index && elements[index - 1].getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth + 1 && box.height >= 44 &&
      Math.abs(box.top - first.top) <= 1 && (!previous || box.left >= previous.right - 1);
  })), 'All five tabs fit in order in one touch-friendly row');
}

async function checkHeaderRow(frame, titleSelector, actionSelector) {
  const title = await frame.locator(titleSelector).boundingBox();
  const action = await frame.locator(actionSelector).boundingBox();
  assert(title && action && title.x + title.width <= action.x + 1 &&
    Math.max(title.y, action.y) < Math.min(title.y + title.height, action.y + action.height),
    'The page title and its control share one row inside the demo');
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
  const frame = page.locator('iframe[data-active]');
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
  await checkWidth(page);
  await checkTabRow(tabs);
  if (width === 320) {
    // Guard the narrow tab row against wider system fonts.
    const widerFont = await page.addStyleTag({ content: ':root { font-family: "DejaVu Sans", sans-serif; }' });
    await checkWidth(page);
    await checkTabRow(tabs);
    await widerFont.evaluate(style => style.remove());
  }
  await page.screenshot({ path: path.join(os.tmpdir(), 'landing-showcase-' + engineName + '-' + width + '-hero.png') });

  const taxesBox = await taxes.boundingBox();
  await page.mouse.click(taxesBox.x + taxesBox.width / 2, taxesBox.y + taxesBox.height / 2);
  await checkSelected(page, 'Dashboard');
  assert.equal(new URL(page.url()).hash, '');
  assert(!requests.some(url => saleExamples.some(example => url.startsWith('/assets/landing/' + example.image))),
    'Below-fold sale receipts must not be downloaded on first paint');
  const startY = await page.evaluate(() => window.scrollY);
  const sales = page.getByRole('tab', { name: 'Sales', exact: true });
  await sales.click();
  const salesFrame = await waitForExample(page, 'Sales');
  await checkHeaderRow(salesFrame, '.rt-month-header .page-title', '.month-picker-title');
  assert.equal(new URL(page.url()).hash, '#sales');
  await sales.press('ArrowRight');
  await waitForExample(page, 'Stock');
  const stock = page.getByRole('tab', { name: 'Stock', exact: true });
  assert(await stock.evaluate(el => el === document.activeElement));
  await stock.press('End');
  const expensesFrame = await waitForExample(page, 'Expenses');
  await checkHeaderRow(expensesFrame, '.page-header .page-title', '#dd-exp-add > button');
  const expenses = page.getByRole('tab', { name: 'Expenses', exact: true });
  await expenses.press('ArrowRight');
  await waitForExample(page, 'Dashboard');
  assert(Math.abs(await page.evaluate(() => window.scrollY) - startY) <= 2,
    'Changing views must leave the document at the same scroll position');
  assert(!requests.some(url => url.includes('/preview/tax')), 'The public demo never loads Taxes');

  await page.goBack();
  await waitForExample(page, 'Expenses');
  await page.goForward();
  await waitForExample(page, 'Dashboard');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  assert.equal(new URL(page.url()).hash, '#dashboard', 'Document scrolling never changes the selected page');
  await checkSelected(page, 'Dashboard');
  await checkSaleExamples(page, width);
  await stock.click();
  await waitForExample(page, 'Stock');
  await page.screenshot({ path: path.join(os.tmpdir(), 'landing-showcase-' + engineName + '-' + width + '-stock.png') });

  if (width === 390 || width === 1440) await checkWindows(page, width);
  await checkWidth(page);
}

async function checkReceipt(slide, example, width) {
  const image = slide.locator('img');
  await image.waitFor({ state: 'attached' });
  const source = '/assets/landing/' + example.image + (width <= 960 ? '-phone' : '') + '.webp';
  await slide.page().waitForFunction(({ img, source }) => {
    return img.complete && img.naturalWidth > 0 && new URL(img.currentSrc).pathname === source;
  }, { img: await image.elementHandle(), source });
  const caption = await slide.innerText();
  const description = await image.getAttribute('alt');
  assert.match(caption, example.name);
  assert(description && description.trim(), 'The receipt has a text alternative');
  const summary = caption + ' ' + description;
  const amounts = [...summary.matchAll(/£(\d+(?:\.\d{2})?)/g)].map(match => Number(match[1]));
  for (const amount of example.amounts) {
    assert(amounts.includes(amount), example.key + ' receipt should describe £' + amount);
  }
  assert.match(summary, example.key === 'return' ? /loss/i : /profit/i);
}

async function checkSaleExamples(page, width) {
  const section = page.locator('.sale-examples');
  const track = section.locator('.example-track');
  const controls = section.locator('#sale-example-selector button');
  assert.deepEqual(await controls.evaluateAll(buttons => buttons.map(button => button.dataset.example)),
    saleExamples.map(example => example.key));

  async function checkActive(index) {
    const example = saleExamples[index];
    const button = controls.nth(index);
    const slide = track.locator('[data-scenario="' + example.key + '"]');
    await section.locator('button[data-example="' + example.key + '"][aria-pressed="true"]').waitFor();
    assert.equal(await section.locator('#sale-example-selector [aria-pressed="true"]').count(), 1);
    assert.equal(await button.getAttribute('aria-controls'), await slide.getAttribute('id'));
    assert(await slide.evaluate(element => !element.inert));
    await checkReceipt(slide, example, width);
    assert(await track.locator('.example-slide').evaluateAll(slides => slides.filter(slide => !slide.inert).length === 1));
    await page.waitForFunction(key => {
      const track = document.querySelector('.example-track');
      const slide = track.querySelector('[data-scenario="' + key + '"]');
      const item = slide.getBoundingClientRect();
      const rail = track.getBoundingClientRect();
      const visibleWidth = Math.min(item.right, rail.right) - Math.max(item.left, rail.left);
      return visibleWidth >= Math.min(item.width, rail.width) - 2 && item.bottom <= rail.bottom + 2;
    }, example.key);
  }

  await section.locator('#sale-example-selector').scrollIntoViewIfNeeded();
  await checkActive(0);
  const startY = await page.evaluate(() => scrollY);
  await controls.nth(1).click();
  await checkActive(1);
  await controls.nth(1).press('ArrowRight');
  await checkActive(2);
  assert(await controls.nth(2).evaluate(button => button === document.activeElement));
  await controls.nth(2).press('Home');
  await checkActive(0);
  assert(Math.abs(await page.evaluate(() => scrollY) - startY) <= 2, 'Sale selectors leave the page at the same vertical position');
  assert.equal(new URL(page.url()).hash, '#dashboard');
  if (width === 390) {
    await track.scrollIntoViewIfNeeded();
    const swipeY = await page.evaluate(() => scrollY);
    const { x, y, width: railWidth, height } = await track.boundingBox();
    const touchY = Math.min(page.viewportSize().height - 50, Math.max(50, y + height / 2));
    if (isWebKit) {
      // A horizontal trackpad gesture drives the native scroll container on WebKit.
      await page.mouse.move(x + railWidth / 2, touchY);
      await page.mouse.wheel(railWidth, 0);
    } else {
      const session = await page.context().newCDPSession(page);
      try {
        const touch = (type, fraction) => session.send('Input.dispatchTouchEvent', {
          type, touchPoints: fraction == null ? [] : [{ x: x + railWidth * fraction, y: touchY }]
        });
        await touch('touchStart', .85);
        // Drag one receipt and briefly rest the finger before lifting. An unpaced
        // sequence creates a fling whose destination depends on the test host.
        for (const fraction of [.72, .58, .44, .30, .15]) {
          await page.waitForTimeout(30);
          await touch('touchMove', fraction);
        }
        await page.waitForTimeout(140);
        await touch('touchEnd');
      } finally {
        await session.detach();
      }
    }
    await checkActive(1);
    assert(Math.abs(await page.evaluate(() => scrollY) - swipeY) <= 2,
      'Horizontal receipt browsing leaves the outer page at the same height');
  }
}

async function useDeviceProfile(page, saveData) {
  await page.addInitScript(saveData => {
    Object.defineProperties(navigator, {
      hardwareConcurrency: { configurable: true, value: 8 },
      deviceMemory: { configurable: true, value: 8 },
      connection: { configurable: true, value: { saveData, effectiveType: '4g' } }
    });
  }, saveData);
}

function holdRequest(interceptOnce, url) {
  let release, received;
  const requested = new Promise(resolve => { received = resolve; });
  const paused = new Promise(resolve => { release = resolve; });
  interceptOnce(path => path === url, () => {
    received();
    return paused;
  });
  return { requested, release };
}

async function checkColdSwitch(page, requests, interceptOnce) {
  await useDeviceProfile(page, true);
  const dashboard = holdRequest(interceptOnce, '/landing1/preview/dashboard/');
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  try {
    await dashboard.requested;
    assert.doesNotMatch(await page.locator('#workspace-panel').innerText(), /opening|loading/i);
  } finally {
    dashboard.release();
  }
  await waitForExample(page, 'Dashboard');
  const sales = holdRequest(interceptOnce, '/landing1/preview/sales/');
  await page.getByRole('tab', { name: 'Sales', exact: true }).click();
  try {
    await sales.requested;
    assert(await page.locator('iframe[data-active][title="Interactive Dashboard example"]').isVisible(),
      'Dashboard stays painted until the requested page is ready');
    assert.doesNotMatch(await page.locator('#workspace-panel').innerText(), /opening|loading/i);
  } finally {
    sales.release();
  }
  await waitForExample(page, 'Sales');
  assert.deepEqual(requests.filter(url => /^\/landing1\/preview\/[^/]+\/$/.test(url)),
    ['/landing1/preview/dashboard/', '/landing1/preview/sales/'], 'Save-Data only loads selected pages');
}

async function checkFailedSwitch(page, requests, interceptOnce) {
  await useDeviceProfile(page, true);
  await page.goto(origin + '/');
  await waitForExample(page, 'Dashboard');
  interceptOnce(url => url.startsWith('/landing1/preview/view-sales-'), () => '');

  await page.getByRole('tab', { name: 'Sales', exact: true }).click();
  const error = page.locator('.preview-status');
  await error.waitFor({ state: 'visible' });
  assert.match(await error.innerText(), /Sales.+load.+Reset/i);
  await page.getByRole('button', { name: 'Reset Sales example' }).click();
  await waitForExample(page, 'Sales');
  assert(await error.isHidden());
}

async function checkWarmSwitch(page, requests) {
  await useDeviceProfile(page, false);
  const costsPrimed = page.waitForRequest(request =>
    request.resourceType() === 'fetch' && new URL(request.url()).pathname.startsWith('/landing1/preview/view-costs-'));
  await page.goto(origin + '/');
  await waitForExample(page, 'Dashboard');
  const salesFrame = page.locator('iframe[title="Interactive Sales example"]');
  await salesFrame.waitFor({ state: 'attached' });
  await page.frameLocator('iframe[title="Interactive Sales example"]').locator('.page.on .page-header').waitFor({ state: 'attached' });
  assert.equal(await salesFrame.getAttribute('aria-hidden'), 'true');
  assert.equal(await salesFrame.getAttribute('sandbox'), 'allow-scripts');
  await costsPrimed;
  assert.equal(await page.locator('iframe').count(), 2, 'Phones keep just one live standby while priming other files');
  const before = await salesFrame.elementHandle();
  await page.getByRole('tab', { name: 'Sales', exact: true }).click();
  await waitForExample(page, 'Sales');
  assert(await before.evaluate(frame => frame.isConnected && frame.hasAttribute('data-active')),
    'The prepared frame is promoted in place');
  assert.equal(requests.filter(url => url === '/landing1/preview/sales/').length, 1);
}

async function checkDashboardReveal(page, reduced) {
  await useDeviceProfile(page, false);
  await page.addInitScript(() => {
    window.dashboardAnimations = {};
    document.addEventListener('animationstart', event => {
      if (event.target.closest('#p-summary')) window.dashboardAnimations[event.animationName] = window.Date.now();
    });
  });
  await page.goto(origin + '/');
  async function checkReveal(after) {
    const dashboard = await waitForExample(page, 'Dashboard');
    if (!reduced) {
      await dashboard.waitForFunction(after =>
        ['rtRevenueBarV1441', 'rtProfitBarV1441', 'rtTruthChartReveal1520', 'donutSweep']
          .every(name => window.dashboardAnimations[name] >= after), after);
    }
    await dashboard.waitForFunction(() => {
      const metric = Array.from(document.querySelectorAll('[data-cv-key="sum-m-rev"],[data-cv-key="sum-rev"]'))
        .find(element => element.getBoundingClientRect().width);
      return metric && Number(metric.textContent.replace(/[^\d.]/g, '')) === Number(metric.dataset.cv);
    });
    if (reduced) {
      const longAnimation = await dashboard.evaluate(() => document.getAnimations().some(animation => {
        const target = animation.effect?.target;
        return target?.closest('#p-summary') && animation.playState === 'running' &&
          Number(animation.effect.getTiming().duration) > 1;
      }));
      assert(!longAnimation, 'Reduced motion shows Dashboard values without a prolonged reveal');
    }
  }
  await checkReveal(0);
  await page.getByRole('tab', { name: 'Sales', exact: true }).click();
  await waitForExample(page, 'Sales');
  const beforeReturn = await page.evaluate(() => Date.now());
  await page.getByRole('tab', { name: 'Dashboard', exact: true }).click();
  await checkReveal(beforeReturn);
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
  const section = page.locator('.sale-examples');
  assert(await section.locator('#sale-example-selector').isHidden());
  let previousBottom = 0;
  for (const example of saleExamples) {
    const slide = section.locator('[data-scenario="' + example.key + '"]');
    const top = await slide.evaluate(element => element.getBoundingClientRect().top + scrollY);
    assert(top >= previousBottom - 1, 'Without JavaScript the next receipt follows vertically');
    await slide.scrollIntoViewIfNeeded();
    await checkReceipt(slide, example, 320);
    previousBottom = await slide.evaluate(element => element.getBoundingClientRect().bottom + scrollY);
  }
  await checkWidth(page);
}

(async () => {
  execFileSync(process.execPath, ['scripts/build-site.cjs'], { cwd: root });
  const browser = await (isWebKit ? webkit : chromium).launch({
    headless: true, executablePath: isWebKit ? undefined : process.env.CHROMIUM_EXECUTABLE
  });
  try {
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) {
      await withPage(browser, { viewport: { width, height }, hasTouch: width === 390, reducedMotion: 'reduce' },
        (page, requests) => checkPresentation(page, requests, width));
      console.log('PASS landing showcase', engineName, width + 'x' + height);
    }
    const phone = { viewport: { width: 390, height: 844 } };
    await withPage(browser, phone, checkColdSwitch);
    await withPage(browser, phone, checkWarmSwitch);
    await withPage(browser, phone, checkFailedSwitch);
    console.log('PASS landing warm, delayed and failed switches', engineName);
    for (const reduced of [false, true]) {
      await withPage(browser, { ...phone, reducedMotion: reduced ? 'reduce' : 'no-preference' },
        page => checkDashboardReveal(page, reduced));
      console.log('PASS landing Dashboard reveal', engineName, reduced ? 'reduced motion' : 'full motion');
    }
    await withPage(browser, phone, checkEntryPoints);
    await withPage(browser, { viewport: { width: 320, height: 568 }, javaScriptEnabled: false }, checkFallback);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
