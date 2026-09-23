# Recovered monitor prototype — reference only

This is the feature-specific source recovered from the August 27 v3 Canon
benchmark package. It is **not an enabled feature or a deployable worker**.
Known defects are recorded in [the audit](../../docs/features/monitors/AUDIT.md).

- `recovered-v3/ui/`: native RETRADE monitor builder/feed and extracted cloud
  bridge/styles. The bridge still depends on historical core globals.
- `recovered-v3/worker/monitors/src/`: original connector, matching, scoring,
  persistence and polling implementation, unchanged for traceability.
- `recovered-v3/worker/monitors/package.reference.json`: original dependency
  declaration for review, deliberately not an install/run package. Versions were
  floating and there was no lockfile; do not install from this reference.
- `recovered-v3/schema/`: v3 prototype SQL, **not an approved migration**.
- `recovered-v3/fixtures/`: recovered Canon benchmark recipe.
- `branch-schema/`: incompatible SQL from the older Git branch, retained only
  for schema reconciliation. Do not apply either schema over the other.

No old application core, accounting, reports, HTML shell, exports, credentials,
ZIP files, screenshots or duplicate v1/v2 implementation is copied into staging.
Original packages remain recoverable; their hashes and extracted-file mappings
are in `docs/features/monitors/provenance.json`. The older dashboard stays in
`RETRADE-UK/RETRADE` at commit `6ea9f95e8d0e9e66fb68a62dd829bee3b8ff6626`.

Do not load these scripts in the app, run the worker against a service, install
its old dependencies, or apply this SQL as part of recovery. Promote repaired,
tested components to their final owners according to the implementation plan.
The public asset allowlist excludes this entire directory.
