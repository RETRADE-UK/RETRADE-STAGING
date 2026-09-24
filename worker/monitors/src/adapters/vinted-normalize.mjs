/** Experimental provider boundary. No requests or credentials in this module. */
import { decimalToPence, isRecord } from '../contracts.mjs';

export class ProviderContractError extends Error {
  constructor(message) { super(message); this.name = 'ProviderContractError'; }
}

function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function first(...values) { return values.find(v => v !== null && v !== undefined && v !== '') ?? null; }
function id(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value) ? value : null;
}
function number(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function count(value) { const n = number(value); return Number.isSafeInteger(n) && n >= 0 ? n : null; }

export function listingUrl(value, expectedId) {
  const listingId = id(expectedId);
  if (!listingId) return null;
  const canonical = `https://www.vinted.co.uk/items/${listingId}`;
  if (value == null || value === '') return canonical;
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, 'https://www.vinted.co.uk');
    if (url.protocol !== 'https:' || !['www.vinted.co.uk', 'vinted.co.uk'].includes(url.hostname)
      || url.username || url.password || url.port || !new RegExp(`^/items/${listingId}(?:-[^/]*)?/?$`).test(url.pathname)) return null;
    // Drop provider query/fragment and preserve a known canonical navigation URL.
    return canonical;
  } catch { return null; }
}

function photoUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (!(url.hostname === 'vinted.net' || url.hostname.endsWith('.vinted.net'))) return null;
    return url.href;
  } catch { return null; }
}

function condition(value) {
  const v = text(value)?.toLowerCase().replace(/[ _]+/g, '_');
  return ({ new: 'new', new_with_tags: 'new', new_without_tags: 'new', very_good: 'very_good', good: 'good', satisfactory: 'satisfactory' })[v] ?? null;
}

export function normalizeSeller(raw, { ratingScale = 'fraction' } = {}) {
  if (!['fraction', 'stars'].includes(ratingScale)) throw new TypeError('Explicit rating scale required');
  if (!isRecord(raw)) raw = {};
  const direct = count(raw.feedback_count);
  const parts = [raw.positive_feedback_count, raw.neutral_feedback_count, raw.negative_feedback_count].map(count);
  // A partial breakdown must not be mistaken for a complete count or zero.
  const reviews = direct ?? (parts.every(n => n !== null) ? parts.reduce((a, b) => a + b, 0) : null);
  const reputation = number(raw.feedback_reputation);
  const max = ratingScale === 'fraction' ? 1 : 5;
  const rating = reputation !== null && reputation >= 0 && reputation <= max
    ? Math.round(reputation * (ratingScale === 'fraction' ? 5 : 1) * 100) / 100 : null;
  return { id: id(raw.id), username: text(first(raw.login, raw.username)), reviews, rating };
}

export function normalizeListing(raw, { observedAt, detailComplete = false, ratingScale = 'fraction' } = {}) {
  if (!isRecord(raw)) throw new ProviderContractError('Listing must be an object');
  const listingId = id(first(raw.id, raw.item_id));
  if (!listingId) throw new ProviderContractError('Listing ID missing or invalid');
  if (typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))) throw new TypeError('Valid observation timestamp required');
  let itemPricePence, quotedTotalPence;
  try {
    itemPricePence = decimalToPence(first(raw.price, raw.price_numeric, raw.price_amount));
    quotedTotalPence = decimalToPence(first(raw.total_item_price, raw.total_item_price_numeric, raw.total_price));
  } catch { throw new ProviderContractError('Listing contains invalid money'); }
  const currency = text(first(raw.currency, raw.price?.currency_code, raw.price?.currency))?.toUpperCase() ?? null;
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) throw new ProviderContractError('Invalid currency');
  const photos = Array.isArray(raw.photos) ? raw.photos : [];
  const images = [...new Set([raw.photo, ...photos].filter(isRecord)
    .map(p => photoUrl(first(p.url, p.full_size_url, p.image_url))).filter(Boolean))];
  return {
    version: 1, platform: 'vinted', id: listingId,
    url: listingUrl(first(raw.url, raw.path), listingId),
    title: text(first(raw.title, raw.name)), description: text(first(raw.description, raw.body)),
    itemPricePence, quotedTotalPence, currency,
    // Provider 'total_item_price' has no validated delivery-cost guarantee.
    // Do not present it as landed cost or use it for buy scoring.
    condition: condition(first(raw.status_title, raw.condition)),
    brand: text(first(raw.brand_title, raw.brand?.title, raw.brand)), imageUrls: images,
    seller: normalizeSeller(first(raw.user, raw.seller), { ratingScale }),
    observedAt: new Date(observedAt).toISOString(), detailComplete: detailComplete === true
  };
}

function mergeKnown(previous, incoming) {
  return Object.fromEntries(Object.keys(previous).map(key => [key,
    incoming[key] == null || (Array.isArray(incoming[key]) && !incoming[key].length) ? previous[key] : incoming[key]]));
}

export function mergeListing(catalog, detail) {
  if (catalog.id !== detail.id || catalog.platform !== detail.platform) throw new ProviderContractError('Detail belongs to a different listing');
  if (catalog.currency && detail.currency && catalog.currency !== detail.currency) throw new ProviderContractError('Listing currency changed');
  const sellerChanged = detail.seller.id !== null && catalog.seller.id !== null && detail.seller.id !== catalog.seller.id;
  const result = mergeKnown(catalog, detail);
  result.seller = sellerChanged ? detail.seller : mergeKnown(catalog.seller, detail.seller);
  result.observedAt = Date.parse(catalog.observedAt) <= Date.parse(detail.observedAt) ? catalog.observedAt : detail.observedAt;
  result.detailComplete = catalog.detailComplete || detail.detailComplete;
  return result;
}

export function parseSearchPage(payload, options) {
  if (!isRecord(payload) || !Array.isArray(payload.items)) throw new ProviderContractError('Catalog response missing items array');
  if (payload.items.length > 100) throw new ProviderContractError('Catalog page exceeds supported bound');
  const listings = payload.items.map(raw => normalizeListing(raw, options));
  // No raw payload persisted here; caller receives the minimum normalized shape.
  const unique = new Map();
  for (const listing of listings) {
    const previous = unique.get(listing.id);
    unique.set(listing.id, previous ? mergeListing(previous, listing) : listing);
  }
  return [...unique.values()];
}
