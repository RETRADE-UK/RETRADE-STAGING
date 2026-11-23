/* Capture Landing 1 from the real app with offline synthetic data. */
'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { openOffline, resetScroll, stableView } = require('./capture.cjs');

async function main() {
  const browser = await chromium.launch();
  try {
    for (const mobile of [false, true]) {
      const state = await openOffline(browser, mobile);
      const { page, context } = state;
      try {
        if (!mobile) await page.setViewportSize({ width: 1320, height: 900 });
        await page.addStyleTag({ content: `
          body.rt { --sidebar-w: 0px !important; }
          body.rt #side-nav, .rt-staging-label, body.rt #bottom-nav, body.rt #mobile-top-bar, body.rt #nav, #search-fab,
          #fab-dial, .fab, .fab-main { display: none !important; }
          .page.on { padding-bottom: 24px !important; }
        ` });
        async function capture(name, selector, expected) {
          const view = page.locator(selector);
          await view.waitFor();
          await resetScroll(page);
          await stableView(page);
          assert.match(await view.innerText(), expected);
          const shot = await view.screenshot({ animations: 'disabled', timeout: 30000 });
          const dest = 'assets/landing/open-' + name + (mobile ? '-phone' : '') + '.webp';
          execFileSync(process.env.PYTHON_EXECUTABLE || 'python3', ['-c',
            'from PIL import Image\nfrom io import BytesIO\nimport sys\nim=Image.open(BytesIO(sys.stdin.buffer.read())).convert("RGB")\nim.thumbnail((int(sys.argv[2]), im.height), Image.Resampling.LANCZOS)\nim.save(sys.argv[1], quality=84, method=5)\nprint(im.size)',
            dest, mobile ? '585' : '1320'], { input: shot, stdio: ['pipe','inherit','inherit'] });
        }
        if (process.argv.includes('--expenses-only')) {
          await captureExpenses();
          assert.deepEqual([...state.errors, ...state.missingAssets, ...state.databaseAttempts], []);
          continue;
        }
        async function captureExpenses() {
          const expenses = require('./example-expenses.json');
          await page.evaluate(rows => {
            DB.expenses = rows.map(([date, category, description, amount], index) =>
              ({ id: 'demo-expense-' + index, date, category, description, amount }));
            goToTab('expenses');
          }, expenses);
          await page.locator('#p-expenses [data-cost-category="Software & subscriptions"]').waitFor();
          const categories = await page.locator('#p-expenses [data-cost-category]').evaluateAll(cards =>
            cards.map(card => card.dataset.costCategory));
          assert.deepEqual(categories.filter(category => category !== 'all').sort(),
            [...new Set(expenses.map(row => row[1]))].sort());
          await capture('expenses', '#p-expenses', /Royal Mail parcel labels/);
        }
        await page.evaluate(() => {
          const base = _periodDateRange;
          _periodDateRange = period => period === 'cy'
            ? { from: new Date().getFullYear() + '-01-01', to: new Date().toISOString().slice(0, 10) }
            : base(period);
        });
        for (const period of ['30d', '7d', '14d', 'cy']) {
          await page.evaluate(value => setSummaryPeriod(value), period);
          await page.waitForFunction(() => !document.querySelector('#p-summary').hasAttribute('data-rt-period-pending'));
          if (period === 'cy') {
            await page.evaluate(() => {
              for (const select of document.querySelectorAll('#p-summary .summary-period-sel')) {
                select.add(new Option('Calendar year', 'cy', true, true));
              }
              const mobileLabel = document.querySelector('#p-summary .summary-hero-head .kpi-label');
              if (mobileLabel) mobileLabel.textContent = 'Gross revenue · Calendar year';
              for (const el of document.querySelectorAll('#p-summary .summary-header-mobile select, #p-summary select[aria-label="Dashboard period"]')) {
                if (!el.querySelector('option[value="cy"]')) el.add(new Option('Calendar year', 'cy', true, true));
              }
            });
          }
          console.log(nameFor(period), await page.evaluate(() => calcSummaryGrossStats().revenue));
          await capture(nameFor(period), '#p-summary', /Dashboard/);
        }
        await page.evaluate(() => goToTab('stock'));
        await capture('stock', '#p-stock', /Stock/);
        await page.evaluate(() => openRunPage(window.__landingCaptureFixture.refs.runId));
        await capture('sourcing', '#p-item', /Sunday car boot finds/);
        await page.evaluate(() => {
          // A short browser-sized list keeps every example sale readable.
          const refs = new Set(window.__landingCaptureFixture.refs.current.slice(0, 5).map(ref => ref.id));
          for (const rows of Object.values(DB)) {
            if (!Array.isArray(rows)) continue;
            for (const item of rows) {
              if (item.dateSold && !refs.has(item.id)) item.dateSold = '2026-10-20';
            }
          }
          goToTab('monthly');
        });
        await capture('sales', '#p-monthly', /Cotton chore jacket/);
        await captureExpenses();
        assert.deepEqual([...state.errors, ...state.missingAssets, ...state.databaseAttempts], []);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
function nameFor(period) { return 'dashboard-' + period; }
main().catch(error => { console.error(error); process.exitCode = 1; });
