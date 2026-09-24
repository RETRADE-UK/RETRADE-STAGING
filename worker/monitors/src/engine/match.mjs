import { canon, createRecipe } from '../contracts.mjs';

const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
export function hasTerm(text, term) {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped !== '' && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'u').test(normalize(text));
}

/** Three outcomes prevent an early catalog-only reject of description-only models. */
export function matchListing(listing, input) {
  const recipe = createRecipe(input);
  const text = `${listing.title ?? ''}\n${listing.description ?? ''}`;
  const warnings = recipe.warningTerms.filter(term => hasTerm(text, term));
  const accessoryOnly = /^(?:canon\s+)?(?:replacement\s+)?(?:battery|batteries|charger|lens|strap|case|bag|screen protector|manual|box)\b/i.test(listing.title ?? '')
    || /\b(?:compatible with|for canon|fits canon)\b/i.test(listing.title ?? '');
  if (accessoryOnly) warnings.push('possible_accessory_only');
  const result = (status, reason, matchedModels = []) => ({ status, reason, matchedModels, warnings });
  if (listing.platform !== 'vinted' || !listing.id) return result('reject', 'identity');
  if (listing.currency !== null && listing.currency !== 'GBP') return result('reject', 'currency');
  if (listing.itemPricePence != null && (!Number.isSafeInteger(listing.itemPricePence) || listing.itemPricePence < 0)) return result('reject', 'invalid_price');
  if (listing.itemPricePence == null || listing.currency == null) return result(listing.detailComplete ? 'reject' : 'pending', 'missing_price_or_currency');
  if (listing.itemPricePence < recipe.minPricePence || (recipe.maxPricePence !== null && listing.itemPricePence > recipe.maxPricePence)) return result('reject', 'price');
  const rejected = recipe.rejectTerms.find(term => hasTerm(text, term));
  if (rejected) return result('reject', `reject_term:${rejected}`);
  const matchedModels = recipe.models.filter(model => recipe.kind === 'canon'
    ? canon.models.find(m => m.id === model).aliases.some(alias => hasTerm(text, alias)) : hasTerm(text, model));
  matchedModels.push(...recipe.customModels.filter(model => hasTerm(text, model)));
  if (!matchedModels.length) return result(listing.detailComplete ? 'reject' : 'pending', 'model');
  if (recipe.conditions.length && !listing.condition) return result(listing.detailComplete ? 'reject' : 'pending', 'missing_condition', matchedModels);
  if (recipe.conditions.length && !recipe.conditions.includes(listing.condition)) return result('reject', 'condition', matchedModels);
  // Restrictive buying rules need a complete description before final acceptance.
  if (recipe.rejectTerms.length && !listing.detailComplete) return result('pending', 'description_required', matchedModels);
  // Wording is only a heuristic. Keep ambiguous accessories visible for review;
  // warnings prevent BUY/SNIPE instead of silently discarding a real camera kit.
  return result('match', 'model', [...new Set(matchedModels)]);
}
