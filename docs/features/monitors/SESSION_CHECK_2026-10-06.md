# Vinted monitor v1.2 — connection verification

Baseline: staging `511a2b6` (v1.1 inbox release). Production is unchanged.

## Findings

The source still called `/api/v2/catalog/items`. The maintainer of
[vinted-location-filter](https://github.com/BenSchZA/vinted-location-filter)
reports that Vinted retired it and moved search to
`/web/gateway/svc-catalogue/items`. The adapter now targets that path. This is an
unofficial endpoint, not a guaranteed integration contract.

One ordinary unauthenticated request to that replacement on 6 October returned
HTTP 403 with `FORBIDDEN` / `Access denied`. No payload was obtained. No repeated
requests, proxies, challenge handling or browser impersonation followed. The
[official Pro API](https://pro-docs.svc.vinted.com/) still documents seller
inventory/orders, not the marketplace discovery needed here. A working session
or suitable alternative source has not been established.

Supabase's connected tools returned an authentication failure (`Unauthorized`)
in this session. Consequently the current remote schema could not be inspected
and the new backend/migration could not be applied. Do not infer backend rollout
from a successful frontend Pages deployment.

## Implementation

- A Connection panel checks the server capability before exposing token entry.
  The existing handler keeps this form hidden until its replacement is deployed.
- Registered account only. Supabase Auth verifies identity; the service checks
  ownership and the selected search against the saved monitor before requesting
  Vinted. Anonymous developer accounts cannot submit tokens.
- One saved search, one page, up to 20 candidates, seven-second provider timeout.
  The private `access_token_web` value is used once as a cookie on the fixed
  Vinted UK destination. Redirects and header/cookie bundles are rejected.
  No refresh token, authentication refresh or purchasing action is implemented.
- The token is removed from the form immediately on submission and when leaving
  Connection. It is not stored in local/session storage, database, logs, URLs or
  responses. Provider messages/bodies are not echoed. Responses use `no-store`.
- A private diagnostics table stores attempt timing and status only. Service-only
  invoker RPCs enforce a five-minute per-account cooldown across tabs/instances;
  Retry-After can extend it. RLS and browser grants deny access to diagnostics.
- Only correctly shaped GBP listings pass. Existing model/price rules determine
  confirmed or pending candidates. Missing descriptions/seller data stay unknown.
  Unknown response shapes fail; empty results do not prove a working session.
- Valid samples are appended to the owned monitor's history and labelled
  **Connection sample**. Normal direct Vinted links and RETRADE save/read actions
  work on them. Duplicate identities cannot overwrite existing scan evidence.
  A stale recipe revision cannot accept the sample.
- Samples are baseline evidence: no push jobs, automatic activation, completed
  scanner baseline, success heartbeat or Discord speed claim is created. Global
  source health remains unchanged even after a successful one-off check.

This is an access-validation step, not a completed live monitor. Continuous
session handling/encrypted storage is deliberately deferred until one real sample
can be validated. Storing a credential for an unreachable source adds no value.

## Deployment and remaining gate

1. Restore Supabase access and confirm project `dvnrxmdejxfuazmpnudj` is staging.
2. Inspect remote migration history/schema. Apply
   `20261006073348_monitor_session_check.sql` once, then verify grants and advisors.
3. Deploy `monitor-service` with all original repo-relative engine files, including
   `worker/monitors/src/session-check.mjs`. Preserve the handler's custom user/cron
   authentication and staging-only guard. No secret/environment setup is needed.
4. The compatible frontend can deploy before the backend; token entry remains
   hidden until `capabilities.sessionCheck` is returned. Then the user can enter a
   token privately in **Monitors → Connection**, with their registered staging account.
5. Verify real response shape, filters and direct links. If 403 persists, stop;
   the cookie does not provide a usable hosted feed. Do not lift the source gate.
6. Only after that evidence, implement a supported continuous connection and
   verify scheduling, live history and physical phone delivery end to end.

Rollback the UI using a new cache build. The prior backend is compatible. Keep
the private attempt history and labelled samples; neither alters accounting.

## Verification

Synthetic source/API tests exercise current path, precise filters, token scope,
refusals, expired sessions, rate limits, changed schemas, empty pages, cross-user
denial and no secret reflection. PGlite tests exercise actual grants, invoker RPCs,
cooldowns, stale revisions, identity deduplication, Retry-After, history/save
integration and no push/activation side effects. Browser tests cover capability
gating, input clearing, errors, sample links and mobile/desktop layout.

Release gates: `npm run check`, `npm run build`, `npm test`, and PR CI. Real Vinted
authenticated listings and iPhone notification receipt remain unverified.

## Verified evening deployment and first sample

Supabase access was restored. The session migration was applied as remote version
20261006174427 and monitor-service v7 deployed. A registered owner check at
19:48 UTC returned HTTP 200 and 20 candidates. History persisted those candidates;
some are confirmed model matches and others are pending description/model review.
The UI now collapses pending candidates separately and acknowledges saved sample
evidence without claiming background monitoring is active. No credentials were
stored; automatic token renewal remains unverified. Signup redirect issue #23
and company transfer are deferred at the owner's request.
