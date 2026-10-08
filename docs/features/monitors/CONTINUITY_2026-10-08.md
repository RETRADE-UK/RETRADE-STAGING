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
as valid until 06:58 UTC. The second refusal did not coincide with the locally
recorded cookie expiry, but the previous worker did not inspect token expiry.
Protected, read-only expiry diagnostics will check whether the effective token
lifetime was shorter. These fixes are not yet a proven cure for the refusal.

## Changes

- Renewal sends the existing scoped public cookies and anonymous identifier to
  the UK homepage. It preserves unmodified session data on temporary errors.
- Applicable access-cookie expiry is tracked alongside the encrypted jar.
  A readable JWT expiry can only shorten the refresh time; it is never trusted
  as an authentication or authorization claim. Opaque tokens still work.
- An operator-only diagnostic reports recorded and effective expiry timestamps
  without returning cookies, token claims, anonymous identifiers or keys. It
  makes no provider request and does not alter the connection.
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

Release #34 merged as `c7018d7` after CI run `37738558019` passed the
complete browser/database suite and 80 monitor tests. The staging migration was
applied as `20261008064702`; service v20 and the Pages build deployed. All 15
deployed source modules match the merged release. Production was not changed.

At 06:47 UTC the protected diagnostic found a valid saved jar whose effective
expiry remained 06:58:42 UTC; no earlier readable token expiry was found. At
06:48:06 the existing session returned HTTP 200 with 50 catalogue items. The
original bounded trial resumed without resetting its 628 checks or two errors.
The first scheduled request at 06:49:01 then returned HTTP 403, before renewal.
The worker stopped, retained the history (628 checks, three errors) and queued
one stop notification for each of two registered devices. Both push providers
accepted delivery. This disproves a claim that the renewal changes alone cured
hosted access; it does not identify Vinted's reason for refusing the request.

The manual and scheduled paths use the same source adapter, public-session
storage, Canon query, 0–160 GBP source window and 50-item first page. The next
operator diagnostic adds bounded refusal classification: only fixed flags for
content type, challenge/authentication text signals and protection-header
presence leave the worker. It reads at most 16 KiB for 250 ms; no body, header
value, challenge URL, cookie or identifier is logged or returned. A stalled
refusal body remains HTTP 403 and cannot become a retryable timeout. No challenge
is followed and no automatic request follows a refusal. This follow-up is
pending release; two additional tests bring the monitor suite to 82.

An unrestricted always-on service and a real eligible-listing alert remain
unproven until a sustained observation succeeds.

## References checked

- Supabase scheduling: https://supabase.com/docs/guides/functions/schedule-functions
- HTTP 403 semantics: https://www.rfc-editor.org/rfc/rfc9110.html#name-403-forbidden
- Official Vinted Pro API: https://pro-docs.svc.vinted.com/

The official Pro surface does not document a general buyer catalogue-search
feed. It should not be presented as an immediately available replacement.
