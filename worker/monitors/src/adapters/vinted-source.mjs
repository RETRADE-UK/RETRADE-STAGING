/** Experimental read-only source. Transport must be injected explicitly.
 * No cookies, sign-in, bypass, automatic retries or deployment entry point. */
import { createRecipe, pence } from '../contracts.mjs';
import { ProviderContractError, parseSearchPage, mergeListing } from './vinted-normalize.mjs';

export class SourceError extends Error {
  constructor(code, { status = null, retryAt = null } = {}) {
    super(code); this.name = 'SourceError'; this.code = code; this.status = status; this.retryAt = retryAt;
  }
}

export function retryAt(header, now, fallbackMs) {
  if (typeof header === 'string' && /^\d+(?:\.\d+)?$/.test(header.trim())) {
    const delay = Number(header) * 1000;
    if (Number.isSafeInteger(Math.ceil(delay)) && now + delay <= 8.64e15) return now + Math.ceil(delay);
  }
  const date = typeof header === 'string' ? Date.parse(header) : NaN;
  return Number.isFinite(date) && date > now ? date : now + fallbackMs;
}

async function readJson(response, maxBytes) {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new SourceError('unexpected_content_type');
  const length = Number(response.headers.get('content-length'));
  if (length > maxBytes) throw new SourceError('response_too_large');
  if (!response.body) throw new SourceError('empty_body');
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new SourceError('response_too_large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const joined = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(joined)); }
  catch { throw new SourceError('invalid_json'); }
}

export function createVintedSource({ request, now = Date.now, timeoutMs = 10000, maxBytes = 1000000 } = {}) {
  if (typeof request !== 'function') throw new TypeError('Explicit request transport required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('Invalid timeout');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 5000000) throw new TypeError('Invalid response bound');
  return {
    async searchPage({ searchText, minPricePence = 0, maxPricePence = null, page = 1, perPage = 50, signal } = {}) {
      if (typeof searchText !== 'string' || !searchText.trim() || searchText.length > 200) throw new TypeError('Search text required');
      pence(minPricePence, 'minPricePence', false); pence(maxPricePence, 'maxPricePence');
      if (maxPricePence !== null && maxPricePence < minPricePence) throw new TypeError('Invalid price range');
      if (!Number.isSafeInteger(page) || page < 1 || page > 100 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) throw new TypeError('Invalid pagination');
      if (signal?.aborted) throw new SourceError('cancelled');
      const url = new URL('https://www.vinted.co.uk/api/v2/catalog/items');
      const params = { search_text: searchText.trim(), price_from: (minPricePence / 100).toFixed(2),
        currency: 'GBP', order: 'newest_first', page, per_page: perPage };
      if (maxPricePence !== null) params.price_to = (maxPricePence / 100).toFixed(2);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
      const controller = new AbortController();
      let timer, onAbort;
      const aborted = new Promise((_, reject) => {
        const stop = code => { controller.abort(); reject(new SourceError(code)); };
        onAbort = () => stop('cancelled');
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => stop('timeout'), timeoutMs);
      });
      try {
        return await Promise.race([aborted, (async () => {
          const response = await request(url, { method: 'GET', redirect: 'error', signal: controller.signal,
            headers: { accept: 'application/json', 'user-agent': 'RETRADE-Monitor/1.0' } });
          const observedAt = new Date(now()).toISOString();
          if (!response.ok) {
            await response.body?.cancel().catch(() => {});
            const delay = response.status === 403 ? 300000 : 120000;
            throw new SourceError(response.status === 429 ? 'rate_limited' : response.status === 403 ? 'blocked' : 'http_error',
              { status: response.status, retryAt: retryAt(response.headers.get('retry-after'), now(), delay) });
          }
          const payload = await readJson(response, maxBytes);
          const listings = parseSearchPage(payload, { observedAt });
          if (payload.items.length > perPage) throw new ProviderContractError('Provider exceeded requested page size');
          return { listings, rawCount: payload.items.length, observedAt };
        })()]);
      } catch (error) {
        if (error instanceof SourceError || error instanceof ProviderContractError) throw error;
        throw new SourceError(controller.signal.aborted ? 'cancelled' : 'transport_failure');
      } finally {
        // Also release unread bodies on header/schema errors, not only on timeout.
        controller.abort();
        clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
      }
    }
  };
}

/** Bounded overlapping catalog scan, not a persistent scheduler. Partial coverage
 * is explicit; a caller must not establish a baseline from an incomplete scan. */
export async function scanCatalog({ source, recipe: input, maxPages = 2, perPage = 50, maxRequests = 6, signal }) {
  const recipe = createRecipe(input);
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10 || !Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 30) throw new TypeError('Invalid scan budget');
  if (!Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) throw new TypeError('Invalid page size');
  if (!recipe.searchTerms.length) throw new TypeError('Source search terms required');
  const candidates = new Map(); let requests = 0;
  const incomplete = [];
  for (const searchText of recipe.searchTerms) {
    for (let page = 1; page <= maxPages; page++) {
      if (signal?.aborted) throw new SourceError('cancelled');
      if (requests >= maxRequests) { incomplete.push({ searchText, reason: 'request_budget' }); break; }
      requests++;
      const result = await source.searchPage({ searchText, minPricePence: recipe.minPricePence,
        maxPricePence: recipe.maxPricePence, page, perPage, signal });
      if (!Array.isArray(result.listings) || !Number.isSafeInteger(result.rawCount) || result.rawCount < result.listings.length || result.rawCount > perPage) throw new ProviderContractError('Invalid source page result');
      for (const listing of result.listings) {
        const previous = candidates.get(listing.id);
        candidates.set(listing.id, previous ? mergeListing(previous, listing) : listing);
      }
      if (result.rawCount < perPage) break;
      if (page === maxPages) incomplete.push({ searchText, reason: 'page_limit' });
    }
  }
  return { listings: [...candidates.values()], requests, incomplete, coverageComplete: incomplete.length === 0 };
}
