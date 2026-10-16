# Partner outstanding clarity — staging — 16 October 2026

This staging release separates actual sold liabilities from the broader known
liability across an account's stock.

## Payment workspace

- **Sold outstanding** is the default payment view.
- **All stock outstanding** adds known unsold fixed payouts without pretending
  unsold profit-share stock is already owed.
- Sold items with missing payout terms stay visible and selectable. Selecting
  them offers **Set payout** / **Set split** rather than a disabled checkbox.
- Multiple missing fixed payouts can be entered together before the payment
  transaction is created.
- Items already allocated to an unpaid payment remain non-selectable so the same
  liability cannot be assigned twice.

## Account position

The outstanding card now displays two explicit figures:
- **Sold outstanding** — unpaid liability attached to completed sales.
- **All stock** — sold outstanding plus known unpaid fixed commitments on stock.

Missing payout amounts are counted separately rather than silently treated as £0.

No stock state is changed by setting a payout or recording a payment. No database
migration or production-data repair is included. The staging Supabase binding,
test authentication helpers, monitor runtime and CNAME are unchanged.

Regression coverage includes a synthetic Matt's Drives-style fixed-cost / pay-after-
sale account with one known sold payout, two sold lots missing payouts, and known
and unknown unsold commitments. Build: `20261016-partner-outstanding-clarity-staging`.
