# Automatic scans and push diagnostics — 6 October 2026

Staging only. Live authenticated refresh succeeded at 21:05 UTC and the saved
session returned 20 listings at 21:07 UTC before this work. Two subscriptions
are registered, one FCM and one Apple. The saved registered-user Canon monitor
was enabled but notifications were off at inspection. The user explicitly asked
to activate automatic pulling and alerts on Windows and iPhone.

## Cadence decision and research

Start at 60 seconds, with up to six catalogue requests per whole worker cycle,
maximum two overlapping pages per term, and account-scoped query reuse. The Canon
recipe contains three search terms, so a typical cycle takes 3 requests and a
full overlapping window up to 6 (180–360 requests/hour). Fifteen-second cycles
multiply those budgets by four; thirty-second cycles by two. No authoritative
buyer-web API rate quota was found, so 60 seconds is an engineering starting
point, not a provider-approved or guaranteed safe limit. Vinted terms restrict
external automation; slower polling is not permission or an exemption. Refusals
stop requests, and 429 uses Retry-After plus durable backoff. No challenges,
proxies or access-control workarounds are implemented.

Supabase supports sub-minute scheduling, so platform capability is not the
limiting factor. Keep minute polling until measured coverage, request/error
counts and notification acknowledgements justify a change. Expected polling
wait alone averages about half the interval for uniformly arriving items; this
excludes indexing lag, requests, queueing and notification delivery.

Sources reviewed:
- https://supabase.com/docs/guides/cron/quickstart
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification
- https://support.microsoft.com/en-us/windows/experience/notifications-and-do-not-disturb-in-windows
- https://www.vinted.com/terms-and-conditions (general automation restriction; not a UK rate quota)

Apple requires Home Screen web-app notification permission; Focus settings apply.
Windows can suppress banners through Do Not Disturb and app notification settings.
Provider acceptance alone cannot establish whether a user saw a banner.

## Runtime

`automatic.mjs` replaces unauthenticated tick scanning. Service-only RPCs claim
only enabled recipes belonging to explicitly activated, verified connections.
Worker credentials never leave the Edge process. Access tokens are reused while
valid; near expiry, the existing durable refresh claim and encrypted rotation
complete before catalogue use. Unknown refresh outcomes require reconnection.
Query cache keys include owner identity. A shared six-request budget, fair claim
ordering, monitor revisions and connection-generation checks fence late results.
Disconnect or pausing automatic searches prevents an in-flight scan commit.

Successful scans persist candidates and matched results through the existing
transactional outbox. Initial history is silent. Only new confirmed matches after
baseline produce one job per subscribed device when that monitor's alerts are on.
Partial windows remain visibly limited. Source diagnostics are account-scoped;
other users cannot open a shared authenticated source gate. next_run_at aligns
with the next minute boundary, avoiding an accidental two-minute cadence.

## Push diagnostics

Test pushes have unique tags so repeated tests can appear separately. Listing tags
remain stable and renotify=false keeps retries from sounding repeatedly. The
service worker acknowledges receipt and a successful showNotification call through
an unguessable per-job receipt capability delivered inside the encrypted push.
Receipt calls cannot read data or change ownership, delivery state or payloads.
They expire after one day, accept only fixed enum states and remain service-only
at the SQL layer. Acknowledgements never contain a Vinted credential.

The Alerts page distinguishes provider acceptance, device receipt, display-request
acceptance and display failure. It includes Test all devices and Test this screen
(the latter calls the local notification API to isolate OS/browser display from
server transport). A successful showNotification promise is not proof of a visible
banner, Focus bypass or a person reading it. Old service workers cannot acknowledge;
users need to reopen/reload the installed app after deployment.

## Verification and rollout

Offline tests cover owner-isolated tokens/cache, expiry renewal before catalogue
requests, 403 stop and durable 429 backoff; actual handler cron and auth paths;
SQL leases, account ownership, silent baseline, two-device fanout, deduplication,
disconnect fencing and receipt scope; service-worker receipt/display calls and
safe listing navigation; mobile/desktop automatic controls and local push tests.

Migration `20261006211333_monitor_automatic.sql` defaults every connection to
inactive. It was syntax/grant checked in a rolled-back staging transaction. Apply
it and deploy monitor-service, then explicitly activate the user's verified
connection and enable notifications for their existing Canon preset as requested.
Leave the anonymous demo preset disabled. Observe at least two cron scans before
claiming automatic pulling works. Record deployed run/PR evidence in the PR.

Runtime ownership and cache build: page.js / cloud.js remain the native UI owner;
worker/monitors/src/automatic.mjs owns the cycle; sw.js owns browser push receipt
and display; private connection RPCs and existing monitor/outbox tables own durable
state. Build: 20261006-monitor-automatic-staging. Production is unchanged.

Rollback: disable auto_enabled on the affected connection, revert service/UI via
PR, retain additive columns/history. The global source remains blocked. Never
read or export ciphertext, Vault keys or push subscription credentials for logs.
