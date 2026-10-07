# Renewable sessions and demonstrated search access — 7 October 2026

The owner rejected repeated manual token replacement. Inspection showed that
renewal had already succeeded at 10:35 UTC (reported expiry 12:35 UTC), while
searches returned 401 at 10:35, 10:39 and 11:03 UTC. Normal expiry did not explain
those refusals. The last two requests were user-triggered trial/check actions;
this change does not repeat the refused live request or enable a scanner.

## Changes

- `connection.mjs` owns one managed-session path for manual checks and the worker.
  It reuses an access token with more than two minutes remaining, otherwise takes
  the database refresh lease, renews once, and persists the encrypted replacement
  before use. No in-memory process needs to survive between scheduled ticks.
- An omitted optional refresh token keeps the existing grant (OAuth RFC 6749 §6).
  Explicit `invalid_grant` asks for reconnection. Other renewal refusals describe
  the integration failure. An ambiguous timeout/transport/5xx/malformed success
  becomes unavailable and is not replayed: the remote request may have rotated
  the token. No raw upstream error descriptions enter diagnostics.
- Manual saved searches now renew when needed; previously they just rejected an
  expired saved access token. Test saved connection reuses a valid session and
  checks one owned search, rather than rotating tokens unnecessarily.
- Search 401 is `access_rejected`, not `expired`. The refresh grant is preserved.
  Connection status reports renewal and actual search access separately. Only a
  recent nonempty valid search can enable Start 12-hour trial. Empty responses,
  token renewal alone and stale checks cannot start it.
- Each renewal gets a new generation. A saved sample and its connection health
  commit atomically under that generation and the existing owner/revision guard.
  Late checks cannot mark a replaced/disconnected session healthy or save finds.
- Once a connection is saved, manual token forms are hidden. Reconnection is
  offered for confirmed invalid grants. Disconnect remains explicit and erases
  credentials while preserving history. The four tiers and notification links
  are unchanged.

## Verification and remaining gate

Synthetic tests cover a 12-hour sequence with six automatic token renewals and
fresh worker instances, durable rotated-token use, failed persistence, manual
expiry recovery, valid-token reuse, no retry after 401, OAuth error classification,
owner/rotation/disconnect fencing and trial readiness. This simulation does not
establish 12 hours of live Vinted access.

The exact live search refusal remains unresolved. Research found an independently
maintained client using a different API host and additional session metadata, but
that does not prove an approved or reliable transport for RETRADE. No alternate
host, proxy, fingerprint impersonation or challenge-handling fallback was added.
Changing hosting or asking for another token has not been established as a fix.
Vinted's documented Pro `GetItems` lists items created through VPI, rather than a
marketplace-wide buyer search. A validated provider search contract/session is
still required before live monitoring can be claimed.

References reviewed 7 October 2026:
- https://datatracker.ietf.org/doc/html/rfc6749#section-6
- https://datatracker.ietf.org/doc/html/rfc9700#section-4.14
- https://pro-docs.svc.vinted.com/#getitems
- https://github.com/Giglium/vinted_scraper/blob/main/src/vinted_scraper/utils/_headers.py
- https://supabase.com/docs/guides/functions/limits

Staging migration: `20261007112431_monitor_connection_health.sql`.
Build: `20261007-monitor-connection-staging`.
Deployment/CI evidence is recorded in the PR. Production is untouched. Rollback
pauses scanning and reverts app/service via PR; retain additive schema and history.
