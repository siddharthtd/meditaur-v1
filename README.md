# Meditaur

Meditation web app: staggered N/M timer chains, generated binaural beats (N tones per ear + per-ear EQ), focus-point tables, and a plan/run split.

This is a wellness tool, not a medical device. Headphones are required for binaural beats.

## Clone and develop

Node and pnpm run in Docker (`infra/Dockerfile.tools`, `node:24.20.0-bookworm-slim` pinned by digest). They are not installed on the host and not downloaded into `.tools/`. Playwright Chromium is a separate image (`meditaur-e2e:local`) so app-code changes do not re-download browsers.

```bash
git clone git@github.com:siddharthtd/meditaur.git
cd meditaur
./scripts/meditaur setup    # once: build meditaur-tools:local, pnpm install
./scripts/meditaur dev      # http://localhost:3000
```

Docker is required for **setup, dev, check, check:full, build, preview, and e2e**. GitHub Actions `pnpm check` still uses `actions/setup-node` with `.nvmrc` (same 24.20.0 pin).

A clone is enough to develop on another machine. These paths are gitignored **on purpose** and are recreated, not copied:

| Path | Recreate with |
| --- | --- |
| `meditaur-tools:local` | `./scripts/meditaur setup` (needs Docker). Node lives in this image, not on the host. |
| `.tools/` | The tools container's `HOME`: pnpm/corepack caches written there. Optional; `setup` recreates them. |
| `node_modules/` | `setup` (`pnpm install --frozen-lockfile` inside the tools container). Bind-mounted so the editor can resolve types. |
| Playwright Chromium | `./scripts/meditaur e2e` (`meditaur-e2e:local`). Not stored in git. |
| `.next/`, `.turbo/` | `dev` / `build` |
| `.env` | Optional. Copy `.env.example` only if you use Supabase. Empty env uses local Dexie. It can hold both targets: `SUPABASE_*` for the hosted project and `SUPABASE_LOCAL_*` for a stack started with `./scripts/meditaur up`. Which one the live tests use is explicit — `./scripts/meditaur test:integration:hosted` or `:local` — and a target that is named but not configured fails instead of skipping. In-container tests cannot use `127.0.0.1`; the local URL is `http://host.docker.internal:54321`. |
| `.vercel/` | `vercel link` if you deploy from the CLI. GitHub/Vercel project settings are not files in this repo. Set **Node.js Version to 24.x**. `engines.node` is `24.x`. Local/CI pin the patch **24.20.0**; Vercel still floats latest 24.x. |

`git config` author is per-machine and is not in the repo. For this clone only: `git config --local user.email` / `user.name`.

## Commands

| Intent | Project-local |
| --- | --- |
| First clone | `./scripts/meditaur setup` |
| Dev server | `./scripts/meditaur dev` |
| Typecheck, lint, unit | `./scripts/meditaur check` |
| Whole gate (Docker) | `./scripts/meditaur check:full` — starts the local stack, runs both live databases, builds, then e2e |
| Production build | `./scripts/meditaur build` |
| Prod-like Docker | `./scripts/meditaur preview` |
| Stop leftovers | `./scripts/meditaur down` |
| Playwright (Docker) | `./scripts/meditaur e2e` |
| Live tests, one or both databases | `./scripts/meditaur test:integration:hosted` · `:local` · `:both` |
| Generated files | `./scripts/meditaur clean` |

`dev`, `build`, `preview`, and e2e stop leftover Compose containers and remove last-run reports / stale `.next` as needed so the working tree does not accumulate deploy debris.

`./scripts/meditaur check` requires Docker. CI `pnpm check` does not. `./scripts/meditaur check:full` runs check, integration, build, and e2e — all in Docker. Inside the tools container `pnpm check:full` is check + integration + build, so it needs neither Docker nor Supabase. `./scripts/meditaur up` is the only command that wants a host tool (the Supabase CLI); without it the live RLS test stays skipped.

## Layout

```
apps/web/              Next.js UI + composition root
packages/domain/       entities, compile, session engine, port interfaces
packages/application/  use cases (MeditaurApp) — REST/gRPC wrap this later
packages/audio-web/    Web Audio adapter (AudioPort)
packages/ui/           large-hit controls, no dropdowns; Button, LatchButton, accent map, EYEBROW_CLASS
packages/db/           Dexie adapter (repository ports) + the Supabase auth adapter
infra/                 Dockerfile.web (preview), Dockerfile.e2e (Playwright), Dockerfile.tools (local Node)
scripts/               committed developer CLI (wraps Docker for Node)
.tools/                gitignored tools-container HOME + pnpm caches (no Node tarball)
supabase/migrations/   cloud schema, RLS, and the workspace-onboarding RPC
tests/unit/            domain / application / adapter unit tests + architecture contract tests
tests/integration/     cross-package contracts (RLS and auth skip without Supabase keys)
tests/e2e/             Playwright
tests/fixtures/        shared test data
docs/                  architecture, invariants, roadmap, dependency allowlist, user guide, beta guide, the owner's review log
.github/workflows/     CI / e2e / deploy (check job uses setup-node, not .tools)
.devcontainer/         optional Codespaces/VS Code sandbox (same Dockerfile.tools + cache env)
```

Two footnotes worth knowing before you touch styling or the schema:

- The palette lives in one place — the `@theme` block in
  `apps/web/src/app/globals.css`. Tailwind's source scan cannot see the sibling
  `packages/ui` package, so `apps/web/src/lib/ui-package-classes.ts` pins the
  class strings that package names. Delete it once the scan can see the package.
- Never change a Dexie table's primary key in a version upgrade — Dexie aborts
  the upgrade. Add a new table and copy, or keep the key path stable.
  `tests/unit/architecture/review-phase0.test.ts` enforces this.

## App routes

- `/` — Lobby. **Start session** (compile last plan → `/run`), Open planner, Account. Installed PWA skips this (`start_url` is `/plan`).
- `/plan` — Plan mode (AppNav). Arrange focus/cool-off blocks, Save / Start session / Duplicate. The plan tools sit above the name; only `Add focus` and `Add cool-off` sit under it, and the bottom row is `Save` + `Start session`.
- `/library` — Library mode (AppNav). Focus points (with chakra fields and images), symbols, intentions, per-entity custom fields, audio files, presets, binaural config with a draft (try / revert / duplicate / save), card or table views, plan list, session history. A sticky tab strip covers the nine sections; each section's toolbar carries its Add action and, in the three sections that have both views, the `Table` switch and the `Columns` disclosure. **Pressing a card, or any row in table view, opens the entry read-only** — the sheet shows, the editor changes, and `Edit` on the card goes straight there. **Download catalog** / **Restore catalog** sit in the page's top row and are JSON (names, plans, presets, and media blobs). Restore merges by id and keeps extras. **Duplicate preset** copies a sound onto a new id. History shows **Sessions completed this week**.
- `/run/[instanceId]` — Run mode. Full-screen (no AppNav). Start is the user gesture for audio; then hands-off auto-advance. Shows the grouped intentions table: focus-level intentions, then one merged symbol cell per symbol spanning its intention rows, carrying the symbol's picture when it has one.
- `/settings` — Preferences (including `textSize`, applied on the document root).
- `/login` — Email/password sign-in, shown only when the Supabase pair is configured.
- `/signup` — The same panel, creating an account. An account carries your `Settings` — volumes, text size and the rest — between the devices you sign in on; everything else still lives in this browser, and the screen says so. It handles both outcomes — signed straight in, or told the address needs confirming first.
- `/account` — Sign-out, or the local continue stub, depending on whether auth is configured.
- `/tuner` — Live binaural + EQ, rendered inside the AppNav shell but with no nav entry of its own. `?preset=<id>` opens a specific library preset. `/dev/tuner` redirects here.

See [docs/ROADMAP.md](docs/ROADMAP.md) for **done vs next**. Status as of
2026-09-17: the review's Phase 0 (critical fixes), Phase 1 (accounts), Phase 2
(config retention — a signed-in reader's `Settings` follow them between devices)
and Phase 4 (the UI redesign, all of it) have landed, and the hosted Supabase
project exists — its schema is applied and real login is verified end to end
(`./scripts/meditaur cloud`). Open: Phase 3, and the deliberate deferrals listed
at the end of the roadmap; it waits on its own design work (the event port, the
privacy decisions) rather than on infrastructure.
Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Invariants:
[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md). Libraries:
[docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).
The design rules the app is held to: [docs/UI_DESIGN.md](docs/UI_DESIGN.md). The
findings and the ordering rationale behind them:
[docs/ARCHITECTURE_REVIEW.md](docs/ARCHITECTURE_REVIEW.md).
Using the app: [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — plain-language manual
for a non-technical reader (no code, no stack). Testing it:
[docs/BETA_GUIDE.md](docs/BETA_GUIDE.md) — beta-tester onboarding, a guided test
plan, known rough edges, and the feedback template.
Reviewing it: [docs/REVIEW_LOG.md](docs/REVIEW_LOG.md) — every request the owner
made while reviewing, what was decided, which commit it landed in, and what is
still open. Working on it with an agent: [AGENTS.md](AGENTS.md).