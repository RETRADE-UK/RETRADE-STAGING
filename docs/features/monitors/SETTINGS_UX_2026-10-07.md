# Monitor workspace and setup journey — 7 October 2026

Finds remains the landing view: matching items for the selected monitor, unread
and saved filters, and history search. Monitors owns recipe creation and editing.
Settings now contains Vinted setup, saved-search checks, device alerts and
collapsed diagnostic/comparison tools. The status strip links directly to Settings.

Manual access-token entry and its one-use request handler have been removed from
the page. Refresh-token storage and renewal continue through the existing backend.
The actual setup contract remains refresh token, browser User-Agent and GB:
the backend does not currently consume Vinted user ID. No unused identity field
was added. Saved connections hide credential entry except on confirmed reconnect.
Secrets clear on submit, navigation away and disposal; none enter browser storage.

Notification troubleshooting and disconnection are disclosures. Unconfigured
connections hide actions that require stored credentials. Returning users land
on Finds; no connection test or scan is triggered by opening the page.

The 12-hour start remains gated by verified search access. This UI release does
not resolve the recorded Vinted catalogue 401 or establish a successful live run.
There are no backend changes, migrations, credential writes or live notifications.

Validation: required asset/invariant checks, monitor unit tests, full synthetic
browser/database suite and public build. Browser coverage includes absent backend
capabilities, first setup, saved credentials, start/pause gating, saved-search
deep links, non-match exclusion, private input disposal, settings navigation,
notification controls and mobile/desktop layout. Physical iPhone performance
and live Vinted reliability are not established by synthetic browser tests.
