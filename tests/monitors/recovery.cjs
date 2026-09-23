/* Offline recovery checks. These protect provenance and isolation, not readiness
 * for deployment. Known prototype defects remain documented activation blockers. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { root, shipped, scripts } = require('../../scripts/assets.cjs');
const manifest = require('../../docs/features/monitors/provenance.json');

(async () => {
  assert.equal(manifest.files.length, 14);
  for (const item of manifest.files) {
    assert(item.path.startsWith('experiments/monitors/'));
    const file = path.join(root, item.path);
    const bytes = fs.readFileSync(file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256,
      `Recovered reference changed: ${item.path}; promote repaired code to its owner instead`);
    if (/\.(?:js|mjs)$/.test(file)) execFileSync(process.execPath, ['--check', file]);
  }
  assert(!shipped.some(file => /(?:^|\/)monitors(?:\/|\.)/.test(file)),
    'Recovery is not activation: add reviewed runtime integration and update this gate together');
  for (const file of scripts.concat('index.html', 'sw.js')) {
    assert(!fs.readFileSync(path.join(root, file), 'utf8').includes('experiments/monitors/'),
      `Recovered prototype loaded from ${file}`);
  }

  // Import pure engine modules only; never execute the worker entry or DB client.
  global.fetch = async () => { throw new Error('Network prohibited in recovery tests'); };
  const base = path.join(root, 'experiments/monitors/recovered-v3/');
  const { basicMatch } = await import(pathToFileURL(path.join(base, 'worker/monitors/src/engine/match.mjs')));
  const { evaluateListing } = await import(pathToFileURL(path.join(base, 'worker/monitors/src/engine/score.mjs')));
  const recipe = JSON.parse(fs.readFileSync(path.join(base, 'fixtures/canon-resell-locker-benchmark.json')));
  const catalog = JSON.parse(fs.readFileSync(path.join(base, 'worker/monitors/src/catalog/canon-dslr.json')));
  const monitor = { template_key: 'canonBenchmark', price_min: recipe.priceMin,
    price_max: recipe.priceMax, models: recipe.models, reject_keywords: recipe.hardRejectKeywords,
    warning_keywords: recipe.warningKeywords, allowed_conditions: [], zero_review_mode: 'risky',
    seller_min_reviews: recipe.sellerRule.minReviews, seller_min_rating: recipe.sellerRule.minRating,
    config: { benchmarkMode: true } };
  assert.equal(recipe.models.length, 11);
  assert.equal(recipe.priceMin, 51);
  assert.equal(recipe.priceMax, 100);
  assert.deepEqual(recipe.hardRejectKeywords, []);
  let cases = 0;
  for (const model of catalog.models) for (const title of model.aliases) {
    for (const itemPrice of [51, 100]) {
      const listing = { id: `fixture-${cases++}`, title, itemPrice, totalPrice: itemPrice,
        condition: 'Satisfactory', sellerReviews: 0, sellerRating: null };
      const match = basicMatch(listing, monitor);
      assert(match.ok, title);
      assert.equal(match.matchedModel, model.id, title);
      assert.equal(evaluateListing(listing, monitor, match).decision, 'risky');
    }
  }
  for (const itemPrice of [50.99, 100.01]) {
    assert.equal(basicMatch({ id: 'outside', title: 'Canon 600D', itemPrice }, monitor).ok, false);
  }
  for (const warning of recipe.warningKeywords) {
    const listing = { id: 'warning', title: `Canon 600D ${warning}`, itemPrice: 80 };
    const match = basicMatch(listing, monitor);
    assert(match.ok);
    assert(match.warnings.includes(warning));
  }
  assert.equal(basicMatch({ id: 'boundary', title: 'Canon 1600D', itemPrice: 80 }, monitor).ok, false);
  console.log(`Monitor recovery: 14 source hashes, syntax, deployment isolation and ${cases} alias/price cases passed. Prototype remains disabled.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
