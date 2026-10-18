/** Offline URL analysis only. No requests, credentials, or runtime activation.
 * API facet names follow a public reference implementation, not a verified
 * current provider contract. Validate that contract before connecting transport. */
const FACETS = Object.freeze([
  ['catalog[]', 'catalogIds', 'catalog_ids'],
  ['brand_ids[]', 'brandIds', 'brand_ids'],
  ['status_ids[]', 'statusIds', 'status_ids'],
  ['size_ids[]', 'sizeIds', 'size_ids'],
  ['color_ids[]', 'colorIds', 'color_ids'],
  ['material_ids[]', 'materialIds', 'material_ids'],
  ['video_game_platform_ids[]', 'videoGamePlatformIds', 'video_game_platform_ids'],
].map(Object.freeze));
const SINGLETONS = ['search_text', 'price_from', 'price_to', 'currency', 'order'];
const IGNORED = ['search_id', 'time', 'page'];
const IMAGE = ['search_by_image_uuid', 'search_by_image_id'];
const CONFIG_KEYS = new Set(['version', 'originalUrl', 'canonicalUrl', 'searchText',
  'minPricePence', 'maxPricePence', 'currency', 'order', ...FACETS.map(x => x[1])]);
const MAX_PENCE = 100_000_000;

function fail(message) { throw new TypeError(message); }
function money(value, name, nullable = false) {
  if (value === null && nullable) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_PENCE)
    fail(`${name} must be integer pence between 0 and ${MAX_PENCE}`);
  return value;
}
function decimal(value, name) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) fail(`Invalid ${name}`);
  const [whole, fraction = ''] = value.split('.');
  return money(Number(whole) * 100 + Number(fraction.padEnd(2, '0')), name);
}
function ids(values, name) {
  if (!Array.isArray(values) || values.length > 100) fail(`Invalid ${name}`);
  const result = values.map(value => {
    if (typeof value !== 'number' && typeof value !== 'string') fail(`Invalid ${name}`);
    if (!/^[1-9]\d*$/.test(String(value))) fail(`Invalid ${name}`);
    const n = Number(value);
    if (!Number.isSafeInteger(n)) fail(`Invalid ${name}`);
    return n;
  });
  return Object.freeze([...new Set(result)].sort((a, b) => a - b));
}
function normalize(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('Search configuration required');
  if (Object.keys(config).some(key => !CONFIG_KEYS.has(key))) fail('Unsupported search configuration field');
  if (config.version !== undefined && config.version !== 1) fail('Unsupported search version');
  const searchText = config.searchText === undefined ? '' : config.searchText;
  if (typeof searchText !== 'string' || searchText.length > 200 || /[\u0000-\u001f\u007f\\]/.test(searchText))
    fail('Invalid search text');
  if (config.currency !== undefined && config.currency !== 'GBP') fail('Only GBP searches are supported');
  if (config.order !== undefined && config.order !== 'newest_first') fail('Use newest_first ordering');
  const result = { version: 1, searchText: searchText.trim(), currency: 'GBP', order: 'newest_first',
    minPricePence: money(config.minPricePence === undefined ? 0 : config.minPricePence, 'Minimum price'),
    maxPricePence: money(config.maxPricePence === undefined ? null : config.maxPricePence, 'Maximum price', true) };
  if (result.maxPricePence !== null && result.maxPricePence < result.minPricePence) fail('Invalid price range');
  for (const [, field] of FACETS) result[field] = ids(config[field] === undefined ? [] : config[field], field);
  return result;
}
function singleton(params, name) {
  const values = params.getAll(name);
  if (new Set(values).size > 1) fail(`Conflicting ${name} values`);
  return values.length ? values[0] : undefined;
}
function paramsFor(config, api) {
  const params = new URLSearchParams();
  params.set('order', config.order);
  params.set('currency', config.currency);
  if (config.searchText) params.set('search_text', config.searchText);
  for (const [web, field, remote] of FACETS) {
    if (api && config[field].length) params.set(remote, config[field].join(','));
    else if (!api) for (const id of config[field]) params.append(web, String(id));
  }
  if (config.minPricePence !== 0) params.set('price_from', (config.minPricePence / 100).toFixed(2));
  if (config.maxPricePence !== null) params.set('price_to', (config.maxPricePence / 100).toFixed(2));
  return params;
}

/** Parse a raw, unescaped Vinted UK catalogue URL without requesting it.
 * Unknown filters fail closed; image-search payloads require a separate contract.
 * Missing/blank keywords remain blank. Price gaps in imported links are preserved. */
export function parseVintedSearchUrl(value) {
  if (typeof value !== 'string' || value.length > 10_000) fail('Vinted search URL required');
  const originalUrl = value.trim();
  if (/[\\\u0000-\u0020\u007f#]/.test(originalUrl) || /%(?![\da-f]{2})/i.test(originalUrl))
    fail('Use a raw URL without backslashes, spaces, controls or fragments');
  // Checking raw authority also rejects explicit ports and URL-parser rewrites.
  if (!/^https:\/\/(?:www\.)?vinted\.co\.uk\/catalog\/?(?:\?|$)/i.test(originalUrl))
    fail('Use an HTTPS Vinted UK catalogue URL');
  let url;
  try { url = new URL(originalUrl); } catch { fail('Invalid search URL'); }
  if (url.protocol !== 'https:' || !['vinted.co.uk', 'www.vinted.co.uk'].includes(url.hostname)
    || !['/catalog', '/catalog/'].includes(url.pathname) || url.username || url.password || url.port || url.hash)
    fail('Use an HTTPS Vinted UK catalogue URL');
  const params = url.searchParams;
  const allowed = new Set([...SINGLETONS, ...IGNORED, ...IMAGE, ...FACETS.map(x => x[0])]);
  for (const [key, item] of params) {
    if (!allowed.has(key)) fail(`Unsupported search parameter: ${key}`);
    if (IMAGE.includes(key) && item !== '') fail('Image searches are not supported');
  }
  const values = Object.fromEntries(SINGLETONS.map(key => [key, singleton(params, key)]));
  const input = { searchText: values.search_text ?? '', currency: values.currency, order: values.order,
    minPricePence: values.price_from === undefined ? 0 : decimal(values.price_from, 'price_from'),
    maxPricePence: values.price_to === undefined ? null : decimal(values.price_to, 'price_to') };
  for (const [web, field] of FACETS) input[field] = params.getAll(web);
  const config = normalize(input);
  return Object.freeze({ ...config, originalUrl,
    canonicalUrl: 'https://www.vinted.co.uk/catalog?' + paramsFor(config, false) });
}

/** Candidate API serialization for offline fixtures; no endpoint is selected.
 * A successful local test is not evidence the current provider accepts these keys. */
export function buildVintedSearchParams(input, { page = 1, perPage = 50 } = {}) {
  const config = normalize(input);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100
    || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) fail('Invalid pagination');
  const params = paramsFor(config, true);
  params.set('page', String(page));
  params.set('per_page', String(perPage));
  return params;
}

/** Non-price source identity only. A caller must additionally scope it by owner.
 * No provenance, pagination, price band, tracking IDs or timestamps enter this key. */
export function sourceSearchKey(input) {
  const config = normalize(input);
  const identity = { version: 1, market: 'vinted-uk', searchText: config.searchText,
    currency: config.currency, order: config.order };
  for (const [, field] of FACETS) identity[field] = config[field];
  return JSON.stringify(identity);
}
