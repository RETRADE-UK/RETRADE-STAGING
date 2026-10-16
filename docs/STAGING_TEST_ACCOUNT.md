# Populated staging test accounts

Open https://test.retrade-uk.com, sign out if necessary, and choose **Open
populated test account**. No password is required. The current browser keeps
its authenticated staging session across reloads. Signing out ends access to
that disposable account; the next click creates a separate one. Existing
accounts are never overwritten or automatically refreshed.

The generated account has 120 items: 70 sold, 20 returned, 20 listed and 10
unlisted, with categories, storage locations and expected prices. It also has
three accounts, eight sourcing runs, 16 costs, eight trips, return/parts records,
job lots, cash movements and 320 activity entries. Dates roll relative to account
creation and include a sale today so the current dashboard has something to show.
Unlisted stock is ready for Select → Actions → List items.

## Ownership and isolation

`src/platform/staging-auth.js` is the sole owner of the staging entry. It loads
in the critical startup phase, uses `signInAnonymously`, and hands the accepted
session to the same core auth handoff used by normal sign-in. A narrow observer
reinstalls the entry when core restores pristine credential forms after sign-out.
Repeated clicks are fenced. Failed authentication remains retryable. Ordinary
password sign-in and recovery retain their core owner.

Staging's existing Supabase binding must succeed before core or the helper can
load. The manifest and runtime flag both gate the helper. Production must not
include this helper or the staging seed migration.

The existing `auth.users` trigger is restricted to newly inserted anonymous
users marked as staging demos. The trigger's security-definer seed helper needs
privileged access only to insert that new user's owned records. It is not
executable by PUBLIC, anon or authenticated roles. The metadata flag selects
fixtures; it does not grant database access. Normal owner-scoped RLS applies.
No policies, public credentials or production data are changed.

## Database and verification

Applied to `dvnrxmdejxfuazmpnudj` only: migration
`20261016160315_staging_rolling_test_account.sql`. It replaces the old fixed-date
seed and refuses to reseed an existing workspace. The migration checks for the
staging-only trigger before installing. Original September migration history is
retained. Rolling back the frontend is independent of this additive seed update;
new test accounts continue to receive recent sample data.

`tests/staging-seed-verification.sql` checks the real staging trigger in a rolled
back transaction: record counts, complete unlisted items, current sales, no future
dates and protection against reseeding. A separate anonymous signup/API read
checks the real auth path and RLS-owned fixture delivery. Tokens are not retained.

`tests/staging-auth-browser.cjs` uses synthetic authentication and blocked external
requests. Chromium/WebKit cover 320/390/1440px, provider failure/retry, double
clicks, a missing auth event, session reuse, sign-out/form restoration and a failed
staging binding. The normal CI suite remains required before frontend merge.
