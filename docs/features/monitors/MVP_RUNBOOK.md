# Staging monitor preview — 24 September 2026

## What can be tried

Open `https://test.retrade-uk.com` → **More → Monitors** on mobile, or **Monitors**
in desktop navigation. The page loads only on demand.

- First visit saves **Canon · Discord comparison £51–£100** for that account.
  Its 11 Canon groups and Rebel aliases, all conditions and warnings-only faults
  preserve the original comparator scope. Phone alerts are a separate opt-in,
  requested on 24 September; the engine benchmark scoring remains feed-only.
- Create a custom monitor with 1–3 searches, matching phrases, minimum/maximum
  prices and warning words. Save, edit, pause, duplicate and archive/restore are
  server-confirmed. Changing matching rules starts a new silent baseline.
- A registered staging account can subscribe a phone and request a test push.
  On iPhone, add staging to the Home Screen, open it there, then tap Enable
  notifications. Allow permission and enable alerts on the desired recipe.
  Test pushes are labelled tests; provider acceptance is not proof of phone receipt.
- Developer bypass is a temporary anonymous account: it can save **paused** monitor
  drafts and comparator observations. It cannot enable scans or subscribe devices.
  Do not use it for durable multi-device testing. Registered staging accounts are
  separate from production accounts.
- Record a Vinted listing ID/link and the actual Discord message timestamp in the
  comparison form. The browser converts local time to UTC. Repeated entries retain
  the earliest timestamp. No Discord account is connected or read automatically.
- Example cards are fictional, local-only, explicitly labelled and have no source
  links. They do not enter stored matches, comparison metrics or push queues.

## Live source gate — unresolved

The actual Supabase Edge hosting environment returned **HTTP 403** for the catalog
probe at `2026-09-24T09:19:06Z`. No listings were obtained. A previous workspace
probe returned 404. The source is globally **blocked**; the scheduled worker skips
Vinted requests in that state. There are no cookies, proxies, challenge bypasses,
marketplace login credentials or purchased data services in this implementation.

This is a testable builder/push/comparison preview, **not a completed live-monitor
MVP**. A usable authorised listing source still needs to be connected and proven
from the hosting environment. Do not call example cards live, claim zero misses,
or claim Discord parity. The source-check diagnostic has been retired (410).

## Deployment ownership

| Component | Owner |
| --- | --- |
| Page / account-scoped cloud API | `src/features/monitors/` |
| Feature CSS | `assets/styles/monitors.css` |
| Matching / source contract | `worker/monitors/src/` |
| Authenticated API + bounded scheduled worker | `supabase/functions/monitor-service/` |
| Recipe, evidence, leases, notification outbox | `supabase/migrations/*monitor*.sql` |
| Delivery display | Existing `sw.js` push/click handlers |

Only staging project `dvnrxmdejxfuazmpnudj` is permitted by the function's runtime
check. Both new migrations were applied there. Production is untouched.
The Edge deployment uploads the entrypoint, Deno config, package/lock and the
original `worker/monitors/src/` files at their repo-relative paths; no second engine
copy is maintained. `web-push` is pinned to 3.6.7, with its npm lockfile.

The Edge gateway JWT check is disabled **because the handler verifies user bearer
tokens through Supabase Auth**, while cron uses a private random token. Neither
public keys nor anonymous sessions can authorize the worker path. Backend RPCs
are service-role-only. Public tables use RLS; browser roles have owner-scoped
read permissions only. Subscription secrets, outbox and worker config have no
browser grants/policies. The security advisor's no-policy notices for these three
tables are intentional deny-by-default boundaries; anonymous owner-read notices
reflect the staging developer bypass. No generic public-write policy was added.

Every minute `retrade-monitor-minute` invokes the function via pg_net. A global
lease prevents overlapping ticks. At most five monitors and six unique catalogue
requests run per cycle, with in-cycle shared search results and bounded pagination.
Each monitor has a revision and expiring lease. Match evidence and notification
jobs commit atomically. First baseline is silent; incomplete scans cannot finish
it. Persistence errors propagate. Pauses/edits invalidate leases and queued jobs.

Push uses an encrypted durable outbox, five jobs per tick, bounded requests,
Retry-After-aware backoff, five attempts, and removal of 404/410 subscriptions.
Stable tags collapse repeated visible alerts. Delivery is **at least once**, since
provider acceptance and DB acknowledgment cannot be one transaction; exactly-once
phone presentation is not promised. Sign-out attempts to unsubscribe this device.
Clicking a push opens/focuses RETRADE; use Monitors to inspect the match.

## Verification and limits

- `npm run check`, `npm run build`, `npm test` are the gates. Monitor tests include
  real PostgreSQL semantics in isolated PGlite, with no production network/data.
- `deno check --node-modules-dir=manual --config supabase/functions/monitor-service/deno.json supabase/functions/monitor-service/index.ts`
  follows `npm ci --prefix supabase/functions/monitor-service` for local checks.
- The synthetic browser suite covers mobile/desktop custom save, rejected save,
  explicit previews and navigation disposal. Screenshots are CI review artifacts.
- Real staging smoke tests use a disposable anonymous account, check saved drafts,
  comparator writes, blocked notification access and unauthenticated rejection.
  The disposable account and its data are removed after verification.
- Physical phone receipt, real catalogue field mappings, full-detail enrichment,
  scan coverage, running cost at scale and multi-day Discord parity are **unproven**.
- Feed displays the latest 200 candidates; comparison uses up to 500 Discord
  observations and labels truncation. Baseline/pre-baseline observations are
  excluded. This is a recent sample, not a complete historical audit export.
- There is no automatic Buy Now, Send Offer, Favourite or purchased-to-stock action.
  View on Vinted is navigation only. Profit/landed-cost estimates remain unknown.

## Operations / rollback

Check only non-secret state: `source_status`, `source_message`, `checked_at` from
`monitor_private.config`; job status from `cron.job`; HTTP result from
`net._http_response`; health fields in owner recipes. Never export config token,
VAPID private keys, push endpoints or account sessions to logs/commits.

To stop background activity: `select cron.unschedule('retrade-monitor-minute');`.
To hide the UI: revert its PR through normal staging CI. Preserve tables/evidence
unless a deliberate data-removal decision is made. Do not apply these staging
schedule/binding files to production. Source activation requires validation and a
reviewed adapter change; changing a status flag alone is not source validation.
