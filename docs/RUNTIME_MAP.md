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
