import { compareObservations } from './benchmark.mjs';

/** A bounded display is not a bounded identity lookup. The snapshot includes
 * exact evidence for every sampled Discord ID, even outside the visible feed. */
export function buildFeed(snapshot) {
  const matches = (snapshot.matches ?? []).filter(row => row.result?.status === 'match');
  const discord = snapshot.discord ?? [];
  const evidence = new Map((snapshot.comparisonMatches ?? matches).map(x => [x.listing_id, x]));
  const events = [];
  const added = new Set();
  function observe(row) {
    if (!row || row.baseline || row.result.status !== 'match' || added.has(row.listing_id)) return;
    added.add(row.listing_id);
    events.push({ listingId: row.listing_id, source: 'retrade', observedAt: row.confirmed_at || row.observed_at });
  }
  matches.forEach(observe);
  let baselineExclusions = 0;
  for (const row of discord) {
    const match = evidence.get(row.listing_id);
    if (match?.baseline || (snapshot.baselineAt && Date.parse(row.discord_at) < Date.parse(snapshot.baselineAt))) {
      baselineExclusions++;
      continue;
    }
    observe(match);
    events.push({ listingId: row.listing_id, source: 'discord', observedAt: row.discord_at });
  }
  return { matches, comparison: compareObservations(events), baselineExclusions,
    truncated: snapshot.truncated === true, baselineReady: !!snapshot.baselineAt };
}
