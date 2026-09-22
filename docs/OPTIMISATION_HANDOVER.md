# RETRADE optimisation handover — v1.5.60

Requested scope: clean up live, retain the refined motion, bring staging to the same shared baseline, and park gestures before starting Vinted monitor work. Work was completed in several audit/implementation/verification passes; this is not a claim of eight hours of continuous execution.

## What changed

| Area | Result |
| --- | --- |
| Repository root | 76 files reduced to 10; root JavaScript reduced from 53 files to `app.js` and `sw.js` |
| Source ownership | `src/core`, `src/domain`, `src/platform`, and feature folders for charts, Sales, partners, bundles, cashflow, exports and diagnostics |
| Static assets | Styles, icons and iOS launch images grouped under `assets/` |
| Load/cache lists | One `config/assets.js` contract replaces separate runtime lists; ordered classic-script execution is retained |
| Startup payload | About 69 KB of developer sample data and regression fixtures moved to on-demand files; normal startup no longer parses them |
| Proven redundancy | Removed the shadowed first `duplicateExpense` definition; archived the uncalled v2 statement engine that was still being precached |
| Background work | Partner-form observer scoped to its actual form/page hosts, removing dashboard/body-wide mutation scanning |
| Service worker | Small initial shell, maximum three warming fetches at a time, deduplicated warm requests, optional warming skipped for Save-Data |
| Cold-start update bug | Deferred core now registers the worker even when the browser's `load` event has already fired |
| Offline/upgrade | Scope-relative asset paths, one previous cache generation for open tabs, legacy URL mapping and useful offline retry message |
| Deployment tooling | Allowlist-based `_site/` export excludes inactive code, docs, tests and experiments |
| Maintenance | Reusable syntax/asset/isolation/invariant checks, size inventory, ownership map, working agreement and safe Windows update instructions |

No financial formulas, forecast arithmetic, database schemas or stored user records were changed. Extracted accounting fixture functions retain their original source; their 62 checks pass. Developer preview stays disabled in production and is loaded only after the existing explicit gate.

Folder moves improve maintainability, not frame rate by themselves. The runtime optimisations are the reduced startup parsing, narrower observer and bounded cache work. This pass preserves v1.5.59 chart/forecast timing and brand travel.

## Staging

Staging receives the shared v1.5.60 runtime while retaining `test.retrade-uk.com`, its original isolated Supabase binding and anonymous test-workspace helper. Its binding must load before core evaluation; a failed binding blocks startup rather than falling back to production.

Nine gesture/interaction sources are preserved byte-for-byte in staging's `experiments/gestures/`. The complete former staging tree remains on `archive/gestures-g1-20260922`, pointing to `f83d1013e1e389902b4dd7d3f368b0c36512ea21`. The experiment README records original load order and how to resume deliberately. Gestures are absent from the active manifest, cache list and staging deployment artifact.

Inactive staging-only performance/loading patches are archived with their history. The staging Pages workflow now deploys the generated allowlist, including nested runtime folders. Production keeps its existing branch-based Pages configuration; archives are inactive but may remain directly addressable on that host until hosting is separately switched to the allowlist build.

## Verification

Local checks and the PR workflows cover:

- Complete runtime asset existence/reference/ownership checks, JavaScript syntax and existing production invariants.
- Desktop and mobile layouts; reduced motion; welcome/login travel; rejected credentials and accepted-session/error race; first-login KPI targets.
- Navigation across Stock, Sales, Partners, Costs, Cashflow, Runs, Tax, Data, Returns, Archive, Activity and Search; no blank destination.
- Partner form labels and on-demand statement/export module loading after the moves.
- 62 financial/lifecycle/cashflow/summary fixture checks after their on-demand extraction.
- Dashboard forecast ordering after navigation/resizing; slow data and startup; skeleton grace period; 600-item navigation fixture.
- Staging endpoint selection and failed-binding isolation.
- Worker concurrency, deduplication, Save-Data, lazy assets, scope boundaries, older tabs and offline recovery.
- Actual Chromium upgrade from a previous installed worker through the relocated app to the new worker, followed by an offline cached-core request.

All tests use synthetic data/local or intercepted requests. No production credentials or business data were used. CI results and merge/deployment status are recorded on the corresponding live/staging PRs and the final chat report.

## Remaining limits

The core is still about 1.6 MB uncompressed and uses shared globals. Partner features still contain ordered historical wrapper layers. Removing them without feature-by-feature coverage would risk behaviour. The current production inventory is approximately 1.91 MB of initial JavaScript, 0.52 MB of deferred JavaScript, 0.14 MB on demand, and 0.35 MB CSS; run `npm run audit:size` for exact current figures. These are uncompressed sizes, not transferred gzip sizes or FPS measurements.

Physical Safari/iOS, Android and the user's desktop still need subjective frame-pacing checks. Synthetic browser runs cannot establish universal 60/120 FPS, production-account correctness for every lifecycle, or exhaustive absence of bugs. CPU-heavy rendering can still block a frame; a skeleton timer cannot interrupt synchronous JavaScript.

The next architectural step is a measured feature extraction from the core with explicit inputs and regression coverage, rather than indiscriminate minification or deleting similarly named files. Vinted monitoring and API integration have not been started.

## Local PC and next chat

Read [local checkout update](LOCAL_CHECKOUT_UPDATE.md). A normal fast-forward pull applies the tracked moves/removals. Preserve local commits/edits first; do not use `reset --hard` or a destructive clean. The new `scripts/update-local.ps1` automates backup branch/stash plus fast-forward checks for subsequent updates. Your PC has not been changed remotely.

Start the next work chat against staging and point it to [next feature handover](NEXT_FEATURE_HANDOVER.md). The active product baseline is ready for feature work once the recorded PR checks and deployments have completed.

## References informing the approach

- [web.dev: PWA caching](https://web.dev/learn/pwa/caching) — cache a deliberate asset set; avoid unnecessary storage/downloads.
- [web.dev: prefetching and precaching](https://web.dev/learn/performance/prefetching-prerendering-precaching) — selective warming and Save-Data respect.
- [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) — module scope differs from classic-script globals; conversion needs a planned migration.
