/* Deterministic, synthetic example workspace for the landing screenshots.
 * No credentials, customer data, network access or production writes belong here.
 * Amounts are input records; the real app calculates every displayed metric. */
'use strict';

const haul = require('./haul.json');
const fixtureVersion = 'example-workspace-2026-11-v2';
const asOf = '2026-11-20T12:00:00.000Z';
const label = 'Example workspace';
const runId = 'capture-sunday-run';
const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const money = value => Math.round(value * 100) / 100;

function dateAgo(days) {
  const date = new Date(asOf);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function monthKey(date) {
  return months[Number(date.slice(5, 7)) - 1] + '-' + date.slice(2, 4);
}

// Four small batches of ordinary UK reseller finds. No aspirational business
// totals are injected: this table supplies actual sold item input records.
const catalogue = [
  ['Cotton chore jacket', 'Clothing & Fashion', 'vinted', 22, 42, .45, 0],
  ['Linen blazer', 'Clothing & Fashion', 'vinted', 22, 38, .45, 0],
  ['Walking shoes', 'Clothing & Fashion', 'vinted', 20, 36, .45, 0],
  ['Wool crew-neck jumper', 'Clothing & Fashion', 'vinted', 18, 32, .35, 0],
  ['Family board game, complete', 'Toys & Games', 'ebay_biz', 14, 34, .65, 3.50],
  ['Nintendo Switch game', 'Video Games & Consoles', 'ebay_biz', 14, 29, .25, 2.10],
  ['Stoneware mugs, set of four', 'Home & Garden', 'fb', 16, 30, 0, 0],
  ['Wooden train set', 'Toys & Games', 'fb', 20, 38, 0, 0],
  ['Cookbook bundle', 'Books', 'vinted', 12, 24, .55, 0],
  ['Compact coffee grinder', 'Home & Garden', 'ebay_biz', 22, 45, .65, 3.50],
  ['Wired games controller', 'Video Games & Consoles', 'ebay_biz', 16, 32, .45, 3.00],
  ['Socket and spanner set', 'Home & Garden', 'fb', 24, 44, 0, 0],
  ['Zip-through fleece', 'Clothing & Fashion', 'vinted', 19, 34, .45, 0]
];

function makeItem(id, values) {
  return {
    id,
    gid: 'EX-' + id.replace('capture-', '').toUpperCase(),
    item: '', category: '', source: 'Charity shop', location: 'Shelf A',
    state: 'sold', dateSourced: null, dateListed: null, dateSold: null,
    costPrice: 0, salePrice: 0, estSalePrice: null,
    postage: 0, shippingCost: 0, packagingCost: 0, promoPercent: 0, listingFee: 0,
    defaultPlatform: 'vinted', salePlatform: 'vinted', soldOnPlatform: 'vinted',
    _postageMode: 'custom', isReturned: false, sourcingRunId: null,
    parts: [], returnHistory: [],
    // Automatic renewal accrual has its own tests. These examples are recorded
    // single-sale listings, so a calendar rollover must not add unseen fees.
    refreshHistory: [{ type: 'renewal_policy', enabled: false }],
    ...values
  };
}

function addPartialRefund(item, amount, date, id) {
  item.returnHistory.push({
    id, saleNo: 1, type: 'partial_seller', refundAmount: amount,
    loggedAt: date + 'T12:00:00.000Z',
    notes: 'Small goodwill refund for a missing accessory.',
    _dateSoldAtReturn: item.dateSold,
    _salePriceAtReturn: item.salePrice,
    _postageAtReturn: item.postage,
    _shippingCostAtReturn: item.shippingCost,
    _packagingCostAtReturn: item.packagingCost,
    _platformAtReturn: item.salePlatform,
    _promoPercentAtReturn: item.promoPercent
  });
}

function buildFixture() {
  const db = { _userOwned: true, trips: [], expenses: [], cashLedger: [], activityLog: [] };
  const current = [], prior = [], listed = [], unlisted = [];
  const add = item => {
    const month = monthKey(item.dateListed || item.dateSourced);
    (db[month] ||= []).push(item);
    return { month, id: item.id };
  };

  for (const period of ['current', 'prior']) {
    for (let index = 0; index < 52; index++) {
      const [name, category, platform, cost, price, packaging, shipping] = catalogue[index % catalogue.length];
      const age = Math.floor(index * 30 / 52) + (period === 'prior' ? 30 : 0);
      const item = makeItem('capture-' + period + '-' + String(index + 1).padStart(2, '0'), {
        item: name,
        category,
        source: ['Charity shop', 'Car boot', 'Local collection'][index % 3],
        dateSourced: dateAgo(age + 7 + index % 5),
        dateListed: dateAgo(age + 4 + index % 5),
        dateSold: dateAgo(age),
        costPrice: cost,
        salePrice: money(price - (period === 'prior' ? 1 : 0)),
        shippingCost: shipping, packagingCost: packaging,
        listingFee: platform === 'ebay_biz' ? .36 : 0,
        defaultPlatform: platform, salePlatform: platform, soldOnPlatform: platform
      });
      if (index === 9) {
        addPartialRefund(item, period === 'current' ? 8 : 10, dateAgo(age - 2), 'capture-' + period + '-refund');
      }
      (period === 'current' ? current : prior).push(add(item));
    }
  }

  const haulRefs = haul.map((example, index) => {
    const item = makeItem('capture-haul-' + (index + 1), {
      item: example.item, category: example.category, source: 'Car boot', location: 'Shelf B',
      dateSourced: '2026-11-01', dateListed: '2026-11-02', dateSold: dateAgo(13 - index),
      costPrice: example.cost, salePrice: example.price,
      shippingCost: example.ship, packagingCost: example.pack,
      listingFee: example.platform === 'ebay_biz' ? .36 : 0,
      defaultPlatform: example.platform, salePlatform: example.platform, soldOnPlatform: example.platform,
      sourcingRunId: runId
    });
    const ref = add(item);
    current.push(ref);
    return ref;
  });

  const stock = [
    ['Blue enamel casserole dish', 'Home & Garden', 'ebay_biz', 6, 22, .70, 3.50],
    ['Corduroy overshirt', 'Clothing & Fashion', 'vinted', 4, 18, .35, 0],
    ['Mario Party Superstars cartridge', 'Video Games & Consoles', 'ebay_biz', 9, 23, .25, 2.10],
    ['Wooden railway starter set', 'Toys & Games', 'fb', 6, 24, 0, 0],
    ['Agatha Christie paperback bundle', 'Books', 'vinted', 3, 12, .55, 0]
  ];
  stock.forEach(([name, category, platform, cost, price, packaging, shipping], index) => {
    listed.push(add(makeItem('capture-stock-' + (index + 1), {
      item: name, category, source: 'Weekend market', state: 'listed',
      dateSourced: dateAgo(9 + index * 3), dateListed: dateAgo(6 + index * 3),
      costPrice: cost, salePrice: price, shippingCost: shipping, packagingCost: packaging,
      listingFee: platform === 'ebay_biz' ? .36 : 0,
      defaultPlatform: platform, salePlatform: platform, soldOnPlatform: platform
    })));
  });
  [
    ['Wool checked scarf', 'Clothing & Fashion', 3, 14],
    ['Vintage garden hand tools', 'Home & Garden', 5, 20],
    ['Children’s picture-book bundle', 'Books', 2, 10]
  ].forEach(([name, category, cost, estimate], index) => {
    unlisted.push(add(makeItem('capture-unlisted-' + (index + 1), {
      item: name, category, state: 'sourced', source: 'Charity shop',
      dateSourced: dateAgo(1 + index), costPrice: cost, salePrice: 0, estSalePrice: estimate
    })));
  });

  return {
    fixtureVersion, asOf, label, db,
    session: { user: {
      id: '00000000-0000-4000-8000-000000000001', email: 'example@retrade.test',
      user_metadata: { full_name: label, business_name: label }
    } },
    runs: [{
      id: runId, name: 'Sunday car boot finds', location: 'Community car boot',
      dateStarted: '2026-11-01', startedAtIso: '2026-11-01T08:30:00.000Z',
      dateEnded: '2026-11-01', endedAtIso: '2026-11-01T10:30:00.000Z',
      status: 'ended', notes: 'Example workspace · mixed Sunday haul.'
    }],
    refs: { current, prior, listed, unlisted, haul: haulRefs, sale: haulRefs[2], runId }
  };
}

/* Appended to the intercepted classic core script, as in startup-browser.cjs.
 * Only I/O/bootstrap is replaced. Rendering and accounting remain app-owned. */
function installFixture(fixture) {
  window.__landingCaptureFixture = fixture;
  window.__landingCaptureLocalSaves = 0;
  SUMMARY_PERIOD = '30d';
  loadFromSupabase = async function () {
    DB = JSON.parse(JSON.stringify(fixture.db));
    DB._userOwned = true;
    _previewMode = true;
    _sourcingRuns = JSON.parse(JSON.stringify(fixture.runs));
    _activeSourcingRun = null;
    _accounts = [];
    _jobLots = [];
    _jobLotItems = [];
    _saleReconciliations = [];
  };
  _hydrateUserSettings = async function () {};
  _startRealtimeSync = async function () {};
  _stopRealtimeSync = function () {};
  saveDB = function () { window.__landingCaptureLocalSaves++; };
  _readSyncClockRevision = async function () {};
  _refreshCloudOnResume = async function () { return false; };
}

module.exports = { buildFixture, installFixture };
