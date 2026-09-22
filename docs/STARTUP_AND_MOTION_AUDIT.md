# Startup and motion audit (22 September 2026)

## Branch ownership

- `RETRADE` is the production repository for focused fixes and polish. Use a `fix/*` or `ui/*` branch, run CI, review a pull request, then merge to its `main`.
- `RETRADE-STAGING` is the separate repository for alpha features, including gestures. Do not copy production changes into it automatically while that work is active.

## Current startup path

`index.html` paints the launch plate, then loads accounting, reports, Supabase and `app.js`. The entrypoint loads `src/platform/launch.js`, preloads the 1.6 MB `src/core/application.js`, and evaluates the core after the shield animation. The core checks the session, chooses login or app, and loads data. The motion stack then releases the dashboard skeleton after its readiness gate. Secondary feature scripts run after the first reveal.

The number of files is not itself a performance problem. Total JavaScript is roughly 2.8 MB before transfer compression; the large core, script evaluation on the main thread, and overlapping chart/number motion are the material startup costs. Versioned enhancement files have several overlapping presentation owners, so deleting or bundling them by filename would risk changing render order.

## Changes in this pass

- Keep the welcome visible through the session check, then raise/fade its lockup into the login form for signed-out users.
- Deduplicate sign-in attempts, accept a session delivered by either the sign-in response or auth event, and clear the error when an auth event wins the race.
- Preload the core during the welcome animation and defer its evaluation until the shield/title sequence finishes. Preserve the existing dashboard reveal and deferred feature ordering.
- Align the CI launch-timing assertion with the current welcome durations.

## Next measured cleanup

1. Record cold and warm traces on desktop Chrome and actual iOS Safari/Android Chrome. Capture long tasks, first usable dashboard time, layout shifts, script evaluation, and animation frames. Compare signed-in, signed-out, slow-network and reduced-motion cases.
2. Establish a single owner for each motion phase: launch, auth handoff, skeleton release, dashboard charts and KPI counts. Remove overlapping wrappers only after checking call sites and comparing recordings.
3. Split `src/core/application.js` by behaviour at stable boundaries, keeping explicit load order and a small boot entrypoint. Consolidate versioned presentation layers after mapping their overrides and dependencies. Make each change in a separate PR with regressions for inventory, sales and partner pages.
4. Reserve chart sizes before data arrives; animate transforms and opacity where possible; coordinate chart and KPI starts from one dashboard-ready signal. Keep ordinary navigation immediate and limit the full welcome to cold starts.

Visual performance still requires device testing. Automated CI verifies syntax and source contracts, but cannot prove frame pacing or a successful live Supabase login.

## Follow-up: v1.5.56

Browser reproduction exposed two concrete sequencing defects: the launch seal made the login visibility check fail, and a cold-start class was removed before its entrance animation completed. Fix the visibility check, keep the class through the local header reveal, and remove the full-dashboard scale/translation. Slow core loading now retains the brand; core download errors offer a retry.

Defer secondary script evaluation and analytics warming until reveal settlement. Stop rebuilding hidden responsive charts; cap chart stagger duration; animate money-flow transforms instead of width. Cache currency formatters, skip repeated KPI text writes and hidden KPI animation, and restrict export observation to relevant panels rather than every animated dashboard text change.

Moved 13 unreferenced scripts into `archive/retired-runtime/`; see `RUNTIME_MAP.md`. This does not shrink downloads because these files were already inactive. Broader core extraction is still outstanding.

Validation uses populated synthetic data in headless Chromium, desktop and mobile viewports, and reduced-motion mode. It checks final KPI values, chart visibility and resizing, navigation, duplicate auth events, invalid credentials, accepted-session/transient-response races and slow core loading. Isolated frame traces show remaining long frames and vary in this software-rendered environment; they do not establish a universal frame-rate improvement or prove performance on physical Safari/Android devices. The earlier syntax-only limitation is supplemented by the new browser CI job.

## Follow-up: v1.5.57

The first-load zero figures were reproduced by holding the same Dashboard date range through hydration. The previous fixture changed the range inside its load stub, unintentionally avoiding stale cache keys. Analytics wrappers now bypass caching while real-layout seed data/hydration is active, invalidate on DB/user identity changes, and clear before/after cloud loads. Accounting calculations and persistence are unchanged.

New routes mount a lightweight skeleton before their deferred render if the page is empty or the Sales layout changes. Yearly Sales uses a calendar-first placeholder; populated same-layout pages remain visible with delayed inline activity feedback. No minimum navigation delay is introduced. Existing Dashboard real-layout skeletons remain for slow data; fast startup can bypass them.

A delayed, quiet status beneath the welcome identifies prolonged startup. The shield travels to its measured login position while the card enters; reduced motion skips the travel. Dashboard bars/counts and Sales history draw are slightly slower without delaying interaction. These are timing changes, not a claim of guaranteed FPS.

Guidance consulted: Apple HIG Loading/Motion and IBM Carbon Loading Patterns. Both support meaningful loading feedback without unnecessary interruption. Tests now include unchanged-range hydration, explicit yearly shells, rapid navigation, slow data skeletons, welcome activity, the shield bridge and a populated 600-item navigation fixture. Browser timing is diagnostic only, not a physical-device benchmark.

The 600-item fixture deliberately includes the historical `Electronics` category, which uses the existing unknown-category fee fallback. A CPU profile showed repeated identical `console.warn` calls dominating its yearly render. Warnings are now emitted once per unknown category per session. The fallback rate and all arithmetic are untouched; 45 comparisons against the previous implementation matched exactly. This improvement specifically benefits that legacy-category path and is not a universal device benchmark.

## Follow-up: v1.5.59

Audit found global motion overriding dashboard durations and an additional timer-stepped forecast sequencer. Dashboard timing now has one owner, `src/features/charts/motion.js`; global overrides were removed and the redundant sequencer archived/unloaded. Actual revenue/profit durations increase modestly from the effective 360/325 ms to 400/365 ms. Forecast waits until the latest actual bar finishes, pauses 120 ms, then grows from the actual height over 520 ms. Background startup work respects this sequence duration.

Repeated FAB visibility sync no longer restarts its entrance, and superseded animation-frame callbacks cannot reverse a newer hide request. Populated Sales layout switches retain their content for a 180 ms grace period before a pending replacement skeleton; immediate empty destinations retain skeletons to prevent blank pages. No artificial minimum wait is added. Synchronous CPU work cannot be interrupted by a skeleton timer, so existing content remains visible in that case.

Research: IBM Carbon Loading Patterns (https://carbondesignsystem.com/patterns/loading-pattern/) and web.dev animation rendering guidance (https://web.dev/articles/animations-overview). These guide feedback and rendering cost; they are not evidence that RETRADE matches any particular commercial app's measured performance.

A resize/filter race also reused draw history from a replaced SVG with the same ID, suppressing its reveal. Polished draw history now belongs to each SVG element. Browser regression coverage exercises filter changes after navigation and desktop/mobile resizing, verifies actual-before-forecast timing and hidden forecast during the actual phase, delayed replacement skeletons, and repeated FAB sync.
