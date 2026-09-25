# Runtime ownership

`config/assets.js` is the source of truth for build ID, execution order, on-demand modules, static assets and legacy URL mappings. `app.js` and `sw.js` consume it; `scripts/assets.cjs` reads it for checks/builds. Do not maintain a second asset list.

| Responsibility | Owner |
| --- | --- |
| First-frame shield, wordmark, appearance and sealed page | `index.html` |
| Scheduling, core preload, fail-closed environment binding | `app.js` |
| Welcome, login travel, skeleton handoff and dashboard release | `src/platform/launch.js` |
| State, auth, routing and primary views | `src/core/application.js` |
| Accounting, fee integrity and reports | `src/domain/` |
| Analytics caching and idle warming | `src/platform/performance.js` |
| Navigation and resume | `src/platform/navigation.js`, `lifecycle.js` |
| General UI visibility and motion | `src/platform/interface-motion.js` |
| Dashboard SVG geometry | `src/features/charts/polish.js` |
| Dashboard bar/forecast timings | `src/features/charts/motion.js` |
| Forecast content and loading handoff | `src/features/charts/finalize.js`, `reveal.js` |
| Sales line sequence and calendar layout | `src/features/sales/` |
| Partner model/presentation/settlement extensions | Ordered partner files in the manifest |
| Bundle, cashflow and document extensions | Corresponding feature directories |
| On-demand partner statements and diagnostics | Manifest `lazy` list |
| Item costs, postage policy application and item view | `src/core/application.js`; `assets/styles/item.css` |
| Sync status presentation | Core `_refreshSideNavSync`; `assets/styles/status.css`; mobile header in `index.html` |
| Responsive Tax view | `src/core/application.js` (`renderTax`), `assets/styles/tax.css` |
| Tax cash timing and calendar slices | `src/domain/accounting-engine.js`; report export in `report-engine.js` |
| Static cache and old-path transition | `sw.js` |

## Loading contract

The two domain entry scripts load before the core. Core fetching overlaps the welcome; evaluation waits for the shield motion. Critical presentation modules install before dashboard release. `retrade:motion-ready` marks that installation; `retrade:launch-settled` allows serial idle loading of deferred extensions. Login can pause that queue. Warm navigation does not replay the brand intro.

Classic scripts intentionally retain their existing scope and wrapper order. File names such as partner `account-ui-v3` and `account-ui-v4` identify layers that currently both contribute behaviour; they are not automatically redundant copies. Changing their order or concatenating them is unsafe without tracing the wrappers.

Diagnostics are explicitly on demand: `_loadDiagnosticFixtures('accounting')` loads four regression runners; `_loadDiagnosticFixtures('preview')` loads the sample dataset. The release-check UI and disabled-by-default developer preview entry point call these loaders. Normal user data is not replaced by sample data.

## Cache and deployment

The worker installs a small shell and limits warming to three concurrent requests. Remaining active scripts warm after launch; Save-Data skips optional warming. Export engines, diagnostic datasets and device-specific launch images cache only on use. Whitelisted scope-relative paths exclude APIs and business data. One preceding cache generation supports already-open tabs; legacy URL aliases allow the folder migration. Unknown routes bypass the static cache.

`npm run build` exports only public runtime assets. Staging's Pages workflow uses this export. Production currently uses its existing branch-based Pages deployment; historical archives remain in the repository and may be directly addressable, though the app never loads them. Changing production hosting source requires a separate hosting configuration change.

## Repository boundaries and future extraction

Small fixes go through the live repository's PR/CI flow. New features begin on staging. Staging retains its own CNAME, public Supabase binding and test-login helper. Its loader fails closed if the binding is unavailable. Gesture G1 is disabled under `experiments/gestures/` and preserved on `archive/gestures-g1-20260922` in the staging repository.

The core is still around 1.6 MB uncompressed. Next extractions should give one feature explicit inputs and regression coverage at a time. Accounting/persistence rewrites, wholesale partner-wrapper consolidation and a framework migration are not part of this cleanup. The local maintainer checkout is `C:\RETRADE-UK\RETRADE`.

Monitor takeover: `experiments/monitors/` contains recovered, audited reference
sources only and is excluded from the allowlist and `_site/`. The repaired offline
engine belongs to `worker/monitors/`, also excluded from public assets. There is
no active monitor UI or deployed service yet. See
`docs/features/monitors/IMPLEMENTATION_PLAN.md` for UI/worker/schema boundaries
and activation gates, and the worker README for the current tested contract.

## Monitor preview runtime

Monitors now mounts on demand from `src/features/monitors/cloud.js` and `page.js`, registered in the manifest lazy list. The core owns only navigation, load and disposal hooks. `assets/styles/monitors.css` is scoped to this page. `supabase/functions/monitor-service/` deploys the original `worker/monitors/src/` engine, with no public worker assets. Push uses the existing service worker. The source is blocked after a staging-host 403; example cards are never saved or notified. See `docs/features/monitors/MVP_RUNBOOK.md`.

## Release v1.5.70 — sync and interaction reconciliation (24 September)

Startup HTML uses the manifest build ID for every local script/style. The worker
honours explicit generation requests: an old tab receives its exact cached
asset when available, otherwise a revalidated network request, never a silent
substitution from the active cache. Business data and API responses remain outside
this cache. `check-assets.cjs` rejects startup version drift.

`navigation.js` owns the chrome layer order (navigation 350, FAB 360, search 370,
forms 400+). The mobile FAB has a stable, untransformed anchor. Closed options,
sheets and panels are inert; notifications cannot intercept taps. The core owns
dial dismissal and accessibility state. Interface motion only fades visibility.

The item revision guard records conflicts but leaves user feedback to the existing
bounded recovery/persistence owner. Successful reconciliation no longer displays
a premature reload error. Compare-and-swap protection, unresolved outbox retention
and cloud deletion protection remain enabled. No accounting rules or database
schema are changed by this shared release.

Validation: `npm run check`, `npm test`, `npm run build`, and the production
checkout's `node scripts/compare-staging.cjs ../staging`. The comparison strips only
the declared staging monitor hooks and rejects any other shared-runtime drift.
Browser tests use isolated data, actual pointer actions and mobile/desktop layouts;
they do not prove physical iOS/Android frame pacing or live account synchronization.
