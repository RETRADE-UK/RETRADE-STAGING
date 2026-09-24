# Vinted monitors — takeover, 23 September 2026

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
