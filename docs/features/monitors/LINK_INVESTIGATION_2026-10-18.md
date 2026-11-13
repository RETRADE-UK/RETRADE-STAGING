# Vinted monitor v1.6: search-link investigation

Reviewed 18 October 2026 against staging main `3d32ca1692bf6ce624e86f105a1312b4c7b58f7e`.
This is an investigation and tested worker integration behind a server-owned capability gate.
It does not activate a source or complete URL import in the application.

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
The parser preserves these settings. A gap-free alternative needs an explicit user-visible change.

The user reports adding whitelist/blacklist terms after pasting the link into Resell Locker.
This supports two distinct configurations: source search filters from the URL, and later text
matching in the monitor. The screenshots also expose a separate country filter.
They do not establish whether the text rules examine title, description or both, nor their
precedence, phrase boundaries or regex behavior.

### User clarification: thread setup and account actions

On 18 October the user explained the workflow they actually use:

- A Discord command centre creates a new thread under a chat.
- The thread receives Vinted search URLs and whitelist/blacklist settings.
- Initial account linking asks for a refresh token and an ID.
- Home delivery is configured so the user can purchase directly from Discord.

The type of ID was not specified. Do not label it as a Vinted user ID, client ID,
device ID or Discord application ID without evidence. Thread versus private-channel
terminology is the user's description, not a verified Discord resource type.

This distinguishes search configuration/alert destinations from the linked account
and checkout preferences. It strongly suggests an authenticated action session;
it does not show whether that session also obtains search results or whether the
provider shares a separate listing source across users. Token entry alone does not
explain source reliability. Home delivery is a checkout setting, not a search filter.

[Fyndit sessions](https://www.fyndit.app/docs/sessions) document refresh-token account
linking and account-specific shipping preferences, including home delivery for buying.
[VintedSeekers getting started](https://inventra.vintedseekers.app/docs/getting-started)
presents URL monitors before optional account actions and their checkout setup.
These corroborate the architecture as a known design, not Resell Locker attribution.

For RETRADE, retain separate models for account sessions, monitor groups/destinations,
URL searches and local matching rules, and checkout preferences. A successful account
connection must not imply successful catalogue scanning. Each capability needs its
own status and verification. Bot identity is a useful optional attribution lead,
not a prerequisite for preparing the independent monitor configuration.

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

The historical `conn-check.icg-in.com` clue was checked against
[DuckDuckGo's observed domain data](https://github.com/duckduckgo/tracker-radar/blob/main/domains/US/icg-in.com.json).
It records `/wsconn` WebSocket requests on eight Vinted sites, including the UK, plus
`/connectioncheck` and `/netconn`. Ownership is unclassified in that dataset. This shows
that the connection appears in Vinted page traffic; it does not establish a product feed,
Resell Locker's backend, or ownership by any listed initiator.

## Further source investigation

The user's hypothesis is plausible: listing monitoring need not use a personal buying account.
The pinned [VintedScanner source](https://github.com/drego85/VintedScanner/blob/d2924a310893382f4cd95aba5551324d3a679171/vinted_scanner.py)
initializes an anonymous website session. Its [README](https://github.com/drego85/VintedScanner/blob/d2924a310893382f4cd95aba5551324d3a679171/README.md)
documents a September migration to the same catalogue endpoint family as our public adapter.
This is source-level evidence; current UK live availability is unverified. Anonymous session
cookies are different from a user's personal refresh token. Our recorded stopped worker was
already in public mode, so simply removing personal credentials is not a new access fix.

The candidate mappings inferred from the pinned VintedScanner source use
`attribute_ids[catalog]`, `[brand]`, `[status]`, `[size]`, `[color]` and `[material]`.
These mappings, including `status` for condition, have not been verified against live UK
responses. No game-platform mapping was verified.
The old top-level `catalog_ids`/`brand_ids` representation is now retained only for explicit
offline comparison. There is no automatic endpoint/schema fallback after a refusal.

A normal-browser observation of the user's first URL was attempted. The browser tool returned
`Tab 1 is not part of browser session`; no usable page was observed. This is an automation
failure, not a Vinted HTTP result or evidence that a normal logged-out browser was refused.

### Documented alternative listing source

[Vinotify developer docs](https://vinotify.me/docs/) describe REST event feeds and HTTPS
webhooks without a personal Vinted login, using a Pro integration token. Pull feeds expose
IDs/cursors and retained history; push delivery is best effort, so a durable integration
would need cursor-based catch-up and deduplication. Category-filtered searches such as these
four links do not qualify for its early-alert mode. Its current UK [pricing](https://vinotify.me/pricing/)
is £19.99/month or £5.99/week for Pro. Pricing lists 100 searches while developer docs list 50;
do not hardcode either account entitlement. A Pro trial was not established.

The provider's [terms](https://vinotify.me/terms/) permit documented integrations for internal
business use; paid redistribution needs a separate agreement. It is independent of Vinted
and does not guarantee complete or uninterrupted detection. This is a possible integration
route, not an assertion of Vinted endorsement, proven speed, or Resell Locker attribution.
No provider account, purchase, token, search or webhook has been created. Live evaluation
requires a provider account and token; none is currently available in this task.

## Worker code and verification

`worker/monitors/src/search-link.mjs` is a pure parser/serializer used by gated worker paths:

- `parseVintedSearchUrl(rawUrl)`: UK HTTPS catalogue URL, optional text, immutable normalized
  facets, integer-pence boundaries, original URL and canonical website URL.
- `buildVintedSearchParams(config, options)`: candidate catalogue-schema serialization.
  An explicit `schema: 'legacy'` exists for historical comparison only. Both profiles are
  fixture-tested; live filter acceptance remains unverified. No transport is selected here.
- `sourceSearchKey(config)`: all supported non-price source filters; callers must add owner
  scope. This is a grouping key, not a complete query or monitor identity.

Unknown parameters, unsupported image searches, ambiguous singleton values, invalid IDs/prices
and unsafe destinations fail explicitly rather than silently widening a search.
Supported catalogue facets include size, colour and material. Video-game platform is preserved
on URL import but explicitly rejected before transport because its current mapping is unknown.

`contracts.mjs`, `recipe-source.mjs`, the adapter, bounded scanner, session diagnostic,
automatic worker, validation and matcher now carry optional `searchUrl` recipes. Exact URL
prices are authoritative; incompatible legacy search terms or price overrides are rejected.
Automatic-worker source queries share only within an owner and identical non-price filters. Models and title
blacklists remain separate local rules; model selection is optional for URL recipes.

Every network entry requires the server-owned `candidateLinkSearch: true` capability for URL
mode. Request-body flags cannot enable it. The service supplies no capability, so new URL
recipes remain unavailable to live users and the automatic worker skips them before renewal
or transport. UI import and manual-service grouping are not yet integrated. Description-based
rejection still requires unavailable enrichment and remains disabled at service validation.

Independent review reproduced a cache defect: a condition-restricted monitor could reuse a
page obtained for an unrestricted monitor without validating condition availability. Both
fresh and cached pages now undergo the current monitor's checks. A regression covers URL and
legacy queries and confirms no false successful baseline/seen-ID commit or extra request.
No production configuration, credentials, notification job or UI behavior changes are activated.

Verification: `node --test tests/monitors/*.test.mjs` on Node 24.14.1:
**109 passed, 0 failed**. Tests use synthetic transports;
they establish parsing and regression behavior, not live availability or latency.

PR validation update: GitHub Actions run `39131884248` passed the 94 monitor tests
and build, then failed the existing 1440px WebKit bulk-list test at
`tests/bulk-list-browser.cjs:71` because the quick-added item lookup was undefined.
At that original PR57 head (`0041dc9`), the browser test was unchanged from the PR base
and the new parser was not runtime-imported. The current integration does import it.
Investigation then reproduced a deferred panel-focus race independently: a callback moved
focus from quick-add's title input to the close button. The focused repair is in PR #58.
Its deterministic regression fails before the fix and passes at 320/390/1440px in Chromium;
account-cost/payout Chromium tests also pass. The formerly failing bulk-list and account-cost
WebKit steps have now passed in PR58 CI. This proves those checks passed with the repair;
it does not establish that the focus race caused both earlier failures. The complete workflow
result is tracked on PR58 and must not be inferred from individual passing steps.

## Remaining integration work and evidence

1. Use available provider/command evidence to investigate the source contract. If the actual
   Resell Locker application name becomes available, use it to narrow attribution; do not
   block independent preparation on a screenshot the user cannot currently provide.
2. Confirm the actual source/export contract and an authorized usable path in the hosting
   environment. Respect the existing blocked state until that is established.
3. Finish service manual-query grouping and URL-import UI against the tested worker contract.
   Verify actual category/brand/condition scope before enabling the capability; a 200 response
   alone does not show filters were honoured. Keep source keywords distinct from whitelists.
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

