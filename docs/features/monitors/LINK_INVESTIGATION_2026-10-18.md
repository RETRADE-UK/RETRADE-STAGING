# Vinted monitor v1.6: search-link investigation

Reviewed 18 October 2026 against staging main `3d32ca1692bf6ce624e86f105a1312b4c7b58f7e`.
This is an investigation and tested offline preparation. It does not activate a source or complete URL import in the application.

## What the four supplied links establish

All four search the UK catalogue with `order=newest_first`, `catalog[]=3075`,
`brand_ids[]=217414`, `status_ids[]=2,3,4,1,6` (repeated parameters) and GBP.
None contains `search_text`. The original URLs are preserved exactly in the new test fixtures.
Category/brand IDs are preserved without relying on an unverified current label mapping.

| Link | Minimum | Maximum |
| --- | ---: | ---: |
| 1 | no explicit minimum | £50 |
| 2 | £51 | £100 |
| 3 | £101 | £200 |
| 4 | £201 | £300 |

These leave £50.01–£50.99, £100.01–£100.99 and £200.01–£200.99 outside every band.
Import preserves these settings. A gap-free alternative needs an explicit user-visible change.

The user reports adding whitelist/blacklist terms after pasting the link into Resell Locker.
This supports two distinct configurations: source search filters from the URL, and later text
matching in the monitor. The screenshots also expose a separate country filter.
They do not establish whether the text rules examine title, description or both, nor their
precedence, phrase boundaries or regex behavior.

Changing a catalogue URL still requires obtaining results. A URL is useful search configuration,
not evidence of a push subscription, a special permission or a solution to an access refusal.
The changing `time` values are not demonstrated listing cursors. In the offline normalization,
`time`, `search_id`, page position and empty image fields are omitted; a live provider contract
must verify request semantics before activation.

## Difference from the existing worker

The prior worker already requested filtered catalogue data; it did not refresh the entire website.
However, its query is keyword driven. At the reviewed commit:

- `adapters/vinted-source.mjs` requires nonempty text and sends keyword/price/currency/order/pagination fields.
  It does not preserve the supplied category, brand and condition facets.
- `contracts.mjs`, `service-validation.mjs`, `session-check.mjs`, the Edge service and UI also assume model/search terms.
- `automatic.mjs` groups searches and widens price windows. Group/cache identity must include every
  non-price source facet as well as owner scope, or different searches can share the wrong response.
- Current title rejection and model matching do not establish parity with a monitor that examines
  full descriptions. The service rejects description-based rules while that data is unavailable.

Therefore replacing one request URL alone would leave inconsistent saved configuration,
manual checks, scheduling and matching.

## Read-only staging evidence

Read on 18 October from isolated staging; no scan was started and no connection setting was changed.

| Recorded field/evidence | Value |
| --- | --- |
| Source mode | public |
| Connection state | verified (historical setup state) |
| Automatic scanning | disabled |
| Scan/search state | blocked |
| Last recorded catalogue HTTP status | 403 |
| Recorded tier checks / errors | 932 / 4 |
| Last scan | 8 October 2026, 08:29:01 UTC |
| Last successful monitor results | 8 October, approximately 08:28 UTC |
| Sent outbox records / listing-notification records | 8 / 0 |

The recorded refusal diagnostic identifies an anti-bot challenge. The eight sends are
test/stop notifications, not proof of new-listing delivery. Earlier worker evidence records
233 scan cycles. A historical `verified` label and enabled individual recipes must not be
presented as current catalogue health when the global scanner is stopped.

## Public implementation and provider evidence

The [teddy-vltn public bot](https://github.com/teddy-vltn/vinted-discord-bot) is a useful
reference for parsing URL facets into catalogue parameters. Its author explicitly says the
public version is no longer maintained, now focuses on a private Fyndit version, and offers
bots to communities. That is evidence that a community can use a separately maintained service;
it does not identify Resell Locker's provider or prove the old code works today.

The pinned [public worker](https://github.com/teddy-vltn/vinted-discord-bot/blob/e6d12887272293c454c50573449c46600bfe2960/src/services/channel_monitor_service.js)
shows saved URL filters, periodic catalogue requests, an initial baseline, new-ID detection,
item-detail enrichment, local filtering and a Discord callback. This supports the URL-driven
design; it does not establish a permanent Vinted push stream. Its in-memory high-water mark
and single-page collection are not a reliability model to copy.

The [public command](https://github.com/teddy-vltn/vinted-discord-bot/blob/e6d12887272293c454c50573449c46600bfe2960/src/bot/commands/start_monitoring.js)
uses `/start_monitoring` with URL and banned keywords. It does not match the supplied
Resell Locker modal with named links, whitelist words and regex placeholders. Therefore
this repository is a reference implementation, not a recovered copy of Resell Locker.

[Fyndit monitors](https://www.fyndit.app/docs/monitors) document URL-derived searches.
Its [filter documentation](https://www.fyndit.app/docs/filters) describes title-plus-description
matching, any whitelist entry passing, any blacklist entry rejecting, case-insensitive whole
words/phrases, and slash-wrapped regex. It offers Test Text and Test Item diagnostics.
These are comparison requirements from Fyndit, not verified Resell Locker behavior.

[Fyndit webhooks](https://www.fyndit.app/docs/webhooks) deliver to Discord channels, including
other servers the user manages. This is not documentation of a general HTTP listing feed.
If an actual provider permits that route, a registered Discord bot with authorized channel
access could consume the delivered messages. That adds a delivery dependency and cannot
be claimed faster than its upstream alerts.

The [official Vinted Pro API](https://pro-docs.svc.vinted.com/) documents allowlisted business
inventory/order capabilities. The reviewed surface does not establish a general marketplace
buyer-search feed. Public Resell Locker material did not expose a usable source contract.

No investigated public source establishes Resell Locker's backend identity, supported export,
or how it maintains source availability. Similar slash commands are not sufficient attribution.

## Offline code added

`worker/monitors/src/search-link.mjs` is a pure, unused module:

- `parseVintedSearchUrl(rawUrl)`: UK HTTPS catalogue URL, optional text, immutable normalized
  facets, integer-pence boundaries, original URL and canonical website URL.
- `buildVintedSearchParams(config, pagination)`: candidate API parameter serialization.
  Facet CSV names follow the public reference implementation and remain unverified against
  the current provider. No endpoint or transport is selected.
- `sourceSearchKey(config)`: all supported non-price source filters; callers must add owner
  scope. This is a grouping key, not a complete query or monitor identity.

Unknown parameters, unsupported image searches, ambiguous singleton values, invalid IDs/prices
and unsafe destinations fail explicitly rather than silently widening a search.
Supported additional facets are size, colour, material and video-game platform.
No production configuration, credentials, notification job or UI behavior changes.

Verification: `node --test tests/monitors/*.test.mjs` on Node 24.14.1:
**94 passed, 0 failed**, including 11 new URL tests. Tests use synthetic transports;
they establish parsing and regression behavior, not live availability or latency.

## Remaining integration work and evidence

1. Identify the actual Resell Locker application from its bot profile/about panel or command
   help. Bot name and application ID are enough; no token is required.
2. Confirm the actual source/export contract and an authorized usable path in the hosting
   environment. Respect the existing blocked state until that is established.
3. Extend the saved recipe contract and server validation, then manual checks, scheduler,
   shared-query/cache identity, and URL-import UI together. Make text optional for facet-only
   searches; do not conflate source keywords with monitor whitelists.
4. Define whitelist/blacklist precedence and missing-description behavior from evidence.
   Keep literal matching safe; regex support needs its own bounded execution design.
   Explain each accepted/rejected/pending listing instead of guessing.
5. In a controlled source test, compare exact listing IDs and independent detection times
   using the same filters. Initial baseline, source misses and post-filter misses are separate.
   The existing baseline/deduplication and read-only benchmark tests remain relevant.
6. Only after successful source verification, enable a staging monitor with recorded
   request budgets, refusal handling, freshness, delivery evidence and restart behavior.

The unresolved dependency is reliable source access. Correct link parsing is necessary
for equivalent searches but does not, by itself, repair the monitor.

