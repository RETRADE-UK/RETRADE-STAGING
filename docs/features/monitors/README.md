# Vinted monitors — takeover, 23 September 2026

**8 October evening:** [Confirmed anti-bot refusal, wider tier window and remaining access dependency](ACCESS_REVIEW_2026-10-08.md). Monitoring is off; no sustained connection or real-listing push is proven.

**8 October continuity:** [Overnight refusal, session renewal and recovery](CONTINUITY_2026-10-08.md).

**7 October catalogue update:** [Public sessions, current listing fields and setup](PUBLIC_CATALOGUE_2026-10-07.md).

**7 October setup clarity:** [Visible controls, connection replacement and cooldown feedback](SETUP_CLARITY_2026-10-07.md).

**7 October workspace:** [Feed, monitors and one-time setup in Settings](SETTINGS_UX_2026-10-07.md).

**7 October connection reliability:** [shared renewal, verified search access and the remaining source blocker](CONNECTION_HEALTH_2026-10-07.md). Four researched tiers are complete; live access remains blocked.

**7 October tier recovery:** [match-only history and recovered monitor definitions](TIERS_2026-10-07.md). The newer v1.3 handover supplies four named price bands; all remain labelled drafts pending complete original model/bundle rules.

**6 October automatic scans:** [minute cadence, authenticated worker and push diagnostics](AUTOMATIC_2026-10-06.md).

**6 October saved connection:** [private renewal test and credential storage](PERSISTENT_CONNECTION_2026-10-06.md). Background activation still awaits a live renewal test.

**6 October v1.2:** [session check and deployment status](SESSION_CHECK_2026-10-06.md).
Updated the retired catalogue path and prepared private one-request session
verification with labelled samples in History. Replacement endpoint also returned
403 unauthenticated. Backend rollout awaits restored Supabase access; the UI does
not accept a token until the new backend capability is present.

**5 October inbox redesign:** see [research, implementation and remaining gates](INBOX_UX_2026-10-05.md). Feed-first navigation, cross-revision history, saved/read state and device-specific push setup. Source connection remains blocked; this is not yet a live detector.

**29 September continuation:** see [current audit and remaining gates](AUDIT_2026-09-29.md). The repaired preview is being released to staging; the fresh hosting probe still returned HTTP 403. Earlier sections below are dated history.

**MVP preview update (24 September):** native builder, persisted recipes, Canon preset, phone-push opt-in and manual Discord comparison are implemented. The actual hosting source probe returned **403**; live scans remain blocked. See [MVP runbook](MVP_RUNBOOK.md) for testing, deployment and remaining gates. Earlier audit entries below describe their dated snapshots.

**Decision: retain the server-worker/native-RETRADE direction; rebuild the
unreliable boundaries before enabling it.** Recovery and audit are complete for
the three available packages, the preserved Git branch and two Discord screenshots.
Live monitoring, deployment and Discord parity have not been demonstrated.

**24 September update:** the first repaired engine is implemented under
[`worker/monitors/`](../../../worker/monitors/README.md), with v1 contracts,
normalization, matching/scoring, bounded source requests and benchmark comparison.
Staging schema inspection found no monitor tables. The catalogue feasibility probe
returned 404; network access and persistent operation remain unverified. The native
monitor page is still disabled. Read the dated audit update before the next step.

## Source of truth

| Evidence | What it contains | Treatment |
| --- | --- | --- |
| `RETRADE_Monitors_v1_Dev.zip`, August 27 | Native page, builder, local recipes and demo feed | Superseded by v3; indexed, not duplicated |
| `RETRADE_Monitors_v2_CloudWorker.zip`, August 27 | Cloud bridge, schema and Node polling worker | Compared with v3; indexed, not duplicated |
| `RETRADE_Monitors_v3_CanonBenchmark.zip`, August 27 | v2 plus permissive Canon benchmark and event table | Feature-only source recovered under `experiments/monitors/` |
| `RETRADE-UK/RETRADE:feature/monitors`, `6ea9f95` | Separate dashboard, storage adapter, category/model schema; worker README only | Different prototype, not a newer complete worker; schema retained for reconciliation |
| `IMG_2373.png`, `IMG_2374.jpeg`, August 27 | Resell Locker / `Locker \| Sender 3` in `cameras-vitned` | Inspected for parity requirements; private screenshots not added to Git |
| Earlier conversation recovery | July Canon buying filters; August isolated development and benchmark plan | Carried forward with the distinction between buying and benchmark rules |

The v3 archive's old `app.js`, `app.css`, HTML, accounting and reports are not the
current app. Only the monitor-specific bridge/style suffixes were extracted.
`provenance.json` records all archive member hashes and each recovered file.

## Requirements carried forward

- Develop in `RETRADE-UK/RETRADE-STAGING`; preserve current branding, shell,
  accounting, startup and folder ownership. Monitors remains separate from Sourcing.
- Multiple reusable monitor recipes: create, edit, pause/resume, duplicate paused,
  archive, model aliases, price bands, condition/keyword rules, seller reputation,
  transparent decision reasons, deal feed and eventual notification preferences.
- First prove detection using **Canon RL Benchmark £51–£100**, Vinted UK,
  search terms Canon / EOS / Rebel. Match any of 500D, 550D, 600D, 650D, 700D,
  1000D, 1100D, 1200D, 1300D, 2000D, 4000D and their Rebel aliases.
- Benchmark accepts all conditions. Faults and zero-review sellers remain visible
  with warnings/risk flags. Feed-only initially. Do not apply the stricter buying
  blacklist to this comparison or confuse filtering with scanner misses.
- Original buying use case: reasonably priced Canon cameras in good condition,
  no damage, including Rebel equivalents. £0–£100 and £101–£200 buying bands were
  discussed separately; their commercial rules follow detection validation.
- Keep model resale values uncalibrated until supported by current evidence.
  Unknown costs/profits must display as unknown, not zero or a buy recommendation.
- Goals: near-complete multi-day coverage against Resell Locker, no duplicate
  spam, observable worker health, usable seller information and useful detection
  speed. No agreed exact latency SLA or hosting budget was recovered.

## Read next

1. [Audit and Discord gap matrix](AUDIT.md): verified defects and activation blockers.
2. [Implementation plan](IMPLEMENTATION_PLAN.md): final folder ownership, contracts,
   acceptance checks and staged delivery sequence.
3. [Recovered source](../../../experiments/monitors/README.md): reference boundaries.

Future improvements requested now: do everything the Discord monitor does, with
better usability and efficiency. That is the product target, not a claim that
the recovered prototype already supports those actions.

Research-based tier completion and bounded trial: see `TRIAL_2026-10-07.md`.
