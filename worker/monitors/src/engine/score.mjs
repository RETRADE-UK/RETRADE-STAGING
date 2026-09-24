import { createRecipe, pence } from '../contracts.mjs';

export function assessSeller(seller, input) {
  const recipe = createRecipe(input);
  const reviews = Number.isSafeInteger(seller?.reviews) && seller.reviews >= 0 ? seller.reviews : null;
  const rating = Number.isFinite(seller?.rating) && seller.rating >= 0 && seller.rating <= 5 ? seller.rating : null;
  if (reviews === 0 && recipe.zeroReviews === 'hide') return { risk: 'high', reason: 'zero_reviews', hidden: true };
  if (reviews === 0 && recipe.zeroReviews === 'risky') return { risk: 'high', reason: 'zero_reviews', hidden: false };
  if (rating !== null && rating < recipe.minRating) return { risk: 'high', reason: 'below_rating_target', hidden: false };
  // 'Allow' keeps zero reviews visible without automatically labelling the seller high risk.
  // An absence of history still cannot establish the confidence required for BUY.
  if (reviews === null || rating === null || reviews < recipe.minReviews || reviews === 0) {
    return { risk: 'unknown', reason: 'insufficient_history', hidden: false };
  }
  return { risk: 'low', reason: 'targets_met', hidden: false };
}

/** Caller supplies verified cost components; an undocumented provider total is not sufficient. */
export function evaluateListing(listing, input, match, { purchaseCosts = null, valuation = null, now = Date.now() } = {}) {
  const recipe = createRecipe(input);
  const seller = assessSeller(listing.seller, recipe);
  const result = { decision: 'check', hidden: false, seller, landedCostPence: null,
    resaleLowPence: null, resaleHighPence: null, projectedProfitPence: null, roiPercent: null,
    warnings: [...match.warnings], reasons: [], notify: false };
  if (match.status !== 'match') return { ...result, hidden: true, reasons: [match.reason] };
  if (seller.hidden) return { ...result, hidden: true, reasons: [seller.reason] };
  if (seller.risk === 'high') result.decision = 'risky';
  if (!listing.detailComplete) result.reasons.push('listing_details_incomplete');
  const costReady = purchaseCosts?.verified === true && purchaseCosts.currency === 'GBP';
  if (costReady) {
    const item = pence(listing.itemPricePence, 'itemPricePence', false);
    const fee = pence(purchaseCosts.buyerFeePence, 'buyerFeePence');
    const shipping = pence(purchaseCosts.shippingPence, 'shippingPence');
    if (fee !== null && shipping !== null) result.landedCostPence = pence(item + fee + shipping, 'landedCostPence', false);
  }
  if (result.landedCostPence === null) result.reasons.push('purchase_costs_incomplete');
  const validDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const valuationReady = valuation?.currency === 'GBP' && typeof valuation.evidence === 'string' && valuation.evidence.trim()
    && validDate(valuation.asOf) && validDate(valuation.validUntil)
    && Date.parse(valuation.asOf) <= now && Date.parse(valuation.validUntil) >= now
    && match.matchedModels.length === 1 && valuation.model === match.matchedModels[0];
  if (valuationReady) {
    result.resaleLowPence = pence(valuation.resaleLowPence, 'resaleLowPence');
    result.resaleHighPence = pence(valuation.resaleHighPence, 'resaleHighPence');
    const exit = pence(valuation.exitCostsPence, 'exitCostsPence');
    if (result.resaleLowPence !== null && result.resaleHighPence !== null && result.resaleHighPence < result.resaleLowPence) throw new TypeError('Invalid resale range');
    if (result.resaleLowPence !== null && exit !== null && result.landedCostPence !== null) {
      result.projectedProfitPence = result.resaleLowPence - exit - result.landedCostPence;
      if (result.landedCostPence > 0) result.roiPercent = Math.round(result.projectedProfitPence / result.landedCostPence * 10000) / 100;
    }
  }
  if (result.projectedProfitPence === null) result.reasons.push('valuation_or_exit_costs_incomplete');
  if (seller.risk !== 'low') result.reasons.push(seller.reason);
  if (match.warnings.length) result.reasons.push('listing_warnings');
  if (recipe.benchmark) result.reasons.push('benchmark_feed_only');
  const economicsReady = result.projectedProfitPence !== null && result.roiPercent !== null;
  if (economicsReady && !recipe.benchmark && listing.detailComplete && seller.risk === 'low' && !match.warnings.length) {
    const profit = result.projectedProfitPence, roi = result.roiPercent;
    if (profit > 0 && profit >= recipe.minProfitPence && roi >= recipe.minRoiPercent) {
      result.decision = profit >= recipe.minProfitPence * 1.4 && roi >= recipe.minRoiPercent * 1.25 ? 'snipe' : 'buy';
      result.reasons.push('economic_targets_met');
    } else result.reasons.push('below_economic_targets');
  }
  result.notify = !recipe.benchmark && recipe.notifyLevels.includes(result.decision);
  return result;
}
