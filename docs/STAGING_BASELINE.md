# Staging baseline — v1.5.60

Runtime is synchronised with the v1.5.60 live cleanup. Deliberate differences: staging CNAME, environment/build field and binding/helper entries in `config/assets.js`, staging entry-query suffixes, two platform binding/auth files, Pages deployment workflow, this note, preserved experiments and staging-only archived sources.

Database: existing staging project `dvnrxmdejxfuazmpnudj`; no database migration or data copy was performed. Startup blocks if its binding cannot load. The visible staging badge and anonymous test-workspace helper remain.

Gestures are disabled. See `experiments/gestures/README.md` and snapshot branch `archive/gestures-g1-20260922` (original commit `f83d1013e1e389902b4dd7d3f368b0c36512ea21`). All nine experiment files match that commit byte-for-byte.

`accounts-performance.js`, `partners-loading-v1517.js` and `sales-loading-v1517.js` were staging-only inactive patches; their unchanged sources are preserved in `archive/retired-runtime/`. They are not in the active asset manifest. The old snapshot branch retains the complete original root layout.

`npm run build` excludes experiments and archives from `_site/`. The Pages workflow uses this allowlist and checks the staging CNAME. The shared test suite additionally verifies the staging endpoint and failed-binding behaviour.

Next: create a feature branch for Vinted monitoring; see `docs/NEXT_FEATURE_HANDOVER.md`. Do not restore gestures implicitly or promote staging bindings into live.
