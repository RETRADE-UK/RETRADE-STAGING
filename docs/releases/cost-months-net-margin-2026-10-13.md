# Trips & Expenses month disclosures and FY reconciliation

The core `renderExpenses` owns month disclosures. Multiple visible months start
with the most recent matching month open; older groups keep their dates, counts
and totals visible. Single-month views have no toggle. Search and bulk selection
reveal all matching rows temporarily, then restore browsing choices. Choices are
session-only and reset on account/range/category changes. Native buttons expose
`aria-expanded` / `aria-controls` and update mounted rows without redrawing the page.
Styling remains in `assets/styles/workspaces.css`.

Performance FY headers and Profit Breakdown now share `_performancePeriodSummary`,
which reads the existing `_buildPnLSummary` result. Net margin is net profit divided
by revenue after dated customer refunds, not an average of item margins. FY ranges
remain the existing Performance April–March ranges; tax cash-basis calculations,
records, monthly item metrics, persistence and sync are unchanged. Expense-only
periods show the loss without a divide-by-zero percentage.

Validation: `npm run check`, `npm test`, `npm run build`. The new isolated browser
regression covers keyboard/touch-size disclosures, rerenders, searches, selection,
account/filter changes, two FYs, refunds, overheads, write-offs and zero revenue.
All browser fixtures use synthetic data and block external requests.
