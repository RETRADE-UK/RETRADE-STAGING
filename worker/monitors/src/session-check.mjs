// Single-request diagnostic. A successful sample never enables background scans.
import { createRecipe } from './contracts.mjs';
import { createVintedSource, validateAccessToken } from './adapters/vinted-source.mjs';
import { matchListing } from './engine/match.mjs';
import { recipeSourceQueries, recipeSourceKey } from './recipe-source.mjs';

export async function checkSession({ request, accessToken, publicSession=null, recipe: input, searchText, userAgent, sourceRecipe=null, now = Date.now, candidateLinkSearch = false }) {
  const recipe = createRecipe(input);
  if (recipe.searchUrl && candidateLinkSearch !== true)
    return { status: 'source_unverified', httpStatus: null, items: [], received: 0, retryAt: null };
  if(!publicSession) validateAccessToken(accessToken);
  if (recipe.searchUrl ? searchText !== undefined : !recipe.searchTerms.includes(searchText))
    throw new TypeError('Choose a saved search from this monitor.');
  const scope = sourceRecipe ? createRecipe(sourceRecipe) : recipe;
  if (recipe.searchUrl && recipeSourceKey(scope) !== recipeSourceKey(recipe))
    throw new TypeError('Diagnostic scope must use the saved URL filters');
  const query = recipe.searchUrl ? recipeSourceQueries(recipe, { priceScope: scope })[0]
    : { searchText, minPricePence: scope.minPricePence, maxPricePence: scope.maxPricePence };
  try {
    const page = await createVintedSource({ request, ...(publicSession?{publicSession}:{accessToken,userAgent}), now, timeoutMs: 10000, candidateLinkSearch })
      .searchPage({ ...query, perPage: publicSession?50:20 });
    // New/unknown provider shapes must not count as a working connection.
    if (page.listings.some(l => !l.title || !l.url || l.currency !== 'GBP' || l.itemPricePence === null)
      || (publicSession && recipe.conditions.length && page.listings.length && page.listings.every(l=>l.condition===null)))
      return { status: 'schema_changed', httpStatus: 200, items: [], received: 0, retryAt: null };
    return { status: page.rawCount ? 'sample_received' : 'empty', httpStatus: 200,
      received: page.rawCount, retryAt: null,
      items: page.listings.map(listing => ({
        listing: { ...listing, captureMode: 'session_check' }, result: matchListing(listing, recipe),
      })).filter(item => item.result.status === 'match').slice(0,20) };
  } catch (error) {
    // Neither raw responses nor exception messages may echo a credential.
    const status = error.status === 401 ? 'access_rejected' : error.status === 403 ? 'blocked' :
      error.status === 429 ? 'rate_limited' : error.status === 404 ? 'endpoint_unavailable' :
      error.code === 'timeout' ? 'timeout' : error.name === 'ProviderContractError' ||
      ['unexpected_content_type', 'invalid_json', 'response_too_large'].includes(error.code) ? 'schema_changed' : 'unavailable';
    return { status, httpStatus: Number.isInteger(error.status) ? error.status : null,
      items: [], received: 0, retryAt: error.retryAt ?? null, diagnostics:error.diagnostics ?? null };
  }
}

export const sessionMessages = Object.freeze({
  source_unverified: 'URL catalogue filters are not verified for this source yet. No request was made.',
  sample_received: 'Vinted returned listing data. Matching sample results are saved in History. Background monitoring is still off until continuous access is verified.',
  empty: 'Vinted returned an empty results page. This does not prove the session works; no listings were saved.',
  access_rejected: 'Vinted rejected search access (401). This does not prove that the token expired. The connection method needs review; repeatedly replacing tokens is not a fix.',
  blocked: 'Vinted refused the server request (403). A token alone has not solved access. No automatic retries will run.',
  rate_limited: 'Vinted requested a pause (429). Wait until the next permitted check; no automatic retries will run.',
  endpoint_unavailable: 'The catalogue endpoint is unavailable (404). The integration needs another review.',
  schema_changed: 'Vinted returned a response this integration cannot safely read. No listings were saved.',
  timeout: 'Vinted did not respond in time. No listings were saved.',
  unavailable: 'The Vinted check could not complete. No listings were saved.',
});

