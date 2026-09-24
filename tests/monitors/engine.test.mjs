import test from 'node:test';
import assert from 'node:assert/strict';
import { canon, canonBenchmark, createRecipe, decimalToPence } from '../../worker/monitors/src/contracts.mjs';
import { normalizeListing, normalizeSeller, mergeListing, listingUrl, parseSearchPage } from '../../worker/monitors/src/adapters/vinted-normalize.mjs';
import { hasTerm, matchListing } from '../../worker/monitors/src/engine/match.mjs';
import { assessSeller, evaluateListing } from '../../worker/monitors/src/engine/score.mjs';

// All data is synthetic. Tests must never discover a network transport implicitly.
globalThis.fetch = () => { throw new Error('Network forbidden in engine tests'); };
const time = '2026-09-24T09:00:00.000Z';
const benchmark = canonBenchmark();
function listing(overrides = {}, options = {}) {
  return normalizeListing({ id: 123, title: 'Canon EOS 600D', price: { amount: '80.00', currency_code: 'GBP' },
    status_title: 'Very good', user: { id: 10, feedback_count: 50, feedback_reputation: .98 }, ...overrides },
  { observedAt: time, detailComplete: true, ...options });
}
const buying = createRecipe({ models: ['600D'], searchTerms: ['Canon'], maxPricePence: 10000, notifyLevels: ['buy', 'snipe'] });
const costs = { verified: true, currency: 'GBP', buyerFeePence: 500, shippingPence: 300 };
const value = { model: '600D', currency: 'GBP', evidence: 'Synthetic test value, not market advice',
  asOf: '2026-09-23T00:00:00Z', validUntil: '2026-10-01T00:00:00Z', resaleLowPence: 16000, resaleHighPence: 17000, exitCostsPence: 1000 };
function score(l = listing(), recipe = buying, options = {}) {
  return evaluateListing(l, recipe, matchListing(l, recipe), { now: Date.parse(time), purchaseCosts: costs, valuation: value, ...options });
}

test('decimal money keeps unknown separate from zero and uses exact pence', () => {
  for (const missing of [null, undefined, '', '  ', { amount: null }]) assert.equal(decimalToPence(missing), null);
  assert.equal(decimalToPence(0), 0);
  assert.equal(decimalToPence('51.01'), 5101);
  assert.equal(decimalToPence(.29), 29);
  for (const bad of [true, false, -1, NaN, Infinity, '1e3', '12.345', '£80', [], 1000001]) assert.throws(() => decimalToPence(bad));
});

test('recipe validates bounds, types and immutable benchmark rules', () => {
  assert.equal(createRecipe({ models: ['600D'], maxPricePence: 0 }).maxPricePence, 0);
  for (const input of [
    { models: [] }, { models: ['alien'] }, { models: ['600D'], maxPricePence: NaN },
    { models: ['600D'], minPricePence: 500, maxPricePence: 400 }, { models: ['600D'], minReviews: -1 },
    { models: ['600D'], version: 2 }, { ...benchmark, conditions: ['good'] },
    { ...benchmark, rejectTerms: ['faulty'] }, { ...benchmark, zeroReviews: 'hide' },
    { ...benchmark, notifyLevels: ['check'] }, { ...benchmark, benchmark: 'false' }
  ]) assert.throws(() => createRecipe(input));
  assert.throws(() => benchmark.models.push('bad'));
});

test('all Canon and Rebel aliases match either inclusive benchmark boundary', () => {
  let cases = 0;
  for (const model of canon.models) for (const alias of model.aliases) for (const price of ['51.00', '100.00']) {
    const result = matchListing(listing({ title: alias.toUpperCase(), price, currency: 'GBP' }), benchmark);
    assert.equal(result.status, 'match', `${alias}/${price}`);
    assert.deepEqual(result.matchedModels, [model.id]); cases++;
  }
  assert.equal(cases, 66);
  for (const price of ['50.99', '100.01']) assert.equal(matchListing(listing({ price, currency: 'GBP' }), benchmark).status, 'reject');
  assert.equal(matchListing(listing({ title: 'Canon 1600D' }), benchmark).status, 'reject');
  assert.equal(matchListing(listing({ title: 'Canon Rebel T3i' }), benchmark).matchedModels[0], '600D');
});

test('benchmark faults and zero reviews remain visible without notifications', () => {
  for (const warning of benchmark.warningTerms) {
    const item = listing({ title: `Canon 600D ${warning}`, user: { id: 10, feedback_count: 0 } });
    const match = matchListing(item, benchmark);
    assert.equal(match.status, 'match'); assert(match.warnings.includes(warning));
    const evaluation = score(item, benchmark);
    assert.equal(evaluation.hidden, false); assert.equal(evaluation.decision, 'risky'); assert.equal(evaluation.notify, false);
  }
  assert.equal(score(listing(), benchmark).decision, 'check');
});

test('custom models are enforced and can extend Canon selection', () => {
  const custom = createRecipe({ kind: 'custom', customModels: ['MacBook Air M1'], maxPricePence: 10000 });
  assert.equal(matchListing(listing({ title: 'Unrelated laptop' }), custom).status, 'reject');
  assert.equal(matchListing(listing({ title: 'MacBook Air M1 256GB' }), custom).status, 'match');
  const extended = createRecipe({ models: ['600D'], customModels: ['EOS R50'] });
  assert.equal(matchListing(listing({ title: 'Canon EOS R50' }), extended).status, 'match');
  assert.equal(matchListing(listing({ price: '0', currency: 'GBP' }), createRecipe({ models: ['600D'], maxPricePence: 0 })).status, 'match');
  assert.equal(matchListing(listing({ price: '0.01', currency: 'GBP' }), createRecipe({ models: ['600D'], maxPricePence: 0 })).status, 'reject');
});

test('model/condition/description gaps await detail rather than losing candidates', () => {
  const raw = listing({ title: 'Digital camera', description: null }, { detailComplete: false });
  assert.equal(matchListing(raw, benchmark).status, 'pending');
  const detail = listing({ title: null, description: 'Canon EOS 600D body' });
  assert.equal(matchListing(mergeListing(raw, detail), benchmark).status, 'match');
  const strict = createRecipe({ models: ['600D'], conditions: ['good'], rejectTerms: ['faulty'] });
  assert.equal(matchListing(listing({ status_title: null }, { detailComplete: false }), strict).status, 'pending');
  assert.equal(matchListing(listing({ status_title: null }), strict).status, 'reject');
  assert.equal(matchListing(listing({ status_title: 'Good' }, { detailComplete: false }), strict).status, 'pending');
  assert.equal(matchListing(listing({ status_title: 'Good', description: 'faulty shutter' }), strict).status, 'reject');
});

test('possible accessories stay visible with warnings rather than creating false buys', () => {
  const item = listing({ title: 'Battery charger for Canon 600D' });
  assert.equal(matchListing(item, benchmark).status, 'match');
  assert(matchListing(item, benchmark).warnings.includes('possible_accessory_only'));
  assert.equal(matchListing(item, buying).status, 'match');
  assert.equal(score(item, buying).decision, 'check');
  const body = listing({ title: 'Canon 600D with no charger' });
  assert(matchListing(body, benchmark).warnings.includes('no charger'));
});

test('matching escapes regex terms and respects word/alias boundaries', () => {
  assert(hasTerm('Camera (test)', '(test)'));
  assert.equal(hasTerm('600D', '600'), false);
  assert.equal(hasTerm('Rebel T3i', 'Rebel T3'), false);
  assert.equal(hasTerm('unbroken camera', 'broken'), false);
});

test('unknown and foreign currency never create GBP matches', () => {
  assert.equal(matchListing(listing({ price: '80', currency: 'EUR' }), benchmark).reason, 'currency');
  assert.equal(matchListing(listing({ price: '80' }), benchmark).status, 'reject');
  assert.equal(matchListing(listing({ price: null }, { detailComplete: false }), benchmark).status, 'pending');
});

test('sparse detail preserves title, photos, seller and first observation', () => {
  const catalog = listing({ photos: [{ url: 'https://images1.vinted.net/photo.jpg' }], url: '/items/123-camera' }, { detailComplete: false });
  const detail = normalizeListing({ id: 123 }, { observedAt: '2026-09-24T09:00:10Z', detailComplete: true });
  const merged = mergeListing(catalog, detail);
  assert.equal(merged.title, catalog.title); assert.deepEqual(merged.imageUrls, catalog.imageUrls);
  assert.deepEqual(merged.seller, catalog.seller); assert.equal(merged.observedAt, time);
  assert.equal(merged.itemPricePence, 8000); assert.equal(merged.detailComplete, true);
  const zero = listing({ user: { id: 10, feedback_count: 0, feedback_reputation: 0 } });
  assert.equal(mergeListing(catalog, zero).seller.reviews, 0);
  assert.equal(mergeListing(catalog, zero).seller.rating, 0);
  assert.throws(() => mergeListing(catalog, listing({ id: 124 })));
  assert.throws(() => mergeListing(catalog, listing({ currency: 'EUR' })));
  const changedSeller = mergeListing(catalog, listing({ user: { id: 11 } }));
  assert.equal(changedSeller.seller.reviews, null);
});

test('links cannot carry unsafe schemes, hosts, credentials or a different listing', () => {
  for (const value of ['javascript:alert(1)', 'https://evil.test/items/123', '//evil.test/items/123',
    'https://vinted.co.uk.evil.test/items/123', 'https://user@www.vinted.co.uk/items/123',
    'https://www.vinted.co.uk/items/124', 'https://www.vinted.co.uk:444/items/123']) assert.equal(listingUrl(value, '123'), null);
  assert.equal(listingUrl('/items/123-name?x=1#fragment', '123'), 'https://www.vinted.co.uk/items/123');
  assert.deepEqual(listing({ photos: [{ url: 'https://evil.test/a' }, { url: 'data:image/png;base64,bad' }] }).imageUrls, []);
});

test('malformed catalog responses fail instead of silently completing an empty scan', () => {
  for (const payload of [{ error: 'blocked' }, null, [], { items: {} }, { items: [{ title: 'no id' }] },
    { items: [{ id: 123, price: false }] }, { items: [{ id: 123, price: 'NaN' }] }]) {
    assert.throws(() => parseSearchPage(payload, { observedAt: time }));
  }
  assert.deepEqual(parseSearchPage({ items: [] }, { observedAt: time }), []);
  assert.equal(parseSearchPage({ items: [{ id: 123 }, { id: 123 }] }, { observedAt: time }).length, 1);
  const duplicate = parseSearchPage({ items: [{ id: 123, title: 'Canon 600D', price: '80', currency: 'GBP' }, { id: 123 }] }, { observedAt: time });
  assert.equal(duplicate[0].title, 'Canon 600D'); assert.equal(duplicate[0].itemPricePence, 8000);
});

test('seller fields distinguish missing counts, complete zero and explicit scales', () => {
  assert.equal(normalizeSeller({}).reviews, null);
  assert.equal(normalizeSeller({ positive_feedback_count: 0 }).reviews, null);
  assert.equal(normalizeSeller({ positive_feedback_count: 0, negative_feedback_count: 0, neutral_feedback_count: 0 }).reviews, 0);
  assert.equal(normalizeSeller({ feedback_reputation: 1 }).rating, 5);
  assert.equal(normalizeSeller({ feedback_reputation: 1 }, { ratingScale: 'stars' }).rating, 1);
  assert.equal(normalizeSeller({ feedback_reputation: 4.8 }).rating, null);
  assert.equal(normalizeSeller({ feedback_count: -1 }).reviews, null);
  assert.throws(() => normalizeSeller({}, { ratingScale: 'guess' }));
});

test('zero-review policies are distinct; allowed does not imply established', () => {
  const seller = { reviews: 0, rating: null };
  assert.equal(assessSeller(seller, buying).risk, 'high');
  assert.equal(assessSeller(seller, createRecipe({ ...buying, zeroReviews: 'allow' })).risk, 'unknown');
  assert.equal(assessSeller(seller, createRecipe({ ...buying, zeroReviews: 'hide' })).hidden, true);
});

test('unknown delivered costs cannot inflate profit or trigger a buy', () => {
  const item = listing({ total_item_price: null });
  const result = score(item, buying, { purchaseCosts: null });
  assert.equal(result.landedCostPence, null); assert.equal(result.projectedProfitPence, null);
  assert.equal(result.decision, 'check'); assert.equal(result.notify, false);
  assert.equal(score(item, buying, { purchaseCosts: { ...costs, shippingPence: null } }).landedCostPence, null);
  assert.equal(score(item, buying, { purchaseCosts: { ...costs, verified: false } }).landedCostPence, null);
  assert.equal(score(listing({ total_item_price: '0' }), buying, { purchaseCosts: null }).landedCostPence, null);
});

test('verified costs use each component once and conservative evidenced valuation', () => {
  const result = score();
  assert.equal(result.landedCostPence, 8800); assert.equal(result.projectedProfitPence, 6200);
  assert.equal(result.roiPercent, 70.45); assert.equal(result.decision, 'snipe'); assert.equal(result.notify, true);
  assert.equal(score(listing(), buying, { purchaseCosts: { ...costs, buyerFeePence: 0, shippingPence: 0 } }).landedCostPence, 8000);
  assert.throws(() => score(listing(), buying, { purchaseCosts: { ...costs, shippingPence: -1 } }));
});

test('stale/mismatched/missing valuations cannot produce profit recommendations', () => {
  for (const valuation of [null, { ...value, model: '700D' }, { ...value, evidence: '' },
    { ...value, validUntil: '2026-09-20T00:00:00Z' }, { ...value, resaleLowPence: null },
    { ...value, exitCostsPence: null }, { ...value, currency: 'EUR' }]) {
    const result = score(listing(), buying, { valuation });
    assert.equal(result.decision, 'check'); assert.equal(result.projectedProfitPence, null);
  }
  assert.throws(() => score(listing(), buying, { valuation: { ...value, resaleHighPence: 1 } }));
});

test('warnings, missing details and seller uncertainty suppress economic buy decisions', () => {
  const warningRecipe = createRecipe({ ...buying, warningTerms: ['no charger'] });
  assert.equal(score(listing({ title: 'Canon 600D no charger' }), warningRecipe).decision, 'check');
  assert.equal(score(listing({}, { detailComplete: false })).decision, 'check');
  assert.equal(score(listing({ user: { id: 10 } })).decision, 'check');
  assert.equal(score(listing({ user: { id: 10, feedback_count: 0 } })).decision, 'risky');
  assert.equal(score(listing(), createRecipe({ ...buying, minProfitPence: 7000 })).decision, 'check');
});
