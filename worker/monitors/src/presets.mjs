import { canon, createRecipe } from './contracts.mjs';

// Recovered August 25 monitor names; June/July broad trials are not replacements.
// Bundle / High Value definitions were not recovered: inert drafts, never guesses.
export function canonTierPresets() {
  const common = {
    models: canon.models.map(m => m.id), searchTerms: ['Canon', 'EOS Rebel'],
    conditions: ['good', 'very_good'],
    titleRejectTerms: ['spares', 'parts only', 'not working', 'faulty', 'broken', 'untested',
      'damaged', 'for repair', 'sensor fault', 'shutter fault'],
    modelMaxPricePence: { '500D':6500, '1100D':7000, '550D':8000, '1200D':9000,
      '600D':7000, '1300D':10000, '700D':9500 },
    warningTerms: ['no charger', 'charger missing', 'no battery'],
  };
  const specs = [
    ['canon-budget-75-v1', 'Canon £0–£75', 0, 7500, false],
    ['canon-mid-125-v1', 'Canon £75.01–£125', 7501, 12500, false],
    ['canon-bundle-draft-v1', 'Canon Bundle Sniper · needs rules', 0, null, true],
    ['canon-high-value-draft-v1', 'Canon High Value · needs rules', 0, null, true],
  ];
  return specs.map(([key,name,minPricePence,maxPricePence,setupRequired]) => ({key,
    data:{name, enabled:false, notifications:false, archived:false,
      recipe:createRecipe({...common,minPricePence,maxPricePence,setupRequired})}}));
}
