/* Runtime asset contract. Ordered classic scripts: do not alphabetise.
 * Shared by the browser loader, service worker and validation tools. */
globalThis.RT_ASSETS = Object.freeze({
  "build": "20261113-independent-cost-duplicates-staging",
  "environment": "staging",
  "entry": [
    "src/platform/local-recovery.js",
    "src/domain/accounting-engine.js",
    "src/domain/report-engine.js",
    "src/platform/view-loader.js"
  ],
  "core": "src/core/application.js",
  "launch": "src/platform/launch.js",
  "critical": [
    "src/platform/staging-auth.js",
    "src/platform/performance.js",
    "src/platform/navigation.js",
    "src/platform/lifecycle.js",
    "src/features/charts/polish.js",
    "src/features/charts/motion.js",
    "src/features/charts/finalize.js",
    "src/features/charts/reveal.js",
    "src/platform/interface-motion.js"
  ],
  "deferred": [
    "src/views/item.js",
    "src/views/stock.js",
    "src/views/sales.js",
    "src/views/sourcing.js",
    "src/views/accounts.js",
    "src/views/costs.js",
    "src/features/purchases/groups.js",
    "src/features/bundles/orders.js",
    "src/features/bundles/panel.js",
    "src/features/bundles/row-polish.js",
    "src/features/cashflow/liabilities.js",
    "src/domain/relist-fees.js",
    "src/features/partners/detail-stability.js",
    "src/features/cashflow/dashboard-v2.js",
    "src/features/cashflow/movement-card-polish.js",
    "src/features/cashflow/performance-v1509.js",
    "src/features/cashflow/transaction-details.js",
    "src/features/partners/item-navigation.js",
    "src/features/partners/actions-v2.js",
    "src/features/partners/statement-action.js",
    "src/features/partners/account-ui-v3.js",
    "src/features/partners/row-menu-popover.js",
    "src/features/partners/item-adjustments.js",
    "src/features/partners/arrangements-v2.js",
    "src/features/partners/account-adjustments.js",
    "src/features/partners/account-adjustments-hardening.js",
    "src/features/partners/payment-allocations-v2.js",
    "src/features/partners/account-transaction-ui.js",
    "src/features/partners/transaction-breakdown-guard.js",
    "src/features/partners/collapse-defaults.js",
    "src/features/partners/operations-dashboard.js",
    "src/features/partners/account-experience-v2.js",
    "src/features/partners/page-unified-v1503.js",
    "src/features/sales/calendar-layout-v1530.js",
    "src/features/exports/documents.js",
    "src/features/sales/chart-sequence.js"
  ],
  "lazy": [
    "src/features/monitors/cloud.js",
    "src/features/monitors/page.js",
    "src/features/sales/defaults.js",
    "src/features/partners/statements.js",
    "src/features/partners/statements-accounting-v3.js",
    "src/features/partners/account-adjustment-statements.js",
    "src/features/diagnostics/preview-fixtures.js",
    "src/features/diagnostics/accounting-fixtures.js",
    "src/views/tax.js",
    "src/views/data.js"
  ],
  "bindings": [
    "src/platform/staging-binding.js"
  ],
  "styles": [
    "assets/styles/application.css",
    "assets/styles/loading.css",
    "assets/styles/tax.css",
    "assets/styles/item.css",
    "assets/styles/status.css",
    "assets/styles/sales.css",
    "assets/styles/responsive.css",
    "assets/styles/workspaces.css",
    "assets/styles/monitors.css"
  ],
  "images": [
    "assets/brand/pdf-logo-dark-v1.png"
  ],
  "icons": [
    "assets/icons/app-180.png",
    "assets/icons/app-32.png"
  ],
  "launchImages": [
    "assets/launch/launch-light-1206x2622.png",
    "assets/launch/launch-light-1284x2778.png",
    "assets/launch/launch-light-1179x2556.png",
    "assets/launch/launch-dark-1170x2532.png",
    "assets/launch/launch-dark-1320x2868.png",
    "assets/launch/launch-dark-1290x2796.png",
    "assets/launch/launch-dark-1284x2778.png",
    "assets/launch/launch-light-1170x2532.png",
    "assets/launch/launch-dark-1179x2556.png",
    "assets/launch/launch-light-1320x2868.png",
    "assets/launch/launch-light-1290x2796.png",
    "assets/launch/launch-dark-1206x2622.png"
  ],
  "legacy": {
    "app-core.js": "src/core/application.js",
    "accounting.js": "src/domain/accounting-engine.js",
    "reports.js": "src/domain/report-engine.js",
    "launch-experience.js": "src/platform/launch.js",
    "performance-system.js": "src/platform/performance.js",
    "navigation-stability.js": "src/platform/navigation.js",
    "app-lifecycle.js": "src/platform/lifecycle.js",
    "motion-system.js": "src/platform/interface-motion.js",
    "account-detail-stability.js": "src/features/partners/detail-stability.js",
    "item-account-adjustments.js": "src/features/partners/item-adjustments.js",
    "relist-fee-integrity.js": "src/domain/relist-fees.js",
    "document-exports.js": "src/features/exports/documents.js",
    "app.css": "assets/styles/application.css",
    "skeleton-motion-polish-v1512.css": "assets/styles/loading.css",
    "icon-180.png": "assets/icons/app-180.png",
    "icon-32.png": "assets/icons/app-32.png",
    "partner-account-adjustment-statements.js": "src/features/partners/account-adjustment-statements.js",
    "partner-statement-action.js": "src/features/partners/statement-action.js",
    "partner-payment-allocations-v2.js": "src/features/partners/payment-allocations-v2.js",
    "partner-account-ui-v3.js": "src/features/partners/account-ui-v3.js",
    "cashflow-liabilities.js": "src/features/cashflow/liabilities.js",
    "partner-row-menu-popover.js": "src/features/partners/row-menu-popover.js",
    "sales-chart-sequence.js": "src/features/sales/chart-sequence.js",
    "partner-collapse-defaults.js": "src/features/partners/collapse-defaults.js",
    "partner-statements-accounting-v3.js": "src/features/partners/statements-accounting-v3.js",
    "cashflow-performance-v1509.js": "src/features/cashflow/performance-v1509.js",
    "partner-item-navigation.js": "src/features/partners/item-navigation.js",
    "partner-arrangements-v2.js": "src/features/partners/arrangements-v2.js",
    "partner-account-experience-v2.js": "src/features/partners/account-experience-v2.js",
    "chart-finalize.js": "src/features/charts/finalize.js",
    "accounts-operations-dashboard.js": "src/features/partners/operations-dashboard.js",
    "bundle-row-polish.js": "src/features/bundles/row-polish.js",
    "chart-polish.js": "src/features/charts/polish.js",
    "chart-motion.js": "src/features/charts/motion.js",
    "partner-actions-v2.js": "src/features/partners/actions-v2.js",
    "bundle-orders.js": "src/features/bundles/orders.js",
    "partner-page-unified-v1503.js": "src/features/partners/page-unified-v1503.js",
    "cashflow-dashboard-v2.js": "src/features/cashflow/dashboard-v2.js",
    "chart-reveal.js": "src/features/charts/reveal.js",
    "partner-account-transaction-ui.js": "src/features/partners/account-transaction-ui.js",
    "bundle-panel.js": "src/features/bundles/panel.js",
    "partner-transaction-breakdown-guard.js": "src/features/partners/transaction-breakdown-guard.js",
    "partner-account-adjustments-hardening.js": "src/features/partners/account-adjustments-hardening.js",
    "sales-calendar-layout-v1530.js": "src/features/sales/calendar-layout-v1530.js",
    "partner-account-adjustments.js": "src/features/partners/account-adjustments.js",
    "cashflow-movement-card-polish.js": "src/features/cashflow/movement-card-polish.js",
    "sales-defaults.js": "src/features/sales/defaults.js",
    "partner-statements.js": "src/features/partners/statements.js",
    "launch-light-1206x2622.png": "assets/launch/launch-light-1206x2622.png",
    "launch-light-1284x2778.png": "assets/launch/launch-light-1284x2778.png",
    "launch-light-1179x2556.png": "assets/launch/launch-light-1179x2556.png",
    "launch-dark-1170x2532.png": "assets/launch/launch-dark-1170x2532.png",
    "launch-dark-1320x2868.png": "assets/launch/launch-dark-1320x2868.png",
    "launch-dark-1290x2796.png": "assets/launch/launch-dark-1290x2796.png",
    "launch-dark-1284x2778.png": "assets/launch/launch-dark-1284x2778.png",
    "launch-light-1170x2532.png": "assets/launch/launch-light-1170x2532.png",
    "launch-dark-1179x2556.png": "assets/launch/launch-dark-1179x2556.png",
    "launch-light-1320x2868.png": "assets/launch/launch-light-1320x2868.png",
    "launch-light-1290x2796.png": "assets/launch/launch-light-1290x2796.png",
    "launch-dark-1206x2622.png": "assets/launch/launch-dark-1206x2622.png",
    "staging-supabase.js": "src/platform/staging-binding.js",
    "staging-dev-auth.js": "src/platform/staging-auth.js"
  },
  "views": {
    "item": {
      "file": "src/views/item.js",
      "functions": [
        "_renderItemPageInner",
        "_renderStockItemPage"
      ]
    },
    "stock": {
      "file": "src/views/stock.js",
      "functions": [
        "_renderStockCore"
      ]
    },
    "sales": {
      "file": "src/views/sales.js",
      "functions": [
        "renderMonth",
        "renderMonthlyGrid",
        "renderMonthlyMoneyFlow",
        "renderMonthlyProfitabilityChart"
      ]
    },
    "sourcing": {
      "file": "src/views/sourcing.js",
      "functions": [
        "renderActiveRunPage",
        "_renderRunPage",
        "renderRunsPage"
      ]
    },
    "accounts": {
      "file": "src/views/accounts.js",
      "functions": [
        "_renderAccountPage"
      ]
    },
    "costs": {
      "file": "src/views/costs.js",
      "functions": [
        "renderExpenses",
        "renderCash",
        "renderReturns",
        "renderScrapped",
        "renderActivity"
      ]
    },
    "tax": {
      "file": "src/views/tax.js",
      "functions": [
        "renderTax",
        "renderTaxPeriodReports"
      ]
    },
    "data": {
      "file": "src/views/data.js",
      "functions": [
        "renderData",
        "renderRelistAudit"
      ]
    }
  },
  "viewRoutes": {
    "item": "item",
    "monthly": "sales",
    "stock": "stock",
    "runs": "sourcing",
    "active-run": "sourcing",
    "accounts": "accounts",
    "expenses": "costs",
    "cash": "costs",
    "returns": "costs",
    "scrapped": "costs",
    "activity": "costs",
    "tax": "tax",
    "data": "data"
  }
});
