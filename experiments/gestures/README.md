# Parked gesture experiment G1

Disabled as of 23 September 2026. None of these files are loaded, precached or included in the deployment artifact. Work is preserved byte-for-byte from staging commit `f83d1013e1e389902b4dd7d3f368b0c36512ea21`.

The complete runnable former staging tree is on branch `archive/gestures-g1-20260922`. Use a separate checkout of that branch to inspect the old behaviour. Do not copy its app core or database configuration into production.

`staging-gestures.js` records the original seven-script load order (six early modules and one chart module). `interaction-system.js` is an older inactive predecessor, preserved for reference. Relative paths inside the original manifest are historical; this folder is not an opt-in loader.

To resume: create a feature branch from current staging, port only the required gesture behaviour to explicit feature APIs, resolve interactions with current navigation/chart owners, add touch/keyboard/reduced-motion tests, then deliberately register the module in the asset manifest. Do not simply re-enable every historical patch.

Current priority: Vinted monitor first, API integration afterwards. This cleanup does not implement either feature.
