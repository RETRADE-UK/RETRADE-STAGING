# Session continuity — 8 October 2026

## Observed incident

The v1.4 trial committed 584 tier checks (146 four-tier cycles) between
21:41 UTC on 7 October and 00:06 UTC on 8 October. A catalogue HTTP 403 at
00:07 UTC stopped automatic scanning. It was not a completed overnight trial.
The retained logs do not establish why Vinted returned that refusal.
A separate manual catalogue check at 05:58 UTC returned 200. The existing
trial resumed after that verification, retaining its original counters and end
time rather than erasing the failure history.

The existing v1.4 worker then completed another 44 tier checks before a second
403 at 06:13 UTC. The session had been created at 05:58 UTC and was recorded
as valid until 06:58 UTC. The second refusal therefore did not coincide with
the locally recorded expiry. These renewal fixes must not be described as a
proven cure for that separate upstream refusal.

## Changes

- Renewal sends the existing scoped public cookies and anonymous identifier to
  the UK homepage. It preserves unmodified session data on temporary errors.
- Applicable access-cookie expiry is tracked alongside the encrypted jar.
  A readable JWT expiry can only shorten the refresh time; it is never trusted
  as an authentication or authorization claim. Opaque tokens still work.
- Rotated catalogue cookies and expiry are saved atomically under the existing
  owner/generation fence. Renewal occurs before the earliest expiry.
- A single SQL predicate controls cron wakeups, claims and session reads.
  Temporary renewal errors honor cooldown/Retry-After. An expired renewal lease
  can recover after a worker restart. A live lease cannot be stolen.
- Explicit source refusals remain paused; no identity/proxy rotation, challenge
  solving or repeated forbidden requests. One stop notification is queued per
  registered device when an active connection first stops. Duplicate failure
  reports cannot queue another alert; a disconnected or replaced generation
  cannot write session state.
- The existing trial still lasts 12 hours. Expired trials are cleaned up even
  if the connection is waiting for recovery. Settings distinguishes automatic
  retry from a pause requiring attention.

Owners remain `vinted-public-session.mjs`, `public-connection.mjs`,
`automatic.mjs`, the service entrypoint and the existing monitor page. Migration
`20261008060431_monitor_session_continuity.sql` is staging only. The cache build
is `20261008-monitor-continuity-staging`. No production data or bindings change.

## Verification

The 24-hour synthetic restart test covers hourly renewal, the same anonymous
identity, encrypted state, an HTTP 503, retry cooldown, cookie expiry during
backoff, and subsequent recovery. Database tests cover live/expired leases,
generation fencing, expiry persistence, denied client/foreign-owner access,
refusal stops and one alert per device. These tests do not prove that Vinted
will continue permitting hosted catalogue access.

Local validation: `npm run check` passed all 79 monitor tests and the asset/
invariant checks; `npm run build` passed; all three monitor database suites
passed. The full browser suite could not start because the browser binary was
not installed and its download returned an invalid archive. It remains a CI gate.

This change is committed locally on `fix/monitor-session-continuity` but has not
been pushed, migrated or deployed. The GitHub push was rejected by automatic
approval review pending explicit permission to publish the branch. After that
permission, open a PR, require passing CI, merge, apply the migration only to
staging, and deploy the matching service bundle. Then verify normal hosted
session renewal and continued scans. Do not resume a refused source as part of
deployment without a successful explicit access check.

An unrestricted always-on service and a real eligible-listing alert remain
unproven until a sustained observation succeeds.

## References checked

- Supabase scheduling: https://supabase.com/docs/guides/functions/schedule-functions
- HTTP 403 semantics: https://www.rfc-editor.org/rfc/rfc9110.html#name-403-forbidden
- Official Vinted Pro API: https://pro-docs.svc.vinted.com/

The official Pro surface does not document a general buyer catalogue-search
feed. It should not be presented as an immediately available replacement.
