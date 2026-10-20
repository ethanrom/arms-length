# Arm's Length: agent conventions

Arm's Length shows what others can actually see of your skin, and from how far. It takes a YouCam Skin Analysis
(masks of each concern) plus the photo, measures every feature in millimetres (iris as ruler) and contrast, then
applies vision science (contrast sensitivity, Peli band contrast) to give a visibility distance per concern.
The "Step back" slider renders the same model. Tone is kind and relief-first. No LLM in the core: every number and
sentence comes from deterministic code and templates. Plan: `internal/PLAN.md` (section 4 is the architecture).
`internal/` is gitignored, so from a worktree read it at `E:/hackathons/youcam-api/internal/`.

## Next.js
This Next.js (16.4) has breaking changes. Before using any Next API, read the relevant guide in
`node_modules/next/dist/docs/` (see `AGENTS.md`). `next.config.ts` enables `cacheComponents`; read the caching docs
before touching data fetching or route handlers.

## Layout
```
app/          screens + app/api/youcam/* (analysis, makeup, simulation) + app/api/visibility (drop-in layer)
components/   UI + motion primitives (components/capture/** owned by Capture)
lib/contracts/  frozen shared types
lib/vision/   CSF models, pyramid band contrast, detection, visibility distance, distance-view renderer
lib/skin/     mask decode, features (components, skeleton, widths), contrast (linear, LMS/DKL), regions
lib/scale/    iris ruler, card calibration, uncertainty
lib/capture/  camera, Camera Kit adapter, quality checks, resize/EXIF
lib/coverage/ least-coverage search, what-if
lib/copy/     deterministic sentence templates, distance anchors, banned-word lists
lib/youcam/   server client: upload, tasks, polling, errors, ledger, breaker, cache, replay mock
workers/      analysis worker (pyramid, features, visibility)
eval/         ModelFest replication, small synthetic oracle set, charts
scripts/      spikes, persona pre-render, smoke tests
fixtures/     recorded YouCam responses and persona bundles
public/demo/  recorded real analyses and renders for demo personas
tests/e2e/    Playwright + axe
docs/         public: MODEL.md, EVAL.md, YOUCAM.md
internal/     gitignored plans, notes, ledger
```

## Ownership
- Edit only the paths your task assigns. Anything else (including `package.json`) goes in your report.
- `lib/contracts/` is frozen. Only the integrator edits it. Need a change? Propose it in your report.

## Tests
- Vitest (`npm test`), lean: only correctness-critical maths and contracts. No large generated suites.
- Never call the live YouCam API in tests. Replay recorded fixtures from `fixtures/`.
- Report only with `npm run typecheck && npm test` green. Playwright (`npm run e2e`) lives in `tests/e2e/`.

## YouCam
- Server-side only. Keys never reach the client bundle.
- Never call the live API unless your task states a unit budget. Every paid call goes through the ledger.

## Secrets
Never commit or print `.env` values (not in logs, test output, reports, or commit messages). `.env.example` is the template.

## Content rules
- No third-party trademarks, logos or copyrighted assets.
- No medical language: diagnose, treat, cure, disease, condition, prescription, Rx, clinical, dermatologist-approved.
- No shaming language: flaw, imperfection, problem area, "fix your...", ugly, bad skin.
- The product is kind and relief-first: distances, not grades. The CI copy linter enforces both lists
  (lists live in `lib/copy/`).

## Code style
- TypeScript strict. Small pure deterministic functions in `lib/`; side effects stay at the edges.
- Sparse comments (why, not what). Match surrounding code. Cite the source for every model parameter.

## Git
- Work and commit only on your own branch, never on `main`. Descriptive messages.
- End every commit message with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- `next dev` and `next build` may re-add the block in `AGENTS.md`; that is expected, leave it.

## Friction notes
Put them in `internal/friction/<agent>.md`. `internal/` is gitignored and lives only in the main checkout
(`E:/hackathons/youcam-api/internal/`), so a worktree needs that absolute path.

## Environment (Windows + Git Bash)
- Use forward slashes in paths and commands.
- Run TypeScript scripts with `npx tsx path/to/script.ts`. Env-file variant: `npm run spike -- scripts/spikes/<file>.ts`.
- Playwright serves on port 3100 (`npm run e2e` builds and starts the app) and uses the installed Chrome channel.
