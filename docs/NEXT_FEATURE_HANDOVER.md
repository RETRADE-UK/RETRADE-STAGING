# Next feature: Vinted monitor

The user's priority is Vinted monitoring, followed by API work. Gestures are paused. Neither new feature is implemented by the repository cleanup.

The recovery/audit workstream is `feature/vinted-monitor`, based on staging `4d5b71f`. All three original packages and the older Git branch have now been inspected. Read [the takeover](features/monitors/README.md), [audit](features/monitors/AUDIT.md) and [implementation plan](features/monitors/IMPLEMENTATION_PLAN.md) before development. The recovered Canon £51–£100 benchmark requirements are known; do not ask the user to repeat them. Source feasibility, deployed database state and actual Discord action behaviour remain unverified.

Keep monitor code in its own feature directory; keep any server-side integration and credentials outside the public browser bundle. Register only necessary browser assets in `config/assets.js`. Test in the staging environment before promoting shared product code to live. Do not copy staging bindings, CNAME or test-login helper into production.

Feature-only v3 source and both incompatible prototype schemas are segregated in `experiments/monitors/`, excluded from the deployed app. No monitor is enabled by the takeover. Do not apply the old SQL or merge the old full app. The implementation plan specifies final ownership under `src/features/monitors/`, `worker/monitors/`, approved migrations and dedicated tests once repaired.

Gesture files in `experiments/gestures/` are historical source, not an enabled loader. The matching archive branch preserves the complete previous runnable staging tree. Do not resume them as part of monitor work.
