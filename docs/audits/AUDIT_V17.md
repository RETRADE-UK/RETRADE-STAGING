# Audit v1.7 — v1.6 requirement verification

Audit date: 28 September 2026. Source: all nine turns of **AUDIT AGENT - v1.6**,
plus the v1.7 continuation. Prior assistant release claims were checked against
repository history and executable tests rather than treated as proof.

Baseline: live `235051e` and staging `416c33c`, both v1.5.93. The initial local
checkouts were stale; both remotes were fetched before the audit branches began.

## Requirement matrix

| v1.6 request | Status at start of audit | Evidence / action |
| --- | --- | --- |
| Approved desktop Tax layout: four KPIs, wide statement, smaller estimate/settings rail, reconciliation, full-width download | Already implemented in both main branches (v1.5.89) | Tax/data browser suites verify desktop geometry, logical reading order, editable settings and unchanged mobile/tablet layout. |
| Retain Overview / Filing guide / Monthly and box-by-box instructions | Already implemented in both (v1.5.91) | Tax/account browser suites cover selected-form box mappings, grouped deductions, totals and responsive controls. |
| Stock colour/age bar directly beneath Listed/Unlisted tabs | Already implemented in both (v1.5.90) | Costs suite checks DOM order, geometry and clickable age segments. |
| Trips & Expenses search, Select, select all shown, bulk delete with confirmation | Already implemented in both (v1.5.90–92) | Costs suite covers search, tri-state selection, cancellation, scoped deletion and concurrent record changes. This request concerns the combined Trips & Expenses page; it does not request destructive deletion of Sourcing sessions. |
| Select all/count at left, actions alongside, Done at right | Already implemented in both (v1.5.91–92) | Costs/accounts suites check selection geometry and narrow-screen overflow. |
| Hide + FAB during Stock/Expenses selection; restore on Done/navigation | Already implemented in both (v1.5.92) | Costs suite checks hidden/inert state, exit and navigation. |
| Same FAB fix for Sales, retaining navigation | Already implemented in both (v1.5.93) | Sales suite covers empty/populated selection, Done and navigation at 320/390/768/1440px; route tests verify navigation visibility. |
| Desktop Sales filters in dropdown, not loose chips | Already implemented in both (v1.5.91) | Accounts/workspace suites verify dropdown visibility and shared control geometry. |
| Stop endless orange mobile sync spinner | Already implemented in both (v1.5.91) | Accounts/UI suites verify unresolved retries retain a single timer, become static pending, reconcile on resume and clear on success. Durable writer/outbox behavior is unchanged. |
| Rework account details into coherent stock/sales and payment sections | Already implemented in both (v1.5.91) | Accounts suite checks four inventory groups, separate payment history, retained disclosure/input state and no idle mutation loop. |
| Faster account search and cleaner directory | Already implemented in both (v1.5.91) | Search/filter/sort reuse rows and do not call the financial statistics engine; scale fixture uses 60 accounts and 600 items. |
| Remove account-count KPI; use meaningful potential profit | Already implemented in both (v1.5.92) | Directory sums authoritative retained `forecastYourShare`. The remaining Awaiting payment count is actionable, not a duplicate total-account count. |
| Hide redundant “N of N” caption except search/filter context | Already implemented in both (v1.5.92) | Accounts suite checks default, query, filter-only and sort-only states. |
| Clicking Stock always defaults to Listed | Missing from both deployed main branches; prepared in open live #76 / staging #12 | Complete the pending v1.5.94 change: reset population/age filters before render, remove the competing performance-layer write, preserve explicit Unlisted sourcing and Dashboard drill-downs. |
| Useful All/Listed/Unlisted inventory KPIs | All redesign was pending in #76/#12; Listed had an additional aged-job-lot omission | All shows capital, retained potential profit, listed asking and attention capital. Listed keeps capital/profit/age/sell-through; Unlisted keeps backlog capital/count, estimated potential and longest sitting. Audit additionally includes aged job lots in Listed capital/count using membership cost once, matching All. |
| Remove “Short” before box numbers in Filing guide | Pending in #76/#12 | Filing rows now use “Box N”. The form selector and Overview's explicit Short/Full cross-reference retain their useful context. Calculations/mappings unchanged. |
| Optimise mobile Sourcing layout | Pending in #76/#12 | Full-width ROI card, two supporting cards, shared search/sort row, compact history, disclosed calculation notes, labelled Log past action and matching loading markup. |
| Apply shared polish to live and staging; monitors/gestures stay staging-only | v1.5.93 shared baseline already synced | Apply v1.5.94 to both via existing PRs. Shared-runtime comparison preserves only declared staging binding/auth, monitor navigation/runtime/push, domain and parked gesture differences. |

## Additional audit fixes

- Listed aged capital previously excluded job lots even though its age filters
  included them. The new regression uses an aged lot with a £50 membership cost
  and an £80 child cost, proving the authoritative £50 is counted once. Two aged
  listings total £250; All attention capital is £295 including unlisted/returned
  stock. Viewing/drilling into KPIs leaves business records unchanged.
- Windows asset ownership checks now compare slash-normalised relative paths.
  The staging comparison normalises CRLF before stripping the declared hooks.
  Neither change relaxes the asset allowlist or allows extra runtime differences.
- The workspace browser test now waits for the scheduled Sales search result
  before asserting its count, removing a timing race observed during this audit.

## Validation and limits

Release validation is recorded in the final audit report and PR descriptions.
Tests use synthetic records and block external data/auth requests. Screenshots
are synthetic; no production account records were changed. Browser coverage
includes desktop, tablet, mobile widths, dark mode and reduced motion. It does
not establish physical iPhone/Android frame pacing or live account synchronisation.

No domain accounting, persistence, migration, monitor or gesture behavior is
changed. Existing startup, offline upgrade, sync conflict, bulk recovery, partner
payments, tax reconciliation, item, cashflow and scroll suites remain required.
