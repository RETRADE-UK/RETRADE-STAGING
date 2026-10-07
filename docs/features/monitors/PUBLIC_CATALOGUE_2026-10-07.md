# Public catalogue connection — 7 October 2026

The authenticated gateway accepted a setup check but refused the first automatic
request with HTTP 403. Bounded research demonstrated three public UK catalogue
reads with one anonymous session, a minute apart, returning 20 GBP listings each.
One additional listing ID appeared between reads. This was an execution-workspace
probe, not proof of access from Supabase or continuous availability.

## Implementation

- Public searches use the current `api.vinted.co.uk/svc-catalogue/items` contract,
  with a public session obtained from the UK homepage. Requests identify RETRADE;
  no account OAuth, rotating proxies, challenge execution or refusal replay.
- `vinted-public-session.mjs` owns fixed-host cookie scope, expiry, replacement,
  request bounds and the public request headers. Session cookies are encrypted
  with the existing owner-bound AES-GCM storage. Public state is identified by
  `source_mode`; legacy account ciphertext cannot be interpreted as a public jar.
- `public-connection.mjs` owns durable bootstrap, expiry and persistence. Leases,
  generations, disconnect fencing, per-owner isolation and cooldown survive restarts.
  A successful replacement removes the obsolete saved account credential bundle.
- `vinted-normalize.mjs` recognises exact known condition labels at the end of
  `item_box.second_line`, only when `item_id` matches the listing. Unknown or
  conflicting explicit fields remain unknown. Prices and buying criteria do not change.
- Setup and automatic queries use the same 50-item page size and merged price
  window for same-owner, same-term monitors. Set-up samples save at most 20
  confirmed matches, silently. Unknown-condition-only pages cannot verify setup.
- Automatic scans keep the six-catalogue-request budget, overlap coverage,
  silent initial baseline and transactional notification outbox. Bootstrap can
  add one bounded request when the stored public session expires. HTTP 401/403/404
  pause requests. Rate limits retain their retry time. Failure HTTP status and
  request counts replace stale successful diagnostics.
- Settings presents Check catalogue access, notification controls and Start
  12-hour trial. No token/User-Agent form remains. Scheduled, limited and running
  states are distinct. Backend capability gates the new UI; old token endpoints
  return a refresh-required response without using submitted credentials.

## Validation and rollout

Synthetic tests cover cookie isolation/expiry/deletion, no account fallback,
refusal/timeout bounds, current condition fields, database permissions and fencing,
shared scans, baseline silence, deduplicated device fanout, and mobile/desktop setup.
Build, CI, deployment and actual-host observations are recorded when complete.
No production binding, production data or buying operation is in scope.

## User steps

1. Open staging and refresh. Go to Monitors → Settings.
2. Press Check catalogue access. Continue only when it reports access verified.
3. Enable notifications on each device and send a test. Confirm a receipt.
4. In Monitors, enable the wanted tiers and their Alerts setting.
5. Start the 12-hour trial in Settings. Wait for the first successful scan.
6. Existing listings form a silent baseline; new qualifying listings can alert.
   Clicking an item notification opens that Vinted listing. Finds retains matches.
7. If access is refused, the app pauses and explains the result. Do not paste a
   token or treat a scheduled trial as evidence of a working source.

Remaining acceptance: actual Supabase access, repeated scheduled scans, session
expiry recovery under real traffic, an eligible new-item delivery and a bounded
12-hour observation. Three public reads do not establish completeness or latency.
