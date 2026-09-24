/** Compare independently observed listing IDs. Null timestamps represent misses,
 * never 'now'. No Discord API access or message sending is involved. */
function timestamp(value) {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new TypeError('Timestamp must include timezone');
  return Date.parse(value);
}

export function compareObservations(observations) {
  if (!Array.isArray(observations)) throw new TypeError('Observations must be an array');
  const byId = new Map(); let duplicates = 0;
  for (const event of observations) {
    if (typeof event.listingId !== 'string' || !event.listingId.trim() || !['retrade', 'discord'].includes(event.source)) throw new TypeError('Invalid comparator observation');
    const at = timestamp(event.observedAt);
    const entry = byId.get(event.listingId) ?? { listingId: event.listingId, retrade: null, discord: null };
    if (entry[event.source] !== null) duplicates++;
    entry[event.source] = entry[event.source] === null ? at : Math.min(at, entry[event.source]);
    byId.set(event.listingId, entry);
  }
  const rows = [...byId.values()].map(row => ({ listingId: row.listingId,
    retradeAt: row.retrade === null ? null : new Date(row.retrade).toISOString(),
    discordAt: row.discord === null ? null : new Date(row.discord).toISOString(),
    differenceMs: row.retrade !== null && row.discord !== null ? row.retrade - row.discord : null }));
  const discord = rows.filter(r => r.discordAt !== null).length;
  const paired = rows.filter(r => r.differenceMs !== null);
  const sorted = paired.map(r => r.differenceMs).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { rows, observedDiscordIds: discord, pairedIds: paired.length,
    discordOnly: rows.filter(r => r.discordAt !== null && r.retradeAt === null).length,
    retradeOnly: rows.filter(r => r.retradeAt !== null && r.discordAt === null).length,
    duplicateObservations: duplicates, coveragePercent: discord ? paired.length / discord * 100 : null,
    medianDifferenceMs: sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : null,
    p95DifferenceMs: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null };
}
