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
  // Camera model names on a compatibility list do not make an accessory a camera.
  const title = normalize(listing.title);
  const accessoryOnly = recipe.kind === 'canon' && (
    /^(?:canon\s+)?(?:(?:replacement|genuine|original|new)\s+)*(?:battery|batteries|charger|lens|strap|case|bag|screen protector|manual|box)\b/.test(title)
    || /\b(?:compatible with|for canon|fits canon)\b/.test(title)
    || /\b(?:expanded|field|user|instruction|pocket) guide\b/.test(title)
    || /\b(?:remote (?:switch|control)|rs[- ]?60e3)\b/.test(title)
    || /\b(?:lens|charger|battery|manual|box|strap|bag) only\b/.test(title)
    || /\b(?:body cap|lens cap)\b/.test(title)
  );
  if (accessoryOnly) warnings.push('possible_accessory_only');
  const result = (status, reason, matchedModels = []) => ({ status, reason, matchedModels, warnings });
  if (accessoryOnly) return result('reject', 'accessory_only');
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
  // Pending candidates remain internal until their required evidence is present.
  return result('match', 'model', [...new Set(matchedModels)]);
}
