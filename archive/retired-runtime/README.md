# Retired runtime scripts

These 13 scripts were not referenced by the production entrypoint, service worker or any active script when archived on 22 September 2026. Their contents are unchanged. This folder is historical source and is not loaded or precached by the application.

- The versioned main-page, Sales and Partners loading patches have been superseded by the loading code in `app-core.js`, `partner-page-unified-v1503.js` and the shared skeleton CSS.
- `main-kpi-count-motion-v1510.js` is superseded by the core KPI motion functions.
- `chart-line-motion.js` and `sales-forecast-gate.js` have been superseded by `sales-chart-sequence.js` and `chart-forecast-sequence.js`.
- `partner-payment-allocations.js` has been superseded by `partner-payment-allocations-v2.js`.
- `partner-statements-pdf.js` is historical; the active branded PDF exports are owned by `document-exports.js` and the statement scripts loaded on demand.
- `surface-gestures-v2.js` was an inactive copy in the live repository. Active gesture development belongs to the separate RETRADE-STAGING repository.

Do not add these files back to the production loader to fix a new issue. Update the active owner instead.

## Retired in v1.5.59

`chart-forecast-sequence.js` was removed from the active loader after consolidating dashboard forecast timing in `chart-motion.js`. Its timer-stepped animation and outdated timing assumptions competed with the current CSS reveal. It is retained unchanged for history.

Retired in v1.5.60: `partner-statements-accounting-v2.js` was precached but had no runtime caller. The v3 engine defines its own complete statement model and both readiness flags.

Staging additionally preserves inactive `accounts-performance.js`, `partners-loading-v1517.js`, and `sales-loading-v1517.js` from the G1 snapshot. None had an entry in the active staging loader; they are excluded from the new manifest and deployment.
