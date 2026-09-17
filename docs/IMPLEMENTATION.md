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
- Every "which one?" is `PickerPage`, and its **text bar is the control**, not a
  filter decorating a list: typing narrows the options (label and hint), `Choose`
  or Enter commits an exact name — or the single remaining option — and a name
  that matches nothing **chooses nothing** and shows the message. Never fall back
  to the nearest match: silently pointing an intention at the wrong symbol is the
  failure this shape exists to prevent. Option rows truncate (`truncate` on the
  label and hint spans); the Button base is `whitespace-nowrap`, which is what
  used to let a symbol's usage paragraph spill out of its row.
- Run-mode primary controls are at least 64px (`min-h-16`). Keyboard: Space pause/resume, ArrowRight skip, Escape end.
- A screen only claims a key that works *there, now*. The run screen's legend (`KeyHints`, `packages/ui`) draws keys as keys and lists only what is live — `Space start` before the first block, `→ skip` only once skipping does something (it used to promise a skip that was a silent no-op at `loaded`), `Esc end` always. Every screen left by Escape says so with the same component: `EditorChrome` and `PickerPage` carry `Esc back`. **The legend sits with that screen's primary action, in the bar that survives scrolling** — the run screen's footer, `EditorChrome`'s sticky bar beside `Save`, and, where there is no bottom bar, the row holding `Choose`. Never beside the title (owner's round 8).
- A choice inside a form is a control, not page furniture: `TileGrid`'s `sm` size (a wrapping row of 44px buttons) for a fixed few choices in a section, `md` only when the choice *is* the screen. The chosen tile carries `aria-pressed`, so selection is not colour alone. The intention editor's `Associated with` still uses `md` — queued in the review log, not forgotten (owner's round 8).
- A card that is dragged and let go is **placed, not animated**: `SortableRows` (`FocusManage.tsx`) marks the row that was just dropped and renders it without a transition, because dnd-kit gives the lifted row `transition: transform 200ms` on release and animates it from the release point into its slot. That is only half of it: the list has to be in its **new order in the same commit as the release**, which is why `reorderBindings`/`reorderIntentions` redraw the list before the write and why the rows are keyed by id. With a lagging list every row travels twice — back to where it came from and then to where it was dropped — and a row whose transform is reset while its place in the document changes animates from a slot away, which is the shuffle. Both release tests sample **every** row's top edge every animation frame (`tests/e2e/library.spec.ts`), not only the dragged one: the rows it displaced are where the shuffle lived (owner's rounds 8 and 9: "it should just magnetically get fit, the card in it's place already shifts down automatically").
- The current block's length is editable, and the reader's choice is the session's: `SessionEngine.setBlockDuration(ms)` moves the block *and* what is left of it (a paused block shifts by the same difference), and `MeditaurApp.saveSessionBlockDuration(workspaceId, instanceId, blockIndex, ms)` writes the stored snapshot so a reload keeps it. The runner updates its own `blocks` copy too — the completion log sums them. Editing a focus point's *default* length is still the library's job, not the run screen's.
- Durations are set with the alarm-clock wheels (`TimeWheel`/`TimeWheels`, wrapped for the app as `DurationSteppers`): the wheel turns with the mouse wheel, a trackpad or touch **and** with a drag, and a press without moving types the value. They replaced `−`/`+` steppers everywhere a duration is set — a plan card, a focus point's default, the run screen. `Stepper` remains for numeric values that are not minutes and seconds (Hz, gain, dB, fades).
- **Nothing writes the wheel's offset while the reader is turning it, and the wheel is put on a row when it stops.** The offset is written during a gesture only where the value came from outside it — a typed value, the minutes column moving the seconds, the drag, which owns the offset itself. A mandatory-snap scroller that is written to mid-momentum loses the gesture it was in the middle of, momentum and pending snap included, and then rests wherever the last finger movement left it. A gesture is "quiet for `SETTLE_MS`" rather than "ended", and that quiet ends by writing the row the value names: it is the wheel's own guarantee, for the browsers that do not snap momentum and for a screen that refused the value (owner's round 9: "often lands between two digits, or lands slightly above or below the marked line"). `tests/e2e/plans.spec.ts` places the offset between two rows with the browser's own snapping off, which fails without the settle.
- The wheel is a **scroll container**, which is what makes it turn natively at all: `overflow-y-scroll`, one fixed-height row per value, `scroll-snap-type: y mandatory`. Do not go back to a stack of numbers plus a hand-rolled drag — that is the shape the owner's round 7 rejected ("it is not scrollble on web"). Its geometry is `packages/ui/src/wheel-math.ts` and the scroll offset *is* the value, so **never render a neighbour row conditionally**: a value at its minimum used to lose the line above it, collapse, and hang ~24px above its neighbour ("seconds is dangling above"). The window is always `TIME_WHEEL_ROWS` rows at a fixed height (`sm` 36px, `md` 52px); the arithmetic is unit-tested in `tests/unit/web/time-wheel.test.ts`. The column must not be `touch-none` (a finger pans it; only the page drag would be the bug) and `TimeWheels` draws **one** band across both columns, which is why there is no `:` between them. The indicator is hidden by `.time-wheel`, a rule in `apps/web/src/app/globals.css` — a class `packages/ui` names and only `apps/web` defines, so it is pinned in `apps/web/src/lib/ui-package-classes.ts` like every other class that package names.
- Optional TTS for intentions is a setting (off by default). It does not replace on-screen text.
- Alarm ducks binaural (does not stop it) unless `stopBinauralOnAlarm` is on. Alarm still bypasses EQ. That flag is a **preference only** (owner's round 5): `Plan.stopBinauralOnAlarm` is gone, `compilePlan` takes it as a `CompileOption` that `compileAndStoreSession` fills from `ports.preferences.get(userId)`, so the Settings switch is the one a session obeys. The planner must not grow a second switch for it.
- Binaural plays only when both switches agree: `Plan.binauralEnabled` (the plan-wide default, on the planner) and the block's focus point's `binauralEnabled` (in the library's focus editor, or in its binaural config screen). Either one off is silence for that block, and that is deliberate — a chakra can stay configured with a preset while being switched off. A block whose `binauralPresetId` is explicitly `None` stays silent too; compile never falls back to a preset the reader did not pick.
- Every binaural control lives in **one** body: `apps/web/src/features/binaural/BinauralBody.tsx` (ear switch, tone rows, fades, EQ bands, optional band tiles, and a `preview` slot for the caller's buttons). The preset editor renders it inline under the name, a focus point's `Open binaural config` renders it over a draft, and `/tuner` renders it over a live preset. Do not copy the markup into a fourth screen: the two copies that existed had already drifted — the config screen passed an EQ band's *index* where `setBandGain(eq, hz, gainDb)` wants the frequency, so one slider moved another band. `Duplicate` belongs on the preset *card*, not inside an editor; a preset editor has no `Open tuner` button, because the tuner is already on it.
- The plan strip's cards are a fixed `w-52 min-w-52` (the app's root font is 18px, so that is 234px), with the card's name as the drag handle and `Remove` beside it. The handle says `Focus`/`Cool-off` and nothing else: the words `· drag` were removed on the owner's round 5, because every card said the same word and it set the card's width. The drag instruction lives in the handle's `aria-label` (`Drag focus block`) instead.
- Do not flatten the product into a fixed 12-stage list, Vite+IndexedDB-only, React `useReducer` session, or `StereoPannerNode` binaural. Those contradict this architecture.
- Local `./scripts/meditaur check` (and `dev` / `build` / `setup` / `exec`) runs in `infra/Dockerfile.tools`. Docker is required on the operator machine. Do not download Node into `.tools/` or `~/.local`.
- The Supabase CLI (`./scripts/meditaur up`) is the only host tool the workflow may ask for, and it stays optional. There are two live targets and the tests say which one they are using: `SUPABASE_TARGET=hosted` reads `SUPABASE_*`, `SUPABASE_TARGET=local` reads `SUPABASE_LOCAL_*`, and `./scripts/meditaur test:integration:hosted | :local | :both` sets it (see `tests/fixtures/supabase-target.ts`). `:both` runs the hosted project and the stack **concurrently inside one container** — they share nothing, so there is no reason to pay two container starts — and every live run also prints whether the stack is answering, so `host.docker.internal` has a visible answer even when only the hosted target is exercised. `:local` and `:both` take the stack's keys from `supabase status -o env`, so nothing has to be copied into `.env` by hand; an explicit `SUPABASE_LOCAL_*` trio still wins when the CLI is absent. A named target that is not configured **fails** rather than skipping — that is what keeps a local run honest, because `.env` can hold the hosted project and the run would otherwise go green against production. `scripts/in-docker.sh` forwards both trios from the shell or repo `.env`, and `compose.tools.yaml` maps `host.docker.internal`, so the local trio's URL is `http://host.docker.internal:54321` (inside the container, `127.0.0.1` is the container). Do not add another host tool, and do not run the live suites from the host.
- Secrets live in exactly two ignored places: `.env` (mode `0600`, operator-written) and the Supabase CLI's own state under `supabase/.temp/`. Never paste a key into a tracked file — `tests/unit/architecture/integrity.test.ts` scans the tree for JWT-shaped and `sb_secret_` / `sb_publishable_` values and asserts those ignore rules, so a leaked key fails `pnpm check` instead of being noticed later. The service-role key never reaches the browser: `NEXT_PUBLIC_*` carries the anon/publishable key only.
- `pnpm check` remains the command *inside* that container, and the CI check job. GitHub Actions must not require Docker for `pnpm check` and must not bootstrap `.tools/`.
- `pnpm check` is `typecheck` (each package + `apps/web`) + `typecheck:tests` (`tsc -p tests/tsconfig.json`) + `lint` + `test:unit`. Tests are typechecked on purpose: they import app code by relative path, so a stale import or a bad fixture call otherwise only fails at runtime. Do not drop `typecheck:tests` from `check`.
- `pnpm check:full` is the in-container gate: `check` + `test:integration` + `build`. It must not require Docker or Supabase — with no keys configured the hosted half skips itself, which is why CI needs no secrets. The whole gate is `./scripts/meditaur check:full`: it starts the local stack (`up`, idempotent, and it re-applies this checkout's migrations so the local half tests the schema that is actually in the tree), runs **both** live databases at once in one container, then builds and runs e2e. That is the occasional pass; the edit loop stays `./scripts/meditaur check`. Supabase became worth gating as soon as there was a database to be wrong about: the live half is no longer "skipped unless an operator remembers".
- Every GitHub Actions **check** job calls a root `pnpm` script. The e2e job builds `infra/Dockerfile.e2e` (BuildKit `gha` cache) then runs `./scripts/e2e.sh`. Do not add a third way to invoke Playwright.
- Markdown is not a build input, and neither is anything already deployed. Enforced by the toolchain, not by an agent rule: every `.github/workflows/*.yml` `pull_request`/`push` event sets `paths-ignore: "**.md"`; Git-connected Vercel runs `scripts/skip-build-if-md-only.sh` via `git rev-parse --show-toplevel` (`vercel.json` `ignoreCommand`: exit 0 skip, exit 1 build — never 127). That gate asks *what changed since the last deployment*, not *what the tip commit changed*: the range is `$VERCEL_GIT_PREVIOUS_SHA` (the last deployed commit for the project and branch, fetched on demand when it is older than Vercel's ten-commit clone) → `HEAD`, falling back to `HEAD^` only when there is no deployment to compare against. `HEAD^ HEAD` was the bug — a code commit with a docs commit pushed over it read as docs-only and the deploy was cancelled, leaving the previous code live. Documentation is markdown anywhere **or** anything under `docs/`; every other path builds. `.dockerignore` and `infra/Dockerfile.e2e.dockerignore` exclude `**/*.md`. `tests/unit/architecture/deploy-gate.test.ts` runs the real script against a scripted git; `integrity.test.ts` enumerates workflow files and pins the command. Do not add a paths-filter Action.
- Clone toolchain is `./scripts/meditaur setup`. Node and pnpm live in `meditaur-tools:local` (`node:24.20.0-bookworm-slim` + Corepack pnpm 10.17.1). `.tools/` holds only pnpm/corepack caches written by that container (it is that container’s `HOME`). `node_modules/` is on the bind mount so the editor can resolve types. Do not put Playwright browsers in `.tools/` or in `Dockerfile.web` or `Dockerfile.tools`.
- `./scripts/meditaur e2e` runs Playwright in `infra/Dockerfile.e2e` (`meditaur-e2e:local`). Chromium is installed in that image’s `deps` layer so source-only rebuilds do not download it again. The preview image stays slim.
- `infra/Dockerfile.web` must run `next start` with `/app/apps/web` as the working directory (that is where `.next` is copied) and must copy `apps/web/next.config.ts`, which the runtime redirects live in. `preview` verifies HTTP 200 before it reports the URL. Starting Next from the monorepo root is a bug, not a config choice.
- Do not put `store-dir` in committed `.npmrc` — that breaks GitHub Actions `cache: pnpm`. The tools container sets `npm_config_store_dir` to `/app/.tools/pnpm-store`.
- CI `pnpm check` uses `actions/setup-node` + `pnpm/action-setup` with `.nvmrc` **24.20.0**. That job must not bootstrap `.tools/` and must not require Docker.
- CI e2e builds `infra/Dockerfile.e2e` with BuildKit GitHub Actions cache (`scope=meditaur-e2e`). It does not run `playwright install` on the runner.
- `dev`, `build`, `preview`, and e2e must clear leftover Compose containers (including the `meditaur-tools` one-off `run` container, which holds port 3000) and last-run reports. `preview` rebuilds `meditaur-web:local` using Docker layer cache. Do not `docker system prune`. Do not `--rmi` on down. Do not wipe `node_modules` or `.tools` on every iteration.
- Keep the `apps/` + `packages/` + `infra/` + `scripts/` + `tests/` layout. Production code stays in `src/`; tests stay in `tests/`. Do not flatten into a single `src/screens` tree.
- Wellness tool, not a medical device.
- Catalog deletes **cascade**, they do not refuse. `deleteFocusPoint`, `deleteSymbol`, `deleteBinding`, `deleteFieldDef`, `deletePreset`, `deleteTableView` and `deleteMediaAsset` run inside `ports.runInTransaction` and remove or clear every reference. Only three refusals survive: `keepOnePlan`, `keepOnePreset`, `keepOneTableView` — a workspace always keeps one of each. Empty custom field values delete the row instead of storing blank text.
- The binaural tuner lives at `/tuner` and loads `?preset=<id>`. `/dev/tuner` redirects there. Library owns preset add/rename/delete; do not treat `getFirstPreset` as the product edit path. `/tuner` renders inside the AppNav shell but has no nav entry — `AppNav` links are exactly Plan, Library, Settings, Account. That is deliberate, not an oversight; a tuner entry needs an owner decision.
- A binaural draft is a `sessionStorage` key per focus point, so a deleted focus point would strand one for the rest of the tab. `pruneBinauralDrafts` sweeps them on every library load, which is the only moment the live set is known.
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
- Catalog JSON includes names, plans, presets, and media blobs (base64). Schema version is 3. Restore merges by id in one Dexie transaction, upserts blobs, and keeps extras. A v1/v2 file backfills bindings and focus-scoped intentions. A file without `blobs` is `{}`. Do not add a zip library.
- Domain and application throw `AppError { code, message }` via `fail`. UI branches on `code` and shows `message`. Do not `throw new Error(string)` from those packages.
- The Lobby's Start session and the planner's Start session both call `startSession` → `compileSession`. Focus tiles call `startSessionFromFocus` (reserved Focus session plan, `symbolScope: "all"`) then the same `compileAndStoreSession`. A live session stays on that `instanceId`. Do not add a second compile engine or a second start button. The planner's button said `Load` until 2026-09-16, when the owner renamed it — `Load` never said what it did.
- `compilePlan` throws on a block that points at a missing catalog id. Dexie plan rows must parse as `PlanBlock[]`.
- Planner autosaves so Start session compiles the on-screen plan.
- Session completion logs use `ports.clock`, not the runner’s `Date.now()`.
- Tuner/runner mixers: `resume` suspends the other scope. Volume is `AudioPort.setMasterVolume` / `setAlarmVolume`.

## Review-derived rules (2026-09-15)

[ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md) is the forward plan; these
rules come out of it and are binding from here on.

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
- A migration is additive and re-runnable: give a constraint a name, `drop
  constraint if exists`, then add it. Never edit a migration that has been
  applied — a database that already ran it will not run the edited version.
- Seed/bootstrap ids are deterministic (`LOCAL_USER`, `LOCAL_WS`, `nid()`); never
  mint seeded rows with `crypto.randomUUID()`. Every row of the default catalog
  obeys this, intentions included, and the default-workspace test builds the
  catalog twice and compares every id (review M4).
- Every use case that takes an id is workspace-scoped. Never read or write across
  a workspace boundary.
- Analytics is first-party: a domain event port plus an `events` table. Do not
  add a third-party analytics SDK — the dependency allowlist still applies.
- Identity flows only through `AuthPort`. Exactly one module may import
  `@supabase/supabase-js` — `packages/db/src/supabase.ts`, the module behind
  the port. Session expiry is deadline-based through `Clock`; never `setInterval`.
  With no session the app stays Dexie-only: `/plan`, `/run`, `/library`, and the
  tuner must keep working exactly as they do without an account.
- The runner's cross-tab lock is scoped to the signed-in user
  (`runnerLockKey(userId)`), not to the browser profile: two people can be signed
  in on one device, and one must not block the other. Read the scope at call time
  (the release also runs from an unmount-only effect).
- An editor's save must join on a picture upload that is still in flight and merge
  the asset id itself — see `saveSymbolNow`/`saveFocusPointNow` in `Library.tsx`.
  A file input's `onChange` writes asynchronously and returns at once, and React
  commits the updated screen asynchronously too, so neither waiting nor re-reading
  the reactive value is enough: the asset id has to come from the promise, and it
  has to be scoped to the entity it was chosen for.
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
- Chakra hues come from the static name→hue map in `packages/ui/src/accents.ts`,
  keyed by the seven seeded names, with `FocusPoint.colour` as the only override
  (`accentForFocusPoint`, painted through `accentStyle`). This needs no schema or
  seed change — and "Hara" is not renamed.
- Buttons are `Button` (`tier` × `size`). Placement is fixed: back/context nav is
  a tertiary button top-left, the screen's one primary action lives in the sticky
  bottom bar (`EditorChrome`'s `actions` slot), secondary actions sit inline with
  their content, and destructive actions sit at the bottom of the section they
  remove. `tier="destructive"` always carries the trash icon, and the confirm step
  is the in-app arm/confirm pattern — never a native `confirm()`.
- Run-mode controls stay at or above the 64px floor (`size="xl"`); `LatchButton`
  keeps its 64px outer target even though the visual switch is smaller, and keeps
  its name, props, and `aria-pressed`.
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
  6–8). Pressing a card or any cell of a table row opens the entry's own page —
  `CatalogCard`'s full-card `onOpen` target, `CatalogDataTable`'s row `onClick`
  (with the name cell keeping a real button for the keyboard) — and what that
  page shows is display only: `FocusSheet` and `SymbolSheet` carry no `input`,
  no switch and no remove, only `Edit` in the bottom bar. Every management
  control over *other* rows (attach/unbind symbols, add/edit intentions, custom
  fields, `Open binaural config`) lives in the entity's editor: `FocusManage` is
  the editor's second half. Do not put an editing control on a sheet, and do not
  give a card an `Open` button — the card *is* the open target.
- Reordering a focus point's symbols or intentions is a **drag**, not a
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
- The section view is **one `Table` switch** (`LatchButton size="sm"`), never a
  pair of buttons, and it is rendered only in the sections that have a table
  (`LIST_MODE_TABS`). The per-section choice is remembered per tab in
  `sessionStorage`.
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
- Do not put a keyboard shortcut in a label unless a handler exists for it. The
  planner's cycle control said `Cycles (Z)` for months with no `Z` handler
  anywhere; the label is now `Cycles`.
- The run screen's merged symbol cell shows the symbol's picture beside its name
  when it has one. `CompiledSymbolGroup.imageAssetId` is the asset the picture
  comes from; a stored snapshot without it simply reads as no picture, and
  `SNAPSHOT_SCHEMA_VERSION` is bumped for shape changes even though nothing reads
  the value yet.
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
  stacking bare labels; the owner's round 6 asked for the focus point, symbol and
  intention editors to be one shape, and their action buttons are `sm` — a row is
  a row. The screen's own primary action stays `lg` in the sticky bottom bar.
- **A custom field is named by its heading, in the editor as well as in the open
  view.** The reader types `Heading` and `Description` and nothing else:
  `FieldDef.key` is derived from the heading by `fieldKeyFor` (application layer,
  on the first save) and then never changes, because it is what a table view's
  `columnKeys` name and what a stored value is keyed to. A heading that collides
  with a built-in column or another field of the same pool gets a numbered suffix
  rather than a refusal. `CustomFields` is the same component on a focus point's
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
  `apps/web/src/lib/screen-scroll.ts`, keyed by `screenId(screen)` (plus the
  active tab for the list), restores a screen's position when the reader comes
  back to it and starts a screen they have not seen at the top. The library's
  screens are state, not routes, so nothing else tracks this: without it, a nested
  intention, a picker or the binaural config sent the reader back to the top of a
  long editor. It records on scroll rather than on the way out, because by then
  React has rendered the next screen and the browser has clamped the offset.
