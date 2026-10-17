# Partner outstanding clarity — staging — 17 October 2026

This release is rebased onto the current staging account and item-cost logic.

## Payment workspace

- **Sold outstanding** is the default view and contains completed sales that still
  need paying or still need their agreed payout entered.
- **All stock outstanding** adds known unpaid fixed commitments on listed/unlisted
  stock without treating unsold profit-share inventory as money already owed.
- Sold fixed-cost items with no stored payout stay selectable. Selection opens a
  payout-entry step instead of disabling the row.
- Multiple missing fixed payouts can be entered together before one payment
  transaction is recorded.
- Items already allocated to an unpaid payment remain non-selectable, preventing
  duplicate allocation.

## Account position

The partner outstanding summary now shows:
- **Sold outstanding**
- **All stock**

Missing payout amounts are counted explicitly and are not silently treated as £0.

Setting payout terms does not change sold/listed/unlisted state and does not itself
record cash. The existing payment-allocation owner remains authoritative for cash,
credits, partial allocations, tax/cashflow timing and duplicate-payment prevention.

No database migration is included. Current linked item cost / partner payout rules,
dashboard updates, staging Supabase binding, test access, monitor runtime and CNAME
remain intact.

Build: `20261017-partner-outstanding-staging`.
