'use strict';
const assert = require('node:assert/strict');

module.exports = async function checkWindows(page, width) {
  page.setDefaultTimeout(12000);
  const frames = {};
  for (const [key, section] of Object.entries({ dashboard: 'dashboard', stock: 'stock', sales: 'sale', expenses: 'expenses' })) {
    const host = page.locator('#' + section + ' iframe');
    await host.scrollIntoViewIfNeeded();
    assert.equal(await host.getAttribute('sandbox'), 'allow-scripts');
    const frame = await (await host.elementHandle()).contentFrame();
    await frame.locator('.page.on .card, .page.on .page-header').first().waitFor({ state: 'attached' });
    assert.equal(await frame.locator('.page, nav').count(), 1);
    assert.equal(await frame.locator('[aria-label^="Back"]:visible').count(), 0);
    assert.equal(await frame.evaluate(() => window.origin), 'null');
    assert(await frame.evaluate(() => {
      try { return !parent.document; } catch (error) { return error.name === 'SecurityError'; }
    }));
    assert(await frame.evaluate(() => {
      try { return !window.localStorage; } catch (error) { return error.name === 'SecurityError'; }
    }));
    assert(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    frames[key] = frame;
  }
  const { dashboard, sales, stock, expenses } = frames;
  await page.locator('#dashboard iframe').scrollIntoViewIfNeeded();
  const picker = dashboard.getByRole('combobox', { name: 'Dashboard period' });
  const amounts = [];
  for (const period of ['7d', '14d', '30d', 'cy']) {
    await picker.selectOption(period);
    await dashboard.waitForFunction(() => !document.querySelector('[data-rt-period-pending]'));
    const amount = Number(await dashboard.locator('[data-cv-key="sum-rev"]').getAttribute('data-cv'));
    assert(amount > (amounts.at(-1) || 0));
    amounts.push(amount);
  }
  assert.equal(amounts[2], 1977);
  const legend = dashboard.locator('.cat-legend-row:visible').first();
  await legend.focus();
  assert.match(await dashboard.locator('.preview-category-detail').innerText(), /£.+ revenue/);
  await legend.press('Enter');
  await dashboard.locator('#slide-panel.on').waitFor();
  await dashboard.getByRole('button', { name: 'Close panel' }).click();
  if (width >= 768) {
    await dashboard.locator('#summary-chart-svg .rt-chart-col').nth(1).hover();
    assert.match(await dashboard.locator('.rt-chart-scrub-tip:visible').innerText(), /Gross Revenue/i);
  }

  await page.locator('#sale iframe').scrollIntoViewIfNeeded();
  await sales.getByLabel('Sort sales').selectOption('profit');
  await sales.waitForFunction(() => window.__monthItems.length > 1 && window.__monthItems.every((v, i, a) => !i || v.profit <= a[i - 1].profit));
  if (!await sales.locator('[data-month-filter="returned"]:visible').count()) {
    await sales.locator('#mfp-filter > button').click();
  }
  await sales.locator('[data-month-filter="returned"]:visible').click();
  await sales.waitForFunction(() => window.__monthItems.length === 1 && window.__monthItems[0].isReturnAdjustment);

  await page.locator('#stock iframe').scrollIntoViewIfNeeded();
  await stock.locator('[data-stock-state="sourced"]').click();
  await stock.getByText('Longest sitting', { exact: true }).waitFor();
  assert.match(await stock.locator('.stock-kpis').innerText(), /24d/);
  const rows = stock.locator('[data-stock-item]');
  assert.equal(await rows.count(), 3);
  await rows.first().click();
  await stock.locator('#slide-panel.on').waitFor();
  await stock.getByRole('button', { name: 'Close panel' }).click();
  await stock.locator('#dd-stock-add > button').click();
  await stock.getByRole('button', { name: 'Add to Stock', exact: true }).click();
  await stock.locator('#sqa-title').fill('Test market find');
  await stock.locator('#sqa-category').selectOption({ index: 1 });
  await stock.locator('#sqa-location').fill('Shelf A');
  await stock.locator('#sqa-cost').fill('5');
  await stock.locator('#sqa-submit-btn').click();
  await stock.locator('[data-stock-state="sourced"]').click();
  await stock.getByText('Test market find', { exact: true }).first().waitFor();
  assert.equal(await rows.count(), 4);

  await page.locator('#expenses iframe').scrollIntoViewIfNeeded();
  const costs = expenses.locator('.expense-item');
  assert.equal(await costs.count(), 6);
  await expenses.locator('[data-cost-category="Postage & packaging"]').click();
  await expenses.waitForFunction(() => document.querySelectorAll('.expense-item').length === 2);
  assert.equal(await costs.count(), 2);
  await expenses.locator('[data-cost-category="all"]').click();
  await expenses.waitForFunction(() => document.querySelectorAll('.expense-item').length === 6);
  await expenses.locator('#dd-exp-add > button').click();
  await expenses.getByRole('button', { name: 'Add Expense', exact: true }).click();
  await expenses.locator('#exp-desc').fill('Test parcel');
  await expenses.locator('#exp-amt').fill('4.25');
  await expenses.locator('#exp-cat').selectOption('Postage & packaging');
  await expenses.getByRole('button', { name: 'Save Expense' }).click();
  await costs.filter({ hasText: 'Test parcel' }).waitFor();
  assert.equal(await costs.count(), 7);
  const seedRow = costs.filter({ hasText: 'Royal Mail parcel labels' });
  await seedRow.getByLabel('Item actions').click();
  await expenses.getByRole('button', { name: 'Delete', exact: true }).click();
  await expenses.locator('#confirm-ok').click();
  await seedRow.waitFor({ state: 'detached' });
  assert.equal(await costs.count(), 6);
  await page.getByRole('button', { name: 'Reset Expenses example' }).click();
  const fresh = page.frameLocator('#expenses iframe');
  await fresh.getByText('Royal Mail parcel labels', { exact: true }).waitFor({ state: 'attached' });
  assert.equal(await fresh.getByText('Test parcel', { exact: true }).count(), 0);
  assert.equal(await rows.count(), 4, 'Resetting one window leaves its neighbours alone');
  assert.equal(await page.evaluate(() => window.localStorage.length + window.sessionStorage.length), 0);
  await page.reload();
  const initial = page.frameLocator('#stock iframe');
  await page.locator('#stock iframe').scrollIntoViewIfNeeded();
  await initial.locator('[data-stock-state="sourced"]').click();
  await initial.getByText('Longest sitting', { exact: true }).waitFor();
  assert.equal(await initial.locator('[data-stock-item]').count(), 3);
  assert.equal(await page.frameLocator('#dashboard iframe').getByLabel('Dashboard period').inputValue(), '30d');
  await page.goto('https://retrade.test/landing2/');
  await page.goBack();
  await page.locator('#stock iframe').scrollIntoViewIfNeeded();
  await initial.locator('[data-stock-state="listed"].is-active').waitFor();
  assert.equal(await initial.locator('[data-stock-item]').count(), 5);
};
