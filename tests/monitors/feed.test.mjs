import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeed } from '../../worker/monitors/src/feed.mjs';
const at = '2026-09-27T10:00:00Z';
const match = (id, baseline = false) => ({ listing_id: id, observed_at: at, baseline, result: { status: 'match' } });

test('Discord IDs outside visible feed pair against exact stored evidence', () => {
  const result = buildFeed({ matches: [match('1')], discord: [{ listing_id: '2', discord_at: at }],
    comparisonMatches: [match('2')], truncated: true, baselineAt: '2026-09-26T00:00:00Z' });
  assert.equal(result.comparison.pairedIds, 1);
  assert.equal(result.comparison.discordOnly, 0);
  assert.equal(result.comparison.retradeOnly, 1);
  assert.equal(result.truncated, true);
});
test('Baseline exclusions are actual excluded rows, never the pagination sentinel', () => {
  const result = buildFeed({ matches: [], discord: [{ listing_id: '2', discord_at: at }, { listing_id: '3', discord_at: at }],
    comparisonMatches: [match('2', true)], truncated: true });
  assert.equal(result.baselineExclusions, 1);
  assert.equal(result.comparison.discordOnly, 1);
  assert.equal(result.baselineReady, false);
});
test('Pending evidence is not a detection and paired visible rows are not duplicated', () => {
  const result = buildFeed({ matches: [match('1')], discord: [{ listing_id: '1', discord_at: at }, { listing_id: '2', discord_at: at }],
    comparisonMatches: [match('1'), { ...match('2'), result: { status: 'pending' } }] });
  assert.equal(result.comparison.pairedIds, 1);
  assert.equal(result.comparison.duplicateObservations, 0);
  assert.equal(result.comparison.discordOnly, 1);
});
