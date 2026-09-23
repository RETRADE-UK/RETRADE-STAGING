# Vinted monitor audit

Date: 2026-09-23. Baseline: staging `4d5b71f`; legacy Git monitor head `6ea9f95`.
Scope: all three recovered archives, their feature deltas, Git dashboard/storage
adapter and schemas, v3 worker/UI/cloud bridge, original benchmark plan and screenshots.

## Verdict

The separation of scanner, provider adapter, matching/scoring, persistence and
native UI is appropriate. The v3 source is the most complete functional starting
point. Neither prototype is ready to activate. The Git branch must not be merged
wholesale: it would restore an obsolete app structure and a conflicting database
contract. Its standalone styling also replaces the native look with a separate shell.

Keep the recovered source quarantined, implement focused replacements under the
current owners, and validate a real source before spending time on advanced scores.
There is no evidence of a deployed worker or an applied monitor migration in this
audit. Database state was not queried or changed.

## Activation blockers

Paths below are relative to `experiments/monitors/recovered-v3/` unless specified.

| ID / priority | Evidence and effect | Required correction |
| --- | --- | --- |
| M01 / P0 | `worker/monitors/src/engine/score.mjs` converts `null` to `0`; a synthetic £80 listing with unknown total produced landed cost **0**. UI `money(null)` likewise displays £0. Missing costs can create misleading profit and BUY/SNIPE decisions. | Explicit null handling; distinguish item, buyer fee, postage and total; finite GBP money validation. Incomplete cost/valuation means CHECK, not a fabricated margin. |
| M02 / P0 | Git SQL and v3 SQL use the same table names with incompatible columns and enum case. Git has `category_id`, `filters`, `expected_resale_low`, uppercase decisions; v3 requires `archived`, `template_key`, `config`, `resale_low`, lowercase decisions. `CREATE TABLE IF NOT EXISTS` does not upgrade existing tables. Git's permissive owner-all listing/match policies would remain if v3 were applied on top. | Inspect staging schema/history read-only, choose one versioned contract, then an append-only migration with explicit grant/policy reconciliation and tests for both predecessor shapes. Do not run either prototype SQL unchanged. |
| M03 / P0 | `ui/monitors.js` uses global localStorage keys, loads cached recipes/deals before cloud authentication and automatically uploads them into an empty signed-in account. No logout/user-change reset or stale-response fencing. | Account/environment-scoped cache, auth lifecycle disposal, request generation checks; explicit reviewed import of local drafts. No silent fallback presented as cloud success. |
| M04 / P0 | `ui/monitors.js:renderDealCard` interpolates HTML-escaped URLs inside inline JavaScript. HTML escaping is not JavaScript escaping; entities are decoded before the handler runs. URL scheme/host is not validated. IDs also enter inline handlers. Git dashboard uses an escaped but unvalidated `href`. | Event listeners/data attributes, textContent, strict HTTPS Vinted host/path validation, validate IDs and decisions. Add malicious URL/quote fixtures before rendering external data. |
| M05 / P1 | `adapters/vinted.mjs:enrich` normalizes sparse detail with fallback title and empty photo array, then overwrites good catalog data. Synthetic `{item:{id}}` changed “Canon EOS 600D faulty” to “Vinted listing” and erased photos. The second match can drop an otherwise valid listing. | Presence-aware merge; absent fields cannot overwrite useful catalog values. Preserve provenance and completeness flags. |
| M06 / P1 | `adapters/vinted.mjs:search` returns `[]` when the response lacks `items`. Synthetic `{message:'unexpected schema'}` looked like success, allowing a false heartbeat/baseline. Requests have no timeout/cancellation and follow redirects. | Validate response shape, IDs/currency/numbers; distinguish true empty results from provider failure. Bound requests, validate destination/redirects and fail visibly on contract changes. |
| M07 / P1 | `index.mjs` matches before enrichment; a model only in description cannot be recovered. `engine/match.mjs` ignores `custom_models`; custom-only monitor accepted an unrelated laptop. `price_max=0` becomes Infinity. Category is a label, not a provider filter; model aliases can match accessories “for 600D”. | Separate cheap candidate selection from final matching; combine built-in/custom rules; explicit zero bounds; map provider filters; test camera versus accessory ambiguity without silently tightening benchmark rules. |
| M08 / P1 | Each poll enriches every candidate before checking stored match identity. With 3 searches and 150 unique candidates with sellers, a cycle can perform up to 303 provider requests (plus bootstrap), even for already-seen items. Search cache lasts one cycle only; no seller cache. Sequential processing delays later monitors. | Fetch deduplication and bounded concurrency, persistent seen state, cache detail/seller enrichment with expiry, incremental changed-item refresh, shared request budget and fair scheduling. Capture first observation before enrichment. |
| M09 / P1 | First-page-only search, no overlap/watermark pagination or saturation warning. `MAX_LISTING_AGE_MINUTES` and `LOG_LEVEL` in original example are unused. Fixed 403/429 delays ignore Retry-After; backoff and bootstrap state are process-local. | Bounded overlapping pages, saturation/coverage metrics, persisted backoff, jitter, provider Retry-After and recovery state. Remove unsupported configuration. Do not promise speed from shorter intervals alone. |
| M10 / P1 | First-run silence is inferred from `last_success_at`; a partly completed/crashed baseline can suppress newly arriving items on retry. No lease prevents multiple worker instances scanning one monitor. Edits do not version/rebaseline rules. | Persist baseline boundary/run state, lease expiry and configuration revision; transactional/idempotent persistence. Test crashes, restart, overlap and rule changes. |
| M11 / P1 | `db.mjs` ignores listing-update errors and only logs heartbeat/benchmark write failures. Match insert and benchmark insert are separate; if the event fails after match success, deduplication prevents a retry. Top-level active-monitor query failure terminates the process. | Propagate failures; transaction or recoverable outbox for detection/benchmark/delivery; resumable worker with supervisor and structured health. Test DB timeouts and failed writes. |
| M12 / P1 | Benchmark timestamps are recorded after enrichment and database writes. Table cannot represent Discord-only misses without fabricating a RETRADE timestamp (it is NOT NULL DEFAULT now). No browser workflow to enter comparator times, and no update policy for them. | Separate provider publication, first observation, persistence, feed visibility and notification times. Nullable independent observations keyed by listing ID, comparator-only entries and coverage/latency reports. |
| M13 / P1 | v3 match owner UPDATE policy permits changes to all granted columns, not just disposition; benchmark FK ownership is not validated. Parent owner changes can leave relationships inconsistent. Grants rely on project defaults; trigger functions lack a fixed search_path. Anonymous staging users can satisfy `authenticated`. | Immutable ownership, same-owner relational constraints, explicit least-privilege grants and status-only writes; reject anonymous demo accounts for real jobs; protected worker health/baseline fields and benchmark attribution. Verify as anon/user A/user B/worker. |
| M14 / P1 | Rating normalization guesses 0–1 versus 0–5 from the numeric value; missing seller fields can overwrite known ones. `zero_review_mode='allow'` still scores zero reviews high risk. Warnings do not prevent economic BUY/SNIPE, and accessory detection treats “no charger” as a charger signal. | Explicit provider field scales and partial-data merge; specify each risk mode; consistent warning/risk policy; negative phrase tests and no automatic accessory valuation. |
| M15 / P2 | UI and worker have different seller scoring. UI overwrites stored reasoning with generic statements, including “strong economics” when valuation is unknown. Image URL is mapped but feed does not render photos. Monitor card hardcodes “0 matches today”. | One decision contract with evidence/confidence; honest pending values; display actual photos/reasons/heartbeat and counts. |
| M16 / P2 | UI writes local state and announces saved/paused before cloud confirmation, swallows dismiss errors, refreshes whole page HTML every 15 seconds, and has no document-visibility gate or auth-aware disposal. Queries select raw payloads unnecessarily. | Await/rollback or show pending states; preserve focus/scroll; incremental updates and cursor pagination, explicit columns, visibility-aware subscription/poll lifecycle. |
| M17 / P1 | Original worker has floating dependency versions, no lockfile, arbitrary SUPABASE_URL, no staging-only check or deployed process configuration. Both notification systems and marketplace actions are absent. | Pin/lock dependencies during implementation; explicit staging URL/worker-owner scope, secret injection, dry-run mode, retention and operational metrics. Establish supported access before enabling network work. |

P0 means activation blocker, not that the currently deployed app has this defect:
all affected recovered monitor code is excluded from runtime and deployment.

## Discord parity: observed, not assumed

The screenshots show **Resell Locker / Locker | Sender 3**, a Canon £51–£100
channel, seller name, UK marker, title, description, relative update age, brand,
condition, star/review count, item price and approximate second price, multiple
photos, plus **View**, **Buy Now**, **Send Offer**, **Favourite** buttons.
The screenshots do not establish what the buttons do after clicking, exact fee
coverage of the second price, API access, hidden filters, or measured alert latency.

| Capability | Recovered implementation | Required before parity claim |
| --- | --- | --- |
| Continuous new listing detection | v3 polling prototype; not deployed or live-verified | Source feasibility, coverage/restart tests, stable hosted worker |
| Canon/price rules and aliases | v3 matcher/builder; gaps M07 | Exact benchmark config, false-positive/negative fixtures |
| Seller, condition, brand, description, photos | Partial normalization/storage; limited feed presentation | Correct nullable data, gallery, description and clear fee breakdown |
| Detection and relative age | DB detection time; not equivalent to listing updated time | Separate timestamps with precise labels |
| View listing | Present but unsafe inline handler | Validated link and mobile handoff |
| Buy Now | Absent | Validate supported/manual purchase handoff; do not label a plain view link as purchase parity |
| Send Offer / Favourite on Vinted | Absent | Verify the Discord behaviour and available authenticated integration; RETRADE-only save is a separate action |
| Discord alerts / phone push | Preferences or toggle only; no sender | Outbox, retries, deduplication, permission/subscription UX and delivery tests after benchmark |
| Reliable pause/edit/archive | Local UX exists; cloud confirmation/worker leases missing | Persisted control state and observable worker acknowledgement |
| Faster/more efficient operation | No comparative evidence | Matched-ID latency distribution plus requests, cost, failures and duplicates measured on equivalent filters |
| Better reseller decisions | Prototype score; no calibrated valuation | Correct full cost model, dated evidence, explanation and manual review |
| Purchased → stock / history | Not implemented | User-confirmed, idempotent stock handoff through existing accounting/lifecycle APIs |

“Everything Discord does” remains the target. Marketplace write actions and
external notification sending have not been executed during this audit.

## Current source feasibility research

Vinted's official Pro documentation describes allowlisted access for inventory,
orders and their webhooks. It does not establish a general marketplace buyer-search
feed. Therefore the Pro integration must not be assumed to replace the prototype's
undocumented `/api/v2/catalog/items` connector. This is an inference from the
documented surface, not a claim that no other authorised access could exist.

Reference: https://pro-docs.svc.vinted.com/ (reviewed 2026-09-23).
No live catalog requests, Vinted sign-in or purchases were performed. Source access,
hosting and real-world reliability remain the next feasibility gate.

Database review reference: https://supabase.com/docs/guides/database/postgres/row-level-security
(grants and policies are separate; anonymous sign-ins can use authenticated role).
Notification design reference: https://github.com/discord/discord-api-docs/blob/main/developers/topics/rate-limits.mdx
(use provider retry information, not fixed assumed rate limits).

## Verification evidence and limits

- Compared the full v1/v2/v3 file inventories and content deltas; recovered v3
  is additive over v2's monitor feature. No accounting/reports replacement is needed.
- Offline synthetic probes reproduced M01, M05, M06 and M07; no network or DB was
  needed. £80/null total → 0; sparse detail → fallback title/empty gallery;
  malformed search → empty success; zero max → unbounded; custom-only → unrelated match.
- Offline benchmark probe retained a faulty £80 600D with a warning and zero-review
  RISKY classification, confirming the intended permissive starting behaviour.
- Recovery test verifies all 14 recovered source hashes, JS syntax, all 11 Canon
  alias groups at both price boundaries, warnings/zero-review visibility and that
  no monitor or worker source is in the public asset allowlist.
- Root check/build and the existing synthetic browser/service-worker suite are
  the merge gates. CI records their final outcome on the takeover PR.
- SQL findings are static review, not database execution. Browser checks validate
  unchanged app behaviour, not a live monitor UI. Device push, physical phones,
  marketplace availability, throughput and Discord timing are unverified.
