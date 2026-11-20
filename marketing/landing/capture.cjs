/* Capture real RETRADE views using a wholly synthetic, offline workspace.
 * Usage: node marketing/landing/capture.cjs [/tmp/retrade-landing-captures]
 * Requires npm ci, Playwright Chromium and Python 3 with Pillow.
 * No staging account, saved login state, API request or database write is used. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { mockAuth, settled } = require('../../tests/startup-browser.cjs');
const { buildFixture, installFixture } = require('./capture-fixture.cjs');

const root = path.resolve(__dirname, '../..');
const origin = 'http://retrade.test';
const dest = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'retrade-landing-captures'));
const fixture = buildFixture();
const contentTypes = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2'
};

function collectMetrics() {
  const fixture = window.__landingCaptureFixture;
  const range = _periodDateRange('30d');
  const priorRange = _prevPeriodRange(_prevPeriodKey('30d'));
  const current = calcSummaryGrossStats();
  const adjusted = calcYearlyStats('30d');
  const runItems = _runItems(fixture.refs.runId);
  const sale = DB[fixture.refs.sale.month].find(item => item.id === fixture.refs.sale.id);
  const cycle = _saleCycleSnapshot(sale, 1);
  const breakdown = _saleBreakdown(_saleEventForCycle(sale, fixture.refs.sale.month, cycle));
  const inventory = allItems().filter(item => !item.dateSold && !item.scrappedAt);
  return {
    current: { ...current, range, refundCount: adjusted.partialOnlyCount + adjusted.fullRefundCount,
      partialRefundCount: adjusted.partialOnlyCount, fullRefundCount: adjusted.fullRefundCount,
      refundAmount: adjusted.refundMoneyTotal, refundRate: adjusted.refundItemRate,
      adjustedRevenue: adjusted.totalRev, adjustedProfit: adjusted.realisedProfit,
      adjustedMargin: adjusted.grossMargin },
    prior: { ..._grossSummaryForRange(priorRange), range: priorRange, adjusted: _statsForRange(priorRange) },
    comparison: { gross: calcSummaryGrossDeltas(current), adjusted: calcSummaryDeltas(adjusted) },
    inventory: { count: inventory.length,
      listed: inventory.filter(item => item.state === 'listed').length,
      unlisted: inventory.filter(item => item.state === 'sourced').length,
      listedAskingValue: inventory.filter(item => item.state === 'listed').reduce((sum, item) => sum + item.salePrice, 0) },
    run: { id: fixture.refs.runId, title: fixture.runs[0].name, count: runItems.length,
      cost: _runCost(fixture.refs.runId), profit: _runProfit(fixture.refs.runId),
      revenue: Math.round(runItems.reduce((sum, item) => sum + calcItemRevenue(item), 0) * 100) / 100 },
    sale: { id: sale.id, title: sale.item, revenue: calcItemRevenue(sale),
      profit: calcNetProfit(sale), breakdown }
  };
}

async function openOffline(browser, mobile) {
  const viewport = mobile ? { width: 390, height: 900 } : { width: 1240, height: 900 };
  const context = await browser.newContext({
    viewport, deviceScaleFactor: mobile ? 2 : 1.5, isMobile: mobile, hasTouch: mobile,
    locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark',
    reducedMotion: 'reduce', serviceWorkers: 'block'
  });
  const page = await context.newPage();
  const errors = [], missingAssets = [], blockedExternal = [], databaseAttempts = [];
  page.__rtStartupDiagnostics = { errors, missingAssets };
  page.on('pageerror', error => errors.push(error.message));
  // Fix the reporting date while leaving real timers, RAF and startup running.
  await page.clock.setFixedTime(new Date(fixture.asOf));
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes('/supabase-js@')) {
      return route.fulfill({ contentType: 'text/javascript',
        body: '(' + mockAuth.toString() + ')(' + JSON.stringify(fixture.session) + ', false);' });
    }
    if (url.origin !== origin) {
      blockedExternal.push(url.origin + url.pathname);
      if (/supabase\.(co|in)$/.test(url.hostname)) databaseAttempts.push(request.method() + ' ' + url.pathname);
      return route.abort('blockedbyclient');
    }
    if (request.method() !== 'GET') throw new Error('Unexpected offline write: ' + request.method() + ' ' + url.pathname);
    const file = url.pathname === '/' ? path.join(root, 'index.html') : path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      missingAssets.push(url.pathname);
      return route.fulfill({ status: 404, body: 'Missing offline capture asset' });
    }
    let body = fs.readFileSync(file);
    if (url.pathname === '/') body = body.toString().replace(/ integrity="[^"]*"/g, '');
    if (url.pathname === '/src/core/application.js') {
      body = body.toString() + '\n;(' + installFixture.toString() + ')(' + JSON.stringify(fixture) + ');\n';
    }
    return route.fulfill({ contentType: contentTypes[path.extname(file)] || 'application/octet-stream', body });
  });
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await settled(page);
  await page.evaluate(() => { setThemePref('dark'); goToTab('summary'); setSummaryPeriod('30d'); });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark' && !document.querySelector('.page.on')?.hasAttribute('aria-busy'));
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors, missingAssets, blockedExternal, databaseAttempts, viewport };
}

async function resetScroll(page) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    for (const element of document.querySelectorAll('*')) {
      if (element.scrollTop || element.scrollLeft) element.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
}

async function stableView(page) {
  await page.waitForFunction(() => !document.querySelector('.page.on')?.hasAttribute('aria-busy'));
  await page.waitForFunction(() => [...document.querySelectorAll('.page.on [data-cv]')]
    .filter(element => element.getClientRects().length && Number.isFinite(Number(element.dataset.cv)))
    .every(element => element.textContent === (_CV_FMT[element.dataset.cvFmt] || _CV_FMT.k)(Number(element.dataset.cv))));
  // Geometry must be unchanged for three painted frames, including route effects.
  await page.evaluate(() => new Promise((resolve, reject) => {
    let previous = '', steady = 0, frames = 0;
    function check() {
      const active = document.querySelector('.page.on');
      const rect = active.getBoundingClientRect();
      const next = [rect.x, rect.y, rect.width, rect.height, document.documentElement.scrollHeight].join(',');
      steady = next === previous ? steady + 1 : 0;
      previous = next;
      if (steady >= 3) return resolve();
      if (++frames > 180) return reject(new Error('App layout did not stabilise before capture'));
      requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
  }));
}

function viewSpec(view, mobile) {
  if (view === 'dashboard') return {
    title: '#p-summary .summary-title',
    required: mobile ? ['#p-summary .summary-title', '#p-summary .summary-hero-card', '#p-summary .summary-mobile-twoup']
      : ['#p-summary .summary-title', '#p-summary .summary-kpis-v3', '#p-summary .summary-chart-card', '#p-summary .summary-categories']
  };
  if (view === 'stock') return { title: '#p-stock .page-title', required: ['#p-stock .page-title', '#p-stock .stock-kpis', '#stock-list'] };
  if (view === 'sourcing') return { title: '#p-item .page-title', required: ['#p-item .page-title', '#p-item .item-full-page'] };
  return { title: '#p-item .ip-title', required: ['#p-item .ip-title', '#p-item .ip-topbar', '#p-item .ip-section-pnl', '#p-item .ip-section-pnl .ip-receipt-row.total'] };
}

async function fitCompleteSections(page, spec, base) {
  await page.setViewportSize(base);
  for (let attempt = 0; attempt < 4; attempt++) {
    await resetScroll(page);
    await stableView(page);
    const geometry = await page.evaluate(selectors => {
      const elements = selectors.map(selector => {
        const element = document.querySelector(selector);
        if (!element || !element.getClientRects().length) throw new Error('Missing visible capture section: ' + selector);
        return element.getBoundingClientRect().bottom;
      });
      const nav = document.getElementById('bottom-nav');
      const clearance = nav?.getClientRects().length ? nav.getBoundingClientRect().height + 28 : 28;
      return { needed: Math.ceil(Math.max(...elements) + clearance), current: innerHeight };
    }, spec.required);
    if (geometry.needed <= geometry.current) return;
    assert(geometry.needed <= 4200, 'Unexpectedly tall capture; inspect the app rather than silently clipping: ' + geometry.needed);
    // Even CSS dimensions keep the desktop 1.5× raster size integral too.
    await page.setViewportSize({ width: base.width, height: Math.ceil(geometry.needed / 2) * 2 });
  }
  throw new Error('Required app sections did not fit a stable capture viewport');
}

async function capture(page, view, mobile, base) {
  const spec = viewSpec(view, mobile);
  for (const selector of spec.required) await page.locator(selector).first().waitFor({ state: 'visible' });
  await fitCompleteSections(page, spec, base);
  await resetScroll(page);
  await stableView(page);
  const proof = await page.evaluate(({ required, title, view }) => {
    const rounded = value => Math.round(value * 100) / 100;
    const nav = document.getElementById('bottom-nav');
    const usableBottom = nav?.getClientRects().length ? nav.getBoundingClientRect().top : innerHeight;
    const requiredElements = required.map(selector => {
      const element = document.querySelector(selector), rect = element.getBoundingClientRect();
      if (rect.x < -.5 || rect.y < -.5 || rect.right > innerWidth + .5 || rect.bottom > usableBottom + .5) {
        throw new Error('Capture would clip ' + selector + ': ' + JSON.stringify(rect.toJSON()));
      }
      return { selector, text: element.innerText.trim(),
        bounds: { x: rounded(rect.x), y: rounded(rect.y), width: rounded(rect.width), height: rounded(rect.height) } };
    });
    const heading = document.querySelector(title);
    if (heading.scrollWidth > heading.clientWidth + 1 || heading.scrollHeight > heading.clientHeight + 1) throw new Error('App heading text is clipped');
    if (document.documentElement.scrollWidth > innerWidth + 1) throw new Error('Horizontal app overflow in capture');
    return { title: heading.innerText.trim(), viewport: { width: innerWidth, height: innerHeight }, deviceScaleFactor: devicePixelRatio,
      scroll: { x: scrollX, y: scrollY },
      proof: { fullHeading: true, fullBreakdown: view === 'sale' ? true : null,
        fullViewport: true, requiredElements },
      renderedDashboard: view === 'dashboard' ? [...document.querySelectorAll('#p-summary [data-cv]')]
        .map(element => {
          const rect = element.getBoundingClientRect(), visible = !!element.getClientRects().length;
          return { key: element.dataset.cvKey, value: Number(element.dataset.cv),
            text: element.textContent.trim(), visible,
            inViewport: visible && rect.top >= 0 && rect.bottom <= usableBottom && rect.left >= 0 && rect.right <= innerWidth };
        }) : null };
  }, { ...spec, view });
  assert.deepEqual(proof.scroll, { x: 0, y: 0 }, 'Capture starts at the real app header');
  const basename = view + (mobile ? '-phone' : '');
  const png = path.join(dest, basename + '.png'), webp = path.join(dest, basename + '.webp');
  await page.screenshot({ path: png, animations: 'disabled', timeout: 30000 });
  const dimensions = JSON.parse(execFileSync('python3', ['-c',
    'from PIL import Image\nimport json,sys\nim=Image.open(sys.argv[1]); im.convert("RGB").save(sys.argv[2],quality=90,method=6)\nout=Image.open(sys.argv[2]); assert im.size==out.size; print(json.dumps({"width":im.width,"height":im.height}))', png, webp], { encoding: 'utf8' }));
  assert.equal(dimensions.width, Math.round(proof.viewport.width * proof.deviceScaleFactor));
  assert.equal(dimensions.height, Math.round(proof.viewport.height * proof.deviceScaleFactor));
  const result = { file: basename + '.webp', png: basename + '.png', view,
    device: mobile ? 'mobile' : 'desktop', ...dimensions, ...proof,
    baseViewport: base, captureMode: 'viewport', bytes: fs.statSync(webp).size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(webp)).digest('hex') };
  console.log('Captured', result.file, dimensions.width + '×' + dimensions.height, JSON.stringify(proof.viewport));
  return result;
}

async function take(browser, mobile) {
  const state = await openOffline(browser, mobile);
  const { context, page, viewport } = state;
  try {
    const captures = [];
    captures.push(await capture(page, 'dashboard', mobile, viewport));
    const metrics = await page.evaluate(collectMetrics);
    assert(metrics.current.soldCount >= 50 && metrics.current.soldCount <= 65, 'Modest current sales volume');
    assert(metrics.current.revenue >= 1500 && metrics.current.revenue <= 2500, 'Modest current revenue');
    assert(metrics.current.margin >= 35 && metrics.current.margin <= 45, 'Healthy but realistic gross margin');
    assert.equal(metrics.current.partialRefundCount, 1);
    assert.equal(metrics.current.fullRefundCount, 0);
    assert.equal(metrics.current.refundAmount, 8);
    assert.equal(metrics.sale.profit, 5.47);
    await page.evaluate(() => { goToTab('stock'); STOCK_STATE_FILTER = 'listed'; STOCK_SEARCH = ''; renderStock(); });
    await page.waitForFunction(() => window.__stockItems?.length === window.__landingCaptureFixture.refs.listed.length);
    captures.push(await capture(page, 'stock', mobile, viewport));
    await page.evaluate(() => openRunPage(window.__landingCaptureFixture.refs.runId));
    captures.push(await capture(page, 'sourcing', mobile, viewport));
    await page.evaluate(() => {
      const ref = window.__landingCaptureFixture.refs.sale;
      openItemPage(ref.month, ref.id);
    });
    const receipt = await page.locator('#p-item .ip-section-pnl').innerText();
    assert(receipt.includes('£5.47') && receipt.includes('£19.00'), 'Real sale receipt reconciles to the selected item');
    captures.push(await capture(page, 'sale', mobile, viewport));
    assert.deepEqual(state.errors, [], 'App must render without JavaScript errors');
    assert.deepEqual(state.missingAssets, [], 'All local app assets must be present');
    assert.deepEqual(state.databaseAttempts, [], 'Offline capture must never attempt a database call');
    return { captures, metrics, blockedExternal: [...new Set(state.blockedExternal)].sort() };
  } catch (error) {
    const suffix = mobile ? 'mobile' : 'desktop';
    await page.screenshot({ path: path.join(dest, 'capture-failure-' + suffix + '.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(dest, 'capture-failure-' + suffix + '.json'), JSON.stringify({
      message: error.message, errors: state.errors, missingAssets: state.missingAssets,
      blockedExternal: state.blockedExternal, databaseAttempts: state.databaseAttempts
    }, null, 2) + '\n');
    throw error;
  } finally { await context.close(); }
}

async function main() {
  fs.mkdirSync(dest, { recursive: true });
  fs.rmSync(path.join(dest, 'capture-manifest.json'), { force: true });
  execFileSync('python3', ['-c', 'from PIL import Image; assert Image.registered_extensions()[".webp"] == "WEBP"']);
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const desktop = await take(browser, false), mobile = await take(browser, true);
    assert.deepEqual(mobile.metrics, desktop.metrics, 'Both devices use the same actual workspace calculations');
    const manifest = { schemaVersion: 2, fixtureVersion: fixture.fixtureVersion, asOf: fixture.asOf,
      label: fixture.label, origin, externalNetwork: 'blocked',
      metrics: desktop.metrics, captures: [...desktop.captures, ...mobile.captures],
      blockedExternalRequests: [...new Set([...desktop.blockedExternal, ...mobile.blockedExternal])].sort() };
    fs.writeFileSync(path.join(dest, 'capture-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log('Wrote offline example workspace manifest:', path.join(dest, 'capture-manifest.json'));
    console.log(JSON.stringify(manifest.metrics, null, 2));
  } finally { await browser.close(); }
}

module.exports = { collectMetrics, viewSpec };
if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
