# Agent notes

Standing contract for anyone — human or agent — working in this tree. Read this
first, then the document the change touches.

| Document | What it is |
| --- | --- |
| [docs/ROADMAP.md](docs/ROADMAP.md) | The **register**: every tracked item with its id, priority and state, and the only place state lives. Do not start anything else |
| [docs/ACCOUNT_FLAGS_PLAN.md](docs/ACCOUNT_FLAGS_PLAN.md) | The plan behind `P0 · 23`, `P0 · 35` and `P1 · 36`: the account's flags, the admin panel and the hand-run reset. Detail only — the register holds the state, and this file retires into [docs/HISTORY.md](docs/HISTORY.md) when item 36 closes |
| [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) | The coding contract. Invariants are binding, not advice |
| [docs/DECISIONS.md](docs/DECISIONS.md) | The owner's answers still in force, and the ones to ask about before reversing |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The shape: hexagon, ports, accounts, sync |
| [docs/UI_DESIGN.md](docs/UI_DESIGN.md) | The visual rules, and the layout of each screen |
| [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) | The dependency allowlist. Default is **no** |
| [docs/REVIEW_LOG.md](docs/REVIEW_LOG.md) | The owner's reviews, ask by ask, and what is still open |
| [docs/HISTORY.md](docs/HISTORY.md) | What already landed, and where the retired documents went |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) · [docs/BETA_GUIDE.md](docs/BETA_GUIDE.md) | Reader-facing; no stack, no internals, no code |

**One id scheme, and no second one.** An item is an integer, allocated once and
never reused; a subpoint is a single lowercase letter (`26a`), one level deep; a
priority is a tag, `P0` blocking to `P5` parked, written `P1 · 5`. A round is
identified by its date — "the owner's round 17 (2026-09-21)" — and provenance is
never an id. **Never invent a letter family** (`H1.3`, `M7`, `C2`, `Phase 3`, `P2b`)
and **never cite a retired document by section**: the content is in
[docs/ROADMAP.md](docs/ROADMAP.md), [docs/DECISIONS.md](docs/DECISIONS.md),
[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) or [docs/HISTORY.md](docs/HISTORY.md)
now. `tests/unit/architecture/item-ids.test.ts` enforces all of it, and
[docs/HISTORY.md](docs/HISTORY.md) holds the crosswalk if you meet an old label.

**Append a round to [docs/REVIEW_LOG.md](docs/REVIEW_LOG.md) every time the owner
reviews the app** — including the asks that were answered rather than implemented —
and keep its "still open" table honest. A request must never be dropped silently;
that table is the only list that may not go quiet.

## Toolchain

Node and pnpm live in `meditaur-tools:local`. Everything runs through
`./scripts/meditaur` — `setup`, `dev`, `check`, `check:full`, `test:unit`,
`test:integration:hosted|:local|:both`, `build`, `preview`, `e2e`, `up`, `down`,
`cloud`, `exec`. Never install Node on the host. `./scripts/meditaur up` (the host
Supabase CLI) is the one exception.

- `check` is the edit loop: typecheck (packages + app), `typecheck:tests`, lint,
  unit.
- **`check:full` is the definition of done**: `check`, both live databases, the
  production build, e2e. It runs `next build`, which is the only thing that
  validates `app/**/route.ts` — a route-level Next mistake passes `check` and the
  e2e suite (`next dev`) and fails only here.
- **Domain, Dexie and `supabase/migrations` move in lockstep.** A new union needs
  its SQL check in the same change (`tests/unit/architecture/schema-unions.test.ts`).
- **A migration is additive and re-runnable** — named constraints, `drop constraint
  if exists` — and **an applied one is never edited**. Push a new one to the hosted
  project immediately (`./scripts/meditaur cloud --yes`); the hosted live suite is
  part of `check:full`, so drift shows up as red tests there.
- External libraries are a security decision, not a convenience: read
  [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) before adding a package, Docker
  image, GitHub Action or `pnpm dlx` tool. `packages/domain`,
  `packages/application` and `packages/audio-web` stay npm-free apart from
  workspace links, and `@supabase/supabase-js` is allowed in exactly one module —
  `packages/db/src/supabase.ts`, the module behind `AuthPort`, the cloud
  preferences adapter and the cloud events adapter. The integrity test enforces
  both. It is inert unless the two `NEXT_PUBLIC_SUPABASE_*` values are set, and the
  service-role key never reaches the browser.
- Secrets live in `.env` (operator-written, `0600`) and the Supabase CLI's own state
  under `supabase/.temp/`. Never paste a key into a tracked file.
- Do not start REST, native, streaming music, or a brand rewrite to "make it
  nicer". [docs/ROADMAP.md](docs/ROADMAP.md) lists what is refused and why.

## Working in a shared tree

**More than one agent works here at a time.** `git status` changes under you
between two commands, and a directory-scoped add sweeps up work that is not yours.

- Never `git add -A`, `git add .` or `git add <dir>`. **Name every file.**
- Before committing, read `git diff --cached --stat`, and for a file someone else
  may be editing, read its **hunks** — one file can hold both sessions' work.
- Name the files a commit touches in its message, so the other session can see what
  moved. Re-read a file the newest commit touched before editing it.
- Leave a modified file you did not write alone.
- `git log --oneline` and `git status` **first**: `read_file` has served a stale
  revision of files the newest commit touched.
- A unit-test total that grows between two runs of the same tree is probably the
  other session's tests landing, not a cache artifact.
- `./scripts/meditaur check` can be killed (exit 143) by the other session's
  `check:full` or a `down`; re-run it.

## Proving a change

- **Prove a new guard has teeth by disabling the fix** and watching the test fail.
  A test that passes with the fix removed is documentation, not a guard.
- The repo's idiom: a source-text guard in `tests/unit/architecture/` or
  `tests/unit/db/` for a structural rule, and an e2e test for something a reader
  sees.
- **Docs are a unit-test input.** `integrity.test.ts` checks that every `*.md` link
  in the docs and the root markdown resolves, and pins the structure of the review
  log, so run `./scripts/meditaur check` after any docs change — even though
  markdown is not a build input.

## The public mirror

`meditaur-v1` is public and this repo is private. `~/workspace/agent-tools/mirror-export.sh`
publishes a snapshot from `git archive HEAD`, so only committed files leave and the
mirror gets this repo's `.gitignore` verbatim. **Never copy the working tree into
it** — that is how local Supabase key material under `supabase/.temp/` reached the
public repo once already.

Agent and owner tooling lives outside this repo, in `~/workspace/agent-tools/`. Do
not add helper scripts to `scripts/` unless this project's own command flow runs
them.

## Peak hours

AI work on this machine is allowed only between **04:00–06:00** and **10:00–01:00
UTC**, weekdays; the whole weekend is free. The gate is deliberately not part of
this repo — it is an owner-set, machine-wide hook configuration that lives outside
the workspace, so every project here obeys it. During peak the hooks refuse tool
calls and stop the session, and the parked request is handed back when the window
opens.

**Stop when it stops you.** Do not retry a refused call, do not disable the hooks,
and never arm the override — that is the owner's alone (an interactive terminal and
a typed phrase). A refused tool call is a deliberate gate, not a bug.

## Traps that have cost time — do not re-learn them

- **A Dexie version that has run is never re-run.** Repair a bad upgrade in a *new*
  version, matching rows by name where a name is the only handle.
- **Never change a Dexie table's primary key in an upgrade** (Dexie aborts it), and
  a table's *name* cannot change either: declare the old table `null` and add a new
  one, copying inside that version's `upgrade`.
- **Every Dexie table belongs in a `db.transaction` scope, or on the named
  `OUTSIDE_THE_SCOPE` list** (`tests/unit/db/transaction-scope.test.ts`). A table
  declared and missing from the scope compiles, passes every unit test, and fails
  only at runtime with "object store was not found".
- **The e2e image bakes the sources**: `docker compose … build` must precede
  `docker compose … run --no-deps e2e`, or the run silently tests the previous
  commit. The tell is the **test count** — compare it with the spec file.
- **The e2e suite retries**, so flakes are silent: grep the log for `flaky`, never
  just the tail. Two consecutive clean runs is the bar for a new UI test.
- **A new route needs four things**: the page, a `Suspense` boundary if it reads
  the query string, `ROUTES` in `tests/e2e/warmup.ts`, and `SHELL` in
  `apps/web/public/sw.js` with the cache `VERSION` bumped.
- **Never warm e2e routes concurrently** — `next dev` compiles through one module
  graph, so a second page queues rather than compiling alongside.
- **`meditaur-e2e:local` is shared between sessions even when the compose project
  is not.** Use a private project (`-p meditaur-e2e-mine`) and verify the image
  holds your build.
- **A class only `packages/ui` names is never generated** by Tailwind: pin it in
  `apps/web/src/lib/ui-package-classes.ts` in the same change.
- **Playwright**: `filter({ has: … })`'s inner locator is queried *inside* the outer
  element; `boundingBox()` is viewport-relative and does not scroll;
  `input[type=file]` carries the `button` role; the Next dev-tools button is a real
  button named `Open Next.js Dev Tools`.
- **A parent's key handler sees every key its children do not stop.** When a child
  editor sits inside a control with its own key handling, one of the two must own
  the keyboard explicitly.
- **Never put backticks in a commit message typed on the command line** — zsh
  executes them. Use a quoted heredoc (`git commit -F - <<'EOF'`).
- `./scripts/meditaur up` applies every migration and wipes the local database;
  `local-up.sh` skips the reset when the migrations applied are the ones on disk,
  and `MEDITAUR_FORCE_DB_RESET=1` overrides.
