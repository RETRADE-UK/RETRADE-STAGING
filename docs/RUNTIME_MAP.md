# Runtime ownership

## 31 October — reimbursements and mileage

Management profit retains actual costs and excludes mileage allowances. HMRC cash-basis reports explicitly opt into annual mileage and exclude actual vehicle running costs when that method applies. UC mileage uses exact assessment dates and its own 833-mile bands. Account adjustment cash-refund applications create a supplier receipt and, when retained personally, an equal owner drawing; consumed credit cannot reduce another payment. Original supplier settlement history is retained. Synthetic tests cover cash, tax, account profit, date boundaries and mileage separation.


## 30 October - profit and cash bridge

Dashboard and comparison net profit use the same management P&L as reports, including dated stock write-offs and motor-method exclusions. Open-ended reports retain expenses, mileage and write-offs; numeric strings remain valid amounts. Public transport and parking have a separate Box 20 category so mileage does not suppress fares. Entry fees remain other business expenses. Owner funding and drawings remain outside profit.

Synthetic accounting browser regressions cover all-time and dated profit agreement, non-cash mileage, write-offs, fares and actual fuel exclusions. Cache build: `20261030-cash-profit-bridge` (staging adds its environment suffix).


## 30 October - statement fee evidence and monthly renewals

The accounting owner accepts verified statement fees only while the sale cycle,
platform, price and postage still match. Promotion edits invalidate the promotion
override. Refund credits match the stored return ID and amount. Private seller
receipts are not reduced by buyer protection a second time. The core mapper reads
both native JSON arrays and legacy string histories.

The existing relist owner records dated calendar-month renewal estimates from
29 October onward, respecting explicit free-fee policies, sold/returned state,
manual relist anchors and shared-listing penny allocation. Short months clamp the
day without losing the original anniversary. Estimates are labelled on the item
page; verified historical listing charges replace covered cash estimates.
The cash wrapper preserves manual relist dates and never charges a resale renewal
twice. Metadata does not become an undoable maintenance event.

No schema or environment-binding change. Synthetic regressions cover unchanged
sale evidence, refunds, history formats, anniversary dates, free listings,
shared pennies, resale P&L and dated cash. CI retains the existing browser suite.
Cache build: 20261030-ebay-evidence-renewals (staging adds -staging).

## 26 October - cash and historical accounting review

`accounting-engine.js` retains negative expense/trip refunds as dated cash
inflows. `cashflow/liabilities.js` no longer suppresses paid reconstructed
settlements: the engine already excludes their display-only ledger mirrors.
Canonical paid amounts, including non-cash credit reductions, remain authoritative.

The core loader's legacy `_backfillDateSoldAtReturn` hook no longer writes inferred
sale dates into return history. Missing evidence stays missing in storage;
calculation fallbacks are explicitly marked and never become persisted facts.
Loading or reviewing records must not manufacture a historical sale date.

Partner adjustment modules recognise allocated non-cash credits only when the
related sale, return or write-off is recognised, and apply cash-basis offsets
only to verified paid
transactions for the loaded user. Refund, stock, margin and relist calculations
remain in the accounting owner; the audit regression covers their boundaries.

`scripts/repairs/verified-supplier-refund.sql` documents the guarded,
parameterised repair method for a verified never-received purchase. It preserves
normal revision/sync triggers and requires exact pre-repair economics plus
external evidence. Actual executed identifiers, amounts and evidence remain in
the private audit record, outside the repository.

Cache build: `20261026-cash-refunds-paid-history` (staging retains its isolated
environment suffix/bindings). Both cash and accounting audit browser regressions
run in Chromium and WebKit CI.

## 23 October — shared order fees and partner cost reconciliation

`accounting-engine.js` allocates one eBay Business fixed checkout fee across
complete bundle members, with per-item category bands and penny-conserving
variable fees. Sale-cycle snapshots retain the original group for refund credits;
resales belong to their own checkout. Missing/incomplete groups keep the existing
standalone estimate. Cash events, item P&L and order totals use this same path.

Supplier stock cost is deducted when recognising sale profit, whether paid yet or
not. A legacy default canonical zero must not erase a positive supplier cost when
there is no explicit override, payment or settlement. Explicit zero agreements
and paid history retain priority. Settlement freezes the resolved amount before
marking an item paid; failed saves restore both fields. Percentage shares inherit
the account rate and
are calculated from positive pre-share margin without recursive P&L calls.
The bundle panel itemises fixed partner cost and profit-share payouts separately.

`bundles/orders.js` owns the shared-listing selector and fee allocation. Separate
listings remain the default; one multi-quantity listing accepts its actual total
including VAT/renewals, or zero if free. Each item stores its allocated incurred
cost plus `bundle_listing_fee` audit metadata in `refreshHistory`; edit/reload and
sale reversal retain those costs. This requires no database schema changes.

`tests/bundle-fees-browser.cjs` covers mobile/desktop creation, edits, reversal,
persistence, fixed-cost conflicts, account-default shares, dashboard/cash totals,
fee bands, returns and resales. It runs with the existing external-network-blocked
browser harness and in Chromium/WebKit CI. A synthetic £180 four-unit order with
£100 stock cost, £16.14 fees and £0.36 shared listing cost retains £63.50.

`scripts/repairs/shared-listing-cost.sql` is an idempotent, parameterised repair
for the verified four-unit order only. Its guards reject changed economics or
returns. Original allocation/cost values remain in audit metadata and normal
revision/sync triggers remain enabled. Deployment execution is recorded in the PR.
Cache build: `20261023-bundle-fees-partner-profit` (staging adds `-staging`).

**18 October partner outstanding UX:** partner payments now separate Sold outstanding from All stock outstanding. Sold fixed-cost items with no agreed payout remain selectable and lead to payout setup rather than a disabled row. `payment-allocations-v2.js` remains the transaction/eligibility owner and `account-ui-v4.js` owns the sold/all-stock account-position breakdown. Existing live potential-profit logic, linked item cost / partner payout rules and accounting ownership are preserved. Cache build: `20261018-partner-outstanding`.

PDF banner fine adjustment (v1.5.103): the shared compositor lifts the complete
shield by 0.2 mm and lowers the title/tagline by 0.2 mm from v1.5.101 positions.
The 42 mm artwork width and banner size are unchanged. Pixel-bound tests verify
both movements separately and protect the shield against clipping.

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
| Sales history dates and responsive rows | Core `renderMonth` / sale-event renderers; `assets/styles/sales.css` |
| Partner model/presentation/settlement extensions | Ordered partner files in the manifest |
| Bundle, cashflow and document extensions | Corresponding feature directories |
| On-demand partner statements and diagnostics | Manifest `lazy` list |
| Item costs, postage policy application and item view | `src/core/application.js`; `assets/styles/item.css` |
| Sync status presentation | Core `_refreshSideNavSync`; `assets/styles/status.css`; mobile header in `index.html` |
| Responsive Tax view | `src/core/application.js` (`renderTax`), `assets/styles/tax.css` |
| Shared workspace cards, aligned collection/header controls, Stock/Sales overview hierarchy and transaction panels | `assets/styles/workspaces.css`; core renders loaded and pending layouts |
| Cashflow transaction drill-down | `src/features/cashflow/transaction-details.js`; payment details stay in `partners/transaction-breakdown-guard.js` |
| Shared mobile scale, gutters and type hierarchy | `assets/styles/responsive.css`; feature geometry remains in its existing owner |
| Route wait policy, inert placeholder structure and status | Core `_showRoutePending` / `_clearRoutePending` / `_routeSkeletonMarkup`; `assets/styles/loading.css` |
| Tax cash timing and calendar slices | `src/domain/accounting-engine.js`; report export in `report-engine.js` |
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

## Release v1.5.70 — sync and interaction reconciliation (24 September)

Startup HTML uses the manifest build ID for every local script/style. The worker
honours explicit generation requests: an old tab receives its exact cached
asset when available, otherwise a revalidated network request, never a silent
substitution from the active cache. Business data and API responses remain outside
this cache. `check-assets.cjs` rejects startup version drift.

`navigation.js` owns the chrome layer order (navigation 350, FAB 360, search 370,
forms 400+). The mobile FAB has a stable, untransformed anchor. Closed options,
sheets and panels are inert; notifications cannot intercept taps. The core owns
dial dismissal and accessibility state. Core navigation alone owns FAB visibility; interface motion does not maintain a second visibility state.

The item revision guard records conflicts but leaves user feedback to the existing
bounded recovery/persistence owner. Successful reconciliation no longer displays
a premature reload error. Compare-and-swap protection, unresolved outbox retention
and cloud deletion protection remain enabled. No accounting rules or database
schema are changed by this shared release.

Validation: `npm run check`, `npm test`, `npm run build`, and the production
checkout's `node scripts/compare-staging.cjs ../staging`. The comparison strips only
the declared staging monitor hooks and rejects any other shared-runtime drift.
Browser tests use isolated data, actual pointer actions and mobile/desktop layouts;
they do not prove physical iOS/Android frame pacing or live account synchronization.

## Release v1.5.76 — stable partner rendering and shorter Tax workspace

Partner presentation remains in the existing ordered modules. `page-unified-v1503.js`
finishes registered presentation callbacks synchronously after the account renderer,
before the first paint. The list renderer calls `__rtPartnersListPolish` directly;
the compact list no longer observes and rewrites its own mutations. Payment allocation
renders with the account and starts collapsed, preserving the user's later choice.
Unsettled stock without a payable amount remains visible with a reason and item link;
only known unpaid liabilities can enter a payment.

Core sync status reconciles against the writer on resume and while saving. After
15 seconds it shows static pending status, retaining the writer and durable queue.
Tax uses session-only Overview, Filing guide and Monthly sections; calculations and
export totals are unchanged. Sales normalises retired date-listed route state to
sale-date sorting so day headings remain available.

Regression coverage includes initial partner frames, unsold payment eligibility,
Tax view controls and accounting totals, legacy Sales sorting and bounded sync motion.


### Audit v1.2 completion

- The final v1.1 draft was recovered from its uncommitted checkout and validated
  against production `67b8f72`; it was not an already deployed release.
- Early route rendering waits for ordered deferred modules. Queued renderers are
  resolved at execution time; cancelled routes cannot reappear after loading.
- Obsolete partner transition shells and navigation wrappers are removed. Partner
  presentation finalizers and settlement export controls finish synchronously.
  Account identity uses the stable account ID, not a display-name match.
- Core owns the FAB on every authenticated route. Routes without a specific
  creation action use the normal quick-add menu. Navigation remains fixed while
  scrolling; dialogs retain the existing higher layer order.
- The route progress line is removed. Slow sync becomes a stationary pending
  state after 15 seconds; completed sync clears the mobile indicator. Writer,
  durable outbox and conflict handling remain authoritative and unchanged.
- Pending Sales, Tax and Cashflow surfaces use their current responsive layout
  classes. Yearly Sales uses the same chart markup and dimensions as the loaded
  view. Warm pages retain their contents rather than flashing a skeleton.
- Tax has Overview / Filing guide / Monthly sections. Tax settings, reconciliation
  and payment detail are collapsible. Other income remains visible in the tax KPI.
- Partner unsettled stock exposes unsold fixed-cost items for advance payment and
  shows percentage-only items with an explanation rather than silently omitting
  them. Own-stock source-date expenses and partner transaction-date expenses are
  covered separately; paying early does not record a sale or create a second cost.
- `tests/ui-regressions-browser.cjs` covers slow module loading, cancelled routes,
  current loading layouts, every main route's navigation/FAB and sync completion.
  Partner tests additionally cover first-frame stability, advance-payment cash/tax
  timing, sale-after-payment deduplication and account/item context isolation.

No database migration or production-data edits. Gestures and monitoring remain
outside the production manifest. This release targets the live repository only.

### v1.5.77 — mixed partner payment selection

`payment-allocations-v2.js` allows eligible upfront fixed costs and sold-item
profit shares in one payment. Candidate eligibility and each allocation's legacy
accounting kind remain authoritative. Mixed payments have no transaction-level
profit/share subtotal: unsold asking prices must never become realised profit.
Sold profit-share-only payments retain their existing share summary.
`partner-upfront-browser.cjs` reproduces the blocked four-by-£39 selection on
mobile and desktop, checking payment-date expenses, individual allocations,
unchanged sale states, cashflow and deduction after a subsequent sale.

### v1.5.78 — disclosure scroll and recovery presentation audit

Core is the sole owner of fiscal-year disclosure defaults and state. Year grids
remain mounted while closed, so the first expansion never rebuilds the chart or
entire Sales page. FY headers support keyboard activation and `aria-expanded`.
The core month badge is the only NOW label; calendar CSS no longer adds a second.
`navigation.js` disables document scroll anchoring at the root as well as the
page: content outside a page must not move the viewport during a disclosure.
Explicit route/back scroll restoration and normal end-of-document clamping remain.

Successful stale-device quarantine remains logged and recoverable but no longer
raises a repeated warning toast. Storage failures still retain pending work and
set a visible sync error. Revision checks, cloud precedence and quarantine data
are unchanged; there are no database changes.

`scroll-browser.cjs` checks repeated pointer/touch disclosure actions, DOM identity,
hit targets and scroll offsets across mobile, desktop and reduced-motion layouts.
Coverage includes fiscal years, Stock groups, partner groups/unsettled items, item
details and native disclosures in Tax, Cashflow and the other main routes. A
shorter document may naturally clamp its bottom scroll limit; that is not a reset.
Physical iPhone Safari frame pacing is not established by these Chromium tests.

### v1.5.79 — mobile scale and item profit presentation

`responsive.css` gives every mobile page consistent gutters, headings, buttons,
metric sizes and card spacing. Long Dashboard/Sourcing headings and partner
action bars can wrap. Editable fields retain 16px text to prevent iOS focus zoom.
Item receipts constrain their platform selector to the card and use lighter,
aligned money controls. Navigation positioning, layer order and disclosure
scroll behaviour stay with their existing owners.

The item receipt displays its canonical net plus partner deduction as the total
before partner, followed by the deduction and retained profit. A matching agreed
percentage is shown when applicable; otherwise a positive total shows the
effective share. Fixed payouts have their own label, and zero/loss totals do not
show a percentage. Expected stock profit remains explicitly labelled expected;
subsequent sale cards identify the sale cycle. No accounting or persistence rules
change. Item browser coverage verifies the bridge and narrow selector containment.


### v1.5.80 — shared workspace presentation and cashflow details

Stock and monthly Sales use a primary metric with aligned supporting cards,
sharing the Dashboard/Cashflow surface, spacing and typography. Their loading
markup uses the same layout classes. `workspaces.css` also aligns cards and rows
across Sales calendar, Costs, Sourcing, Partners, Tax and the remaining pages;
mobile input sizing and navigation layers retain their existing owners.

Every cashflow row opens a source-backed detail panel, including results after
search/filter updates. Manual entries and expenses lead to their existing editors;
item, sale and return movements link to the item; trip costs link to the trip.
The enhanced ledger is rebuilt after local filter results without replacing the
search input. Filtered results include the complete matching history, while the
initial ledger keeps its existing recent/history paging. No cash calculations or
export totals change.

Partner payments show their date, note, individual item allocations, any non-cash
credits and the actual cash amount. Item links preserve the Cashflow return route.
The existing settlement detail owner permits date/note amendments and exposes the
existing paid/reverse actions and partner account. Metadata edits preserve all
amounts, allocation snapshots and paid-at timestamps; the deterministic audit row
is updated once, and the active page refreshes after source edits or reversal.
Opening details performs no writes. Missing item records remain visible by their
allocation name, with no invented link. No database migration is required.

`cashflow-browser.cjs` uses synthetic mobile/desktop data to exercise the four-by-£39
payment, source links, metadata/manual/expense edits, search, account credits and
reversal, including unchanged allocation totals and cash-event deduplication.

### v1.5.81 — compact workspace headers and useful sourcing history

`workspaces.css` owns compact Sales/Stock metric surfaces and collection toolbars,
plus adaptive Sourcing rows. Core renders those structures and their pending
summaries synchronously. `tax.css` owns the paired year caption/selector.
The Accounts title is emitted by its existing operations renderer.

Sourcing history no longer regroups sorted runs into month disclosures. Core
sorts the complete history, caches per-render run metrics, and applies search
without replacing its input. The existing saved sort preference now consistently
uses `window._RUNS_SORT`; no business data is written by these controls.
`tests/workspace-browser.cjs` covers ranking, searching, drill-down and compact
header geometry. See `docs/audits/WORKSPACE_UX_2026-09-26.md` for research and scope.

### v1.5.83 — loading layout and Sales endpoint audit

Route placeholders wait 300 ms, reuse current workspace classes, and cancel on
completion/navigation. Warm content stays mounted. Boot still uses its real
Dashboard tree but no longer has a fixed minimum loading hold. A shared live
status sits outside busy pages; decorative shells are inert. The old competing
Sales loading CSS is retired. Current-month emphasis and refund endpoint timing
remain owned by the calendar and chart-sequence modules. See
`docs/audits/LOADING_UX_2026-09-26.md` for policy, research and verification limits.

### v1.5.84 — desktop Tax and Reports & Data cleanup

Tax overview uses a desktop comparison panel beside the three existing detail
sections; mobile keeps its established reading order. Monthly fills the available
width. Calculations, filing values and export logic are unchanged.

Core `_dataWorkspaceMarkup` owns both Reports & Data and its inert placeholder.
`workspaces.css` owns responsive report/backup cards. Duplicate spreadsheet menus
and the second reporting-readiness action are removed. Full JSON backup/restore,
item spreadsheet import/export, report formats and Activity remain available.
Checks and recovery are collapsed; return/resale scanning and device diagnostics
run only when requested. Existing sync, restore and destructive-action guards
remain authoritative. Recently deleted items remain visible for session recovery.

### v1.5.85 — compact sync and atomic Sales entry

Core `_refreshSideNavSync` presents the writer/outbox state in one shared design;
`status.css` owns all responsive indicators and the on-demand details panel.
The desktop indicator shares the account row. A single live region announces
meaningful transitions; fast saves stay quiet and long saves stop rotating.

Core `_prepareSalesEntry` owns default Monthly routing before activation/loading.
`performance.js` no longer toggles Sales navigation. `sales/defaults.js` is now an
inert lazy compatibility asset for old URLs. `_showRoutePending` removes stale
Sales subviews/months before paint and retains matching warm content. See
`docs/audits/SYNC_AND_SALES_ENTRY.md` for rationale and regression coverage.

Desktop Sales uses the global page width. `workspaces.css` owns collection search sizing and shared 44px control geometry, including pending markup. Sales chart cards stretch together; `renderMonthlyProfitabilityChart` populates the breakdown before measuring the SVG so labels retain their intended scale.

Sales navigation enters the current month from another page and toggles Monthly/Performance on repeated navigation clicks. Stock age filtering uses its existing dropdown at all widths. The four overview KPIs share real/pending card geometry. Desktop Tax expands working disclosures via `_syncTaxDesktopDetails`, restoring mobile disclosure state across the breakpoint. `interface-motion.js` exposes `_animateWorkspaceChange` for completed navigation and explicit filter changes; opacity-only, cancelable and reduced-motion aware, without background-render observers.


### v1.5.88 — desktop Tax workspace redesign

The Tax Overview now uses a desktop-specific three-lane workspace: profit
reconciliation and income/deductions share the primary canvas, while tax
settings/estimate and stock/partner payment timing form a narrower right rail.
Desktop density is tightened in the KPI, toolbar, card and reconciliation rhythm
without changing calculations, exports or filing values.

Mobile and tablet keep the established reading order and disclosure behaviour.
`_syncTaxDesktopDetails` now moves only payment detail into the desktop rail and
restores it before Monthly below the desktop breakpoint. The Tax route skeleton
uses the same structure to avoid layout shifts. `tests/data-browser.cjs` covers
desktop lane geometry, visible disclosures, mobile/tablet ordering and full-width
Monthly. Research and rationale are recorded in
`docs/audits/TAX_DESKTOP_UX_2026-09-26.md`.

### v1.5.89 — approved desktop Tax statement

The desktop Tax Overview now places Income & deductions first in a wide column,
with the Sales-to-Tax adjustments underneath and a narrower estimate/payment rail.
Four desktop KPIs show income, expenses, business profit and estimated tax/NI.
The full-width download action follows the content in visual and DOM order.

`renderTax` derives both responsive presentations from the existing calculation
results. `_syncTaxDesktopDetails` owns reversible ordering and the compact desktop
settings editor; the same input nodes return to their established tablet/mobile
position. Editor state survives re-renders and breakpoint changes. Nested
native change events during an other-income edit do not trigger a second
save/render. No domain calculations, filing mappings or exports change.

The desktop skeleton follows the statement/rail structure. Mobile/tablet retain
the original three KPIs, comparison, disclosures and settings presentation.
See `docs/audits/TAX_DESKTOP_UX_2026-09-26.md` for the approved design rationale.

### v1.5.91 — account workspace and consistent list controls

`partners/operations-dashboard.js` owns prepared account directory rows and local
search/filter/sort; legacy compact/sort decorators skip its marked output.
`partners/page-unified-v1503.js` groups existing item/payment nodes into responsive
workspace sections after the account finalizers. `workspaces.css` owns directory
and detail geometry. Idempotent summary text updates stop observer churn.

Core sync presentation retains one timer across unconfirmed retries and reconciles
on page resume; status animation is also bounded in CSS. Tax overview shows box
references and its filing guide combines recorded costs by selected SA103 form.
No loading order, persistence or calculation owner changes. See
`docs/audits/ACCOUNTS_WORKSPACE_2026-09-27.md` and the synthetic account browser tests.

### v1.5.92 — useful account KPI and selection parity

The account directory sums the existing `forecastYourShare` statistic for its
Potential profit card; estimates remain after partner shares, including losses,
and do not become realised income. Search/filter counts appear only for an active
query/filter. The pending layout follows the same KPI labels and omits the caption.

Trips & Expenses uses the Stock selection pattern: tri-state select-all/count,
contextual Delete action and right-aligned Done. Core `_syncFabVisibility` hides
and makes creation controls inert during Stock/Expenses selection and restores
them on exit, successful deletion or navigation. No persistence, tax, fee or
settlement calculation changes. Synthetic tests cover the KPI source, caption
visibility, selection states, deletion guards and FAB lifecycle.

### v1.5.93 — Sales selection and staging refresh

Sales uses the same core FAB visibility rule as Stock and Expenses: selection
makes creation controls hidden/inert, and Done or navigation restores them.
`renderMonth` reconciles this state on each render, including bulk-action exits.
Sales browser coverage checks empty/populated selection and exit at four widths.
This release also refreshes staging's shared app while preserving its isolated
binding, monitor runtime/worker and parked gesture experiments.

### v1.5.94 — Stock entry, useful inventory totals and mobile Sourcing

Core Stock entry resets population and age filters to Listed/All before rendering;
explicit sourcing callbacks opt into Unlisted, and Dashboard drill-downs retain
their requested population. Performance decoration no longer sets route filters.
All-stock KPIs aggregate existing item/job-lot calculations: capital, retained
estimated profit (listed plus estimated unlisted), listed asking value and capital
in unlisted/returned/90-day listings. Sold and removed stock remain excluded.

Mobile Sourcing uses a full-width ROI card above two supporting cards, a compact
search/sort row and denser history rows; calculation help is disclosed on demand.
Pending markup follows those same classes. Tax filing rows show Box N, with the
chosen Short/Full form retained in the selector; mappings and totals are unchanged.

### v1.5.95 — Tax summary format chooser

The Tax download action opens an accessible native dialog for PDF, CSV or Excel.
Core captures the displayed year/figures when the chooser opens. Report engine
provides shared rows and CSV/XLSX output; the existing document exporter owns
the branded PDF. Excel keeps amounts numeric and sales counts as integers.
The existing lazy export libraries and load order remain unchanged. Asset cache
version is 20260928-v1595. Synthetic browser coverage downloads all three formats
on desktop/mobile and verifies figures, filenames, focus and record immutability.

### v1.5.96 — Consistent PDF banner alignment

The shared brandBanner in src/features/exports/documents.js centres the shield
beside the combined wordmark and tagline, on the banner's vertical midpoint.
Tax summaries, sales receipts, order summaries, credit notes, annual statements,
settlement slips and the final adjustment-aware partner statement exporter use
this same owner, including continuation pages. Statement action loads its final
exporter before exposing the PDF action; the older intermediate statement writers
are superseded in that path. No accounting or document-body layout changed.

The PDF banner browser audit generates all seven formats with real jsPDF and
synthetic records, compares every page's banner and checks the logo's centre.
Cache version: 20260928-v1596.

### v1.5.97 — Supplied sign artwork in every PDF

PDF banners use the supplied dark-background sign logo intact, including its
wordmark, tightly grouped tagline and gold rules. The original PNG is preserved
at assets/brand/pdf-logo-dark-v1.png; documents.js renders it proportionally at
print resolution. There is no separately typeset approximation of the logo.

The manifest images list declares optional artwork for the public build and
service worker. It is fetched only for exports and cached on first use, keeping
it out of startup warming. A failed logo load can be retried. All seven PDF
exporters share the same artwork, including continuation pages. Cache version:
20260928-v1597.

### v1.5.98 — Smaller PDF logo

The shared PDF sign artwork is 42 mm wide (25% smaller), retaining its aspect
ratio and vertical centring. Applies to all seven exports and continuation pages.
Cache version: 20260928-v1598.

### v1.5.99 — Text group aligned to shield body

PDF artwork retains the 42 mm scale. The title, tagline and gold rules move as
one group, aligned to the main shield body rather than its lower swoosh/tail.
The original source PNG remains unchanged. Shared canvas composition owns this
alignment for all seven PDF types and continuation pages. Cache: 20260928-v1599.

### v1.5.100 — Complete shield alignment in exported banners

The shared PDF compositor aligns the full visible shield (including the gold
swoosh) with the title/tagline group. The earlier upper-body-only alignment
lifted the text above the complete logo centre. Artwork, 42 mm width and banner
size remain unchanged across all seven PDF formats and continuation pages.
The pixel-bound regression now checks the complete shield. Cache: 20260929-v15100.

### PDF banner optical adjustment — v1.5.101

The title and tagline move down together by 0.41 mm from geometric centring.
The shield, artwork scale and banner dimensions remain unchanged. Shared by
all existing PDF outputs and continuation pages. Cache: 20260929-v15101.

### v1.5.102 — Local safety-save recovery

`src/platform/local-recovery.js` loads before core and owns the on-device
IndexedDB recovery archive. A quota failure can archive only the signed-in
user's known, timestamped quarantine snapshots. Original localStorage entries
are removed only after a strict archive transaction commits and their bytes
still match. Pending outbox records, authentication and preferences are never
cleared. Archived evidence is exportable under Reports & Data, not auto-replayed.

Core retains failed outbox writes in a user-scoped in-memory queue, retries the
latest intent after archival and reports an honest warning while not durable.
Denied storage/archive failures retain the original evidence. The warning is
rate-limited; users must keep the app open and export a full backup until synced.
No Supabase schema, accounting or cloud conflict-resolution changes. Synthetic
desktop/mobile tests cover quota, denied storage, concurrent edits, reload,
archive failures and account isolation. Cache: 20260929-v15102.

### v1.5.104 — cross-device sync convergence

Core owns cloud snapshot reads, pending local overlays, the serialized writer and
Realtime clock coordination. Incoming signals have a 120 ms leading deadline;
visible sessions poll the clock every 2.5 seconds and check it on every rejoin.
An incoming refresh waits for an active write batch, preserves pending keys and
their original CAS bases, and applies unrelated cloud records immediately.
Edits made during a read remain durable and dirty; the writer waits for its
atomic commit. Timed-out and old-session reads cannot later replace live state.
Boot keeps the baseline established by initDB instead of acknowledging recovered
local intent. Retry sync flushes actual local edits and reads cloud state without
turning every unchanged row into a write. Signed photo URLs use the existing
cache and are excluded from durable fingerprints; photos do not block records.
Partner item fields are mapped before the boot baseline, preventing lazy feature
hydration from staging untouched stock on the first edit.

There are no schema changes or production-data test writes. The new VM regression
exercises delayed reads, pending work, CAS bases, timeout/account isolation and
signal bursts. The new two-session browser fixture uses the real loader, writer,
recovery and clock with a synthetic server; it covers bidirectional propagation,
failed writes, edits during reads, reconnects, missed events and hard reload.
All external browser requests are blocked. Physical phone/network latency still
requires observation on the user's devices. Cache: 20261006-v15104.


## Dashboard headroom refinement — 13 October 2026

`src/features/charts/polish.js` remains the sole dashboard geometry owner.
Add 5% above the largest positive plotted value before rounding. Prefer the
existing round-money increment, refining it when it would exceed 10% total
headroom (minimum increment: one penny). Grid spacing cannot inflate this
ceiling. Zero baselines, negative bounds, refunds and FY forecasts remain.
Refined ceilings retain accurate labels; accounting inputs are not changed.
Examples: GBP 1,900 -> 2,000; GBP 1,950 -> 2,100; GBP 2,000 -> 2,100.

Existing cache/version behaviour is unchanged. Rotate the manifest and all
HTML asset tags together to `20261013-chart-headroom` (staging: `-staging`).
Scale tests cover 1,104 cases; browser tests measure the visible gap on mobile
and desktop, as well as sparse forecasts and redraws. All data is synthetic.
Design reference: https://www.chartjs.org/docs/latest/axes/cartesian/linear.html#grace
The 5% target and 10% rounding cap are RETRADE presentation choices; no new
chart dependency is introduced.


## Stock selection and Performance reconciliation — 13 October 2026

The chart geometry owner (`src/features/charts/polish.js`) keeps 5% positive
headroom with bounded money rounding, now refining through 5/10 increments.
Only a regular grid is labelled: no extra irregular terminal tick. A £70 peak
uses a £75 ceiling with £0/£25/£50/£75 ticks. Plot bounds and labelled ticks are
separate; a large sale cannot force a jump to the next coarse grid interval.

Core remains the owner of duplicate creation, withdrawal, and Stock selection.
Unlisted duplicates retain their state and no listing date/fee. A copy gets a
new identity and independent part IDs, clears completed-sale/settlement data,
and chooses a numbered name across all month buckets using persisted titles.
Staging's separate purchase-group resets and Link purchase action remain.

Stock reserves all bulk actions and its zero-selection totals from entry.
Eligibility only enables/disables controls. Checkbox changes update existing
rows instead of replacing the list. Bulk withdrawal shares the single-item
reset, confirms scope, rechecks live eligibility/lot membership after confirmation,
and uses the existing durable save path. It does not end marketplace listings.

Performance's monthly cards, monthly chart and drill-down share dated components
from the existing canonical FY summary, including the FY's motor-cost exclusion
and removed-stock/write-off costs. Cost-only and return-only months remain visible.
The FY headline is not replaced with the former incomplete monthly sum.
No tax/accounting-engine rules, boundaries, database schema or user data changed.

Verification: tests/stock-performance.cjs, tests/stock-performance-browser.cjs
and the chart scale/browser suites. All records are synthetic. New static
generation: 20261013-stock-performance-polish (staging adds -staging).


## Credential forms and Stock control formatting — 14 October 2026

Core owns auth-screen switching and completion. Sign-in has its own POST form,
submit button, stable username/password names and explicit username/current-password
hints. Signup/recovery retain new-password hints. Hidden auth steps are inert and
disabled. Successful authentication removes all credential forms from the document
without rewriting submitted input types or values; only pristine HTML is retained
for later sign-out. Passwords are never stored by the app. Session persistence and
Supabase verification remain with the existing auth owner.

Fake credential fields are removed. The workspace guard excludes the whole auth
overlay, runs immediately even after a deferred load, and treats newly inserted
form controls as ordinary data across routes and lazy panels. Searches use search
input types. Browser password managers ultimately control save/autofill prompts;
synthetic Chromium/WebKit tests verify form semantics and isolation, not iCloud
Keychain UI or physical iPhone behaviour.

Stock retains the native Platform picker with a storefront icon, centred text and
symmetric padding. Button geometry and eligibility are unchanged. Regression checks
cover 320/390/1440px controls. Cache: 20261014-login-autofill-stock-format
(staging adds -staging).

References: Apple enabling-password-autofill-on-an-html-input-element and
https://web.dev/articles/sign-in-form-best-practices (form submission and removal).


## Stock Platform arrow — 14 October 2026

`workspaces.css` explicitly renders the native Platform picker's background
caret once at 12px, vertically centred 10px from the right edge. This overrides
the toolbar background shorthand that reset the original no-repeat setting.
The centred label, storefront icon and native selection behaviour are retained.
Cache generation: `20261014-platform-arrow` (staging adds `-staging`).

### 14 October 2026 — contained dashboard forecast readout

Dashboard polish passes the existing numeric forecast into the core scrubber.
Its one HTML tooltip shows actuals and month-end projections together and stays
inside the SVG's visible bounds, accounting for card padding and the legend.
Finalize removes the obsolete SVG forecast label; no second dashboard hover
listener or native title competes with the readout. Dashed bars, run-rate maths,
refunds and tap-to-open behaviour retain their existing owners.
The forecast-readout asset generation refreshes cached clients.

### 14 October 2026 — compact Stock / Sales selection workflow

Core owns the shared one-row selection toolbar, capability checks and batch
commands; workspaces.css owns its responsive action menu. Stock exposes Mark
sold / Unlist, with Platform, Bundle sale, Create Job Lot, Link purchase and
Duplicate to stock under More. Sales exposes Undo sales / Duplicate to stock.
Unlisted and Returned queues instead expose Duplicate / Create Job Lot.
Mobile uses selected count / Actions / Done. Menus open above or below the
toolbar to fit the viewport; long menus scroll internally on short screens. Actions reserve space immediately;
row selection updates in place and Select all follows the actual filtered rows.
Destructive deletion and disposal stay on individual item pages.

Sales selection keys identify sale/return events, including distinct cycles for
the same item. The bundle renderers expose their IDs for in-place selection.
Bulk undo only reverses the selected latest completed standalone sale, retaining
costs, earlier return history and incurred relist fees. Refunds, grouped orders,
archived/returned items and partner allocations require individual review.
Confirmation rechecks the exact records; a changed record cancels the batch.
Each successful batch uses the existing durable save owner once.

Duplication shares the existing record builder. Batch copies are new Unlisted
stock sourced today, with new item/part IDs and sequential names. Costs/photos/
partner terms are retained; sale/return history, payments, old purchase/group/run
links and cloud revision markers are cleared. Source records are untouched.
No schema or accounting-engine changes. The bulk-selection cache generation
refreshes both environments (staging retains its isolated binding).

Synthetic Chromium/WebKit coverage exercises six widths, single-row controls,
exact visible selection, independent sale cycles, batch cancellation, mixed
eligibility, resale reversal, duplicate isolation, and keyboard menu dismissal.

### 14 October 2026 — Platform menu alignment

The native Platform picker in the bulk action menu uses the same left inset
as the other action icons and labels. Its single caret stays at the right edge.
The existing picker behaviour is unchanged. Static cache generation:
`20261014-platform-menu-alignment` (staging adds `-staging`).

### 16 October 2026 — yearly Sales forecast readout

The shared core scrubber now presents actual-to-date and month-end forecast
together for Sales, using the same contained card as Home. Sales retains its
projected endpoint geometry and existing forecast model; achieved values and
refunds remain separate from projections. The likely revenue range is inside
the card. Chart finalization and Sales sequencing no longer install competing
forecast bubbles or native hover titles. Dashes, endpoint timing and touch
scrubbing keep their existing owners. No accounting or persistence changes.
Cache generation: `20261016-sales-forecast-readout` (staging adds `-staging`).


### 16 October 2026 — one fixed account cost / payout

The accounting engine resolves the canonical fixed agreement before calculating
acquisition cost. Supplier arrangements deduct it as acquisition; legacy partner
arrangements deduct it as their existing partner payout. A mirrored costPrice is
never a second expense. Legacy settlement kinds and payment history stay intact;
percentage agreements retain their genuine upfront cost and profit share. Existing
fixed records benefit on read, without a bulk data rewrite or migration.

Core owns the shared fixed-amount writer and the single amount in the item cost
form. Add-stock/list inputs synchronise cost and payout in item-adjustments.js;
arrangements-v2.js uses the same writer for individual and bulk account terms.
General item edits preserve existing account terms/payment status when the owner
has not changed. Stock forecasts, sale/return breakdowns, cash and tax calculations
use the same deduplication. Payment allocations remain authoritative for cash.

The account-cost-payout browser regression uses isolated synthetic records across
mobile/desktop and Chromium/WebKit: existing duplicate values, zero, field sync,
edit/reload, advance payment, later sale, return/resale, historical profit shares,
hybrid percentage arrangements and narrow layouts. Static generation:
`20261016-account-cost-payout` (staging adds `-staging`).


### 16 October 2026 — editable item terms

Core's item cost form now exposes a per-item agreement selector for every account
item, independent of its account default. Fixed cost and the terms amount are both
editable and synchronise immediately. Profit share shows a read-only £0 item cost;
saving explicitly sets the item to consignment mechanics and persists its override
and percentage. Merely viewing historical hybrid items does not migrate data.

Terms remain editable after payment; account ownership stays protected. Existing
transaction allocations and dates are unchanged. Allocated payments determine the
remaining liability after a terms edit, and cash-basis tax uses the recorded
allocation kind even if the item's agreement changes. No schema migration.

The account-cost-payout and item browser tests cover both edit directions, model
switches, persistence, independent item/account defaults, payment preservation,
outstanding balances and small-screen controls. Generation:
`20261016-item-terms-linked-cost` (staging adds `-staging`).

### 16 October 2026 — account potential and legacy status reconciliation

Core owns account inventory grouping through _accountStockGroups, shared by the
account rows and summary. Completed sales cannot enter remaining potential even
when an older record still has a listed label. The existing on-load state repair
now resolves listed/sourced labels against completed sale and active-return
evidence. Relisted stock and disposed-item history are preserved. Repairs use the
existing pre-migration snapshot and conflict-aware writer; no direct database
rewrite or schema migration is required.

The potential card reads forecastYourShare and priced listed/unlisted counts from
_accountStats. Its separate hand-written profit formula is removed. Listed items
retain the accounting engine's fees, costs, returns and partner deductions;
unlisted estimates use the existing item forecast policy. Unpriced items are
excluded from the estimate, and loss-making stock is not silently clamped to zero.
Job Lot allocation keeps its existing owner.

Synthetic unit and desktop/mobile Chromium/WebKit regressions cover six active
listings plus five legacy sold records, idempotent status repair and row roundtrip,
returns, resale, disposal, unlisted estimates, real platform fees, fixed partner
amounts and negative profit. Generation: 20261016-account-potential-state
(staging adds -staging).


### 16 October 2026 — fourteen-day dashboard

Home offers Last 14 days between the 7- and 30-day options. Core aggregates one
bucket per calendar day, including today and zero-sales days. Headline metrics,
drill-down labels and comparison deltas use the same range. Prior rolling windows
now end immediately before the selected range, correcting the skipped boundary day.

Chart polish owns the 14-day geometry: proportional inset profit bars, a 38px
maximum revenue width, evenly spaced visible date labels including both endpoints,
and a full hit column for every date. Narrow layouts reduce labels, not data.
Daily views remain actual-only; refunds keep their existing separate presentation.
Performance warming includes 14 days. No data or schema migration.

The isolated fortnight regression runs in Chromium and WebKit at 320, 390, 768
and 1440px, checking boundaries, totals, blank days, losses, bar gaps, label bounds,
selection persistence, hover, drill-downs and switching between daily periods.
Cache generation: `20261016-dashboard-14-days` (staging adds `-staging`).
