# Cash expense refunds and recorded historical payments

Negative expense rows represent refunds. The cash event builder previously
discarded them even though expense totals already netted them. Standalone and
trip expense refunds now produce inflows with their original IDs, source types
and refund dates. Zero amounts produce no event. Mileage remains a non-cash
deduction.

Paid settlements marked `historicalReconstruction` were also removed by a
later cashflow wrapper. That flag records provenance, not payment status. The
canonical paid settlement now remains in cashflow; linked system ledger mirrors
are still excluded by the accounting engine. Unpaid/reversed transactions stay
excluded, and payment credits continue to use net `partnerAmount` rather than
the gross item allocation. The diagnostic reconstruction total remains available.

No amounts, allocation records, source dates or production data are changed. No
schema migration is required. Explicit historical adjustments must be supported
by evidence; this change does not invent an opening balance or reconciliation
plug.

## Validation

- `tests/cash-refunds-history-browser.cjs`: synthetic expense/trip refunds,
  source identity and dates, reconstructed and ordinary payments, display
  mirrors, reversal, net payment credits, supplier liabilities, trading profit
  and immutable reads.
- Existing cashflow and partner cost/payment regression coverage.
- Browser fixtures block every external request and contain no business data.
