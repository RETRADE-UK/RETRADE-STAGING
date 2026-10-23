/** Query planning only. Candidate URL filters require an explicit source capability
 * at each runtime entry point; these helpers never create a transport. */
import { createRecipe, pence } from './contracts.mjs';
import { parseVintedSearchUrl, sourceSearchKey } from './search-link.mjs';

export function recipeSourceKey(input) {
  const recipe = createRecipe(input);
  return recipe.searchUrl
    ? 'url:' + sourceSearchKey(parseVintedSearchUrl(recipe.searchUrl))
    : 'terms:' + JSON.stringify(recipe.searchTerms);
}

export function recipeSourceQueries(input, { priceScope = null } = {}) {
  const recipe = createRecipe(input);
  const minPricePence = pence(priceScope ? priceScope.minPricePence : recipe.minPricePence, 'Minimum source price', false);
  const maxPricePence = pence(priceScope ? priceScope.maxPricePence : recipe.maxPricePence, 'Maximum source price');
  if (maxPricePence !== null && maxPricePence < minPricePence) throw new TypeError('Invalid source price range');
  if (recipe.searchUrl) {
    // Provenance URLs differ between price bands and tracking timestamps; they
    // must not fragment a shared page cache when the actual query is identical.
    const { originalUrl, canonicalUrl, ...filters } = parseVintedSearchUrl(recipe.searchUrl);
    return [{ linkSearch: { ...filters, minPricePence, maxPricePence } }];
  }
  if (!recipe.searchTerms.length) throw new TypeError('Source search terms required');
  return recipe.searchTerms.map(searchText => ({ searchText, minPricePence, maxPricePence }));
}

/** Share price windows only for the same owner and complete non-price scope. */
export function groupSourcePriceScope(monitors, current) {
  const key = recipeSourceKey(current.recipe);
  const peers = monitors.filter(m => m.user_id === current.user_id && recipeSourceKey(m.recipe) === key);
  if (!peers.length) throw new TypeError('Current monitor must belong to its source group');
  return {
    minPricePence: Math.min(...peers.map(m => createRecipe(m.recipe).minPricePence)),
    maxPricePence: peers.some(m => createRecipe(m.recipe).maxPricePence === null)
      ? null : Math.max(...peers.map(m => createRecipe(m.recipe).maxPricePence)),
  };
}
