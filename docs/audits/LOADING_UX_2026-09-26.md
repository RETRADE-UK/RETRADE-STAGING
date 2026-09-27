# Loading and Sales motion audit — v1.5.83

## Findings and decisions

The route shell still assumed four generic cards for unrelated workspaces. It
also used generic line heights rather than KPI typography, omitted current
toolbars, and did not reflect the compact Accounts strip or Tax sections. Cold
boot already masks the real Dashboard tree; that separate auth/data boundary
remains in place. Warm route refreshes must keep their populated content.

The Sales refund endpoint had no semantic marker class, so the sequence owner
excluded it from both the historical-point reveal and the forecast endpoint
gate. It now joins the same final stage as the blue/green rings. Past refund
points retain their historical reveal. Reduced motion shows the completed chart.
The current month keeps its gold outline and gains `aria-current="date"`; the
redundant NOW text is removed. Financial-year disclosures use a neutral border
and retain their CURRENT badge, distinguishing year from month.

## Loading policy

| Situation | Presentation |
| --- | --- |
| First route finishes within 300 ms | Render content directly; no skeleton flash |
| First route or changed Sales layout still waiting | Page-specific inert shell; static labels and controls, unknown data placeholders |
| Same populated layout refreshes, filters or sorts | Keep content visible; no page-wide replacement loader |
| Navigation cancelled | Cancel placeholder/status timers; late work cannot reclaim the route |
| Route still waiting after 8 seconds | Plain-language status; navigation remains available; no fabricated percentage |
| Data ready | Reveal immediately; no artificial minimum dwell |
| Reduced motion | Static placeholders and completed charts |

The 300 ms gate and additional 700 ms before shimmer are RETRADE implementation
choices, not universal research thresholds. The first second of a route wait
therefore has no moving shimmer. Existing low-contrast, constant-speed 3.65 s
shimmer remains. Off-page placeholder motion is disabled. The retired Sales
loading CSS (1.18 s competing shimmer and whole-card masking) is removed.

Status announcements live outside `aria-busy` regions so screen readers do not
have to wait for the busy region to finish. Decorative shells are `aria-hidden`
and `inert`; they cannot take focus or trigger disabled/placeholder actions.

## Layout contract and limits

Core `_routeSkeletonMarkup` uses the production layout classes: compact 2×2/4-up
Sales and Stock metrics, Stock status tabs below metrics, chart-first Performance,
Accounts outstanding strip and rows, selected Tax section with bottom export,
Cashflow surfaces, Sourcing metrics/list, Costs banner, Returns KPIs, Activity
timeline and report sections. Chart skeletons reuse `_monthlyNetProfitChartHTML`.
The final responsive CSS remains authoritative; no guessed monetary records are
created by route skeletons. Cold-boot data masks include the newer KPI classes.

A first-load shell cannot know eventual list length, wrapped item names or
conditional rows before data arrives. Those use a bounded representative number
of rows, not a claim of pixel-identical unknown content. Exact page structure,
breakpoints, metric order and interaction placement are the maintained contract.
This work reduces unnecessary loader DOM/animation and removes a fixed 440 ms
minimum boot-loading hold; it does not claim faster network/database requests.

## Research

- [NN/g: Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/):
  placeholders should communicate the coming layout; quick-load flashes are
  counterproductive. Skeletons are not a substitute for performance work.
- [IBM Carbon: Loading](https://carbondesignsystem.com/patterns/loading-pattern/):
  skeletons suit initial data/container loading, not every control or modal.
  Retain the known structure and distinguish page loading from action progress.
- [Google: Optimize CLS](https://web.dev/articles/optimize-cls): reserve space for
  asynchronous content; avoid animations that alter layout geometry.
- [W3C: Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html):
  loading and completion messages should be available without moving focus;
  avoid excessive announcements.

## Verification

`tests/loading-motion-browser.cjs` checks route shells at 320/390/768/1440 px,
read-only construction, inert shells, fast/warm/cancelled waits, and the refund
endpoint before/after the final forecast stage, including reduced motion.
Existing startup, route, accounting, scroll, interaction and workspace suites
remain release gates. Screenshots use synthetic data, not live business data.
Physical iPhone Safari performance is not established by Chromium checks.
