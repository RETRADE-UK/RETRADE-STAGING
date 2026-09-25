# Tax, item costs and Sales clarity — v1.5.73

Tax now consistently prepares cash-basis actual-expense accounts, including when
an old trading-allowance preference is saved. Personal Allowance calculations are
unchanged. The filing guide maps existing expense categories to both SA103S and
SA103F, explicitly identifying 2025/26 as the reference form and requiring review
for 2026/27. Net bookkeeping profit is mapped to S21/F47, not automatically called
the final taxable-profit filing figure. Existing category classifications are not
silently changed; users must review their records and business-only proportions.

Sources checked 25 September 2026:
- https://www.gov.uk/government/publications/self-assessment-self-employment-short-sa103s
- https://www.gov.uk/government/publications/self-assessment-self-employment-full-sa103f

Item costs use a compact editor with ownership in a disclosure. Fixed payouts are
labelled as item cost; the headline includes purchase, parts and partner deduction
once. Profit-share edits preview cost and retained profit without changing DB.
Save commits through the existing guarded path. Supplier acquisition cost remains
distinct from consignment payout internally; historical settled terms stay locked.

Sales retains its existing filters, selection, bundles and calendar navigation.
Core-rendered date tags remain visible on every row under non-date sorting; day
headers count returns separately rather than inventing orders for return-only days.
The focused stylesheet owns responsive history-row presentation, not accounting.

Validation: run check, full browser suite, build and shared staging comparison.
Tests use synthetic data with external business requests blocked. No production
records, database migrations, Vinted code or parked gestures are changed. Mobile
browser emulation does not establish physical iOS performance. Rollback is a PR
revert plus a new cache generation; no data restoration is required.
