import test from 'node:test';
import assert from 'node:assert/strict';
import { compareObservations } from '../../worker/monitors/src/benchmark.mjs';

test('Discord-only misses remain real misses, not invented RETRADE timestamps', () => {
  const result = compareObservations([
    { listingId: '1', source: 'discord', observedAt: '2026-09-24T09:00:00Z' },
    { listingId: '2', source: 'discord', observedAt: '2026-09-24T09:00:00Z' },
    { listingId: '2', source: 'retrade', observedAt: '2026-09-24T09:00:02Z' },
    { listingId: '3', source: 'retrade', observedAt: '2026-09-24T09:00:00Z' }
  ]);
  assert.equal(result.coveragePercent, 50); assert.equal(result.discordOnly, 1); assert.equal(result.retradeOnly, 1);
  assert.equal(result.rows[0].retradeAt, null); assert.equal(result.medianDifferenceMs, 2000);
});

test('earliest duplicate wins; signed latency remains negative when RETRADE is faster', () => {
  const result = compareObservations([
    { listingId: '1', source: 'discord', observedAt: '2026-09-24T09:00:05Z' },
    { listingId: '1', source: 'retrade', observedAt: '2026-09-24T09:00:03Z' },
    { listingId: '1', source: 'retrade', observedAt: '2026-09-24T09:00:02Z' },
    { listingId: '2', source: 'discord', observedAt: '2026-09-24T09:00:05Z' },
    { listingId: '2', source: 'retrade', observedAt: '2026-09-24T09:00:06Z' }
  ]);
  assert.equal(result.duplicateObservations, 1); assert.equal(result.rows[0].differenceMs, -3000);
  assert.equal(result.medianDifferenceMs, -1000); assert.equal(result.p95DifferenceMs, 1000);
});

test('empty or unpaired samples do not claim 100% coverage or zero latency', () => {
  assert.equal(compareObservations([]).coveragePercent, null);
  assert.equal(compareObservations([]).p95DifferenceMs, null);
  const result = compareObservations([{ listingId: '1', source: 'discord', observedAt: '2026-09-24T09:00:00Z' }]);
  assert.equal(result.coveragePercent, 0); assert.equal(result.medianDifferenceMs, null);
  assert.throws(() => compareObservations([{ listingId: '1', source: 'discord', observedAt: '2026-09-24T09:00:00' }]));
});
