# Item detail, postage policies and sync chrome — 25 September 2026

Release: 20260925-v1572 (staging uses the `-staging` suffix).

## Changes and ownership

- The mobile sync node was at body level while its CSS was nested inside the desktop sidebar breakpoint. It could appear as raw page-bottom text. It now lives inside the mobile header, styled globally by `assets/styles/status.css`: delayed saving indicator, pending-on-device indication and a usable error retry. No sync, outbox, conflict or cloud-write rules changed.
- Applying an item postage policy dispatched two change events, with a full rerender after the first. Both monetary values now change atomically and are saved once, targeting the current resale where applicable. Policy selection is derived from saved amounts when the view reopens; editing amounts becomes Custom amounts. Clearing is an explicit option, works on item/quick-add/edit forms, and preserves zero buyer postage. No new database column is needed for policy identity.
- `renderItemPage` remains the owner. New `assets/styles/item.css` provides mobile cards and a desktop two-column cost editor / receipt, clear primary actions, secondary actions disclosure, keyboard-accessible sections and 44px editing controls. Secondary details/history collapse initially and retain their state through price/policy edits.
- Item and unlisted-stock pages expose the existing partner terms. Supplier purchase amounts update `costPrice`, `accountPaidAmount` and the existing canonical agreed amount consistently, so acquisition cost is counted once. Consignment/hybrid terms use the existing percent or fixed-payout fields and remain a separate partner deduction. Reassigning an unpaid item clears the previous canonical terms. A recorded payment prevents changing partner assignment/terms from this editor; it does not rewrite settlements.
- Headlines use net profit after the partner allocation. Sale 1, resale and relist projections expose the partner deduction rather than hiding it between gross and net figures. Fresh listings show expected net profit in their receipt instead of a zero realised-only total.

## Verification

Required gates: `npm run check`, `npm test`, `npm run build` in both repositories, plus shared-runtime parity. `tests/item-browser.cjs` is part of `npm test`: actual selections/taps, both postage values and one-save atomicity, zero/clear values, edit and quick-add forms, resale isolation, fixed/percentage/supplier/hybrid terms, row mapping roundtrip, settlement protection, net headlines, relist preview, keyboard/disclosure state, 320–1440px layout and header sync/retry.

Browser tests use the isolated synthetic harness and block external business traffic. Local Chromium is supplied through CHROMIUM_EXECUTABLE; CI uses pinned Playwright. Physical iOS performance and the user's actual account have not been tested. No business-data write, schema migration, Vinted/monitor feature change or gesture activation belongs to this release.
