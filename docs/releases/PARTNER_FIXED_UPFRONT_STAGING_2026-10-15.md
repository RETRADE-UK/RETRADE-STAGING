# Partner fixed-cost advance payments — staging — 15 October 2026

This ports the approved live partner-payment bug fix onto staging without changing
the staging-only monitor runtime, CNAME, authentication helper or Supabase binding.

- Legacy fixed amounts on never-sold stock remain payable before listing or sale.
- Missing canonical amounts are not coerced to zero; explicit zero remains valid.
- Bulk Mark as paid and Unsettled items use the same eligibility/allocation owner.
- Percentage-only profit share still requires a completed sale unless deliberately
  converted to a fixed item agreement.
- Confirming an advance payment records the payment while leaving stock state
  unchanged and prevents a second partner charge after a later sale.

No database migration or business-data repair is included. Tests use synthetic data
and block external requests. Build: `20261015-partner-fixed-upfront-staging`.
