# Compact sync and predictable Sales entry — v1.5.85

## Design evidence (26 September 2026)

- Google Docs exposes document status next to the title, including offline state:
  https://support.google.com/docs/answer/6388102
- IBM Carbon recommends using notifications sparingly because they are disruptive;
  actionable messages need an accessible route to recovery:
  https://carbondesignsystem.com/components/notification/usage/
- Material distinguishes short snackbar updates from persistent application chrome:
  https://m3.material.io/components/snackbar/guidelines

Applied judgment: frequent background saves should use a stable, compact indicator,
not an automatic toast on every save. RETRADE uses a filled green circle for synced,
a delayed spinner for a longer active save, outlined amber for pending, a minus
for offline and an exclamation mark for errors. Colour is supplemented by shape,
accessible names and an on-demand details panel. Unknown-duration saves never
invent progress percentages. After 15 seconds the spinner becomes static pending.
Reduced-motion users get static feedback. Only material state transitions are
announced; a fast save does not produce a success notification.

The same 44px target appears in the phone header, tablet header or desktop account
row. Exactly one is visible. The state change cannot resize the header. Details
open on request, support keyboard focus/Escape and contain Retry when relevant.
The panel uses textContent and preserves its controls across status updates.
Business data, sync transport, outbox and conflict handling are unchanged.

## Sales fixes

Core `_prepareSalesEntry` sets the current month before activation and loading.
The performance layer no longer toggles Sales mode or bypasses core routing.
The old defaults asset is an inert, lazy compatibility target for historical URLs.
Saved Yearly preferences cannot override default entry; intentional Yearly and
contextual month links remain explicit routes. Reload hydration chooses Monthly
before its real-layout loading render.

A wrong-view or wrong-month cached page is cleared synchronously. A 300ms wait
still avoids flashing skeletons for quick renders. Slower routes use their exact
Monthly or Yearly placeholder. Warm refreshes of the same month retain content.
The normal render queue cancels superseded navigation; Yearly completion clears
both loading timers and respects the active route.

## Verification

`sync-sales-browser.cjs` covers compact geometry, each state, retry, offline,
reduced motion, keyboard dismissal, stored Yearly state, repeated Sales entry,
intentional Yearly, contextual months and delayed skeleton handoff at phone,
tablet and desktop widths. Network and records are synthetic. Existing startup,
interaction and sync tests remain release gates. Physical Safari is not covered.
