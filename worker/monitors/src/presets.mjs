import { createRecipe } from './contracts.mjs';

// Latest recovered proposal: August 27, carried into the v1.3 handover (PR #27).
// Prices/names survived, but complete model/ceiling/bundle rules did not.
// No illustrative model examples are silently promoted into active buying rules.
export function canonTierPresets() {
  const specs = [
    ['canon-cheap-sniper-60-v1', 'Cheap Sniper £0–£60 · needs rules', 0, 6000],
    ['canon-61-100-v1', 'Canon £61–£100 · needs rules', 6100, 10000],
    ['canon-premium-160-v1', 'Premium £100–£160 · needs rules', 10000, 16000],
    ['canon-bundles-150-v1', 'Bundles £0–£150 · needs rules', 0, 15000],
  ];
  return specs.map(([key,name,minPricePence,maxPricePence]) => ({key,
    data:{name, enabled:false, notifications:false, archived:false,
      recipe:createRecipe({models:[],searchTerms:['Canon','EOS Rebel'],
        minPricePence,maxPricePence,setupRequired:true})}}));
}
