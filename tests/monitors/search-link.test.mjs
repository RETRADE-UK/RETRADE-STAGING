import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVintedSearchUrl, buildVintedSearchParams, sourceSearchKey } from '../../worker/monitors/src/search-link.mjs';

globalThis.fetch = () => { throw new Error('Network forbidden in offline search-link tests'); };
const base = 'https://www.vinted.co.uk/catalog';
const shared = 'search_id=1483763887&order=newest_first&catalog[]=3075&page=1&';
const filters = 'status_ids[]=2&status_ids[]=3&status_ids[]=4&status_ids[]=1&status_ids[]=6&currency=GBP&search_by_image_uuid=&search_by_image_id=&brand_ids[]=217414&';
const links = [
  `${base}?${shared}time=1785357197&${filters}price_to=50`,
  `${base}?${shared}time=1785357385&${filters}price_to=100&price_from=51`,
  `${base}?${shared}time=1785357430&${filters}price_to=200&price_from=101`,
  `${base}?${shared}time=1785357503&${filters}price_to=300&price_from=201`,
];

test('all four supplied links preserve filters, no keywords and exact price bands', () => {
  const expected = [[0, 5000], [5100, 10000], [10100, 20000], [20100, 30000]];
  links.forEach((link, i) => {
    const config = parseVintedSearchUrl(link);
    assert.deepEqual([config.minPricePence, config.maxPricePence], expected[i]);
    assert.equal(config.originalUrl, link);
    assert.equal(config.searchText, '');
    assert.deepEqual(config.catalogIds, [3075]);
    assert.deepEqual(config.brandIds, [217414]);
    assert.deepEqual(config.statusIds, [1, 2, 3, 4, 6]);
    assert.equal(config.currency, 'GBP');
    assert.equal(config.order, 'newest_first');
    const params = buildVintedSearchParams(config);
    assert.equal(params.has('search_text'), false);
    assert.equal(params.get('catalog_ids'), '3075');
    assert.equal(params.get('brand_ids'), '217414');
    assert.equal(params.get('status_ids'), '1,2,3,4,6');
    assert.equal(params.get('page'), '1');
    assert.equal(params.get('per_page'), '50');
    assert.equal(params.get('price_to'), (expected[i][1] / 100).toFixed(2));
    for (const key of ['search_id', 'time', 'search_by_image_uuid', 'search_by_image_id']) {
      assert.equal(params.has(key), false);
      assert.equal(new URL(config.canonicalUrl).searchParams.has(key), false);
    }
    assert.equal(new URL(config.canonicalUrl).searchParams.has('page'), false);
    const roundTrip = parseVintedSearchUrl(config.canonicalUrl);
    assert.equal(roundTrip.canonicalUrl, config.canonicalUrl);
    assert.equal(sourceSearchKey(roundTrip), sourceSearchKey(config));
  });
});

test('price gaps are retained and decimal boundaries are exact', () => {
  const configs = links.map(parseVintedSearchUrl);
  for (let i = 1; i < configs.length; i++)
    assert.equal(configs[i].minPricePence - configs[i - 1].maxPricePence, 100);
  const pennies = parseVintedSearchUrl(`${base}?price_from=50.01&price_to=100.01`);
  assert.equal(pennies.minPricePence, 5001);
  assert.equal(pennies.maxPricePence, 10001);
  const zero = parseVintedSearchUrl(`${base}?price_to=0`);
  assert.equal(zero.maxPricePence, 0);
  assert.equal(buildVintedSearchParams(zero).get('price_to'), '0.00');
  assert.equal(parseVintedSearchUrl(base).maxPricePence, null);
});

test('normalized configuration and every facet array are immutable', () => {
  const config = parseVintedSearchUrl(links[0]);
  assert(Object.isFrozen(config));
  for (const value of Object.values(config)) if (Array.isArray(value)) assert(Object.isFrozen(value));
  assert.throws(() => { config.brandIds.push(1); }, TypeError);
  assert.throws(() => { config.searchText = 'changed'; }, TypeError);
});

test('all supported facets survive canonical links and candidate API parameters', () => {
  const config = parseVintedSearchUrl(`${base}?catalog%5B%5D=3&catalog[]=1&catalog[]=3&brand_ids[]=2&status_ids[]=6&size_ids[]=4&color_ids[]=5&material_ids[]=7&video_game_platform_ids[]=8`);
  assert.deepEqual(config.catalogIds, [1, 3]);
  const params = buildVintedSearchParams(config, {page: 2, perPage: 100});
  assert.deepEqual(Object.fromEntries(params), { order: 'newest_first', currency: 'GBP',
    catalog_ids: '1,3', brand_ids: '2', status_ids: '6', size_ids: '4', color_ids: '5',
    material_ids: '7', video_game_platform_ids: '8', page: '2', per_page: '100' });
  assert.deepEqual(parseVintedSearchUrl(config.canonicalUrl).videoGamePlatformIds, [8]);
});

test('source key excludes prices/tracking but distinguishes every non-price filter', () => {
  const configs = links.map(parseVintedSearchUrl);
  assert.equal(new Set(configs.map(sourceSearchKey)).size, 1);
  const config = configs[0], key = sourceSearchKey(config);
  for (const field of ['catalogIds', 'brandIds', 'statusIds', 'sizeIds', 'colorIds', 'materialIds', 'videoGamePlatformIds'])
    assert.notEqual(sourceSearchKey({...config, [field]: [99]}), key);
  assert.notEqual(sourceSearchKey({...config, searchText: 'Canon'}), key);
  const reverse = {...config, statusIds: [6, 4, 3, 2, 1, 2]};
  assert.equal(sourceSearchKey(reverse), key);
  assert.equal(sourceSearchKey({...config, originalUrl: 'ignored', canonicalUrl: 'ignored'}), key);
});

test('keywords are optional and encoded without changing their content', () => {
  const config = parseVintedSearchUrl(`${base}?search_text=Canon+EOS+%26+Rebel`);
  assert.equal(config.searchText, 'Canon EOS & Rebel');
  assert.equal(buildVintedSearchParams(config).get('search_text'), 'Canon EOS & Rebel');
  assert.equal(parseVintedSearchUrl(`${base}?search_text=`).searchText, '');
  assert.equal(buildVintedSearchParams(parseVintedSearchUrl(`${base}?search_text=+`)).has('search_text'), false);
});

test('conflicting singleton values fail instead of using the first or last', () => {
  for (const tail of ['price_from=1&price_from=2', 'price_to=50&price_to=100',
    'search_text=Canon&search_text=Rebel', 'currency=GBP&currency=EUR', 'order=newest_first&order=relevance'])
    assert.throws(() => parseVintedSearchUrl(`${base}?${tail}`), /Conflicting/);
  assert.equal(parseVintedSearchUrl(`${base}?price_to=50&price_to=50`).maxPricePence, 5000);
});

test('unknown filters and nonempty image searches fail rather than broaden scope', () => {
  for (const tail of ['seller_id=1', 'is_for_swap=1', 'catalog_ids=3075', 'brand_ids=217414',
    'unknown=', 'search_by_image_id=abc', 'search_by_image_uuid=abc', 'search_by_image_uuid=&search_by_image_uuid=abc'])
    assert.throws(() => parseVintedSearchUrl(`${base}?${tail}`), /Unsupported|Image searches/);
});

test('unsafe destinations, fragments, credentials and escaped markdown are rejected', () => {
  for (const link of ['http://www.vinted.co.uk/catalog', 'https://www.vinted.fr/catalog',
    'https://www.vinted.co.uk.evil.example/catalog', 'https://vinted.co.uk@evil.example/catalog',
    'https://user:pass@www.vinted.co.uk/catalog', 'https://www.vinted.co.uk:443/catalog',
    'https://www.vinted.co.uk./catalog', `${base}/123`, `${base}#`, `${base}#filters`,
    'https://www.vinted.co.uk/items/1', `${base}?catalog\\[\\]=3075`, `${base}?price_to=50\\&price_from=0`,
    `[link](${links[0]})`, `${base}?search_text=bad value`, `${base}?search_text=%zz`])
    assert.throws(() => parseVintedSearchUrl(link), TypeError, link);
  assert.equal(parseVintedSearchUrl('https://vinted.co.uk/catalog/').currency, 'GBP');
});

test('invalid prices, foreign currency, unsupported ordering and IDs are rejected', () => {
  for (const value of ['', '-1', '1.001', 'NaN', 'Infinity', '1e2', '+1', '1000000.01', '1,000', '%20'])
    assert.throws(() => parseVintedSearchUrl(`${base}?price_to=${value}`), TypeError, value);
  assert.throws(() => parseVintedSearchUrl(`${base}?price_from=2&price_to=1`), /range/);
  assert.throws(() => parseVintedSearchUrl(`${base}?currency=EUR`), /GBP/);
  assert.throws(() => parseVintedSearchUrl(`${base}?order=relevance`), /ordering/);
  for (const value of ['', '0', '-1', '1.5', '01', '1,2', '1e3', '9007199254740992'])
    assert.throws(() => parseVintedSearchUrl(`${base}?catalog[]=${value}`), TypeError, value);
  assert.throws(() => parseVintedSearchUrl(`${base}?${Array(101).fill('catalog[]=1').join('&')}`), /catalogIds/);
});

test('builders validate configurations and pagination independently of parsing', () => {
  const config = parseVintedSearchUrl(links[0]);
  for (const changed of [{catalogIds: [true]}, {brandIds: [-1]}, {catalogIds: null}, {searchText: null},
    {minPricePence: null}, {minPricePence: 1.1},
    {maxPricePence: Infinity}, {currency: 'EUR'}, {order: 'relevance'}, {unsupported: 1}, {version: 2}]) {
    assert.throws(() => buildVintedSearchParams({...config, ...changed}), TypeError);
    assert.throws(() => sourceSearchKey({...config, ...changed}), TypeError);
  }
  for (const opts of [{page: 0}, {page: 101}, {page: 1.5}, {perPage: 0}, {perPage: 101}, {perPage: '50'}])
    assert.throws(() => buildVintedSearchParams(config, opts), /pagination/);
  for (const value of [null, undefined, [], 'url']) assert.throws(() => buildVintedSearchParams(value), TypeError);
});
