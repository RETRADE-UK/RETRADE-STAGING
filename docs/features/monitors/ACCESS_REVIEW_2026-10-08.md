# Catalogue access review — 8 October 2026

## Current outcome

The completed bounded trial recorded 932 tier checks across 233 four-tier cycles
and four errors. Last successful scans were 08:28 UTC (09:28 BST); at 08:29 UTC
the source returned HTTP 403. At 18:25 UTC automatic monitoring remained off.
The scheduled final review stopped the expired trial. Do not resume this run or
describe the saved connection state `verified` as proof of working catalogue access.

The stored, sanitized response for scheduled request 304 identifies an HTML
response with both a challenge signal and a protection header. It contains no
authentication-expiry signal. This establishes an anti-bot challenge; it does
not identify its trigger or prove that IP changes/request volume caused it.
Repeated renewal is not an established remedy. No new Vinted requests were made
during this review, and no challenge handling, identity rotation or proxy was added.

At 08:06 UTC the worker reported renewal and four committed scans. From 08:07
through 08:11 it returned zero requests/commits, before renewal and scans resumed
at 08:12. Historical cookie contents were not retained, so the exact reason for
that gap cannot be reconstructed. It remains an unproven continuity case.

Four test pushes and four stop pushes were accepted by providers. Three test
and two stop pushes have recorded device-display acknowledgements. No genuine
new-listing alert was generated during this trial; latency and completeness are
not established. Retained older/sample rows must not count as trial detections.

## Changes in this release

- Scheduled and manual failures now explain an observed anti-bot challenge in
  ordinary app status. Provider response bodies/headers/tokens remain private;
  challenge signals are fixed booleans. Hard refusals still stop automatically.
- Premium and two-lens bundle search ceilings increase to GBP 200. Stable preset
  keys remain unchanged to avoid creating duplicate monitors on bootstrap.
- Body caps, GBP 20 named kit-lens allowance, GBP 45 two-lens allowance, condition
  requirements, fault exclusions and exclusive bundle routing remain intact.
  A 250D plus named 18–55mm lens at GBP 180 can now match; an 80D with named
  18–55mm and 55–250mm lenses can match at GBP 200. GBP 200 is not an unconditional
  threshold for every body. A 4000D kit at GBP 180 still fails its model cap.
- The original Discord screenshot shows a 4000D manual next to the camera, but
  does not expose the title or listing ID. This suggests the pictured model;
  it is insufficient evidence to claim the particular listing should match.
- Existing owner presets must be updated through `monitor_save` with expected
  revision, retaining enabled/notification preferences. The two widened rules
  receive a new silent baseline after access is restored. Old evidence is retained.

The three search terms Canon / EOS / Rebel remain: they cover distinct titles.
Identical requests are already cached across this owner's four tiers. Removing
terms without coverage evidence could suppress genuine matches.

## Access dependency

Official Vinted Pro Integrations v0.374.0 documents allowlisted seller inventory,
orders and related webhooks. It does not document general marketplace buyer
search. Do not build a buyer monitor on assumed Pro capabilities.
https://pro-docs.svc.vinted.com/

Supabase documents that Edge Functions do not have stable egress addresses.
This is a hosting constraint, not proof of the refusal trigger. Static egress
would only solve an IP allowlist requirement after the provider approved it;
moving hosting alone is not an established solution.
https://supabase.com/docs/guides/troubleshooting/why-supabase-edge-functions-cannot-provide-static-egress-ips-for-whitelisting-3d78b0

Next required external input: an approved UK marketplace catalogue endpoint/feed
and its credentials, permitted query rate, authentication lifecycle, freshness
and pagination contract. No such access was established during this review.
Do not purchase an unverified scraper, promise reliability, or restart a refused
source to manufacture a successful test. A real eligible-listing push and a
sustained trial remain gates after access is available.

## Validation / rollout

Focused regression tests cover GBP 180/200 boundaries, model-cap rejections,
bundle exclusivity and one-request challenge stops without private body exposure.
Full check/build and repository CI are required before merge. No schema migration
is required. Deploy the matching monitor-service bundle to staging only, then
verify the two saved preset revisions and the persisted paused status. Rollback
uses a reviewed revert and `monitor_save` for rule changes; do not delete history.
