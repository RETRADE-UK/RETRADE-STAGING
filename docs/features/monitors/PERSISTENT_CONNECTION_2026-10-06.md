# Saved Vinted connection — 6 October 2026

Staging only: `dvnrxmdejxfuazmpnudj`, `test.retrade-uk.com`.
Production, account migration and the deferred localhost Auth redirect are unchanged.

## Behaviour

Connection now has Save & test renewal, Test saved connection, Check saved search,
and Disconnect & delete credentials. Registered staging users enter their own
refresh_token_web, browser User-Agent and UK country (GB) privately in the app.
No password is requested. Input fields clear on submit, navigation and logout.
Nothing is written to browser storage. Logging out of RETRADE does not delete the
saved connection; Disconnect does. Vinted logout/session revocation may require
reconnection. Sharing a rotating Vinted session with another tool can interfere
with that tool; do not promise independent simultaneous renewal.

A renewal test performs exactly one POST to the fixed UK `/oauth/token` endpoint,
with the web refresh grant. It is an experimental contract, not a verified official
buyer API. The implementation lead is the refreshToken method at:
https://github.com/scirpter/Vinted-Deal-Alerts-Discord-Bot/blob/c1097039f7f4859e6812361ccc567d6efe21127e/src/infra/vinted/vinted-client.ts
Only the grant shape is used; no proxy, challenge handling, transport impersonation,
retry machinery or credential examples from that repository are incorporated.
The contract still needs the user's live credential test. No credential was
available during implementation and no authenticated renewal was performed.

Successful renewal validates both tokens and expiry, then atomically persists the
replacement encrypted bundle before reporting success. Check saved search uses
the saved access token with the existing owned recipe/sample path; it cannot
mark the global source healthy, enable scanning or generate listing alerts.
Current background monitoring remains paused. Continuous access, expiry-driven
renewal and scanner activation are a follow-up gate after the real renewal and
filtered sample work. Existing phone push setup/test is unchanged.

## Security and ownership

`worker/monitors/src/connection.mjs` owns validation, AES-256-GCM encryption and the
single bounded renewal request. Credentials are encrypted before any database
request, with a random 96-bit nonce and account-bound authenticated additional
data. The versioned encryption key is generated inside Supabase Vault and read
only by the service. Database/storage errors and upstream bodies never return
credential data. No request/body logging is added.

`monitor_private.connections` stores ciphertext and minimal state. It has RLS and
no anon/authenticated grants or policies. Service-only SECURITY INVOKER RPCs have
empty search_path. The Edge handler verifies the user with Auth, rejects anonymous
users, and derives ownership from that verified user, never a supplied owner ID.
The existing staging runtime guard and no-store response headers remain.

Five-minute durable cooldown and attempt/generation fencing serialise refreshes
across tabs and worker instances. Timeout/crash or ambiguous response requires
fresh credentials rather than replaying a possibly consumed refresh token.
403 stops renewal; 429 retains a Retry-After pause and needs an explicit later test.
Disconnect erases ciphertext and invalidates pending completion while preserving
cooldown. Account deletion cascades ciphertext deletion. Database backups may
retain prior encrypted versions until their normal retention expires.

Vault key `monitor_connection_key_v1` must not be deleted while ciphertext is in
use. Rotating that key requires decrypt/re-encrypt migration or disconnecting all
saved connections first. No raw key/token belongs in logs, Git, issues or exports.

## Deployment and verification

Apply migration `20261006202339_monitor_connection.sql` to staging only, then deploy
monitor-service with the new connection module included. Keep gateway verify_jwt
false: the handler performs Auth verification and the scheduler has its private
credential. The new UI is gated by capabilities.persistentConnection.

Tests cover GCM tampering/wrong-account decryption, input/header rejection, fixed
host/no redirects, bounded body/timeout, sanitized refusals, token rotation,
verified-user routing, no global activation, SQL role grants, cooldown, crash and
disconnect fencing, account deletion, and mobile/desktop input clearing and actions.
Local PostgreSQL tests use PGlite; the real Vault key creation/read path was also
verified as service_role inside a rolled-back staging transaction, returning only
a length check. A synthetic local test is not evidence of live Vinted renewal.

Required gates: npm run check; npm test; npm run build; PR CI; Pages deployment;
staging function auth/grants/advisors checks. Once deployed, user action is to enter
credentials in Connection → Save & test renewal. Inspect sanitized status only.
If renewal is refused, pause and reassess the connection method; do not loop.

Rollback: revert UI/service through a PR. The additive private migration can stay;
erase saved connections explicitly if the feature is retired. Do not remove the
Vault key before ciphertext cleanup. Production has no migration or deployment.
