/** Version 1 engine contract. Money is integer GBP pence; null means unknown. */
import { readFileSync } from 'node:fs';

export const canon = JSON.parse(readFileSync(new URL('./catalog/canon-dslr.json', import.meta.url), 'utf8'));
export const CONDITIONS = ['new', 'very_good', 'good', 'satisfactory'];

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function pence(value, label = 'money', nullable = true) {
  if (value == null && nullable) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000) {
    throw new TypeError(`${label} must be integer pence between 0 and 100000000`);
  }
  return value;
}

/** Parse provider decimal prices without coercing null/blank/boolean to zero. */
export function decimalToPence(value) {
  if (value == null || value === '') return null;
  if (isRecord(value)) return decimalToPence(value.amount);
  if (typeof value !== 'number' && typeof value !== 'string') throw new TypeError('Invalid decimal price');
  const text = String(value).trim();
  if (!text) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new TypeError('Invalid decimal price');
  const [whole, fraction = ''] = text.split('.');
  return pence(Number(whole) * 100 + Number(fraction.padEnd(2, '0')), 'price', false);
}

function terms(value, label) {
  if (!Array.isArray(value) || value.length > 100 || value.some(v => typeof v !== 'string' || !v.trim() || v.length > 200)) {
    throw new TypeError(`${label} must be at most 100 nonempty text terms`);
  }
  return [...new Set(value.map(v => v.trim()))];
}

export function createRecipe(input = {}) {
  if (!isRecord(input)) throw new TypeError('Recipe must be an object');
  if (input.version !== undefined && input.version !== 1) throw new TypeError('Unsupported recipe version');
  if (input.benchmark !== undefined && typeof input.benchmark !== 'boolean') throw new TypeError('benchmark must be boolean');
  const kind = input.kind ?? 'canon';
  if (!['canon', 'custom'].includes(kind)) throw new TypeError('Unknown recipe kind');
  const models = terms(input.models ?? [], 'models');
  if (kind === 'canon' && models.some(id => !canon.models.some(m => m.id === id))) throw new TypeError('Unknown Canon model');
  const conditions = terms(input.conditions ?? [], 'conditions');
  if (conditions.some(c => !CONDITIONS.includes(c))) throw new TypeError('Unknown condition');
  const notifyLevels = terms(input.notifyLevels ?? [], 'notifyLevels');
  if (notifyLevels.some(c => !['buy', 'snipe', 'check', 'risky'].includes(c))) throw new TypeError('Unknown notification level');
  const minPricePence = pence(input.minPricePence ?? 0, 'minPricePence', false);
  const maxPricePence = pence(input.maxPricePence, 'maxPricePence');
  if (maxPricePence !== null && maxPricePence < minPricePence) throw new TypeError('Invalid price range');
  const zeroReviews = input.zeroReviews ?? 'risky';
  if (!['risky', 'hide', 'allow'].includes(zeroReviews)) throw new TypeError('Unknown zero-review policy');
  const minReviews = input.minReviews ?? 5;
  const minRating = input.minRating ?? 4.5;
  const minRoiPercent = input.minRoiPercent ?? 35;
  if (!Number.isSafeInteger(minReviews) || minReviews < 0 || minReviews > 1000000) throw new TypeError('Invalid minimum reviews');
  if (!Number.isFinite(minRating) || minRating < 0 || minRating > 5) throw new TypeError('Invalid minimum rating');
  if (!Number.isFinite(minRoiPercent) || minRoiPercent < 0 || minRoiPercent > 100000) throw new TypeError('Invalid minimum ROI');
  const rejectTerms = terms(input.rejectTerms ?? [], 'rejectTerms');
  const recipe = {
    version: 1, kind, benchmark: input.benchmark ?? false, models,
    customModels: terms(input.customModels ?? [], 'customModels'),
    searchTerms: terms(input.searchTerms ?? [], 'searchTerms'),
    minPricePence, maxPricePence, conditions, rejectTerms,
    warningTerms: terms(input.warningTerms ?? [], 'warningTerms'),
    minProfitPence: pence(input.minProfitPence ?? 4000, 'minProfitPence', false),
    minRoiPercent, minReviews, minRating, zeroReviews, notifyLevels
  };
  if (!recipe.models.length && !recipe.customModels.length) throw new TypeError('Select at least one model or custom model');
  if (recipe.benchmark && (conditions.length || rejectTerms.length || zeroReviews === 'hide' || notifyLevels.length)) {
    throw new TypeError('Benchmark must accept all conditions, warn instead of reject/hide, and remain feed-only');
  }
  for (const value of Object.values(recipe)) if (Array.isArray(value)) Object.freeze(value);
  return Object.freeze(recipe);
}

export function canonBenchmark() {
  return createRecipe({ benchmark: true, models: canon.models.map(m => m.id),
    searchTerms: ['Canon', 'EOS', 'Rebel'], minPricePence: 5100, maxPricePence: 10000,
    warningTerms: ['spares', 'parts only', 'not working', 'faulty', 'broken', 'untested',
      'water damage', 'sensor damaged', 'sensor fault', 'shutter fault', 'no charger', 'charger missing', 'no battery'] });
}
