# Monitor implementation plan

This is the next workstream after recovery. Keep PRs small and independently
testable. The current recovery PR intentionally enables no monitor runtime.

## Folder ownership

Create files only when they have an implementation and a testable purpose; do not
populate empty scaffolding. Reuse existing repo tools instead of a second build system.

| Owner | Intended contents |
| --- | --- |
| `src/features/monitors/` | Native page, builder/feed, cloud adapter and explicit lifecycle; no provider credentials or polling worker |
| `assets/styles/monitors.css` | Feature-scoped styles using current RETRADE tokens; no second application shell |
| `worker/monitors/` | Independently deployable Node service, pinned package/lockfile, config validation, provider adapters, scheduling, matching, persistence and delivery |
| `supabase/migrations/` | Approved append-only monitor schema changes after schema discovery; no prototype SQL copied blindly |
| `supabase/tests/` | Grants, ownership, migration compatibility and transactional database tests |
| `tests/monitors/` | Synthetic contract, regression, UI and worker fault tests; no production traffic |
| `docs/features/monitors/` | Requirements, decisions, gap matrix, deployment/runbook and benchmark protocol |
| `experiments/monitors/` | Frozen recovered reference; excluded from public assets/build and worker deployment |

`config/assets.js` remains the only public loading/build contract. Register the
repaired UI as on-demand once an explicit mount/unmount integration exists. Keep
the benchmark route separate from Sourcing. Preserve dashboard-first cold start,
the current welcome/login sequence, staging binding and parked gestures. Add one
small authenticated integration point; do not paste the old cloud bridge into
the 1.6 MB core or merge any old full app files.

## Implementation sequence and exit criteria

### 1. Validate contracts and data source

- Inspect the isolated staging schema and migration history read-only. Establish
  whether neither, Git, v2/v3 or mixed monitor tables already exist. Do not touch
  the production project. Record staging project `dvnrxmdejxfuazmpnudj` explicitly.
- Define a versioned recipe (including built-in/custom models and match-any
  semantics), nullable listing fields, money/currency and scoring result once.
  Keep provider-normalization separate from business decisions. Use integer minor
  units at boundaries or explicit decimal handling; reject NaN/Infinity.
- Specify provider capabilities: catalog search, structured filters, overlap
  pagination, optional item/seller enrichment, freshness and rate-limit signals.
  Test malformed/partial/empty replies with fixtures before real traffic.
- Verify a supported usable Vinted data-access path and its availability in the
  actual hosting environment. A mock does not pass this gate. Handle blocked
  access visibly; do not build reliability around defeating access controls.
- Record hosting choice and expected budget once request-volume evidence exists;
  no platform or sub-second promise was agreed in the recovered material.

Exit: agreed source capability contract, staging schema inventory and fixture
coverage. If the source is unavailable, retain a disconnected UI state and
document the blocker rather than labelling demo results live.

### 2. Repair worker and database foundation

- Fix M01–M14/M17 from the audit before reuse. Start with matcher/normalizer unit
  fixtures: every alias, price boundaries, custom models, title-only/detail-only
  names, accessory-only listings, unknown/zero prices, foreign currency, warnings,
  seller 0 versus unknown, partial detail/profile data and missing valuations.
- Reconcile schemas explicitly. Prefer one recipe contract, with versioned
  category/catalog definitions; do not adopt the older category tables solely
  because they exist. Keep ownership immutable and restrict client writes to
  recipe settings, match disposition and validated comparator observations.
- Use an expiring per-monitor lease, config revision and persisted initial
  baseline/watermark. Record which candidates were seen in the baseline even
  when suppressed. A restart or partial failure must not reinterpret new items
  as old. Edits and newly widened scopes need an explicit rebaseline policy.
- Group identical catalog queries, enforce one shared request budget, and queue
  only needed enrichment. Cache seller/item details with explicit TTL/version.
  Use bounded overlap pagination with coverage warnings when the window saturates.
- Record `observed_at` immediately when a listing first arrives. Persist match,
  benchmark observation and future notification work atomically or with a
  recoverable transactional outbox. Capture persistence/visible/delivery times
  independently. Duplicate work must not duplicate alerts or benchmark rows.
- Backoff obeys provider Retry-After, uses jitter and persists across restarts.
  Every request has timeout/cancellation. Expose blocked/degraded/stale states,
  last successful cycle, next attempt, queue lag and request/error counters.
- Run explicit DB allow/deny tests as signed-out, anonymous-demo, owner A,
  owner B and worker; test attempted foreign ownership, parent updates, forged
  match scores and read access to raw payloads. Generate migrations with the
  Supabase CLI, validate locally, then apply only to isolated staging.

Exit: crash/restart, duplicate workers, failed DB writes, malformed provider
responses, pagination overflow and rate limits cannot silently corrupt coverage.
Benchmark remains feed-only; no notification recipients are contacted here.

### 3. Integrate native UI in staging

- Mount through authenticated app context and dispose on navigation/logout.
  Scope caches to environment/user, cancel stale requests and reset on account
  change. Draft import must be a visible explicit action. Unsaved/cloud-failed
  actions cannot appear confirmed.
- Keep familiar RETRADE navigation, styles, skeleton/motion policy and responsive
  layout. Build dedicated monitor skeletons with matching geometry; preserve
  focus/scroll during incremental feed updates. Avoid full-page 15-second rerenders.
- Feed: image gallery, title, description, source, brand/condition, seller
  rating/review count, precise price components, honest unknown values, warnings
  and reason, source update time and RETRADE detection time. Show actual health.
- Builder: benchmark and buying templates remain separate; edit/pause/duplicate/
  archive must wait for persistence or show pending/failure. Archived recipes
  stay recoverable. Do not auto-create enabled paid/network jobs for demo users.
- Validate external links and use event listeners. Test hostile quotes/schemes,
  missing photos, long text, keyboard focus, reduced motion, mobile layout,
  sign-out during load, failed writes and old-data responses.

Exit: authenticated fixture UI and staging integration pass existing app gates
without startup/network regressions; only then enable the real benchmark worker.

### 4. Measure Resell Locker parity

Use the recovered £51–£100 Canon recipe, all 11 models/Rebel aliases, all
conditions and warnings-only faults/zero-review sellers. Initial catalog baseline
is recorded and excluded from new-listing timing comparisons.

For each unique Vinted listing ID store independent RETRADE and Discord
observations; either timestamp may be absent. Log source publication/update time
separately. Include Discord-only rows, RETRADE-only rows, duplicate counts and
the reason for a non-match (source miss, filter, baseline, persistence, UI delay).
Do not use a listing's “updated 15 minutes ago” as the Discord message receipt time.

Run side by side for several days with the same observable scope. Record:

- coverage against observed Discord IDs and legitimate extra RETRADE matches;
- signed RETRADE-minus-Discord detection difference, median and p95 on shared IDs;
- source-to-observation, observation-to-feed and eventual delivery delay separately;
- duplicates, stale intervals, request counts, enrichment cache hit rate and cost.

Proposed acceptance gates (not previously agreed performance promises): at least
99% coverage of eligible observed comparator IDs, zero duplicate user alerts,
no unexplained stale periods, and p95 comparative latency no worse than the
existing monitor. Report sample size and exclusions; a small sample is inconclusive.
Improve efficiency by reducing repeated work, not simply increasing request rate.

### 5. Complete action and notification parity

- Confirm what the observed **Buy Now**, **Send Offer** and **Favourite** buttons
  actually do. Screenshots prove labels, not purchase/offer/favourite execution.
  Validate supported authenticated action mechanisms before implementing them.
  A Vinted view link and a RETRADE shortlist must be labelled honestly.
- Add opt-in Discord and web-push delivery with a durable outbox, idempotency,
  retries, expired-subscription handling, quiet/urgent preferences and traceable
  delivery state. Feed-only benchmark must never create delivery jobs.
- Calibrate resale estimates from dated evidence, include all purchase/exit costs,
  and expose confidence and explanations. Expand to other product categories only
  once the source, model catalogue and contract are reusable.
- Add user-confirmed purchased-to-stock handoff through RETRADE's existing stock
  API/lifecycle rules with a unique source reference. Never create accounting
  records just because an alert was viewed or a marketplace button was clicked.

Exit: feature-by-feature evidence against the audit matrix; only claim faster or
better once measured. Production promotion gets its own reviewed PR and migration
plan, excluding all staging bindings, test-auth helpers and recovered source.
