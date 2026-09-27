# Workspace UI refinement — v1.5.81

The mobile screenshots showed wrapped headers, oversized summaries and list
controls spread over several rows. Sourcing sorting was ineffective across
months because the sorted runs were immediately regrouped into a fixed reverse
month order.

## Research and decisions

Reviewed the original guidance below, not secondary template galleries:

- [Nielsen Norman Group: Data Tables — Four Major User Tasks](https://www.nngroup.com/articles/data-tables/)
  supports finding records, comparing them, opening details and acting on them.
  Applied: visible run metrics and a clear entry to each run; compact stock and
  sales summaries leave more room for the working list.
- [IBM Carbon: Data table usage](https://carbondesignsystem.com/components/data-table/usage/)
  places collection tools together and reserves expanded areas for supplementary
  detail. Applied: one search/filter/sort/selection area, with existing item and
  run pages retaining full detail and editing.
- [NN/g: Mobile Tables](https://www.nngroup.com/articles/mobile-tables/) and
  [Google: Common layouts](https://developer.android.com/design/ui/mobile/guides/layout-and-content/common-layouts)
  informed the adaptive presentation. Desktop run rows align comparable metrics;
  mobile rows put the same figures below the name and date, with explicit labels.
- [NN/g: Accordions on Desktop](https://www.nngroup.com/articles/accordions-on-desktop/)
  explains the visibility and interaction costs of hidden content. Sourcing uses
  a flat list so sorting visibly ranks every run across all dates.
- [W3C sortable table example](https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/)
  informed explicit sorting controls and keyboard access. Here the collection is
  a list of native buttons with descriptive accessible names and a labelled
  native sort selector; it does not claim ARIA table/grid semantics.

These are product-specific applications of the guidance, not evidence that one
layout universally outperforms another. No new animation, framework or remote UI
library is needed.

## Implementation

- Dashboard, Performance and Accounts headers keep their controls on the right.
  Accounts navigation uses the same label; the creation action remains Add partner.
- Tax year and its date range form one compact caption beside the year selector.
- Sales and Stock have a single four-metric surface: four columns on wide screens,
  two by two on mobile. Existing metric definitions and breakdowns remain visible.
  Search and selection share a row on mobile, followed by filter/sort controls.
- Stock status tabs precede the summary so its scope is explicit. Existing job lot,
  selection, grouping and item actions retain their owners.
- Sourcing has globally sorted rows, search by run/place/date, a matching-result
  count and an empty state. Spend, sold/item count, net profit and ROI remain
  visible without opening a month. Run details remain one click or Enter away.
- Sort uses the existing saved preference; search is session-only. The previous
  save/read code referenced an undeclared RUNS_SORT while the renderer used a
  different window value. It now consistently reads/writes window._RUNS_SORT.
- Unsold runs display the existing profit value, including any run overhead loss,
  rather than hiding it behind a dash. The explanatory caption states that profit
  is based on sales to date after run costs. Zero-spend ROI remains unavailable.
- Loaded and pending summary layouts use the same classes. Existing chrome,
  financial calculations, authentication, cloud storage and cache behaviour retain
  their owners. The versioned static asset build advances to v1581.

## Verification

`npm run check`, `npm test` and `npm run build` passed locally. The full suite
includes 156 disclosure/scroll interactions across desktop, mobile and reduced
motion. PR CI must pass on the final committed tree before merge.
`workspace-browser.cjs` verifies six global sort modes across different months,
zero-spend ROI, losses, persisted sorting, search continuity/empty results, keyboard
run details, header geometry and Sales search/selection/month-picker interaction.
The browser harness blocks external data requests and uses synthetic fixtures.

Visual inspection covers dark mobile layouts at 320/390px and desktop at 1440px;
responsive tests also cover intermediate widths. These browser checks do not
establish physical iPhone Safari behaviour or frame pacing.

## Follow-up preferences — v1.5.82

- Dashboard refunds remain discrete red dots; the chart polish renderer no longer creates a connecting path, including during responsive redraws.
- Stock status tabs sit below the KPI surface and above the collection toolbar.
- Monthly Sales and Stock show their supporting metric first and the orange primary metric second. Pending layouts use the same order.
- The Tax download action is a full-width primary button at the bottom of every Tax section.
