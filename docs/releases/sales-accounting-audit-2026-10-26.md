# Sale-cycle and management accounting audit, 26 October 2026

The event replay exposed old full-return records with no saved original sale date,
paid fixed-price stock stored under a legacy consignment type, signed purchase
refunds dropped by a nonnegative cost clamp, and relist fees present in the resale
fields but absent from cash events. Summary gross margin also averaged item
percentages instead of dividing aggregate profit by aggregate net revenue.

- Missing Sale 1 dates now use the recorded return timestamp as an explicit
  estimate. `dateEstimated` and `dateSource` are exposed on snapshots/events.
  This is read-only and does not write inferred dates into historical records.
- Paid fixed-price on-hand stock and returned stock remain in invested capital.
  Unpaid, sold and scrapped stock are excluded.
- Signed item adjustments reduce sale cost basis and cash-basis purchases.
  Existing refund cash events remain the single source of the actual receipt.
- Relist cash fees fall back to the recorded next-sale/current-resale fee when
  the older return snapshot lacks a fee. An explicit zero retains priority.
- Aggregate margin uses net realised profit divided by net sales revenue. The
  separate average item margin remains available as a diagnostic metric.

Non-cash account credits now reconcile through explicit recognition events.
Only documented item allocations with a realised sale, return or write-off are
recognised; unallocated and unsold-stock credits remain balance credits. The
recognition date is the later of the credit date and the item's first realised
activity. Allocation totals cannot exceed the credit record amount. Item
attribution and aggregate P&L consume the same events, so allocation never adds a
second copy to aggregate profit. Statements retain the credit even in a period
without the original sale; excess over a displayed row's partner share appears
at account level. Actual settlement cash remains its recorded net payment.

The adjustment loader refreshes financial views after load and refreshes with
user-data loads. It rejects cross-user rows and in-flight responses from a
previous user. No database schema or bulk historical rewrite is required.

`tests/accounting-audit-browser.cjs` uses synthetic data and the network-blocking
browser harness. It covers original-date precedence, missing-date bounds,
return/resale basis, immutable reads, paid/unpaid stock, weighted/zero margins,
signed costs, relist fallback/explicit/zero fees, credit dates and voids,
unallocated/unsold deferral, allocation caps, statement periods, and no duplicate
cash/tax credit benefit. It runs in the package suite and Chromium/WebKit CI.

Final review also retires the obsolete automatic original-sale-date backfill. It
previously saved return timestamps as exact sale dates and could copy one cycle's
date into another. The compatibility hook now performs no writes. Existing
recorded values are preserved; previously saved approximations cannot be
identified reliably from current records alone.

Cash-basis credit reductions require a current-user row and a matching paid
settlement, use the settlement payment date, and cannot exceed the transaction's
gross allocation less actual cash payment. Duplicate/stale applications cannot
create another tax benefit. Regression cases cover unpaid/reversed payments,
changed payment dates, cross-user loaded data, duplicate applications and the
no-write legacy hook.
