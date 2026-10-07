# Clear connection setup — 7 October 2026

The owner's screenshot showed a disabled connection submit button without an
explanation, help disclosures that looked like plain text, and a replacement
journey requiring disconnection. Several monitor buttons also lacked the shared
application button variants.

## Changes

- Settings uses separate connection and device-alert cards, side by side on wide
  screens and stacked on phones. Finds remains the default view.
- Connection progress distinguishes saved credentials, verified search access
  and running monitoring. A renewed session with a catalogue 401 stays visibly
  blocked and cannot start a trial.
- Connect Vinted is the initial action. Update connection reveals an empty form
  without deleting stored credentials; Cancel clears the draft. Submission uses
  the existing authenticated, encrypted connection endpoint. It does not change
  that endpoint's rotation or storage behaviour.
- A visible countdown explains the existing server cooldown after checks or
  disconnection. A local clock enables controls when the wait ends; it never
  contacts Vinted, changes a cooldown, or rebuilds the form. No new retry loop.
- Use this browser explicitly fills User-Agent from the current browser, with
  guidance for sessions in another browser. Token input is trimmed and validated
  before submission. Token and browser fields clear on submit, Cancel, navigation
  away and disposal. They never enter local/session storage.
- Connection writes fence earlier status responses and suppress background page
  refresh during the write. Ordinary status refresh preserves draft fields.
- All monitor action buttons use the existing primary/secondary/destructive
  variants. Native disclosures have a border, background, chevron, keyboard
  focus style and 44px minimum target. Monitor cards expose a View finds action.

## Verification and limits

The monitor browser regression exercises cooldown expiry without manual refresh,
draft preservation, explicit browser-detail copying, token validation, private
input disposal, update/cancel without disconnect, blocked/ready trial gating,
keyboard disclosures, saved-search samples and 320/390/1024/1440px containment.
Required release gates: `npm run check`, `npm test`, `npm run build`, screenshot
review and passing PR CI. Check the PR for final run outcomes.

This is a frontend release. No migration, backend deployment, credential change,
live Vinted request or notification send is part of it. The last inspected
staging state was disconnected with no stored credentials; the preceding search
failure was HTTP 401 after successful renewal. A real successful search is still
required before starting the 12-hour live trial. Synthetic tests do not establish
physical iPhone performance or marketplace availability.

Build: `20261007-monitor-setup-staging`. Rollback through a staging revert PR;
no data rollback is required. Production is unchanged.
