# Monitor engine foundation

This directory owns the new server-side monitor code. It is outside the public
asset manifest and has no running service, database writer or deployment entry
point yet. The recovered prototype remains unchanged in `experiments/monitors/`.

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
The future scheduler must persist `retryAt`, use leases and budgets, and respect
provider limits across restarts. No cookies, sign-in, proxy rotation or CAPTCHA
handling are implemented.

`scanCatalog()` deduplicates overlap by listing ID before later enrichment and
retains first observation. It reports `coverageComplete: false` on request or page
limits. Never establish a baseline or mark full coverage after an incomplete
scan. Complete here means all configured queries ended on a short page; it is
**not proof of marketplace-wide completeness**. Listing churn and provider
semantics still require live overlap/watermark validation.

On 2026-09-24 a small unauthenticated UK Canon catalog probe from the execution
environment returned HTTP 404. No catalog payload was obtained. That does not
prove the endpoint is universally unavailable, but it does not validate it for
deployment. No live source, hosted worker, phone alerts or Discord parity is
claimed. Provider field mappings and photo/rating conventions remain fixture
contracts until validated with a usable source.

## Next integration

1. Establish usable source access in the intended host and validate payloads.
2. Add an append-only staging schema and tested persistence for versioned recipes,
   immutable ownership, leases/baselines, observations and an outbox.
3. Build the authenticated native UI in `src/features/monitors/` with the current
   app context and separate styling owner; do not revive the old inline handlers.
4. Run the feed-only benchmark, then implement delivery and action parity.

See [current audit status](../../docs/features/monitors/AUDIT.md) and
[implementation plan](../../docs/features/monitors/IMPLEMENTATION_PLAN.md).
