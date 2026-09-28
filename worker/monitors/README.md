# Monitor engine foundation

This directory owns the shared server-side monitor modules, deployed through
`supabase/functions/monitor-service/`. It stays outside the public asset manifest;
there is no separate Node daemon. Persistence, scheduled execution and the native
UI are deployed to staging. The source remains blocked by HTTP 403, confirmed by
the 29 September hosting probe. Recovered prototypes remain reference-only.

Use Node 22 or newer. There are no external dependencies or duplicate package
manifests. From the repository root:

```sh
npm run test:monitors
npm run check
```

## Responsibilities

| Module | Contract |
| --- | --- |
| `src/contracts.mjs` | Validated immutable v1 recipes, integer GBP pence, benchmark factory |
| `src/catalog/canon-dslr.json` | Single active Canon/Rebel alias catalogue; no market valuations |
| `src/adapters/vinted-normalize.mjs` | Explicit provider normalization, safe URLs, sparse-detail merge and malformed-payload errors |
| `src/adapters/vinted-source.mjs` | Injected read-only transport, bounded responses/timeouts, rate-limit signals and bounded overlapping scans |
| `src/engine/match.mjs` | Match / pending detail / reject; built-in and custom models; warnings |
| `src/engine/score.mjs` | Seller assessment and conservative decisions using verified cost/evidence inputs |
| `src/benchmark.mjs` | Independent RETRADE/Discord observations, real misses, duplicates and signed latency statistics |
| `src/feed.mjs` | Bounded display plus exact comparator identity evidence; baseline exclusions and confirmation timing |

## Data contract

- Money uses integer pence, with `null` for unknown. A £0 maximum is a real zero
  limit; `null` is unbounded. Provider decimal values accept at most two decimal
  places. Booleans, negatives, non-finite values and excess precision are rejected.
- Listing identity is a numeric Vinted ID. Currency must be known GBP to match;
  missing currency/price can wait for details. Foreign currency is rejected.
- `observedAt` records first receipt and survives enrichment/duplicate merges.
  Source publication/update timestamps are not inferred from this value.
- `detailComplete` is explicit. Incomplete catalog descriptions cannot cause an
  irreversible model rejection. Restrictive wording rules wait for complete
  detail; absent optional detail cannot overwrite good title/photos/seller data.
- Seller reputation scale is explicit (`fraction` or `stars`); there is no
  magnitude-based guessing. Partial feedback counts are unknown, not zero.
  `allow` zero reviews means visible without the forced high-risk label; it does
  not create established-seller confidence for an automatic BUY recommendation.
- `quotedTotalPence` preserves the provider's quoted total for later display;
  its fee/shipping coverage is unverified. Scoring requires separate verified
  GBP buyer-fee and shipping inputs. Costs must not be counted twice.
- Valuation requires one matched model, currency, evidence text, `asOf`,
  `validUntil`, conservative resale and exit costs. These inputs are supplied by
  a future trusted server-side valuation store, not accepted from an untrusted
  browser as verified facts. Tests use synthetic values, not real resale advice.
- Missing cost/evidence, stale valuation, ambiguous models, incomplete detail or
  warning signals cannot create BUY/SNIPE. Possible accessories remain visible
  for review; wording alone is insufficient to prove that a real kit is absent.
- No invented 0–100 confidence score: decisions carry explicit reasons and
  warnings. `notify` represents recipe intent only; there is no sender here.

`canonBenchmark()` retains £51–£100, all 11 Canon models/Rebel aliases, all
conditions, warnings rather than hard rejection, and feed-only operation.
The recipe validator prevents restrictive condition/fault filters, hidden
zero-review sellers or notification levels being attached to benchmark mode.

## Source boundary and current limits

The Vinted source is experimental. It requires an explicitly injected request
transport; importing it cannot make network requests. It fixes the destination
to the UK catalog, rejects redirects, bounds page size/response bytes/time, and
returns 403/429/other failures with retry metadata. It does not retry on its own.
The deployed scheduler persists `retryAt` and uses leases and shared request
budgets across restarts. No cookies, sign-in, proxy rotation or CAPTCHA
handling are implemented.

`scanCatalog()` deduplicates overlap by listing ID before later enrichment and
retains first observation. It reports `coverageComplete: false` on request or page
limits. Never establish a baseline or mark full coverage after an incomplete
scan. Complete means each query ended on a short page or a full distinct page
whose IDs were already durably recorded by an earlier cycle; it is
**not proof of marketplace-wide completeness**. Listing churn and provider
semantics still require live overlap/watermark validation.

The latest deployed Edge probe at 2026-09-28T23:22:24.812Z returned HTTP 403.
No catalogue payload was obtained. Provider mappings, photo/rating conventions,
newest-first ordering, continuous coverage and physical phone receipt remain
unverified until a usable source is connected.

## Remaining integration gates

1. Establish usable source access from the worker host and validate real payloads.
2. Validate enrichment and live ordering/overlap with the deployed persistence.
3. Verify registered-account phone receipt and multi-day Discord comparison.
4. Complete supported action parity and evidence-backed valuation separately.

See [current continuation audit](../../docs/features/monitors/AUDIT_2026-09-29.md)
and [runbook](../../docs/features/monitors/MVP_RUNBOOK.md).

## Staging service integration (24 September)

The engine is now reused by `supabase/functions/monitor-service/`. The native page, persistence and scheduled delivery are documented in `docs/features/monitors/MVP_RUNBOOK.md`. Engine benchmark recipes retain feed-only scoring; opt-in push of new matches is a separate account-owned service setting requested for the MVP. The live source is blocked (403) and scans are not running.
