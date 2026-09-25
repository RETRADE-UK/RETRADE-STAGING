# Partner upfront stock payments — v1.5.74

The existing allocation module owns this change. Its candidates previously used
the account-wide due-on-sale gate, hiding agreed fixed-cost stock until sold.
An explicit Include unsold stock checkbox now exposes eligible fixed-cost listed
and unlisted stock. Upfront accounts default to including it, preserving their
existing behaviour; pay-on-sale accounts opt in per account for the session.

No percentage-based estimated profit is converted into a debt. The added early
payment path excludes disposed/returned stock; legacy reconstruction is retained.
Existing allocations reduce the selectable remainder, and fully allocated items
cannot be paid twice. Both new payments and existing-payment assignment use the
same candidates. Listing state and sale dates are never changed by payment.

Transactions containing only fixed-cost items use fixed-cost accounting even when
their parent account has another default. Unsold fixed-cost items and profit-share
items must be paid separately to avoid claiming unrealised gross profit.

Coverage: mobile and desktop synthetic payment flows, listed/unlisted selection,
percentage-only exclusion, paid/disposed exclusion, single £50 allocation,
unchanged sale count/state and prevention of duplicate allocation. Full normal
release checks and shared staging parity also apply. No database migration,
production business-data access, Vinted change or gesture activation.
