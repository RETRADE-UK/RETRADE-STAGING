# Account workspace and list consistency — 27 September 2026

## Research and decisions

- [Carbon data tables](https://carbondesignsystem.com/components/data-table/usage/): keep search next to collection actions; use consistent selection controls and an indeterminate select-all state. RETRADE keeps its existing controls and uses the same left Select all / right Done arrangement in Costs.
- [NN/g: data-table tasks](https://www.nngroup.com/articles/data-tables/): aligned rows help compare balances across accounts. The directory now has a ledger header and aligned account, stock, activity and outstanding columns, with concise mobile rows.
- [NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): keep frequent work visible while secondary details remain expandable. The account workspace separates Stock & sales from Payments & adjustments, side by side on wide desktop and in reading order below 1281px. Existing item/payment handlers and disclosure state remain authoritative.
- [HMRC SA103S](https://www.gov.uk/government/publications/self-assessment-self-employment-short-sa103s) and [SA103F](https://www.gov.uk/government/publications/self-assessment-self-employment-full-sa103f): box mappings checked against published 2025/26 forms. Overview labels identify both forms; the filing guide groups recorded expenses into one amount per box for the selected form. Net accounting profit/loss is explicitly before further tax adjustments. The selected year's form still needs checking; the app does not invent unsupported tax-return answers.

## Causes addressed

Account search rebuilt the complete page, recalculated every account, then passed it through older row decorators. A three-account synthetic measurement took approximately 52 ms and nine `_accountStats` calls for one search. The updated path took approximately 0.3 ms and zero calls on the same fixture. This is a local browser comparison, not a physical-device guarantee. Full account renders still obtain fresh authoritative figures; search only changes visibility and sort order of those prepared rows. Session state resets on account-owner changes.

Account summary observers repeatedly assigned identical text, scheduling more observer passes. They now update only changed text. Collapse-state capture also wrote the next state before the native click handler toggled it again; the listener now records the resulting state after the handler.

Sync retries reset the presentation timer when moving through pending/error/offline. The timer now covers the whole unresolved episode, only resetting on a clean confirmation. A finite CSS animation and page-resume reconciliation provide additional bounds. Static pending remains truthful; neither outbox records nor cloud acknowledgement rules are bypassed.

## Ownership and validation

`operations-dashboard.js` owns the directory's prepared rows and controls; older compact/sort decorators skip its explicitly marked output. `page-unified-v1503.js` groups the existing account nodes after render finalizers; `workspaces.css` owns responsive geometry. No new runtime scripts, frameworks, database migration or calculation changes.

`accounts-workspace-browser.cjs` covers input identity, no balance recalculation on search/filter/sort, a 60-account / 600-item fixture, settled idle DOM, disclosure interaction, mobile/tablet/desktop overflow, filing-form references, Costs selection alignment, desktop Sales dropdowns and sync retry/resume bounds. Existing payment-allocation tests exercise payment creation with the reorganized nodes. All browser data is synthetic and network-isolated.
