# Implementation invariants

Product **done vs next** is [ROADMAP.md](./ROADMAP.md). This file is the
non-negotiable coding contract, not a feature list.

- `packages/domain` must not import React, DOM, Web Audio, `@meditaur/application`, or adapters.
- `packages/application` depends only on `@meditaur/domain`. UI, Dexie, and Web Audio are adapters. REST and gRPC, when added, call `createMeditaurApp` only.
- Session expiry is deadline-based. `setInterval` is forbidden for expiry.
- Binaural graph: N sines per ear → equal-power bus (`1/sqrt(N)`) → 10 peaking EQ bands → `ChannelMerger` (ch0 left, ch1 right). Never `StereoPannerNode`.
- Alarm bypasses EQ.
- Max 16 tones per ear; 17th is a domain error.
- Classic beat: `left = carrier + beat/2`, `right = carrier - beat/2`.
- No `<select>` in app UI. Use TileGrid, Stepper, LatchButton, PickerPage.
- **A feature flag is asked at the offer, never at the store read.** The list, the tab, the
  table strip, the column, the switch or the screen a reader would choose the feature from is
  what a gate touches; the store keeps answering with the whole catalogue, which keeps a
  reader's own row visible (a symbol naming no system is never hidden). **The session is the
  one exception** (`P0 · 37`): the compiled library carries the account's own symbol list, so
  nothing a flag hides can appear in a run, and a block still naming a symbol outside the
  account is **refused** — naming the symbol, saying to point the block elsewhere so the
  session runs without it, and saying who to ask to change the account. `docs/ARCHITECTURE.md`
  has the shape and `DECISIONS.md` §11 the answers behind it. A control that cannot act is
  **not drawn at all**: no dead latch, no empty column, no link into a screen that refuses.
- Every "which one?" is `PickerPage`, and its **text bar is the control**, not a
  filter decorating a list: typing narrows the options (label and hint), `Choose`
  or Enter commits an exact name — or the single remaining option — and a name
  that matches nothing **chooses nothing** and shows the message. Never fall back
  to the nearest match: silently pointing an intention at the wrong symbol is the
  failure this shape exists to prevent. Option rows truncate (`truncate` on the
  label and hint spans); the Button base is `whitespace-nowrap`, which is what
  used to let a symbol's usage paragraph spill out of its row.
- Run-mode primary controls are at least 64px (`min-h-16`) — the wordless transport squares are `Button iconOnly size="xl"`, which is that floor exactly. The three *secondary* run controls (the session latches) are the compact `sm` switch, and the legend names only `Space` and `Esc`; both are the owner's round 19 ask (see ([UI_DESIGN §2.3](./UI_DESIGN.md))). Keyboard: Space pause/resume, ArrowRight skip, Escape end.
- A screen only claims a key that works *there, now*. The run screen's legend (`KeyHints`, `packages/ui`) draws keys as keys and lists only what is live — `Space start` before the first block, `→ skip` only once skipping does something (it used to promise a skip that was a silent no-op at `loaded`), `Esc end` always. Every screen left by Escape says so with the same component: `EditorChrome` and `PickerPage` carry `Esc back`. **The legend sits with that screen's primary action, in the bar that survives scrolling** — the run screen's footer, `EditorChrome`'s sticky bar beside `Save`, and, where there is no bottom bar, the row holding `Choose`. Never beside the title (owner's round 8).
- A choice inside a form is a control, not page furniture: `TileGrid`'s `sm` size (a wrapping row of 44px buttons) for a fixed few choices in a section, `md` only when the choice *is* the screen. The chosen tile carries `aria-pressed`, so selection is not colour alone. The intention editor's `Associated with` still uses `md` — queued in the review log, not forgotten (owner's round 8).
- A card that is dragged and let go is **placed, not animated**: `SortableRows` (`FocusManage.tsx`) marks the row that was just dropped and renders it without a transition, because dnd-kit gives the lifted row `transition: transform 200ms` on release and animates it from the release point into its slot. That is only half of it: the list has to be in its **new order in the same commit as the release**, which is why `reorderBindings`/`reorderIntentions` redraw the list before the write and why the rows are keyed by id. With a lagging list every row travels twice — back to where it came from and then to where it was dropped — and a row whose transform is reset while its place in the document changes animates from a slot away, which is the shuffle. Both release tests sample **every** row's top edge every animation frame (`tests/e2e/library.spec.ts`), not only the dragged one: the rows it displaced are where the shuffle lived (owner's rounds 8 and 9: "it should just magnetically get fit, the card in it's place already shifts down automatically").
- **A block has stages, and one alarm.** The owner's round 15 replaced one timer per block with one timer per stage, so `PlanBlock.stages` is a list (the vocabulary, the seeded templates and the rule that resolves them live in `packages/domain/src/stages.ts`) and a block's length is their sum. A session that does not obey all of this is a bug:
  - **The alarm rings once, at the end of the whole block**, never at a stage boundary (`SessionEngine.onExpiry` walks to the next stage and only the last one ends the block). A session with an alarm between its stages is a bug, and `tests/unit/domain/session-engine.test.ts` samples it.
  - **Binaural is per stage and is not restarted across a boundary.** `beginBlock` sets the tones once, from the stage that starts the block, and `beginStage` touches them **only** when two neighbouring stages disagree on the flag — so turning it off for the intentions does not restart it for the symbols. It is off for intentions and affirmations by construction (`binauralForKind`), which is why Thanks Giving is silent.
  - **A time on screen is either the stage's or the block's, and never both.** `remainingMs` is the stage (the big clock), `blockRemainingMs` is the stage plus every stage after it (the header). `blockRemainingMs` is computed in one place; do not recompute it in a component.
  - A **stage keeps its own `label`**, copied from the template when the block was made: a block never reads its type at run time, so an edit to a type's labels must move nothing a reader already has.
  - `PlanBlockStage.kind` is a closed union (`StageKind`) and it is the **only** thing a screen may ask about a stage. `label` is text the reader can rewrite, so nothing switches on it.
  - The e2e duration hook (`meditaur:e2eDurationMs` → `ports.durationOverrideMs`) shortens **every** stage rather than replacing the block, so a suite still tests the session's own shape.
  - **The device's own store is buildable in Node** (`fake-indexeddb`, a devDependency): a test that needs the real Dexie, the mirror or an upgrade path builds it rather than faking it. What this cannot reach is a *screen* — the gates themselves are pinned by the guard table in `tests/unit/architecture/feature-flags.test.ts`, one row per gate, which is what a passing suite would otherwise not notice.
- The current **stage's** length is editable, and the reader's choice is the session's: `SessionEngine.setStageDuration(ms, stageIndex?)` moves that stage *and* what is left of it (a paused stage shifts by the same difference), and `MeditaurApp.saveSessionStageDuration(workspaceId, instanceId, blockIndex, stageIndex, ms)` writes the stored snapshot **and** the plan block, so a reload and the next session both keep it. The runner updates its own `blocks` copy too — the completion log sums them. Before Start every stage's row is editable; once it is running only the stage on screen is, because the ones behind the reader have already run. Editing a meditation's *default* length is still the library's job, not the run screen's.
- Durations are set with the alarm-clock wheels (`TimeWheel`/`TimeWheels`, wrapped for the app as `DurationSteppers`): the wheel turns with the mouse wheel, a trackpad or touch **and** with a drag, and a press without moving types the value. They replaced `−`/`+` steppers everywhere a duration is set — a plan card, a meditation's default, the run screen. `Stepper` remains for numeric values that are not minutes and seconds (Hz, gain, dB, fades).
- **Nothing writes the wheel's offset while the reader is turning it, and the wheel is put on a row when it stops.** The offset is written during a gesture only where the value came from outside it — a typed value, the minutes column moving the seconds, the drag, which owns the offset itself. A mandatory-snap scroller that is written to mid-momentum loses the gesture it was in the middle of, momentum and pending snap included, and then rests wherever the last finger movement left it. A gesture is "quiet for `SETTLE_MS`" rather than "ended", and that quiet ends by writing the row the value names: it is the wheel's own guarantee, for the browsers that do not snap momentum and for a screen that refused the value (owner's round 9: "often lands between two digits, or lands slightly above or below the marked line"). `tests/e2e/plans.spec.ts` places the offset between two rows with the browser's own snapping off, which fails without the settle.
- The wheel is a **scroll container**, which is what makes it turn natively at all: `overflow-y-scroll`, one fixed-height row per value, `scroll-snap-type: y mandatory`. Do not go back to a stack of numbers plus a hand-rolled drag — that is the shape the owner's round 7 rejected ("it is not scrollble on web"). Its geometry is `packages/ui/src/wheel-math.ts` and the scroll offset *is* the value, so **never render a neighbour row conditionally**: a value at its minimum used to lose the line above it, collapse, and hang ~24px above its neighbour ("seconds is dangling above"). The window is always `TIME_WHEEL_ROWS` rows at a fixed height (`sm` 36px, `md` 52px); the arithmetic is unit-tested in `tests/unit/web/time-wheel.test.ts`. The column must not be `touch-none` (a finger pans it; only the page drag would be the bug) and `TimeWheels` draws **one** band across both columns, which is why there is no `:` between them. The indicator is hidden by `.time-wheel`, a rule in `apps/web/src/app/globals.css` — a class `packages/ui` names and only `apps/web` defines, so it is pinned in `apps/web/src/lib/ui-package-classes.ts` like every other class that package names.
- **A parent's key handler sees every key its children do not stop.** The wheel's handler sits on the `role="spinbutton"` wrapper and reads `Enter` and `" "` as "open the editor"; the text box inside it stopped only `Escape`, so `Enter` reached it too — the box committed the value, re-opened over it holding the *stale* text, and the next blur wrote the old number back. Every wheel in the app reverted a typed duration on the next click. The box now claims the keyboard while it is open, which is also what keeps an arrow key moving the caret instead of stepping the wheel: when a child editor sits inside a control that has its own key handling, one of the two has to own the keyboard explicitly.
- Optional TTS for intentions is a setting (off by default). It does not replace on-screen text.
- Alarm ducks binaural (does not stop it) unless `stopBinauralOnAlarm` is on. Alarm still bypasses EQ. That flag is a **preference only** (owner's round 5): `Plan.stopBinauralOnAlarm` is gone, `compilePlan` takes it as a `CompileOption` that `compileAndStoreSession` fills from `ports.preferences.get(userId)`, so the Settings switch is the one a session obeys. The planner must not grow a second switch for it.
- Binaural plays only when both switches agree: `Plan.binauralEnabled` (the plan-wide default, on the planner) and the block's meditation's `binauralEnabled` (the Database's `Binaural` column, or its binaural config screen). Either one off is silence for that block, and that is deliberate — a chakra can stay configured with a preset while being switched off. A block whose `binauralPresetId` is explicitly `None` stays silent too; compile never falls back to a preset the reader did not pick.
- Every binaural control lives in **one** body: `apps/web/src/features/binaural/BinauralBody.tsx` (ear switch, tone rows, fades, EQ bands, optional band tiles, and a `preview` slot for the caller's buttons). The preset editor renders it inline under the name, a meditation's `Open binaural config` renders it over a draft, and `/tuner` renders it over a live preset. Do not copy the markup into a fourth screen: the two copies that existed had already drifted — the config screen passed an EQ band's *index* where `setBandGain(eq, hz, gainDb)` wants the frequency, so one slider moved another band. `Duplicate` belongs on the preset *card*, not inside an editor; a preset editor has no `Open tuner` button, because the tuner is already on it.
- The plan strip's cards are a fixed `w-52 min-w-52` (the app's root font is 18px, so that is 234px), with the card's name as the drag handle and `Remove` beside it. **There is no cool-off block and no block kind** (the owner's round 15, 2026-09-19): a card's handle says the meditation's name with its type under it, and the whole strip has one **`Add meditation block`**, which opens the same `PickerPage` a card's `Meditation` field does — every live meditation, every live type, the type beside the name. `PlanBlock` has no `type`, and `compilePlan` refuses a block that names no meditation. A block names a **list** of them since the owner's round 22 — *"Each point block can have multiple points in it (no limit on the number of points)"* — so `meditationIds` is `string[]` and never empty; `leadMeditationId` is the first, which is whose stages, sound, Display facts and Focus picture the block takes, and the rest are the points a point block clubs into the same pass. `parsePlanBlocks` and `planFromCloud` both read the older `meditationId` and `focusPointId` as a list of one, so a stored plan never has to move, and `withoutMeditations` is what a delete cascades with (a block left with none leaves the plan). The words `· drag` were removed on the owner's round 5, because every card said the same word and it set the card's width; the drag instruction lives in the handle's `aria-label` instead. Under the handle the card draws **one row per stage** — the stage's label above its `M`/`S` wheels, stacked so the card keeps its width — and the run screen's pre-Start header draws the same rows for the block on screen.
- Do not flatten the product into a fixed 12-stage list, Vite+IndexedDB-only, React `useReducer` session, or `StereoPannerNode` binaural. Those contradict this architecture.
- Local `./scripts/meditaur check` (and `dev` / `build` / `setup` / `exec`) runs in `infra/Dockerfile.tools`. Docker is required on the operator machine. Do not download Node into `.tools/` or `~/.local`.
- The Supabase CLI (`./scripts/meditaur up`) is the only host tool the workflow may ask for, and it stays optional. There are two live targets and the tests say which one they are using: `SUPABASE_TARGET=hosted` reads `SUPABASE_*`, `SUPABASE_TARGET=local` reads `SUPABASE_LOCAL_*`, and `./scripts/meditaur test:integration:hosted | :local | :both` sets it (see `tests/fixtures/supabase-target.ts`). `:both` runs the hosted project and the stack **concurrently inside one container** — they share nothing, so there is no reason to pay two container starts — and every live run also prints whether the stack is answering, so `host.docker.internal` has a visible answer even when only the hosted target is exercised. `:local` and `:both` take the stack's keys from `supabase status -o env`, so nothing has to be copied into `.env` by hand; an explicit `SUPABASE_LOCAL_*` trio still wins when the CLI is absent. A named target that is not configured **fails** rather than skipping — that is what keeps a local run honest, because `.env` can hold the hosted project and the run would otherwise go green against production. `scripts/in-docker.sh` forwards both trios from the shell or repo `.env`, and `compose.tools.yaml` maps `host.docker.internal`, so the local trio's URL is `http://host.docker.internal:54321` (inside the container, `127.0.0.1` is the container). Do not add another host tool, and do not run the live suites from the host.
- Secrets live in exactly two ignored places: `.env` (mode `0600`, operator-written) and the Supabase CLI's own state under `supabase/.temp/`. Never paste a key into a tracked file — `tests/unit/architecture/integrity.test.ts` scans the tree for JWT-shaped and `sb_secret_` / `sb_publishable_` values and asserts those ignore rules, so a leaked key fails `pnpm check` instead of being noticed later. The service-role key never reaches the browser: `NEXT_PUBLIC_*` carries the anon/publishable key only.
- `pnpm check` remains the command *inside* that container, and the CI check job. GitHub Actions must not require Docker for `pnpm check` and must not bootstrap `.tools/`.
- `pnpm check` is `typecheck` (each package + `apps/web`) + `typecheck:tests` (`tsc -p tests/tsconfig.json`) + `lint` + `test:unit`. Tests are typechecked on purpose: they import app code by relative path, so a stale import or a bad fixture call otherwise only fails at runtime. Do not drop `typecheck:tests` from `check`.
- `pnpm check:full` is the in-container gate: `check` + `test:integration` + `build`. It must not require Docker or Supabase — with no keys configured the hosted half skips itself, which is why CI needs no secrets. The whole gate is `./scripts/meditaur check:full`: it starts the local stack (`up`, idempotent, and it replays the migrations only when the ones on disk are not the ones applied — `supabase_migrations.schema_migrations` answers that, `MEDITAUR_FORCE_DB_RESET=1` overrides — so the local half still tests the schema that is actually in the tree, without paying 98s a run for it), runs **both** live databases at once in one container, then builds and runs e2e. That is the occasional pass; the edit loop stays `./scripts/meditaur check`. Supabase became worth gating as soon as there was a database to be wrong about: the live half is no longer "skipped unless an operator remembers".
- Every GitHub Actions **check** job calls a root `pnpm` script. The e2e job builds `infra/Dockerfile.e2e` (BuildKit `gha` cache) then runs `./scripts/e2e.sh`. Do not add a third way to invoke Playwright.
- Markdown is not a build input, and neither is anything already deployed. Enforced by the toolchain, not by an agent rule: every `.github/workflows/*.yml` `pull_request`/`push` event sets `paths-ignore: "**.md"`; Git-connected Vercel runs `scripts/skip-build-if-md-only.sh` via `git rev-parse --show-toplevel` (`vercel.json` `ignoreCommand`: exit 0 skip, exit 1 build — never 127). That gate asks *what changed since the last deployment*, not *what the tip commit changed*: the range is `$VERCEL_GIT_PREVIOUS_SHA` (the last deployed commit for the project and branch, fetched on demand when it is older than Vercel's ten-commit clone) → `HEAD`, falling back to `HEAD^` only when there is no deployment to compare against. `HEAD^ HEAD` was the bug — a code commit with a docs commit pushed over it read as docs-only and the deploy was cancelled, leaving the previous code live. Documentation is markdown anywhere **or** anything under `docs/`; every other path builds. `.dockerignore` and `infra/Dockerfile.e2e.dockerignore` exclude `**/*.md`. `tests/unit/architecture/deploy-gate.test.ts` runs the real script against a scripted git; `integrity.test.ts` enumerates workflow files and pins the command. Do not add a paths-filter Action.
- Clone toolchain is `./scripts/meditaur setup`. Node and pnpm live in `meditaur-tools:local` (`node:24.20.0-bookworm-slim` + Corepack pnpm 10.17.1). `.tools/` holds only pnpm/corepack caches written by that container (it is that container’s `HOME`). `node_modules/` is on the bind mount so the editor can resolve types. Do not put Playwright browsers in `.tools/` or in `Dockerfile.web` or `Dockerfile.tools`.
- `./scripts/meditaur e2e [spec|args]` runs Playwright in the session's e2e image (`meditaur-e2e:local`, or `meditaur-e2e:<MEDITAUR_SESSION>`). Chromium is installed in that image’s `deps` layer so source-only rebuilds do not download it again. Arguments reach Playwright, which is how one spec is read without the whole suite. The preview image stays slim.
- **What the gate costs, and the three caches that keep it there** (measured 2026-09-18 on a 12-core machine): `check` is 167s cold and 38s warm, the two live databases together are 21s, `build` is 114s, e2e is a 1m in-container production build plus **2.1m** of tests standalone and **3.6m** inside the gate (2026-09-24, three workers, 101 passed, green). The suite is not slow because the tests are heavy — the 66 e2e tests are 696s of test time between them, and three tests that only render a page cost 14–16s each. It is slow because of startup, so the caches are the whole budget: keep turbo's `.turbo` (`scripts/clean.sh` sweeps it; `clean-run.sh` must not, and deleting it before a gate cost 134s of typecheck and lint), keep `*.tsbuildinfo` (`tests/tsconfig.json` is `incremental`: 48s → 10s) and keep `eslint --cache` (44s → 13s). `turbo.json`'s `build` task declares `NODE_ENV` and both `NEXT_PUBLIC_SUPABASE_*` names as `env` because Next inlines them into the bundle — without that, keeping `.turbo` would be a false cache hit waiting to happen. e2e's worker count is **three** (`PLAYWRIGHT_WORKERS` overrides it): measured 2026-09-24 on this shared 12-core host, three workers are 100 passed / 1 failed in 2.1m where six are 94 passed / **7 failed** — six of the seven were contention and pass at three. The split this replaces (6 here, 3 on a 4-vCPU CI runner) was measured against `next dev`, which a run no longer starts.
- **The e2e suite is served a production build** (`P2 · 17`). `scripts/e2e.sh` builds inside the run container and the web server is `pnpm exec next start`, so nothing is compiled during a run — which is what removes the class the two red rounds were made of (a cold `next dev` compiling routes under six workers, read as 30-second `page.goto` timeouts and one `Page crashed`). The container’s filesystem is its own and `.next` is excluded from the image context, so no run can test a build somebody made earlier. Two consequences to keep: the **CSP is live** during a run (it is production-only in `apps/web/next.config.ts`), and the **service worker registers**, so the suite blocks it (`serviceWorkers: "block"`) rather than reading a cached shell. `retries: 0`, deliberately: a `flaky` line is a test that failed and passed, which reads as green while hiding exactly this class.
- **A spec that claims the store has to ask for the write and wait for it.** Planner edits autosave 400ms after the last one (`Planner.tsx`), and `Done` closes the editor without flushing — while `openEditor` in `plans.spec.ts` begins with `page.goto("/plan")`, a full navigation that re-reads the store. So a spec that presses a control and then navigates passes or fails on whether the server happened to be slower than 400ms: round 24's randomiser spec passed under `next dev` for that reason and failed every time the moment the suite was served a production build (`P2 · 58`, 2026-09-24). Press the screen's own `Save` and wait for it to drop its `· unsaved` half, the way the neighbouring test in that file does. **The app's boundary is the same one, and it is deliberate:** an unsaved edit survives a route change — the screen flushes on unmount — but not a full page load inside those 400ms, which is what the `· unsaved` marker and the Save button are for.
- **`tests/e2e/warmup.ts` is no longer required for a new route.** It was the fix for `next dev`’s per-route compile, and with a production build there is nothing to compile: it is now only the check that every route answers before a worker reaches it, and it runs **in series** (three pages at a time was 43.9s with the ten waits going 37.7s → 124.9s, measured against `next dev`, because its compiles go through one module graph). Playwright starts the web server as a plugin *before* global setups, which is what makes any of it possible. A wait on a screen a worker has just reached for the first time still wants its own timeout (`plans.spec.ts`’s `/run/` wait carries a 60s one for that reason).
- `infra/Dockerfile.web` must run `next start` with `/app/apps/web` as the working directory (that is where `.next` is copied) and must copy `apps/web/next.config.ts`, which the runtime redirects live in. `preview` verifies HTTP 200 before it reports the URL. Starting Next from the monorepo root is a bug, not a config choice.
- Do not put `store-dir` in committed `.npmrc` — that breaks GitHub Actions `cache: pnpm`. The tools container sets `npm_config_store_dir` to `/app/.tools/pnpm-store`.
- CI `pnpm check` uses `actions/setup-node` + `pnpm/action-setup` with `.nvmrc` **24.20.0**. That job must not bootstrap `.tools/` and must not require Docker.
- CI e2e builds `infra/Dockerfile.e2e` with BuildKit GitHub Actions cache (`scope=meditaur-e2e`). It does not run `playwright install` on the runner.
- `dev`, `build`, `preview`, and e2e must clear leftover Compose containers (including the `meditaur-tools` one-off `run` container, which holds port 3000) and last-run reports. `preview` rebuilds `meditaur-web:local` using Docker layer cache. Do not `docker system prune`. Do not `--rmi` on down. Do not wipe `node_modules`, `.tools` or `.turbo` on every iteration.
- Keep the `apps/` + `packages/` + `infra/` + `scripts/` + `tests/` layout. Production code stays in `src/`; tests stay in `tests/`. Do not flatten into a single `src/screens` tree.
- Wellness tool, not a medical device.
- Catalog deletes **cascade**, they do not refuse. `deleteMeditation`, `deleteSymbol`, `deleteEntry`, `deleteLine`, `deleteFieldDef`, `deletePreset` and `deleteMediaAsset` run inside `ports.runInTransaction` and remove or clear every reference, plan blocks included. Only two refusals survive: `keepOnePlan`, `keepOnePreset` — a workspace always keeps one of each. (`keepOneTableView` went with `table_views`; the Database holds no display settings, so there is no "the last view" to keep.) Empty custom field values delete the row instead of storing blank text.
- **A catalogue delete is a mark, not a removal** (`P2 · 3`, slice 3). The row stays and `deletedAt` says it is gone — on the device and in the cloud alike — because a removal cannot travel: the other device reads a missing row as **new** and hands it back ([DECISIONS.md](./DECISIONS.md) §12). The three fields are the domain's `deleteMark` (`packages/domain/src/delete-mark.ts`): the mark, one revision on so it wins last-write-wins, and the timestamp moved with it because that column is what a pull reads. So **every read of a catalogue table leaves the marked rows out** — `packages/db/src/ports.ts` filters through one `withoutDeleted(...)` wrapper and the cloud adapters read through `liveRows`, and a read that forgets draws a row the reader deleted. `plans` and `plan_blocks` carry the mark too (`20260923140000_plan_delete_marks.sql`); the domain's `Plan` deliberately does not, because a deleted plan is a row the store no longer offers rather than a state the app holds. Three removals stay removals: `mediaBlobs` (bytes, never synced), `events` (append-only) and the session history's own pruning.
- The binaural tuner lives at `/tuner` and loads `?preset=<id>`. `/dev/tuner` redirects there. Library owns preset add/rename/delete; do not treat `getFirstPreset` as the product edit path. `/tuner` renders inside the AppNav shell but has no nav entry — `AppNav` links are exactly Plan, Library, Settings, Account. That is deliberate, not an oversight; a tuner entry needs an owner decision.
- A binaural draft is a `sessionStorage` key per meditation, so a deleted meditation would strand one for the rest of the tab. `pruneBinauralDrafts` sweeps them on every library load, which is the only moment the live set is known.
- Plan / Library / Settings / Account are the AppNav routes (the current route uses `aria-current`). `/run` is a separate shell with no AppNav.
- External libraries are an allowlist. See [DEPENDENCIES.md](./DEPENDENCIES.md). Do not add npm packages, Docker images, or `pnpm dlx` tools without updating that file and the integrity allowlist test.
- Local/CI/Docker Node stays pinned at **24.20.0** (`.nvmrc`, `infra/Dockerfile.web`, `infra/Dockerfile.e2e`, `infra/Dockerfile.tools`, with the image digest in those `FROM` lines). `package.json` `engines.node` is **`24.x`**: Vercel only accepts a major, not a patch — do not put `24.20.0` there. Vercel then deploys latest **24.x**, which may not be 24.20.0. Vercel **Project Settings → Node.js Version** must be **24.x** so install Node matches `engine-strict`.
- Compile prune keeps 5 snapshots per plan (`SNAPSHOT_KEEP_PER_PLAN`). History lists at most `SESSION_LOG_LIST_LIMIT` (50); `recordSessionLog` prunes to that. `deletePlan` drops that plan’s snapshots and logs (SQL FKs cascade).
- `/` Start session compiles the last plan and opens `/run`. Do not add a second start button on `/plan`. Installed PWA `start_url` is `/plan`.
- Duplicate plan mints a new plan id and new block ids. Do not share block ids across plans.
- Duplicate preset mints a new preset id and structured-clones tones and EQ. Do not share those arrays by mutation.
- Sessions completed this week counts `listRecent` logs in the local ISO week (Monday). It is capped by `SESSION_LOG_LIST_LIMIT` (50). Do not add a dashboard.
- Picking a focus copies `defaultBinauralPresetId` and `defaultDurationMs` onto the block. Compile still uses only `block.binauralPresetId` — an explicit None stays silent.
- Library remembers the last section in `sessionStorage` for this tab. Do not add a UserPreferences field for it.
- **The alarm defaults to off, and a meditation may answer for itself** (the owner's
  round 17, which reversed §12.21's default). `DEFAULT_ALARM_ENABLED` is `false` —
  the seeded plan, the preference a new plan is built from and `compilePlan`'s
  fallback all answer with it, because *"noone asked for an alarm-on on this screen,
  it always was an alarm - off here"*. `PlanBlock.alarmEnabled` is `boolean | null`,
  `null` meaning **the plan's answer**, and `Plan.alarmEnabled` is still the switch on
  the plan's latch row. `compilePlan` resolves the two into
  `CompiledBlock.alarmEnabled` (the block first, the plan behind it), the engine's
  `onExpiry` reads **that** — off means no alarm asset, no `alarm` event and no duck,
  because the duck exists to make room for the alarm — and `setAlarmEnabled`, the run
  screen's latch, writes the **block on screen** rather than the session. Binaural and
  auto-scroll are still **per stage**
  (`PlanBlockStage.binaural`/`autoScroll`), their switches sit with that stage's timer
  — in the meditation's own editor on the plan screen, and in the stage strip before
  Start — and `setStageFlag` follows `setStageDuration`'s
  rule about which row is editable — any of them before Start, only the one playing
  after, with the tones moved at once when the playing stage's `binaural` changes. The
  run screen's write-back is `MeditaurApp.saveSessionStageFlag(workspaceId,
  instanceId, blockIndex, stageIndex, flag, value)`, which shares
  `patchSessionStage` with `saveSessionStageDuration`: the stored snapshot **and** the
  plan block, so a reload and the next session both keep it.
- **A block carries its own Display, and the panel is on the meditation** (the owner's
  round 17). `PlanBlock.display` is a `PlanDisplay | null`, `null` for the plan's, and
  `compilePlan` builds a per-block `FactScope` so one meditation's facts come from its
  own columns. `Plan.display` is no longer edited anywhere: it is the answer a block
  that has never been asked inherits, the same shape `UserPreferences` has for a new
  plan, and the first change in the editor materialises the block's own copy.
  `isAppDefaultDisplay` is what lets a Dexie repair hand a plan the app's *new*
  default without touching a display the reader arranged.
- **The run screen's clock is the stage strip** (the owner's round 17). There is no
  big timer in the header: each stage's wheels show what that stage has left, and
  `engine.seek(blockIndex, stageIndex)` is the one move behind a stage press, a
  `Restart`, and all five arrow-key gestures — it lands on that stage at **its own**
  length, clears the clock and holds at `loaded`, so `Start`/`Space` runs from there.
  Never `paused`: a pause remembers a remainder, and this is the one move that must
  forget it. `sessionRegions` takes the stage's `kind`, so the main region holds a
  `symbols` stage's sheet of symbols rather than the intentions column, and the symbol
  in play follows the column's own report until the column runs out of travel —
  `stage-progress.ts` is the clock's answer when it does.
- Catalog JSON includes names, plans, presets, media blobs (base64) **and session history**, and it carries the `entries` table and each column's options. `CATALOG_BACKUP_SCHEMA_VERSION` is **9** (4 → 5 added `logs`; 5 → 6 `entries` and `fieldOptions`; 6 → 7 the meditation types; 7 → 8 the rename's read path; 8 → 9 the affirmations key), and the code reads the constant — never a literal. Restore merges by id in one Dexie transaction, upserts blobs and logs, and keeps extras; `SessionLogRepository.save` exists for that one caller, because `append` would collide on a second restore. A v1/v2 file backfills the pair rows and their lines with stable derived ids (`entriesFromLegacy`, `stableId`) — a v1/v2 "binding" and a focus-scoped intention become one `Entry`; a v3 file's rows gain `revision: 0` / `updatedAt: 0` and an empty field description; a v4 file carries no `logs` and restores with none; a v5 file carries no Entries table and gets one from its bindings and intentions. A file without `blobs` is `{}`, and a file *newer* than the current version is refused rather than half-read. Do not add a zip library.
- Domain and application throw `AppError { code, message }` via `fail`. UI branches on `code` and shows `message`. Do not `throw new Error(string)` from those packages.
- The Lobby's Start session and the planner's Start session both call `startSession` → `compileSession`. Focus tiles call `startSessionFromFocus` (reserved Focus session plan, `symbolScope: "all"`) then the same `compileAndStoreSession`. A live session stays on that `instanceId`. Do not add a second compile engine or a second start button. The planner's button said `Load` until 2026-09-16, when the owner renamed it — `Load` never said what it did.
- `compilePlan` throws on a block that points at a missing catalog id. Dexie plan rows must parse as `PlanBlock[]`.
- **A Dexie upgrade reads and writes rows through its table's mappers, never straight through.** The `plans` table keeps a plan's blocks as JSON (`PlanRow.blocksJson`), so a row is not a `Plan`: `planFromRow` and `planRowForStore` are the only places that know both shapes. v30 handed raw rows to a rule that reads `plan.blocks`, which threw inside the upgrade and **aborted the open** — the shape of the 2026-09-21 outage, and invisible to every test because a test always starts from an empty database. A repair is also not a save: it keeps the row's own `updatedAt` and its delete mark, so it cannot resurrect a plan the reader deleted or make one look newer than the cloud's copy.
- **A `const` helper is declared above every line that calls it.** A function declaration is hoisted and may sit below its caller; a `const` arrow may not, and the failure is a `ReferenceError` at render rather than a type error — in round 22 the grid's filter reached for a cell helper declared 340 lines below the first line that called it, and every meditation table and `Symbols` fell to the screen's error boundary while typecheck, lint and all 598 unit tests stayed green. `no-use-before-define` is on for this; the five files that still carry a later call are named in `eslint.config.js` as a ratchet, and the Database's own grid is not among them.
- **A heading is named by its own column, not by the controls inside it.** The grid's `⌕` is a labelled control of its own, so a heading without its own `aria-label` answers to "Name Open the filter for Name" — which is both what a screen reader says and what an `exact` name lookup stops matching. `aria-label={columnLabelOf(column)}` is the whole rule, Karuna's two headings included.
- Planner autosaves so Start session compiles the on-screen plan.
- Session completion logs use `ports.clock`, not the runner’s `Date.now()`.
- Tuner/runner mixers: `resume` suspends the other scope. Volume is `AudioPort.setMasterVolume` / `setAlarmVolume`.

## Review-derived rules (2026-09-15)
The review of that date found the four critical defects and the gaps the later
phases closed; [HISTORY.md](./HISTORY.md) records what it found and where the fixes
went. These rules come out of it and are binding from here on.

- Never change a Dexie table’s primary key in a version upgrade — Dexie aborts
  the upgrade. Add a new table and copy, or keep the key path stable.
- `Plan.revision` CAS must be atomic: the read, the check, and the write run in
  one `ports.runInTransaction`. Never read-check-write outside a transaction.
- Domain types, Dexie, and `supabase/migrations` move in lockstep. A schema
  change updates all three in one change. The integrity test compares column
  names; a **union** is guarded separately by
  `tests/unit/architecture/schema-unions.test.ts`, which reads the union out of
  `packages/domain/src/models.ts` and fails if a migration does not constrain the
  matching column to exactly those values. Add a union to the domain and the SQL
  check belongs in the same change.

**A meditation type is a row, not a union** (the owner's round 15). Chakras, Points,
Protection and Thanks Giving live in `meditation_types`, seeded in
`packages/db/src/default-workspace.ts`, and **their ids are constants in
`packages/domain/src/meditation-types.ts`** — the domain, because `packages/db`
seeds the rows and `apps/web` asks which type a row is, and the app may not import
`packages/db`. Three consequences:

- A surface that used to switch on a type — a library tab, a Database table, a group
  in a plan's tiles, a column's pool — is generated from the rows, so a type the
  reader adds appears everywhere at once with nothing to register.
- The seeded **names are plural** (`Chakras`, `Points`), because a name is a heading
  as well as a label; the owner's round 6 settled that when "Point" over a group of
  meditations read as a single odd one out.
- A column belongs to one type or to every type (`FieldDef.typeId`, null = shared).
  A built-in section that belongs to one type is gated on that type's id
  (`CHAKRA_TYPE_ID`), never on a word a reader can rename.
- **The pool is the filter, and it is one rule in one place.**
  `columnIsInPool(def, typeId)` in `apps/web/src/features/library/library-model.ts`
  is the whole of §12.4 — a column is in a pool when it is that type's or the
  reader's shared one — and every surface that draws a meditation's columns asks
  it: `poolColumns` (the list, its picker, the tab's cards and table),
  `FocusEditor` and `FocusSheet` (the row's own editor and read-only view, by the
  row's `typeId`), and the Database's `columnsOf` + `DatabaseTable`'s
  `customColumns` (by the table's type). A pool that is *not* a type's — Symbols,
  Entries — draws the shared columns only. Compile is deliberately not filtered:
  the plan's Display is the reader's own choice of columns, and a pinned key a
  meditation does not have simply has no value to show.

**Every Dexie table belongs in a `db.transaction` list, or on the named list of
tables deliberately outside it** (`OUTSIDE_THE_SCOPE` in
`tests/unit/db/transaction-scope.test.ts`). A table that is declared and missing
from the write path's scope compiles, passes every unit test, and fails only at
runtime — IndexedDB's "object store was not found" — the first time a use case
inside the scope touches it. That is what `meditationTypes` did to every catalogue
save until the e2e suite caught it.
- A migration is additive and re-runnable: give a constraint a name, `drop
  constraint if exists`, then add it. Never edit a migration that has been
  applied — a database that already ran it will not run the edited version.
- Seed/bootstrap ids are deterministic (`LOCAL_USER`, `LOCAL_WS`, `nid()`); never
  mint seeded rows with `crypto.randomUUID()`. Every row of the default catalog
  obeys this, intentions included, and the default-workspace test builds the
  catalog twice and compares every id (the review, 2026-09-15).
- Every use case that takes an id is workspace-scoped. Never read or write across
  a workspace boundary.
- Analytics is first-party: a domain event port plus an `events` table. Do not
  add a third-party analytics SDK — the dependency allowlist still applies. Both
  exist as of `c51c28d` (`EventPort` with one event type — `client_error` — the
  `events` table, `dexieEvents`, `createSupabaseEventsPort`); nothing writes to
  them yet, because `error.tsx` still only logs to the console.
- Identity flows only through `AuthPort`. Exactly one module may import
  `@supabase/supabase-js` — `packages/db/src/supabase.ts`, the module behind
  the port. Session expiry is deadline-based through `Clock`; never `setInterval`.
  With no session the app stays Dexie-only: `/plan`, `/run`, `/library`, and the
  tuner must keep working exactly as they do without an account.
- **Closing an account is one order, owned by the application, not by a screen**:
  the server closes it, the session is cleared, the device is wiped — and a close
  the server refused wipes nothing (`MeditaurApp.closeAccount`). The server half is
  `supabase/functions/close-account/`. The other server half is
  `supabase/functions/admin/` — the only writer of `account_flags` (`P0 · 23`): the
  table grants an account a self-select and **no write at all**, so a flag can only
  change through a function that has first proved the caller is an admin, and the same
  function creates an account and sets a password by hand. Both carry **no imports at
  all** on purpose: the one-SDK-importer rule above is about importers, and a function
  is a second runtime rather than a second importer. `./scripts/meditaur cloud --yes`
  deploys them with the migrations, so a caller and the thing it calls ship together,
  and the platform verifies the JWT before either runs. Nothing typechecks or lints
  them — Deno is not a runtime this repo's toolchain has — so the hosted live suite is
  what proves them, and that gap is the register's `P4 · 34`.
  `tests/unit/architecture/integrity.test.ts` reads the two files as text for the rules
  that would rot silently (no imports, and both deployed without `--no-verify-jwt`),
  which is not a substitute for the suite. That suite is also the only one that *can*
  reach them: the local stack serves Postgres and Auth and no `functions serve`, so
  `account-close.test.ts` and `admin-flags.test.ts` skip on the local target and run on
  the hosted one. The close's data half is still covered locally, by `rls.test.ts`
  calling `delete_my_data()` against the stack.
- The runner's cross-tab lock is scoped to the signed-in user
  (`runnerLockKey(userId)`), not to the browser profile: two people can be signed
  in on one device, and one must not block the other. Read the scope at call time
  (the release also runs from an unmount-only effect).
- An editor's save must join on a picture upload that is still in flight and merge
  the asset id itself — see `saveSymbolNow`/`saveMeditationNow` in `Library.tsx`.
  A file input's `onChange` writes asynchronously and returns at once, and React
  commits the updated screen asynchronously too, so neither waiting nor re-reading
  the reactive value is enough: the asset id has to come from the promise, and it
  has to be scoped to the entity it was chosen for.
- A control inside an editor either writes through the draft or writes it back.
  The focus editor is the one screen that manages *other* rows, so several of its
  controls (`Binaural beats`, the picture upload) persist immediately while the
  screen still holds a **draft** — and `reload` refreshes the lists without ever
  touching that draft. An action that writes straight through must also patch
  `screen.value`, or two things go wrong at once: the control keeps showing where
  the draft started, and `saveEditorDraft` — which every route out of the editor
  calls — writes the stale draft back over the press. Both happened to the
  library's binaural switch, and to the reader it read as "the button does
  nothing". A picker is safe here because it threads the draft through its own
  `screen.value`, so the draft stays the single copy.
- A label a screen shows must belong to the state the screen is in. The run
  screen's header was `block?.meditationName ?? "Cool-off"` — correct while a
  cool-off block existed to be named, and a lie on a screen with no block at all,
  where a finished one-chakra session announced a rest block it had never had. (The
  kind is gone now — the owner's round 15, 2026-09-19 — and the fallback is `"This block"`,
  which is only drawn when there *is* a block.) A fallback belongs
  to the state it describes, or it does not belong on screen. The neighbouring
  `No block yet.` is still there because it is at least true; it is queued in the
  review log rather than rewritten.
- A control that cannot do anything is not drawn. `Auto-advance` is hidden on a
  one-block session that does not repeat, because there is nothing to advance to
  and never will be. Ask that of the **whole session**, not of the moment: asked
  per-block, the latch would blink out of the footer as a longer plan reached its
  last block. The engine draws the same line internally — `autoAdvance` only
  decides anything while a next block exists, so the last block ends the session
  instead of parking at `awaitingSkip` behind a `Skip` with nowhere to go. Zero is
  a length for the same reason it is elsewhere: `setBlockDuration(0)` is allowed,
  and a `0:00` block rings its alarm and closes a session with nothing after it.
- Media blob URLs are cached for the life of a screen and released on unmount, and
  per asset on delete. Do not revoke them on a reload: asset ids are immutable, so
  rebuilding the URLs only makes every picture blank and re-decode after a save.

## UI rules (from the 2026-09-15 redesign)

[UI_DESIGN.md](./UI_DESIGN.md) is the direction; these are the binding parts.

- The palette lives in exactly one place: the `@theme` block in
  `apps/web/src/app/globals.css`. Screens use the generated token utilities
  (`bg-bg`, `bg-surface`, `bg-surface-raised`, `text-text`, `text-muted`,
  `border-line`, `bg-chakra-*`). Do not reach for a raw Tailwind palette utility
  (`stone-*`, `amber-*`, `teal-*`, `red-*`) or a hex in a component.
- **Eight colour schemes, and the document's default is the app's own** (`P2 · 46`).
  `UserPreferences.theme` stores the **name** of a scheme; `apps/web/src/lib/themes.ts`
  declares the hexes and `globals.css` carries them as one `[data-theme=…]` block per scheme
  (seven, because `warm` *is* the `@theme` default — a second copy of one palette in one file
  is how two copies start to disagree). `tests/unit/web/themes.test.ts` reads both and fails
  when they drift, checks every scheme's ink and accent for contrast, and requires each one's
  ground and accent to sit in genuinely different hues. `apps/web/src/lib/theme.ts` is the
  pre-paint mirror and the only writer, and `ThemeSync` reconciles it with Dexie, exactly as
  `text-size.ts`/`TextSizeSync` do. The picker is the **one** component allowed near a raw
  hex, and it paints the values rather than spelling them. A ninth scheme is a domain union, a
  `theme in (…)` check in a new migration and a new block — never an edit to an applied one.
- **The session wears the meditation's colour, and the app does not** (`P2 · 47`).
  `Runner` puts `data-chakra=<accent key>` on the run shell and `globals.css` holds one rule
  per chakra overriding the ground, surfaces, line and accent **for that subtree** — which is
  the deliberate exception to §1.2's "never a large background wash", and it stops at the run
  screen. Two consequences to keep: the shell must carry `bg-bg` itself (the body paints the
  root value, so without it the panels tint and the page does not), and the wash must be mixed
  into a base of the scheme's own lightness rather than a fixed one, or a light scheme gets a
  dark session. `accentForMeditation` — not `accentForName` — is what the screen reads, so a
  reader's own `Meditation.colour` reaches the transport too. `custom` and `neutral` accents
  have no rule on purpose: no wash, ink accents, the app's own ground.
- **The randomiser is a plan block's setting, read at compile time** (`P2 · 45`).
  `PlanBlock.intentionRandomiser` is `null` for a block that has never been asked, and `null`
  reads as every line — so nothing stored changes when the feature lands and no plan is
  migrated. The draw happens in `compilePlan` and lands in the session's snapshot, which is
  what makes a repeat cycle show the same lines and the next session a different set.
  `SNAPSHOT_SCHEMA_VERSION` is **8**. A count is a **ceiling**: at or above a pool it keeps all
  of it, `0` keeps none, nothing is duplicated, and the flat `intentions` list is rebuilt from
  the drawn halves (the spoken-intentions read uses it). The **affirmations** stage is not
  drawn from — the counts name intentions. The draw is injected (`CompileOptions.pick`, default
  `systemPick` in `packages/domain/src/pick.ts`, the `Clock` idiom), so a test settles it. With
  the `intention_randomiser` flag off the compile reads every line: the flag subtracts the
  behaviour, not only the control.
- Chakra hues come from the static name→hue map in `packages/ui/src/accents.ts`,
  keyed by the seven seeded names, with `Meditation.colour` as the only override
  (`accentForMeditation`, painted through `accentStyle`). This needs no schema or
  seed change — and "Hara" is not renamed.
- Buttons are `Button` (`tier` × `size`). Placement is fixed: the way back is the
  **`Esc back` legend**, drawn as a control (`KeyHints`' `onPress`) rather than a
  separate button — the owner's round 20 — and the screen's one primary action lives
  in the sticky bottom bar (`EditorChrome`'s `actions` slot), secondary actions sit
  inline with their content, and destructive actions sit at the bottom of the section
  they remove. `tier="destructive"` always carries the trash icon, and the confirm
  step is the in-app arm/confirm pattern — never a native `confirm()`.
- Run-mode **primary** controls stay at or above the 64px floor (`size="xl"`;
  `Button iconOnly` is a 64×64 square). `LatchButton` keeps its name, props and
  `aria-pressed` at either size, and its 64px outer target where it is `md`. The run
  screen's three session latches are the compact `sm` switch, which is the one
  deliberate exception to the floor — the owner's round 19: *"need to be of the same
  size, smaller, give them smaller names so that they take up less space"*.
- `EYEBROW_CLASS` from `@meditaur/ui` is the one small-caps screen label; the
  integrity test pins it in the Plan, Library, and Run shells.
- Every control answers a press. `Button` shrinks and dims while held
  (`active:scale-95 active:opacity-80`), and `LatchButton`, `Stepper` and
  `TileGrid` carry the same treatment. It is not decoration: with no press state
  a button that works reads as one that does nothing, which is exactly what the
  owner reported.
- Destructive controls use the arm step *everywhere*, and the arm is visible:
  `Button tier="destructive" armed` fills light red (`bg-destructive/20`), and the
  confirming press fills dark (`active:bg-destructive active:text-text`) as it
  runs. `apps/web/src/lib/armed.ts` owns the state — `useArmedFlag()` for a screen
  with one delete, `useArmedId()` for a list — and disarms after 5 seconds. Use
  one of those two hooks; do not hand-roll the timer.
- Destructive controls that need the impact sentence use `DeleteButton`
  (`apps/web/src/features/library/DeleteButton.tsx`): it renders the armed
  `Button tier="destructive"` and, below it, the sentence for the armed item.
  Compose it rather than repeating the fill, the label swap and the notice.
- **Deleting cascades, so it has to say what it takes.** `packages/application/
  src/deletion-impact.ts` computes a `DeletionImpact` and
  `MeditaurApp.getDeletionImpact(workspaceId, kind, id)` returns the sentence the
  UI shows (`This also removes 2 blocks from 1 plan and 1 intention.`,
  `1 place that pointed at it is cleared.`). `Library.tsx` fetches it when a
  control arms and hands it to `DeleteButton`; a new destructive control passes
  that impact rather than writing its own confirmation prose.
  `patchPlanBlocks(workspaceId, patch)` is the one way a delete edits plans:
  `null` drops a block, the survivors are reindexed, and `plan.revision` is
  bumped so a stale editor hits `plan.conflict` instead of writing over it.
- A screen the navigation bar already names does not repeat its name: `/plan`,
  `/library` and `/settings` carry no page title, and a library section carries no
  heading either (the lit tab says which section it is). The run screen keeps its
  eyebrow — it sits outside `AppNav`. The integrity test pins this.
- The library's top row is `Download catalog` / `Restore catalog`, which act on
  the whole library; each section's row is its `Add …` action at the left, where
  the heading used to be, with the view switch and `Columns` at the right.
- The library's destructive and column controls: the `Columns` action in a
  section's toolbar opens the column switches as a disclosure panel, and it shows
  itself selected (`aria-expanded` plus the primary tier) while that panel is
  open — an action that looks inert when pressed reads as broken. Cards are
  containers, not buttons: each carries `Edit` and `Delete` named after the row
  they act on (`Edit Heart Chakra`, `aria-label`), and `Delete` is the same
  two-press arming as the editors' (`armedCardId` in `Library.tsx`). The library
  owns the available-column list for the active section (`poolColumns`); the list
  components render rows only. A section that gains columns adds itself there,
  not in the list.
- **Open is read-only, edit is where change lives** (the owner's round 4 items
  6–8, and one screen since the owner's round 22). Pressing a card or any cell of a
  table row opens the entry's own record — `CatalogCard`'s full-card `onOpen`
  target, `CatalogDataTable`'s row `onClick` (with the name cell keeping a real
  button for the keyboard) — and what that record shows on arrival is display only:
  `MeditationSheet` and `SymbolSheet` carry no `input`, no switch and no remove,
  only `Edit` in the bottom bar. `Edit` turns **that screen** into the editor, and
  `RecordScreen` is what holds the two halves: it mounts the read-only one or the
  editor exclusively, so exactly one shell owns `Esc` at any moment. Every
  management control over *other* rows (attach/unbind symbols, add/edit intentions,
  custom fields, `Open binaural config`) lives in the editor. Do not put an editing
  control on the reading half, and do not give a card an `Open` button — the card
  *is* the open target.
- Reordering a meditation's symbols or intentions is a **drag**, not a
  `Up`/`Down` pair, because the order is the `Rotate next` order. `FocusManage`
  wires `@dnd-kit/sortable` with `verticalListSortingStrategy`, the x half of the
  transform dropped (the planner's strip drops its y half), and both sensors:
  pointer and keyboard. Every row writes its whole list's `sortOrder` on drop —
  a drag can move a row many places, and pairwise swaps leave stale orders
  between them.
- An editor that hands over to a picker or to `binaural-config` saves its draft
  first (`saveDraftThen` in `Library.tsx`), because those screens come back with
  `Back` and the unsaved name would be gone when they did. Sub-actions that stay
  on the editor use `persistStay`, which must not reset the draft screen.
- The section view is **one `Table` switch**, never a pair of buttons, and it is
  rendered only in the sections that have a table (`LIST_MODE_TABS`). The
  per-section choice is remembered per tab in `sessionStorage`. Since the owner's
  round 14 the Add action leads the toolbar row and the switch — with the `Columns`
  picker that belongs to the table it switches to — sits at the row's right edge
  (`ml-auto`), so it reads as a setting for the list rather than an action on the
  section.
- **Escape goes back, on every screen.** It lives in `EditorChrome` and
  `PickerPage`, so a new screen cannot forget it; both do exactly what the `Back`
  button does, including discarding unsaved drafts. The run screen is the one
  exception — there Escape stops the session — and it has its own handler.
- Text size is painted before the first paint. `applyTextSize` in
  `apps/web/src/lib/text-size.ts` is the only writer: it sets the attribute and
  mirrors the value to `localStorage`, and the inline script in
  `apps/web/src/app/layout.tsx` reads that mirror ahead of hydration. The script
  and the writer must agree on the key and on the allowed sizes, which
  `tests/unit/web/text-size.test.ts` enforces. Dexie stays authoritative.
- **The reading scale is `sm | md | lg | xl` = 16 / 18 / 20 / 22px**, and `md` is
  the default the app is designed against (owner's round 14). A fifth value has to
  move four places at once: the domain union, `globals.css`, `Settings`' tile list,
  and the SQL check (`20260918180000_text_size_small.sql`) —
  `tests/unit/architecture/schema-unions.test.ts` fails if the migration and the
  union drift. **Buttons are outside the scale**: every metric in
  `packages/ui/src/Button.tsx` is a literal px, so a control keeps its size whatever
  the reader picks, and `tests/e2e/settings.spec.ts` asserts it.
- **Every file picker is a button's hidden half.** The Audio files tab's
  `Add ambient audio` / `Add alarm audio` and the library's `Restore catalog` are
  `Button`s, each over an `sr-only` `<input type="file">` that is `aria-hidden`
  and `tabIndex={-1}`: `input[type=file]` carries the `button` role, so without
  that the page has two controls answering to one name.
- Do not put a keyboard shortcut in a label unless a handler exists for it. The
  planner's cycle control said `Cycles (Z)` for months with no `Z` handler
  anywhere; the label is now `Cycles`.
- The run screen is **three regions in one viewport** (owner's round 15 §6 — it was
  one table in round 14; UI_DESIGN.md §2). The route's layout is
  `h-[100dvh] overflow-hidden` and `Runner`'s `<main>` fills it, so the intentions
  column is the only scroller — never the page. `features/runner/SessionRegions.tsx`
  holds the three: `MeditationPanel` (the meditation's name, its **type** from
  `CompiledBlock.meditationTypeName`, then `meditationFacts`), `SymbolPanel` (the
  pair whose lines are at the top of the column — `facts` + `entryFacts`, and the
  picture from `CompiledSymbolGroup.imageAssetId`), and `IntentionsColumn`
  (`blockLines(block, stageKind)`: an affirmations stage reads the reader's
  sentences, anything else the meditation's own lines then each pair's, with the
  legacy flat `intentions` as the fallback for a snapshot compiled before grouping).
  All of those facts *are* the plan's Display, so hiding one still takes it off this
  screen. `SNAPSHOT_SCHEMA_VERSION` is bumped for shape changes even though nothing
  reads the value yet.
- **The intentions column's scroll is a pure function plus a float.**
  `features/runner/scroll-rate.ts`'s `scrollTarget({scrollTop, contentPx, viewportPx,
  remainingMs, elapsedMs, running})` is the whole rule: nothing to scroll means no
  movement, holding when the session is not running or the stage has run out, and
  otherwise the position plus **content ÷ remaining stage time** for the frame's
  elapsed milliseconds — the rate is never a fixed px/s. The component keeps that
  position as a float of its own and writes `Math.round` of it, because a scroll
  offset is rounded to whole pixels and a frame's fraction of one would be thrown
  away — the column looked enabled, ran 132 frames in two seconds with a target of
  0.116px, and did not move at all until this (round 15, 2026-09-19). A hand on the list re-seeds the float when the element is
  more than a pixel from what was last written, which is the manual re-sync;
  `[data-intentions-scroll]` carries `data-auto-scroll="on|off|held"` so a still
  column can be told from a held one. `prefers-reduced-motion: reduce` starts the
  scroll **off** and the stage's own `Auto-scroll` press overrules it for that
  session.
- Fonts load through `next/font/google` in `apps/web/src/app/layout.tsx` — no npm
  package, so the dependency allowlist is untouched. If that build-time fetch ever
  has to go, self-host the same WOFF2 families instead of adding a font package.
- Tailwind builds this stylesheet from `apps/web`, and its source scan does **not**
  reach the sibling `packages/ui` package — verified against the built CSS.
  `@source`, the `source()` import function, and the PostCSS plugin's `base`
  option were all tried and none of them reach it. `apps/web/src/lib/ui-package-classes.ts`
  therefore pins the class strings `Button`, `LatchButton`, `accents.ts`,
  `PickerPage`, and `Stepper` name, in a file the scan does see. A class that
  only `packages/ui` names is otherwise never generated, and the failure is
  silent. Update that file in the same change as any new utility in `packages/ui`,
  and delete it once the scan can see the package.
- `Stepper` has two sizes for the same reason `Button` does: `md` is the
  page-level control, `sm` is the compact row used inside a plan block card. The
  compact size keeps the 44px tap floor (`h-11 w-11`), so an off-by-one card is
  still tappable on a phone; it exists because two `md` buttons crowd a 256px
  card, not to make the control small.
- **Every library editor is built from the same two pieces**
  (`apps/web/src/features/library/EditorSection.tsx`): `EditorSection` is a
  `text-xl` heading with its own action on the heading line, and `EditorField` is
  the app's label-over-control row. A new editor composes those rather than
  stacking bare labels; the owner's round 6 asked for the meditation, symbol and
  intention editors to be one shape, and their action buttons are `sm` — a row is
  a row. The screen's own primary action stays `lg` in the sticky bottom bar.
- **A custom field is named by its heading, in the editor as well as in the open
  view.** The reader types `Heading` and `Description` and nothing else:
  `FieldDef.key` is derived from the heading by `fieldKeyFor` (application layer,
  on the first save) and then never changes, because it is what a table view's
  `columnKeys` name and what a stored value is keyed to. A heading that collides
  with a built-in column or another field of the same pool gets a numbered suffix
  rather than a refusal. `CustomFields` is the same component on a meditation's
  editor and a symbol's, and **each field is its own section there** — titled by
  its heading, with one box under it for that entity's text, and its own two-press
  `Delete <heading>` on the heading line — rather than a list under a shared
  `Custom fields` heading. The description is the field's own note: drawn in the
  Fields tab's card and in the open views, deliberately not in the editor. `Add
  custom fields` is one line at the foot of the fields, not a section action. A
  field belongs to its **pool**, so deleting it anywhere deletes it everywhere
  with its values, and the arm step says so (`getDeletionImpact`, kind `field`).
  A field's own screen asks `Applies to` only on the route that has no entity to
  take it from — the Fields tab's `Add`; opened from an editor it states the pool
  instead, because that is the entity that asked for the field (owner's round 9).
- **A press anywhere on a card belongs to the card.** `CatalogCard`'s action row
  paints above its full-card open target, so the row swallowed presses and the
  bottom band of every card was dead — the owner's round 6, library item 1. The
  card container answers a press that did not land on a button, link, input or
  label (`isInteractive`), and the open target underneath keeps the keyboard
  path. If you move the actions, keep the container's handler.
- **A screen remembers where it was scrolled to.** `useScreenScroll` in
  `apps/web/src/lib/screen-scroll.ts`, keyed by the list's own tab in `Library` and
  by the record in `RecordScreen` (which reuses the `focus-sheet:<id>` and
  `symbol-sheet:<id>` keys the library stored, so a reader's place survived the move
  to a route), restores a screen's position when the reader comes
  back to it and starts a screen they have not seen at the top. Without it, a nested
  intention, a picker or the binaural config sent the reader back to the top of a
  long editor. It records on scroll rather than on the way out, because by then
  React has rendered the next screen and the browser has clamped the offset.
- **A record has one address and one screen, and it reads before it writes** (the owner's
  round 20, and one screen since round 22's answer). A meditation's, a symbol's and a
  preset's page is `/record?kind=…&id=…` (`record-route.ts`), reached from a grid row's
  press, from a card, and from nothing else; `Edit` turns that screen into its editor **in
  place**, and `from` in the address is what `Esc` uses to go back to the list the reader
  came from. The rows of the old two-path shape — the library's own request reader, the
  Database's `record` request and the flag that remembered the door — are deleted, and the
  route's three checklist entries (`ROUTES`, `SHELL`, the cache `VERSION`) are in place. A
  **preset** has nothing to read, so its page *is* its editor. **Creating** keeps its own
  addresses in the Database, because a row that does not exist yet has no id. Do not add a
  second read path for a record, and do not let a row press open anything but this screen.
- **A control that leaves a screen writes that screen's draft first.** The Database is the
  one place in this app where leaving discards, and the question the guard asks belongs to
  the nav bar, not to a control that navigates: a row's press, like `Tune`, saves and only
  then goes (`DatabaseTab`'s `openRecord`). Anything that navigates away from the grid
  without that write is a silent data loss.
- **A key legend that names a key the screen acts on is the control for it, and it lives in the
  screen's own bar.** Where a screen shows `Esc back`, the legend is pressable; where it would be
  a caption beside a button doing the same thing, the button goes; and it is drawn in the sticky
  bottom bar beside the primary action, never beside the title (the owner's round 8, restored in
  round 25 after `EditorChrome` drifted back up and the guard — which read only that a legend
  existed — stayed green). `integrity.test.ts` reads the five shells for all of it, so the rule is
  enforced rather than remembered.
- **A grid row's controls belong to the row** (`DatabaseTable`'s `TAIL_CELL`, `ROW_BAND`,
  `RowBand`): no leading controls column, the row's own press opens the record, and the
  last cell stays at the row's right edge so the controls cannot scroll out of reach. The
  armed box is a band **under** the row (`ARMED_CELL`), because a three-glyph cell has no
  room for the sentence a delete needs.
- **What a row is stays at the left edge** (`LEAD_CELL`, `LEAD_HEAD`): the first data
  column — a record's `Name`, a sentence's words, Karuna's `Symbol` — is pinned, because a
  table wider than its room otherwise scrolls away the one thing that says which row a
  reader is on. Two pins, one per edge, and both take the row's own fill (`bg-inherit`) so
  the pointer's highlight travels with them: **a sticky cell that does not inherit the fill
  shows the columns sliding under it.**
- **A commit validates the whole draft before it writes the first row.** Every write in
  `commitDatabaseDraft` is its own transaction, so a refusal in the middle leaves the rows
  before it stored — a point made on the spot surviving the sentence written for it, and
  the screen saying only "Save failed". The draft's own rules run over it first
  (`requireText`), and the same shape is the rule for any screen that writes several rows:
  it must be able to say the whole change is writable before the first one lands.
- **A seeded row added after the first release is minted from its own slot.**
  `seeded-ids.ts` holds `nid`, `seeded-points.ts` and `seeded-bindings.ts` hold round 21's
  rows, and **both the seed and the Dexie repair import them**, so the two cannot mint
  different ids for the same row — id-keyed sync would duplicate it rather than merge it.
  A new seeded row goes at the **end** of its list: the seed numbers its entries in the
  order it plants them, so a row inserted in the middle moves every id after it.
- **A glyph is drawn in `currentColor`.** Where the app paints an accent on a picture
  (`FocusVisuals`, `focus-glyphs.tsx`), the accent is set once as `color` on the region and
  every stroke inherits it — an accent is **ink**, never a fill, and a component that
  hard-codes a colour cannot take the reader's own. Reduced motion is a prop, not a class
  the CSS never reads.

## The Database screen (owner's design, 2026-09-18)

The screen landed 2026-09-18 (`afd48d6`, one squashed commit); what the build did
and where it deviated is in [HISTORY.md](./HISTORY.md), and the owner's calls are in
[DECISIONS.md](./DECISIONS.md). These rules override the library rules above wherever
the two disagree.

**It is a destination, not a tab** (the owner's round 15, 2026-09-19): `/database`,
in the nav bar between `Library` and `Settings`, so the store sits beside the
screens it feeds rather than inside the one that browses it. The library keeps no
tab for it, and nothing on the library writes. A request travels in the address —
`Add` on a type's tab is `/database?mode=add&table=meditation:<typeId>`, a record's
`Edit` carries its id — so the grid can be linked to, reloaded and handed a row to
fill in; `apps/web/src/features/database/database-route.ts` builds and reads them.
**The address is read once, and only once the store has arrived**: a type's table is
one of the store's *rows* (`database-tables.ts`), so the query cannot be validated
until `view` is in hand, and the search string is recorded as it is spent — a second
`view` would otherwise re-read the same `?mode=add` and add a second row.

**The Database's tables and the library's tabs are generated** (same round). One
table per live type, in `sortOrder`, then Entries, Symbols, Presets, Affirmations and
**Types**;
the library draws one tab per live type, then Symbols, Archive, Audio files, Presets,
Plans and History. The ids are namespaced — `type:<id>` for a tab, `meditation:<id>`
for a table — so renaming a type moves its label and nothing else: the stored
`meditaur:libraryTable`, the scroll memory and a `?table=` all survive it. A type's
meditations are a **filter over the one meditation list**, not a second store: which
table a meditation is in *is* its `typeId`, so there is nothing to keep in step, and
a grid answer is written back into that type's own subset so one table's save cannot
reindex another's order. `parseDatabaseTable` opens a plain `/database` on Entries
and answers the retired `focus` id (and a type since archived) with the first live
type's table.

The **Types** table is a real, visible table (§12.6): a row per type, its name
editable in the grid, its order draggable, archiving and Restore through the Archive,
and no custom columns of its own — a type's columns are its *meditations'* columns
(§12.4). Archiving a type steps aside the type row alone; its meditations become
unreachable because no live type draws a tab or a table for them, which is the
visibility rule doing the work rather than a second bookkeeping pass. Removing a type
is permanent and runs the `deleteMeditation` cascade for each of its meditations
(`deleteMeditationType`), and its impact sentence names them.

**An intention is one sentence, and the Affirmations tab is a view over it** (the
owner's round 16, §2.1). `Intention = { id, workspaceId, entryId: string | null,
sortOrder, text }` in `packages/domain/src/models.ts`; `entryId: null` is an
**orphan**, which is exactly what the Affirmations tab lists until something is
associated with it. `Affirmation` and its Dexie table are gone — Dexie **v23** moves
its rows into `intentions` as orphans rather than dropping them, and
`20260920120000_intentions.sql` does the same in SQL. The `FieldScope` name
`"affirmation"` **stays**: the tab is still called Affirmations and its columns are
still its own pool, so keeping the literal cost no migration of a stored union.
Three consequences, and each is a place a future column has to be added:

- **A sentence's leading cell is its `text`, never `name`.** A `name`-keyed cell
  writes `builtins.text`, and `commitRecords` drops a record with no name on save —
  the row would vanish after `Saved.` `RESERVED_BY_SCOPE.affirmation` is what keeps
  a custom column's key away from the table's own field names.
- **A block reads its own meditations' sentences.** `CompiledBlock.affirmations:
  string[]` is filled at compile time from the live intentions of the block's own
  meditations — all of them, in the block's order, since round 22 — in `sortOrder`,
  symbol-carrying rows included — so a Protection stage reads Protection's sentences rather
  than every sentence in the workspace. A snapshot keeps saying what the session said even if
  the reader edits afterwards, and nothing references a sentence by id, which is why removing
  one takes nothing else with it.
  The same rule governs the intentions table: `focusIntentions` is every point's own lines
  (the ones with no symbol, which read first and carry no label), and `symbolGroups` holds
  **one group per symbol the block's points share**, each with every point's lines for it —
  a symbol two points have in common appears once.
- **The tab and a meditation's own cell are one list.** A sentence is a draft line
  with a nullable `entryId`, so the Affirmations tab, a meditation's Intentions cell
  and Karuna all draw it — and an edit in one shows up in the other.

**The seed is Thanks Giving too** (round 15, 2026-09-19). `buildDefaultWorkspace` mints a Thanks Giving
row — `THANKS_GIVING_TYPE_ID`, one 3:00 affirmations stage, **no preset** (binaural
is off for the kind, so a preset would name a sound it never plays) and no location —
and the seeded plan is **`Chakra circuit`**: Thanks Giving, the seven chakras in
order, Thanks Giving. Protection, Liver and Kidneys stay as rows and are no longer
blocks of it. No affirmations are seeded: the owner gave no text, and a sentence the
reader did not write is not one they should be asked to repeat. A stored plan keeps
whatever it held — the new circuit is the *seed*, not a migration of the reader's own
plan.

- **The Database is data only.** No column picker, no pinning, no hiding, no
display settings of any kind live in it. What is shown during a session is the
plan's `display` setting, and the plan page is where it is chosen.
- **Every object has a drag handle and keeps its order** — chakra rows, symbol
rows, entry rows, intention lines, and columns. A drag redraws before it writes,
the way `SortableRows` and the planner's strip already do. A row keeps an explicit
`↑`/`↓` beside its grip (§12.30), the keyboard sensor is the third path, and the
column header as a handle is the part the owner deferred — a column's place comes
from the heading `+` inserting where it is pressed.
- **The heading `+` inserts there; the trailing `+` appends.** On a computer it is
quiet until hover or keyboard focus; on a phone it is always visible and light,
which is the trade the one-time hint exists to offset (§6.5). A row's own `+`
inserts a row, an output column of the entries table can carry one before it, and
the empty row it makes is *not stored* — a row with nothing to point at never
reaches the store.
- **A chip offers two things when acted on** — `Open record`, for the chips that
point at one, and `✕ Clear`, which clears that reference and nothing else (§4,
§6.2). There is no "choose another": clear it and type again. An unmatched name in
a reference or `select` search bar offers the context-aware create, and what it
makes is chosen for the cell that asked; the new record goes to the store while the
cell's value still waits for Save.
- **One rule covers archiving:** an item is visible only if it and every record it
references are live. Archiving a chakra therefore hides its entries, their lines
*and the plan blocks that use it*, with no bookkeeping and no "removed from 2
plans" to undo; Restore reveals them again. Permanent deletion happens only on the
Archive page.
- **`X` has five levels, and the level decides what it touches:** a reference chip
clears that reference and nothing else; a line, an entry row and a record row each
open a box naming what goes; a column header can be removed only while the column
is empty, and the control is not drawn otherwise. Archive is a single tap; Remove
is the armed, two-press control — the same `armed.ts` pattern as everywhere else.
- **The Database is the one screen where leaving discards.** Cells land in a draft,
Save commits it, and leaving loses it — the opposite of
`saveDraftThen`/`EditorChrome` everywhere else, which is why the screen carries a
confirm-on-leave. Its exit is a nav press as well as its own `Back`, so the flag
and the question live outside React in
`apps/web/src/features/database/database-guard.ts`: the screen publishes
`setDatabaseDirty`, and `AppNav` refuses a press that `confirmLeaveDatabase()`
declines — leaving by the nav bar asks exactly what `Back` asks. Its save report names the rows the orphan sweep archived, up to
five. `Esc` on this screen goes back through the same door as its `Back` button,
and one press never does two things: a cell that has the press stops it before the
screen's own listener on `window` can see it (§12.25).
- **A new column is usable everywhere at once**: the grid, the record's page in the
library, and every meditation's Display section, with nothing to register.
- **The Display is what a session shows** — per meditation, with the plan's answer
as the default a block that has never been changed inherits. A column is shown or
hidden and pinned or not, and **a column cannot be pinned while hidden** — pinning
it shows it (in `setDisplayColumn`, not in the panel). The pin reaches the session
through `CompiledFact.pinned` (`SNAPSHOT_SCHEMA_VERSION` 5), where a pinned column
sits in the box's sticky band with the chakra's or the symbol's name and the rest
scrolls away with the lines. A **record's own editor keeps its draft** across the
handover to the binaural config or the default-sound picker: the shell writes it
first (`registerSave`), because those screens come back with a `Back`.
- The reference and `select` cells follow the ARIA combobox pattern. There is no
native `<select>` (the rule above stands), which means the accessibility is built
by hand rather than inherited.
- **The grid is one surface, and its controls are quiet.** A card
(`rounded-2xl border border-line bg-surface`) with a header band, a
`border-line/50` hairline under every row, and a `bg-surface-raised` hover that
the pinned lead cell follows via `bg-inherit`. A cell is **text at rest** — no
border, no fill — and paints `bg-bg` with a `ring-2 ring-accent/40` only when it
has the press. `REVEAL` (`DatabaseCells.tsx`) hides a control until its row (or
its own line) is hovered or has the keyboard, and only `pointer-fine` hides it at
all: a phone draws it always, which is what the one-time hint offsets. Neither
rule may be "fixed" back to an always-drawn box or button — the owner's round 13
is that review, and `tests/e2e/database.spec.ts` asserts both as computed style.
`opacity`, never `display`: a row's geometry must not move under a gesture, and
the grid's own drag tests read a handle's box before it is hovered.
- **A table column is sized by naming the *others*.** In an auto-layout table a
  `w-full` column resolves against the table's width and the table grows to
  500000px; `BUILTIN_WIDTH` names the narrow ones and the wide one takes the rest.
  The table is `min-w-[40rem]`, not `min-w-max` — a max-content floor kept it
  wider than a 1024-wide laptop, so it scrolled sideways with room to spare.
- **A column is added in place, and an unnamed one is not stored.** `＋` inserts a
  `DraftColumn` with an empty heading, so the grid renders a heading text box and
  editable cells immediately; `ColumnHeading` takes the keyboard on arrival and
  `renameColumn` mints the column's `key` from the **first** heading written (never
  again, or a plan's pinned column would be stranded). `commitDatabaseDraft` skips
  a column whose heading is empty, exactly as it skips a row with nothing to point
  at. A column's type, its reference target and its description live in
  `ColumnMenu`, behind the chip on its own heading line — there is no add-column
  form, and `＋` alone is the whole gesture.
- **A record row is added in the grid too.** `addRecord` puts an unnamed record in
  the draft, the row's name cell takes the caret, and `commitRecords` skips a
  record with no name. Only **presets** open a page (`Add preset`, the grid's
  `New preset`, and a preset row's `Open`), because a preset's sound is the point
  of it. A chakra's `Picture` / `Default sound` / `Binaural` and a symbol's
  `Picture` are *columns* of their table, not fields of a page.
- **The library routes into the Database, it does not open a page.** `Add` on a
  type's tab, `Add symbol` and a browse sheet's `Edit` call `goToDatabase`, which
  navigates to the Database with the table in the address and hands the tab a
  `DatabaseRequest`; the tab lands on the right table, adds a row or takes the
  caret to an existing one, and reports the request handled. `Tune` (in the
  `Default sound` cell, beside the preset it tunes) is the one door out that is not
  leaving: the shell writes the grid's draft before the config screen replaces it.
- **A `data-table` attribute names the kind of grid, not the generated id.** A
  type's table is a meditation table whatever type it belongs to, so the attribute
  stays `focus` while its rows and columns do not; `data-type-id` carries the type.
  Tests scope on the pair, which is what keeps two type tables apart.
- **One floating panel at a time, and looking away closes it.** `useFloatingPanel`
  is the one home for it: a second panel stands the first down, a press outside
  closes the panel *and* blurs the cell, and `Escape` is handled in the capture
  phase so the same press can never reach the screen's own "leave the Database".
- **A picture chosen just before `Save` is part of that `Save`.** A file input's
  `onChange` starts an asynchronous asset write and React commits its patch later
  still, so `DatabaseTab` keeps the in-flight patch in `pendingPicture` and applies
  it inside `save()`. Without that, clicking `Save` straight after choosing a
  picture stores the row without it — the race `DatabaseRecord` already carries a
  fix for.

## What the guards keep still (2026-09-24)

Two rules about the code's own size, both kept by a source-text guard in
`tests/unit/architecture/`, in the shape this repo already uses for a number that
may only fall — `ALLOWED_SECTION_CITATIONS` in `item-ids.test.ts`, the
`withoutDeleted(` floor in `sync-marks.test.ts`. Raising one of those numbers is
allowed, but only as a deliberate line in a commit that says why, never as a side
effect of an edit.

- **A file that has outgrown one reading has a ceiling.**
  `tests/unit/architecture/file-size.test.ts` caps `DatabaseTable.tsx`,
  `create-app.ts`, `Planner.tsx` and `Runner.tsx` where they stand, and the cap
  may only fall. Splitting one of them is a different question with its own
  register row (`P3 · 50`); the cap is what stops that question getting worse
  while it waits.
- **Where `packages/ui` has a control for the job, use it.** A raw `<button>`
  under `apps/web/src/features/**` that is not on
  `tests/unit/architecture/ui-primitives.test.ts`'s named list is a defect, not a
  style preference. Each entry on that list carries its own reason, and the list
  may only shrink (`P4 · 51`).
