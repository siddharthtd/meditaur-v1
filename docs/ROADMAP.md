# Roadmap

Status **2026-09-16**. Work one item at a time. Merge only after that item’s tests pass. Do not start REST/gRPC, native apps, streaming music, or a brand rewrite.

Checkboxes: **[x]** landed in this workspace. **[ ]** not started. This file is **done vs next**; the coding contract is [IMPLEMENTATION.md](./IMPLEMENTATION.md). The 2026-09-15 [architectural review](./ARCHITECTURE_REVIEW.md) is the findings record and the ordering rationale — statuses live *here*, not there, because keeping them in both is what let the two documents drift. **Phase 0 landed 2026-09-15** (all four critical fixes plus the drift test), **Phase 1 (accounts) landed**, and **Phase 4 (the UI redesign) was brought forward by the owner and landed in full**, including the owner's round-4 queue (cascading deletes, read-only open views, drag reordering, the typed picker). Everything still open is either blocked on a hosted Supabase project or listed as a deliberate deferral at the foot of this file.

Every landed bullet below is covered by `./scripts/meditaur check:full`
(typecheck, lint, unit, integration, build, e2e). That is the definition of done here.

## Landed (do not rebuild)

### P0 — the session is editable

- [x] Per-block library picks
- [x] Plans as first-class (create / switch / delete, keep one)
- [x] Library writes; deletes refuse only the last plan / preset / table view, everything else **cascades** with the damage named on the armed button (owner's round 4 — replaced refuse-delete (no cascade) on 2026-09-16)

### Catalog editors (library gaps)

- [x] Preset CRUD; tuner `?preset=`; refuse only your last preset — deleting one clears block/default references with the impact named on the armed button
- [x] Focus default sound and default duration — PickerPage / mm:ss steppers on the focus editor; picking a focus copies `defaultBinauralPresetId` and `defaultDurationMs` onto the block (block values can still override). No compile fallback for explicit None.
- [x] Table-view editor (built-in columns + custom field keys, row filter)
- [x] Field defs and per-symbol values; empty value deletes the row
- [x] Open views are read-only (`FocusSheet`, `SymbolSheet`): a card, or any cell of a table row, opens the entry to *read* it, and everything that changes it — symbols, intentions, custom fields, binaural — lives in the editor behind `Edit`. Symbols and intentions reorder by drag, not `Up`/`Down` (owner's round 4, `7219e35`)
- [x] Durations are set with the alarm-clock wheels, everywhere (plan cards, a focus point's default, the run screen); the run screen's current block length is editable before and during a run, and the keyboard legend says only what works there (owner's round 5)
- [x] The wheel is a real scroll container: the mouse wheel, a trackpad and touch turn it, a drag still turns it for the mouse, each column is a fixed stack of equal rows so minutes and seconds cannot drift apart, the two columns share one band with no `:` between them, and the indicator is hidden (owner's round 7)
- [x] A choice inside a form is compact (`TileGrid`'s `sm` size, the focus point's `Kind`), the `Esc` legend sits with the screen's primary action rather than beside the title, and a card that is dragged and let go is placed at once instead of animating into its slot (owner's round 8)
- [x] The binaural controls are one body shared by the preset editor, a focus point's config and `/tuner`; `Duplicate` sits on the preset card (owner's round 5)
- [x] A custom field is named by its heading: the form asks for a heading and a description, the key is derived (`fieldKeyFor`) and never re-derived, and the open views show each value under the field's own heading instead of one `Custom fields` heading. The symbol's editor has the same custom-fields section the focus point's has (owner's round 6)
- [x] One editor shape — `EditorSection`/`EditorField` — for the focus point, symbol and intention editors, with `sm` section actions (owner's round 6)
- [x] A card opens the entry from anywhere on it, the action row included, and a screen remembers where it was scrolled to when the reader comes back (owner's round 6)
- [x] The planner's tools sit in their own strip, apart from the focus tiles, and the `Point` group is `Points` (owner's round 6)
- [x] `PickerPage` is one typed text bar everywhere: it filters as you type, `Choose`/Enter takes an exact name or the only remaining option, and a name that matches nothing chooses nothing and says so (owner's round 4, `bdaff8e`)

### P1 — session audio

- [x] Ambient / alarm files (Dexie blobs, size/mime caps, alarm generation token)
- [x] Run-mode Playwright (Start session → Start and focus-tile → Start; no `<select>`; `/run` has no AppNav)
- [x] First visual pass (Plan / Library / Run mode labels; AppNav `aria-current`)
- [x] `textSize` applied on the document root
- [x] Wake lock released; mixer isolated tuner vs runner; plan `revision` CAS
- [x] Snapshot prune on compile (`SNAPSHOT_KEEP_PER_PLAN` = 5)

### Accounts / schema (partial)

- [x] Postgres aligned with Dexie; RLS SQL contract always on
- [x] Live two-user deny **when** URL + anon + service role are set (else skipped)
- [x] Unused `@supabase/supabase-js` removed; npm allowlist + integrity test ([DEPENDENCIES.md](./DEPENDENCIES.md))

### Session GC

- [x] Session-log retention — `listRecent` uses `[workspaceId+completedAt]` and `limit`. `recordSessionLog` prunes to `SESSION_LOG_LIST_LIMIT` (50).
- [x] Delete-plan cleanup — `deletePlan` drops that plan’s snapshots (`prune(id, 0)`) and logs (`deleteForPlan`). SQL FKs cascade.

### Plans

- [x] Duplicate plan — new plan id and block ids; catalog picks copied; name is `{source} copy`

### Lobby / Library shortcuts

- [x] Home **Start session** — compile last plan, open `/run`
- [x] Library **Plans** open `/plan` via `openPlan`
- [x] History shows duration + plan name; tap opens the plan (gone plans error)
- [x] Library remembers the last section in `sessionStorage` for this tab
- [x] Tuner at `/tuner` under AppNav; `/dev/tuner` redirects there
- [x] Catalog JSON download — names, plans with blocks, presets, and media blobs (base64)
- [x] Restore catalog from JSON — merge by id into the current workspace in one Dexie transaction; upserts media blobs; keeps extras; no zip
- [x] Duplicate preset — new preset id; tones cloned; name is `{source} copy`
- [x] Sessions completed this week — one number on History from the recent log page (local Monday week)

### Toolchain

- [x] Pinned Vercel CLI on the deploy job — `pnpm dlx vercel@59.11.7 deploy --prod --yes`. Not a root dependency. (`59.11.8` is not on npm; latest published is `59.11.7`.)
- [x] ESLint 10 — `eslint@10.10.0`, `@eslint/js@10.0.1`, `js.configs.recommended` on. v9 EOL is gone.
- [x] Node **24.20.0** in `.nvmrc` and Docker (digest-pinned). `engines.node` is **24.x**. Vercel dashboard is **24.x**. Action SHAs pinned (checkout 7.0.1, setup-node 7.0.0, pnpm/action-setup 6.1.0, buildx 4.3.0, build-push 7.3.0). Dependabot: github-actions weekly only. `shamefully-hoist=true`.
- [x] Whole gate `./scripts/meditaur check:full` — check + integration + build + e2e, all in Docker. Inside the container `pnpm check:full` is check + integration + build, so it needs neither Docker nor Supabase.
- [x] `preview` serves the built image (`WORKDIR /app/apps/web`, `next.config.ts` copied into the runtime layer) and reports the URL only after HTTP 200.
- [x] `clean-run.sh` stops all three Compose projects, including `meditaur-tools`, so an orphaned `dev` container cannot hold port 3000.
- [x] Optional Supabase settings are forwarded into the tools container, and `host.docker.internal` maps to the host, so the live RLS test can actually run.
- [x] `.devcontainer` builds the same image and uses the same cache env as `compose.tools.yaml`.

### Requirements v2 (landed)

- [x] Focus kind `"body"` → `"point"`; chakra fields (description, governs, colour, element) plus representation image and description
- [x] `FieldDef.entityType` pools for `symbol` and `focusPoint`; `FieldValue.entityId`; an empty value deletes the row
- [x] Symbol image
- [x] `Affirmation` → `Intention`, with a nullable focus point
- [x] Dedicated Focus / Symbol / Intention screens in the `/library` stack; shared `AssociatedWith`; card-or-table views with pool-aware custom columns
- [x] Binaural config screen with a `sessionStorage` draft (try / revert / duplicate / save); `Plan.binauralEnabled` and `FocusPoint.binauralEnabled`; compile and runner skip binaural when either is off
- [x] Dexie v6, SQL migration `20260915000000_requirements_v2.sql`, catalog `schemaVersion` 3 (v1/v2 restore backfills)
- [x] *(The v2 specification itself — `meditaur-requirements-v2.md` — was **retired 2026-09-16**: it is all landed, its own §2 said "not the current state", and its live rules now sit in `IMPLEMENTATION.md` (the binaural toggles, the field pools, the catalog schema), `UI_DESIGN.md` §1.6 (the image frame) and this roadmap. The rationale for each decision is in `ARCHITECTURE_REVIEW.md`, and what the owner asked for is in `REVIEW_LOG.md`.)*

### Local session (do not rebuild)

- [x] The Lobby and the planner share `startSession` → `compileSession`; a live session stays on that `instanceId`
- [x] Planner autosave so Start session compiles the on-screen plan
- [x] Session-log `completedAt` comes from `ports.clock`, not the runner’s `Date.now()`
- [x] Catalog backup includes media blobs; restore merges (keeps extras) inside `runInTransaction`
- [x] `AudioPort.setMasterVolume` / `setAlarmVolume`; tuner `resume` suspends the runner mixer and vice versa
- [x] Library screen split by table
- [x] `compilePlan` throws on a dangling catalog id; Dexie plan reads parse `PlanBlock`
- [x] Throws `AppError { code, message }`; UI branches on `code` and shows `message`

### Spreadsheet session (do not rebuild)

- [x] Workspace `Symbol` + `FocusSymbolBinding`; affirmations keyed by focus and optional symbol
- [x] `PlanBlock.symbolScope` `rotate` | `all`; one-tap session compiles `all` on a reserved Focus session plan
- [x] `/plan` focus tiles (by kind) call `startSessionFromFocus`; the plan's Start session / `lastPlanId` stay separate
- [x] Planner mm:ss duration; Library focus page (focus lines, bind/unbind, pair rows) — since 2026-09-16 (owner round 4) that page is read-only and the binding lives in the editor, with symbols and intentions reordered by drag
- [x] Runner sheet layout from `focusAffirmations` + `symbolGroups`; Start another session → `/plan`
- [x] Catalog backup `schemaVersion` 2 with a v1 backfill; Dexie v5 + SQL migration (superseded by `schemaVersion` 3 / Dexie v6 in Requirements v2)

## Already in the product (do not rebuild)

The planner already has cycles, cycle-until-stopped, New/Save, mm:ss durations,
drag-reorder, autosave, and refuse-delete-last. Settings already cover TTS,
gains, `textSize`, auto-advance, and stop-binaural-on-alarm. Seed creates the
starter plan. Run uses Space / ArrowRight / Escape. The PWA `start_url` is
`/plan`, so installed users never see `/`. Logs prune to 50 and delete-plan
drops that plan’s snapshots and logs. A focus point’s default sound and duration
copy onto the block when the focus is picked.

Do **not** add a second start button on `/plan` — `Start session` is already the
circuit session.
One-tap sessions are the **focus tiles** on `/plan`, not another start button.
Circuits and one-tap sessions share one `compileSession` path; keep it that way.

## Up next (realigned)

The session is complete. The 2026-09-15 [architectural review](./ARCHITECTURE_REVIEW.md)
found four critical defects and the gaps that block the next feature-sets, and
set the order below. Every phase ends with `./scripts/meditaur check:full` green.

**Where this stands on 2026-09-16.** Phase 0, Phase 1, and Phase 4 are done, and
the unblocked work that was left — the two Phase 4 leftovers, review M4 and M7's
visible half, four minor issues, and the SQL union checks — landed on 2026-09-16.
**The hosted Supabase project exists now**: all 14 migrations are applied to it
(the last two pushed 2026-09-17) and real login is verified end to end — the live
suite passes against it (9 tests, 2 local-only skips) and a browser sign-in
reaches `/plan` with the device's workspace adopted and `/account` naming the
user. Phase 2 and Phase 3 were waiting on exactly that
infrastructure; **Phase 2 landed 2026-09-16** — the preference overwrite, the
catalogue row versioning, the `lastPlanId` guard, the read-through bootstrap and
its live coverage. Phase 3 still needs a design pass before any code (the event
port and the privacy decisions, starting with whether consent and erasure are
acceptance criteria — review §10.1).

| Phase | Status | Blocked by |
| --- | --- | --- |
| 0 — critical fixes | **done** 2026-09-15 | — |
| 1 — accounts (P2.6) | **done** 2026-09-16, verified live | — |
| 2 — config retention | **done** 2026-09-16 | — |
| 3 — analytics + privacy | not started | the domain event port (review M2/M9), consent and retention decisions |
| 4 — UI redesign | **done** 2026-09-16 | — |

**Unblocked work finished 2026-09-16** (`ea00dc3`, `aab43f7`, `9c30207`,
`9cbcda4`, `dc9ccfe`, `9ba598d`, `63fb2d5`): the two Phase 4 leftovers, review M4
(seeded intention ids), four minor issues (the stale `Cycles (Z)` hint, the
text-size flash, the profile-scoped runner lock, stranded binaural drafts), the
SQL union checks with a drift test, and a partial M7 (media URLs are no longer
rebuilt on every save). Nothing left on this file is waiting on infrastructure:
Phase 2 landed 2026-09-16 (below), Phase 3 needs its own design pass, and the
rest is the deliberate deferral list at the end of this section.

### Phase 0 — critical fixes (before any feature work) — all landed 2026-09-15

- [x] **Dexie v6 upgrade** — `schema.ts` no longer changes a primary key in
  place. v6 drops the old `fieldValues` table and adds `fieldValuesByEntity`
  (rows are read inside the version's `upgrade`); v7 is the schema-less repair
  that re-runs that diff for databases already sitting at the broken v6 shape.
- [x] **`field_values` FK** — `20260915120000_field_values_entity_fk.sql` drops
  the leftover `entity_id → symbols(id)` constraint by definition (it scans
  `pg_constraint` rather than asserting a generated name), leaving polymorphic
  integrity to the application guards.
- [x] **RLS onboarding and role hierarchy** —
  `20260915130000_rls_onboarding_and_roles.sql` adds
  `public.is_workspace_owner(ws)` and `public.create_workspace(...)`
  (SECURITY DEFINER, workspace + owner membership in one statement), and replaces
  `members_self` with `members_select`/`_insert`/`_update`/`_delete` guarded by
  the owner check. Known limitation, documented in the migration: the last owner
  can still demote or remove themselves.
- [x] **Atomic `Plan.revision` CAS** — `savePlan` now runs its read → check →
  write inside `ports.runInTransaction`.
- [x] **Drift test** — `tests/unit/architecture/review-phase0.test.ts` reads the
  Dexie version blocks and the migrations and fails on a primary-key change, on
  field-value access outside `fieldValuesByEntity`, on a polymorphic
  `field_values` FK, or on a CAS outside a transaction.

### Phase 1 — accounts (P2.6)

Design pinned in [ARCHITECTURE.md](./ARCHITECTURE.md#accounts-p26-design-contract).

- [x] `AuthPort` + `AuthSession` in domain; `MeditaurApp` exposes
  `authIsConfigured` / `getAuthSession` / `signIn` / `signOut` /
  `onAuthSessionChange`; the login and account screens use them.
- [x] Local, no-cloud adapter (`createLocalAuthPort`) keeps the product
  Dexie-only with no session.
- [x] Workspace-scoped reads (M6, review).
- [x] Supabase adapter — `packages/db/src/supabase.ts`, the only module that
  imports `@supabase/supabase-js`. `composition.ts` selects it from
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` and falls back to
  `createLocalAuthPort` with no pair. Verified live against the local stack
  (`./scripts/meditaur up` + keys, 2026-09-15), which also exercised the Phase 0
  RLS onboarding and role-escalation cases for the first time.
- [x] Identity adoption (`WorkspaceRepository.adopt`, one Dexie transaction),
  session persistence (the SDK stores the session itself), and the React session
  context (`SessionProvider`; components use `useSession()`, and only the provider
  calls `app.bootstrap()`).
- [x] **Sign-up path** (owner ask, 2026-09-16) — `AuthPort.signUp` →
  `SignUpOutcome` (`signedIn` | `confirmationRequired`), `MeditaurApp.signUp`
  (validation, then adoption only when a session really came back), and `/signup`
  sharing `AuthPanel` with `/login`. `confirmationRequired` is a real branch for
  a project with `Confirm email` on. Unit-tested, and the provider half is now
  exercised live: a public sign-up against the hosted project returns a session —
  the `signedIn` branch the panel pushes `/plan` on — and a rejected address
  surfaced the provider's own words in the panel. The click-through of the form
  itself is still unverified.
- [x] **Real login end to end** — verified 2026-09-16 against the hosted project
  created that day. `./scripts/meditaur cloud` links it, applies the migrations
  and runs the live suite (6 tests, no skips); a browser sign-in then reaches
  `/plan` with the device's workspace adopted — the piece that had never run at
  runtime — and `/account` names the signed-in user. The local stack still covers
  offline development.

### Phase 2 — config retention (preferences only) — landed 2026-09-16

The first change where an account *does* something beyond identifying the reader:
their settings now follow them between devices, and nothing else does.

- [x] **M11 — the blind overwrite** (2026-09-16). `UserPreferences.revision` in
  the domain, a Dexie data-only version (v12) and
  `user_preferences.revision` in SQL
  (`20260916170000_user_preferences_revision.sql`). `savePreferences` returns the
  row it stored and runs its read → check → write inside
  `ports.runInTransaction`, refusing a stale write with `preferences.conflict`
  rather than overwriting it — the shape `Plan.revision` already uses.
  `rememberPlan` rebases inside its own transaction instead of comparing, so
  bookkeeping cannot raise a conflict the reader cannot act on, and `Settings`
  chains its writes and adopts the returned revision, so two quick toggles cannot
  collide. Pinned by `tests/unit/application/preferences.test.ts` and by the
  domain ↔ Dexie ↔ SQL guard in `tests/unit/architecture/integrity.test.ts`.
- [x] **M5 — per-row versioning** (2026-09-16). The eight catalogue rows
  (`FocusPoint`, `Symbol`, `Intention`, `FieldDef`, `FieldValue`, `TableView`,
  `BinauralPreset`, `MediaAsset`) extend one `Versioned` shape in the domain, a
  Dexie data-only version (v13) backfills the stored ones, and
  `20260916180000_catalog_row_versioning.sql` adds `revision` + `updated_at` to
  the matching tables. Every catalogue write is stamped in the application, at the
  one place the write goes through, so a revision is a fact about the row instead
  of something each editor remembers. The two screens that hold a *draft* rather
  than a read row (the binaural config, a custom-field box) carry the stored
  revision in with them, so editing an existing row moves its revision on instead
  of restarting it. Catalog backup is `schemaVersion` 4 for the new fields, and an
  older file still restores (they default to 0). Out on purpose: soft delete —
  sync proper gets deletes from tombstones — and the append-only and link rows,
  where a revision would say nothing. Pinned by the domain ↔ Dexie ↔ SQL guard in
  `tests/unit/architecture/integrity.test.ts`.
- [x] **`lastPlanId` null-guard** — **already true, and now pinned.**
  `getActivePlan` never adopted a remembered plan this device does not hold: it
  chooses from the plans the workspace actually has and rewrites the preference to
  what it chose. Phase 2 is what made that matter — the id now routinely arrives
  from another device. Its own test covers both shapes (never chosen, and a real
  plan id belonging to another workspace).
- [x] **Read-through bootstrap** (2026-09-16). `createCachedPreferences`
  (`packages/db`) is the app's preference store when the cloud pair is set: the
  cloud answers reads and takes writes, and the Dexie row is a copy written only
  from a row the cloud already accepted. A read that cannot reach the cloud falls
  back to the copy; a write that cannot reach it fails visibly, because there is
  deliberately no offline mutation queue. Only the reader the session names is
  served from the cloud. `createSupabasePreferencesPort` (`packages/db/src/supabase.ts`)
  is the adapter, and its `save` is **one statement**: the revision is part of the
  `where`, so a row another device moved past matches nothing.
- [x] **The compare-and-swap moved into the store** (2026-09-16, part of the two
  items above). `PreferencesRepository.save` refuses a row whose revision the
  store has moved past and returns `null`; the application turns that into the one
  sentence a reader sees. It had to move: a preference write may now be a network
  call, and a caller-side transaction cannot span one — the local store keeps the
  read, the check and the write in one Dexie transaction instead.
- [x] **Live coverage** — `tests/integration/preferences-supabase.test.ts`: two
  clients, one account, one preference row. The first write lands; the second is
  refused and what is stored is the winner's row, not a blend. A second case
  proves `prefs_self` keeps one reader's row out of another's reach (reads return
  nothing, a write is refused rather than quietly creating a row they do not own).

Catalog and plan sync stay out of scope here.

### Phase 3 — analytics (first-party) — decisions first, then work

The infrastructure is no longer the blocker; the privacy decisions are. Settle
**before any code**: what is measured, the retention window, whether consent is
opt-in or opt-out, the export/delete path, and whether events are per-workspace or
per-user.

Then: a domain event port (no npm, `docs/DEPENDENCIES.md` rule), an `events` table
(idempotent `event_id` + `schema_version`, RLS like every other table) wired from
`SessionEngine` and `MeditaurApp`, plus consent, retention and a user
export/delete path.

### Sync proper — after Phase 2, and after M7

Cloud-authoritative, Dexie as an offline cache, **no CRDT** — that is decided in
[ARCHITECTURE.md](./ARCHITECTURE.md), not open. Plan for it: push-then-pull per
row on the versioning Phase 2 introduces, tombstones for deletes (the SQL cascades
already exist), and `Plan.revision`'s atomic CAS as the conflict surface. Order of
work: read-only pull first, then writes, then visible conflict surfacing. Close
review M7 first, or sync amplifies it. This is also where the two-users-one-device
limitation ends, which means three pieces of copy change with it: the sign-up
screen's "still live in this browser", the beta guide's "you can ignore the
`Account` button", and the user guide's "not copied between devices".

### Before the beta opens: SMTP and password reset

Two small items that need the same thing — a mail provider allowlisted in
[DEPENDENCIES.md](./DEPENDENCIES.md), because a new external dependency is a
security decision here, not a convenience. Today confirmation is **off** on the
hosted project, which means anyone can sign up with an address they do not own,
and there is no password reset anywhere in the app. Both are acceptable for a
closed beta of people who know the owner, and both stop being acceptable the
moment it opens.

### Phase 4 — UI redesign (brought forward, all landed 2026-09-16)

The owner brought this ahead of Phases 2–3: with no users yet, the redesign is
the step that earns them, and both later phases want a hosted project to be
meaningful. It is an in-product visual pass — not the forbidden
brand/design-system rewrite, and not a new UI kit. Design direction:
[UI_DESIGN.md](./UI_DESIGN.md).

**Landed 2026-09-15** (commits `9c4ba74`, `207517b`, `4c4ff46`, `2b2052f`),
stages 1–5 of that doc's implementation order, green on `check:full` + e2e:

1. **Tokens** — `globals.css` `@theme` block: base/surface/line tiers, the seven
   chakra accents, one destructive hue, Fraunces + Manrope through `next/font`,
   and the overlay scrollbar. No `stone-*` / `amber-*` / `teal-*` utility and no
   raw hex is left outside the token block.
2. **Primitives** — `Button` (tier × size) and the static chakra name→hue map in
   `packages/ui`, `LatchButton` rebuilt as a track-and-thumb switch (same name,
   props, `aria-pressed`, 64px target).
3. **Shared shell** — `EYEBROW_CLASS` plus `EditorChrome`'s sticky bottom action
   bar, adopted by every library editor.
4. **Run screen** — `Runner` is the grouped intentions table: focus-level
   intentions with no symbol column, one merged symbol cell spanning its
   intention rows, `-` for missing values, a docked clock, a sticky control bar.
5. **Library** — sticky swipeable tab strip over the nine sections and a
   per-table toolbar: the Add action (fields and audio included), the list-mode
   toggle, and a compact backup/restore, all in the same fixed top-right spot.

`packages/ui` naming classes that Tailwind never generated is a known trap:
`apps/web/src/lib/ui-package-classes.ts` pins the strings from `Button`,
`LatchButton`, `accents.ts`, and `PickerPage` in a file the app's Tailwind scan
does see. Verified against the built CSS — `@source`, the `source()` import
function, and the PostCSS plugin's `base` option do **not** reach the sibling
package. Delete that file once the scan can see `packages/ui`.

**Both leftovers landed 2026-09-16:**

- [x] **Library column picker as a toolbar action** (`9c30207`) — it opens from
  the toolbar the table belongs to, and the library now owns the available-column
  list. The e2e that clicks a visible toggle was updated in the same change, which
  is what this item was waiting on.
- [x] **Symbol pictures on the run screen** (`aab43f7`) —
  `CompiledSymbolGroup.imageAssetId` carries the asset, and the run screen
  resolves it to a blob URL beside the name in the merged cell. The picture is
  proved end-to-end by an e2e that uploads a real PNG through the library and
  starts a session from a focus tile.

Guardrails while touching this area: do not change the local identity scheme
(`LOCAL_WS`, `LOCAL_USER`, the deterministic seed ids) — it is what makes
identity adoption possible once real accounts arrive. Keep the catalog export
visible: pre-accounts users have device-only data.

Parked / operator-only:

1. **[x] Live two-user RLS verification** — verified **2026-09-14** against a
   local stack (Supabase CLI 2.117.0, `./scripts/meditaur up`): the live branch of
   `tests/integration/rls.test.ts` ran and passed (no skip). **Re-run 2026-09-16**
   on the migration set that added the union checks: 6 integration tests, no
   skips. Re-run it whenever the RLS or the schema SQL changes. Operator steps:
   set the keys, `./scripts/meditaur up`, `./scripts/meditaur test:integration`.
   Inside the tools container the stack is
   `http://host.docker.internal:54321`. Note: while `.env` holds keys the test
   **fails instead of skipping** if the stack is down — run
   `./scripts/meditaur down` and drop `.env` to get the skip back.
2. **[ ] P2.6 — Email login** — **design pinned 2026-09-15**
   ([ARCHITECTURE.md](./ARCHITECTURE.md#accounts-p26-design-contract)): the port
   shape, adapter home, identity adoption, the two-users-one-device rule, and what
   stays out of scope (sync is a separate change). Development can be exercised
   against the local stack (`./scripts/meditaur up`), but real login cannot be
   verified without a hosted Supabase project, so implementation still waits on an
   explicit go-ahead. `@supabase/supabase-js` is allowed only in the change where
   `AuthPort` imports it, with the allowlist and integrity test updated together.

Engineering debt:

- **[x] `vitest` ≥ 4.1.11** — done **2026-09-15** (`^3.2.4` → `^4.1.11`) to close
  [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) on
  `vitest` / `@vitest/mocker`. `pnpm audit` went 6 → 4 findings. V5 is `latest`
  and is deferred on purpose; see [DEPENDENCIES.md](./DEPENDENCIES.md).
- **[ ] PostCSS via Next** — accepted risk, re-check on each Next upgrade. Same
  section of [DEPENDENCIES.md](./DEPENDENCIES.md).

Deliberately deferred, with reasons (2026-09-16):

- **Review M7's remaining half** — the catalog is still refetched after every
  mutation instead of patching state. Its visible cost (rebuilding every media
  URL, which blanked the pictures) is fixed. The refetch only becomes a problem
  when the store is remote, so it belongs with the sync work in Phase 3 rather
  than in a speculative rewrite of every mutation path now.
- **Review's SQL leftovers: `init.sql` idempotency, explicit grants, unused
  indexes, the orphan `profiles` table.** The union checks were the data-integrity
  half and they are in. The rest either changes nothing for a database that
  already ran the baseline — idempotency, grants; and the hosted project now has
  the baseline applied, so re-running it is not something the beta does — or is a
  removal that needs its own change and the owner's call (`profiles`, the Dexie
  index strings).
- **`SNAPSHOT_SCHEMA_VERSION`** is written and never read. It was bumped for the
  symbol-picture field as a signal. Giving it a reader (rejecting or migrating an
  old snapshot) is a real change with a real decision in it, not a cleanup.
- **`btoa`/`atob`/`structuredClone` in the application layer** — the layer is not
  environment-isomorphic and a base64 backup costs ~3.3× memory. Both matter only
  if the application ever runs outside the browser, which nothing asks for today.

## Later (P3 — do not start now)

- [ ] Hosted demo (Vercel secrets on the repo; login + PWA icons that are not a 32px “M”)
- [ ] REST / gRPC around `createMeditaurApp` **when a second client exists**
- [ ] Workspace sharing (membership is in SQL; unused in UI)
- [ ] Native shell (`packages/domain` + `AudioPort`)

## Not this product (do not reopen)

Already decided against. Do not start these to “make it nicer”:

- YouTube, Spotify, or any streaming catalog
- A second timer model or a fixed 12-stage list
- REST / gRPC before a real second client
- Native shell before that client exists
- Brand / illustration / design-system rewrite
- Notifications, calendars, social share, AI-written intentions
- Install-app banners, another UI kit, a second HTTP client, a dashboard
- A wizard that rebuilds `makeStarterPlan`
- Host-global Node as the only toolchain

Do **not** add a second start button on `/plan` — `Start session` is already the
circuit session.
One-tap chakra/point sessions are the **focus tiles** on `/plan`, not another
start button.

Only if it stays on this product, after accounts:

- Login empty states and real PWA icons (the appearance gate).
- Post-session note — a **new** `SessionLog` field plus Dexie and SQL. Not free;
  skip unless journaling becomes the product.
