import test from 'node:test';
import assert from 'node:assert/strict';
import { canonBenchmark, createRecipe } from '../../worker/monitors/src/contracts.mjs';
import { createVintedSource, scanCatalog, retryAt } from '../../worker/monitors/src/adapters/vinted-source.mjs';

globalThis.fetch = () => { throw new Error('Real network forbidden in source tests'); };
const now = Date.parse('2026-09-24T09:00:00Z');
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const item = id => ({ id, title: 'Canon EOS 600D', price: { amount: '80', currency_code: 'GBP' } });

test('transport must be explicitly supplied', () => { assert.throws(() => createVintedSource()); });

test('requests preserve zero bounds, fixed host, newest order and manual redirect rejection', async () => {
  let calls = 0;
  const source = createVintedSource({ now: () => now, request: async (url, options) => {
    calls++; assert.equal(url.origin, 'https://www.vinted.co.uk'); assert.equal(url.searchParams.get('price_to'), '0.00');
    assert.equal(url.searchParams.get('order'), 'newest_first'); assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'GET'); assert.equal(options.headers.cookie, undefined);
    return json({ items: [item(1)] });
  } });
  const result = await source.searchPage({ searchText: 'Canon', maxPricePence: 0 });
  assert.equal(calls, 1); assert.equal(result.observedAt, new Date(now).toISOString()); assert.equal(result.listings[0].observedAt, result.observedAt);
});

test('HTTP rate limit and block responses propagate retry timing without retries', async () => {
  for (const status of [403, 429, 503, 404]) {
    let calls = 0;
    const source = createVintedSource({ now: () => now, request: async () => {
      calls++; return new Response('', { status, headers: { 'retry-after': '600' } });
    } });
    await assert.rejects(source.searchPage({ searchText: 'Canon' }), e => e.status === status && e.retryAt === now + 600000);
    assert.equal(calls, 1);
  }
  assert.equal(retryAt(new Date(now + 5000).toUTCString(), now, 100), now + 5000);
  assert.equal(retryAt('garbage', now, 100), now + 100);
});

test('malformed, non-JSON and oversized responses fail explicitly', async () => {
  const responses = [
    () => json({ message: 'changed API' }), () => new Response('<html>blocked</html>', { headers: { 'content-type': 'text/html' } }),
    () => new Response('{broken', { headers: { 'content-type': 'application/json' } }),
    () => json({ items: [item(1)] })
  ];
  for (let i = 0; i < responses.length; i++) {
    const source = createVintedSource({ request: async () => responses[i](), maxBytes: i === 3 ? 10 : 1000000 });
    await assert.rejects(source.searchPage({ searchText: 'Canon' }));
  }
});

test('requests are bounded even if a transport hangs and ignores abort', async () => {
  let signal;
  const source = createVintedSource({ timeoutMs: 10, request: async (_, options) => { signal = options.signal; return new Promise(() => {}); } });
  await assert.rejects(source.searchPage({ searchText: 'Canon' }), e => e.code === 'timeout');
  assert.equal(signal.aborted, true);
});

test('caller cancellation and invalid input make no request', async () => {
  let calls = 0;
  const source = createVintedSource({ request: async () => { calls++; return json({ items: [] }); } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(source.searchPage({ searchText: 'Canon', signal: controller.signal }), e => e.code === 'cancelled');
  for (const input of [{ searchText: '' }, { searchText: 'Canon', page: 0 }, { searchText: 'Canon', perPage: 500 },
    { searchText: 'Canon', minPricePence: 100, maxPricePence: 0 }]) await assert.rejects(source.searchPage(input));
  assert.equal(calls, 0);
});

test('timeout covers stalled response bodies as well as connection setup', async () => {
  let signal;
  const source = createVintedSource({ timeoutMs: 10, request: async (_, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ start(controller) {
      options.signal.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true });
    } }), { headers: { 'content-type': 'application/json' } });
  } });
  await assert.rejects(source.searchPage({ searchText: 'Canon' }), e => e.code === 'timeout');
  assert.equal(signal.aborted, true);
});

test('a rejected oversized response aborts its unread transport', async () => {
  let signal;
  const source = createVintedSource({ maxBytes: 10, request: async (_, options) => {
    signal = options.signal;
    return new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '5000' } });
  } });
  await assert.rejects(source.searchPage({ searchText: 'Canon' }), e => e.code === 'response_too_large');
  assert.equal(signal.aborted, true);
});

test('overlap pages deduplicate candidates while preserving first observation', async () => {
  const queries = [];
  const source = createVintedSource({ now: () => now + queries.length * 1000, request: async url => {
    queries.push(url.searchParams.get('search_text') + ':' + url.searchParams.get('page'));
    const page = Number(url.searchParams.get('page'));
    return json({ items: page === 1 ? [item(1), item(2)] : [item(2)] });
  } });
  const result = await scanCatalog({ source, recipe: canonBenchmark(), perPage: 2, maxPages: 2 });
  assert.equal(result.requests, 6); assert.equal(result.coverageComplete, true); assert.equal(result.listings.length, 2);
  assert.deepEqual(queries, ['Canon:1', 'Canon:2', 'EOS:1', 'EOS:2', 'Rebel:1', 'Rebel:2']);
  assert.equal(result.listings[0].observedAt, new Date(now + 1000).toISOString());
});

test('saturation and request budgets cannot masquerade as complete coverage', async () => {
  const source = createVintedSource({ request: async () => json({ items: [item(1)] }) });
  const result = await scanCatalog({ source, recipe: canonBenchmark(), perPage: 1, maxPages: 2, maxRequests: 2 });
  assert.equal(result.requests, 2); assert.equal(result.coverageComplete, false);
  assert.deepEqual(result.incomplete.map(i => i.reason), ['page_limit', 'request_budget', 'request_budget']);
  const empty = await scanCatalog({ source: createVintedSource({ request: async () => json({ items: [] }) }), recipe: canonBenchmark() });
  assert.equal(empty.coverageComplete, true); assert.equal(empty.listings.length, 0);
  const noQueries = createRecipe({ models: ['600D'] });
  await assert.rejects(scanCatalog({ source, recipe: noQueries }));
});

test('duplicate-filled full pages still trigger pagination', async () => {
  let calls = 0;
  const source = createVintedSource({ request: async () => { calls++; return json({ items: calls === 1 ? [item(1), item(1)] : [] }); } });
  const result = await scanCatalog({ source, recipe: createRecipe({ ...canonBenchmark(), searchTerms: ['Canon'] }), perPage: 2 });
  assert.equal(calls, 2); assert.equal(result.listings.length, 1); assert.equal(result.coverageComplete, true);
});
