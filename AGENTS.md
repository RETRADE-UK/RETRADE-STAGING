# RETRADE working agreement

- Live bug fixes/polish: `RETRADE-UK/RETRADE`; larger features: `RETRADE-UK/RETRADE-STAGING` first. Use branches, PRs and passing CI before merge.
- Gestures are parked in staging's `experiments/gestures/`; Vinted monitoring is the next feature priority. Do not enable historical gesture loaders incidentally.
- Read `docs/RUNTIME_MAP.md` and `docs/DEVELOPMENT_WORKFLOW.md` before edits. `config/assets.js` owns script order and the public asset allowlist.
- Preserve classic-script execution order, accounting rules, persistence and user data. Do not delete a file merely because its name contains an older version.
- Staging must keep its isolated Supabase binding and `test.retrade-uk.com` CNAME. A failed binding must block core startup. Production must never load staging auth helpers.
- For asset/layout changes run `npm run check`, `npm test`, and `npm run build`. Browser tests are synthetic and must not contact production data. State physical-device performance limits honestly.
- Update ownership/handover docs when moving files or changing load/cache behaviour. Generated `_site/`, local backups, exports and credentials do not belong in Git.
- Keep the cleaned layout as development continues: one owner per feature, no duplicate full-app snapshots or root-level patch piles. For monitor work read `docs/features/monitors/README.md`, `AUDIT.md` and `IMPLEMENTATION_PLAN.md`. Recovered prototypes in `experiments/monitors/` are reference-only, not approved runtime or migrations; fix the recorded activation blockers before promoting components.
