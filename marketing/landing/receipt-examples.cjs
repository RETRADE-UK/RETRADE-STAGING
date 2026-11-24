/* These three synthetic records are inserted only into the offline screenshot
 * session. The public interactive workspace keeps its original reporting data. */
'use strict';

const assert = require('node:assert/strict');
const { makeItem } = require('./capture-fixture.cjs');

const examples = [
  {
    key: 'sale-jeans', item: 'Levi’s 501 jeans', category: 'Clothing & Fashion',
    platform: 'vinted', costPrice: 8.5, salePrice: 32
  },
  {
    key: 'sale-repair', item: 'Dyson V7 cordless vacuum', category: 'Home & Garden',
    platform: 'fb', costPrice: 15, salePrice: 65,
    parts: [
      { description: 'Replacement battery', cost: 18, date: '2026-11-08' },
      { description: 'Replacement filter', cost: 6, date: '2026-11-08' }
    ]
  },
  {
    key: 'sale-return', item: 'De’Longhi coffee grinder', category: 'Home & Garden',
    platform: 'ebay_biz', costPrice: 8, salePrice: 30,
    shippingCost: 3.5, packagingCost: 0.5, listingFee: 0.36,
    refund: { amount: 30, postage: 3.5, date: '2026-11-18' }
  }
];

async function captureReceipts(page, capture) {
  const captures = [];
  const metrics = {};
  for (const { key, platform, refund, ...inputs } of examples) {
    const item = makeItem(key, {
      ...inputs, defaultPlatform: platform, salePlatform: platform, soldOnPlatform: platform,
      dateSourced: '2026-11-04', dateListed: '2026-11-09', dateSold: '2026-11-14'
    });
    await page.evaluate(record => {
      DB['NOV-26'].push(record);
      saveDB();
      openItemPage('NOV-26', record.id);
    }, item);
    await page.locator('#p-item .ip-title').getByText(item.item, { exact: true }).waitFor();

    if (refund) {
      await page.evaluate(id => openReturn('NOV-26', id), key);
      await page.locator('#rtn-type').selectOption('full_seller');
      await page.locator('#rtn-refund').fill(String(refund.amount));
      await page.locator('#rtn-date').fill(refund.date);
      await page.locator('#rtn-postage').fill(String(refund.postage));
      await page.getByRole('button', { name: 'Log Return', exact: true }).click();
      await page.locator('#p-item .ip-section-pnl').getByText('Stock cost restored').waitFor();
      await page.waitForFunction(() => getComputedStyle(document.getElementById('toast')).opacity === '0');
    }

    const outcome = await page.evaluate(id => {
      const record = DB['NOV-26'].find(entry => entry.id === id);
      const events = getSaleEventsInRange('2026-11-01', '2026-11-30').filter(event => event.item.id === id);
      return {
        title: record.item, price: record.salePrice, itemCost: record.costPrice,
        partsCost: calcPartsCost(record), profit: calcNetProfit(record),
        returned: record.isReturned, events: events.map(event => _saleBreakdown(event))
      };
    }, key);
    assert.equal(outcome.returned, Boolean(refund));
    assert.equal(outcome.events.length, refund ? 2 : 1);
    assert.equal(outcome.partsCost, item.parts.reduce((sum, part) => sum + part.cost, 0));
    assert.equal(Math.round(outcome.events.reduce((sum, event) => sum + event.netProfit, 0) * 100) / 100, outcome.profit);
    const receipt = page.locator('#p-item .ip-section-pnl');
    const amount = await receipt.locator('.rcpt-s1-price-input').inputValue();
    assert.equal(Number(amount), outcome.price);
    for (const part of item.parts) await receipt.getByText(part.description, { exact: true }).waitFor();
    const totalText = await receipt.locator('.ip-receipt-row.total .ip-receipt-val').innerText();
    assert.equal(totalText, await page.evaluate(p => fmt(p), outcome.profit));
    if (refund) {
      assert.equal(Number(await receipt.locator('.rcpt-return-postage-input').inputValue()), refund.postage);
      assert.equal(outcome.events[1].returnRefund, refund.amount);
    }
    metrics[key] = outcome;
    captures.push(await capture(key));
  }
  return { captures, metrics };
}

module.exports = { captureReceipts };
