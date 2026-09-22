# RETRADE

Static browser application with a Supabase backend. No production build framework is required.

## Structure

| Path | Purpose |
| --- | --- |
| `index.html`, `app.js`, `sw.js` | First frame, ordered startup and root-scope offline worker |
| `config/assets.js` | Single ordered asset/build contract for loader, worker, checks and deployment |
| `src/core/` | Application state, sessions, navigation and legacy primary views |
| `src/domain/` | Accounting, reports and fee integrity |
| `src/platform/` | Launch, lifecycle, motion, performance and navigation coordination |
| `src/features/` | Partners, Sales, charts, bundles, cashflow, exports and optional diagnostics |
| `assets/` | Styles, icons and iOS launch images |
| `tests/`, `scripts/` | Isolated browser/worker regressions and dependency-free verification/build tools |
| `supabase/migrations/` | Append-only database history |
| `docs/` | Workflow, ownership, audits and handovers |
| `archive/` | Inactive historical sources; never loaded by the app |

See [runtime ownership](docs/RUNTIME_MAP.md), [cleanup report](docs/OPTIMISATION_HANDOVER.md) and [next feature handover](docs/NEXT_FEATURE_HANDOVER.md).

## Checks and development

```sh
npm ci
npx playwright install chromium
npm run check
npm test
npm run build
npm run audit:size
```

`check` validates asset references, syntax, isolation, existing production invariants and worker behaviour. Browser tests use synthetic auth/data and block external business requests. `build` creates `_site/` from an explicit allowlist, excluding archives, experiments, docs and tests. `audit:size` reports uncompressed assets, not an FPS score. Serve the repository or `_site/` over HTTP; opening HTML as a local file does not exercise PWA behaviour.

The scripts still share classic-script globals. Preserve manifest order; changing to ES modules or merging wrappers requires a separate migration with feature tests. The remaining large core is documented technical debt, not a claim that the architecture rewrite is finished.

Live fixes: `RETRADE-UK/RETRADE`. New features: `RETRADE-UK/RETRADE-STAGING`. Gestures are parked there; Vinted monitor work is next. Never commit exports, credentials or local business backups.
