# Architectural review and forward plan

**Date 2026-09-15. Read-only review.** Basis: a full read of `docs/*`,
`packages/{domain,application,db,audio-web,ui}`, `apps/web`,
`supabase/migrations`, `tests/*`, and the CI workflows, plus three dedicated
deep-dive audits.

> **How to use this document.** It is the record of what was found and why the
> fixes were ordered as they were. [ROADMAP.md](./ROADMAP.md) is the status — what
> is done and what is next; [IMPLEMENTATION.md](./IMPLEMENTATION.md) carries the
> binding rules derived from this review. Do not mark an item done until
> `./scripts/meditaur check:full` is green.

> **Implementation status, 2026-09-17.** Sections 2 and 3 below are the review as
> found; the markers show what has since landed. **Phase 0 is complete** — C1–C4
> are all fixed, each with a test. **Phase 1 is complete and verified live** — M3,
> M4 and M6 closed, and sign-in against the hosted project is exercised end to
> end. **M9 is partial** — the UI session context half landed, `composition.ts`
> still binds Dexie at module scope and mutations have no analytics wrapper.
> **Phase 2 is complete** (2026-09-16): M11 and M5, the `lastPlanId` guard, the
> read-through bootstrap and its live coverage, with the store contract in
> [ARCHITECTURE.md](./ARCHITECTURE.md#the-preference-store-phase-2). **Phase 4 is
> complete**, including the two items it left open (owner brought the redesign
> forward). Phase 3 has not started. M7 is half done: its visible cost is fixed,
> the refetch remains for the remote store. The body of the review is left as
> written, so a reader can see the original finding beside its fix.

## TL;DR

The hexagonal core is genuinely clean and well-disciplined, but the seams the
next three feature-sets need are missing or unsound today. Four critical defects
exist, plus major gaps that become blocking the moment accounts and sync land.
Recommended order (owner-confirmed): **accounts first → analytics + preference
sync → UI redesign last**, with the critical fixes landed **before** any feature
work. Analytics should be **first-party, event-sourced in Supabase** (no new
client dependency). Config retention (owner scope: auth session and preferences
only) needs per-row versioning and a merge strategy that does not exist yet.

*Amended 2026-09-15:* the owner moved the UI redesign ahead of Phases 2–3, and
its five stages landed. Phase 0 and Phase 1 landed too, so this document is now
history plus the two unstarted phases, not the live plan —
[ROADMAP.md](./ROADMAP.md) is.

## 1. What is healthy — keep it

- Dependency direction is enforced (`apps/web → application → domain`; adapters
  in `db`/`audio-web`/`ui`) via ESLint `no-restricted-imports` and
  `tests/unit/architecture/integrity.test.ts`.
- `packages/domain` has zero external imports, injected `Clock` and `AudioPort`,
  no `setInterval` (deadline-based only), and no DOM/React/Web Audio leakage.
- `SessionEngine` is a clean state machine, fully unit-tested with `FakeClock`
  and `RecordingAudioPort`.
- Everything throws `AppError { code, message }` via `fail()`; there is no
  `throw new Error` in domain or application.
- `compilePlan` is pure, deep-copies tones and EQ into the snapshot, and
  validates dangling catalog references and tone caps.
- The docs are unusually precise and mostly accurate.

## 2. Critical issues — fix before any feature work

**All four landed 2026-09-15** (`49b10af`), each covered by
`tests/unit/architecture/review-phase0.test.ts`.

### C1 — the Dexie v6 migration breaks upgrades of existing databases — **fixed**

`packages/db/src/schema.ts` changes the `fieldValues` store primary key from
`[symbolId+fieldDefId]` (v1) to `[entityId+fieldDefId]` (v6). Dexie cannot change
a table's primary key across versions; it aborts the upgrade ("Not yet support
for changing primary key") before the v6 upgrade function runs. Fresh installs
(e2e browsers are always fresh) are unaffected, which is why CI is green. Any
device that opened the app on v1–v5 will fail to open IndexedDB after upgrade.

**Fix:** keep the primary key stable, or create a new table in v6, copy the rows,
then drop the old one. Never rename a primary key in place.

**Landed as:** v6 drops the old `fieldValues` table and adds
`fieldValuesByEntity`, reading the old rows inside that version's `upgrade`; v7 is
a schema-less repair that re-runs the diff for databases already sitting at the
broken v6 shape.

### C2 — the Postgres `field_values` FK still points at `symbols(id)` — **fixed**

`20260904120000_init.sql` declares `field_values.symbol_id references
symbols(id)`. `20260915000000_requirements_v2.sql` renames the column to
`entity_id` but does not rebuild the FK. Postgres therefore cannot store
focusPoint-scoped field values (an `entity_id` pointing at a focus point), which
the domain explicitly allows (`FieldEntityType = "focusPoint"`). Cloud sync of a
landed v2 feature will fail.

**Fix:** drop the FK and enforce integrity in the application/RLS layer, or use a
polymorphic key with no FK.

**Landed as:** `20260915120000_field_values_entity_fk.sql` drops the constraint
by definition (it looks the constraint up in `pg_constraint` rather than
asserting a generated name), leaving integrity to the application guards.

### C3 — RLS blocks onboarding and allows privilege escalation — **fixed**

In `20260904120000_init.sql`:

- `workspaces_member` is `for all using (is_workspace_member(id))` with no
  `with check`, so a new workspace has no member rows and **no authenticated user
  can insert their first workspace**. The membership row cannot precede the
  workspace because of the FK.
- `members_self` is `for all using (user_id = auth.uid() or
  is_workspace_member(workspace_id))`, so **any** member can read/write **any**
  membership row — promote themselves to `owner`, demote others, or remove
  members.

Both are P2.6 blockers. **Fix:** a bootstrap policy or `security definer` RPC
that creates the workspace and the owner membership atomically, plus a
role-hierarchy membership policy.

**Landed as:** `20260915130000_rls_onboarding_and_roles.sql` adds
`public.is_workspace_owner(ws)` and `public.create_workspace(...)`, and replaces
`members_self` with four owner-guarded policies. Known limitation, recorded in
the migration: the last owner can still demote or remove themselves.

### C4 — `Plan.revision` CAS is non-atomic — **fixed**

`packages/application/src/create-app.ts` `savePlan` does read → compare → write
`revision + 1` outside any transaction. Two concurrent writers both pass and both
write `N + 1` (last write wins). This contradicts the pinned guarantee that
"conflicts on plans fail visibly via `Plan.revision` CAS".

**Fix:** wrap the read-check-write in `ports.runInTransaction` (Dexie serializes
overlapping read/write transactions) and add a concurrency test.

**Landed as:** `savePlan` performs its read, check, and write inside
`ports.runInTransaction`.

## 3. Major issues — fix alongside the next feature-sets

Status keys: **done**, **partial**, **open**.

- **M1 — non-transactional multi-write use cases. — done** (`f7311fd`) `deletePlan`
  (logs → snapshots → plan → prefs), `saveMediaAsset`/`deleteMediaAsset`
  (blob vs row), and the delete guards (check-then-delete race) all run inside
  one `runInTransaction` now.
- **M2 — the ports the planned work needs do not exist. — partial.** `AuthPort`
  and `WorkspaceRepository` landed with Phase 1. Still absent: a
  `MemberRepository` (members are seeded but unreadable) and the analytics/event
  port (Phase 3). `BootstrapPort.ensureReady()` still returns a snapshot rather
  than a reactive source; `SessionProvider` supplies the reactivity in the UI.
- **M3 — identity adoption is unimplemented, and a legacy id is not a UUID. —
  done.** `LOCAL_USER` and `LOCAL_WS` are deterministic UUIDs, and
  `WorkspaceRepository.adopt` claims the local seed workspace for the first
  signed-in user in one Dexie transaction.
- **M4 — non-deterministic seed ids break id-based sync. — done** (`ea00dc3`).
  Focus points, symbols, presets, plan, blocks, and the default view already used
  `nid()`; the seeded intentions were the last ones minting ids with `createId()`
  and now number from 0x100. The default-workspace test builds the catalog twice
  and compares every id, which is what a platform-generated UUID cannot survive.
- **M5 — no per-row versioning or soft delete for catalog tables. — the
  versioning half is done** (2026-09-16). `focus_points`, `symbols`, `intentions`,
  `field_defs`, `field_values`, `table_views`, `binaural_presets`, `media_assets`
  and `user_preferences` all carry `revision` + `updated_at`, in the domain, in
  Dexie (v13 backfills the stored rows) and in SQL
  (`20260916180000_catalog_row_versioning.sql`). Every catalogue write is stamped
  where the application writes it, so the revision is a fact about the row rather
  than something each editor remembers. Deliberately out: soft delete, which sync
  proper gets from tombstones rather than a column, and the append-only
  (`session_logs`, `session_snapshots`) and link (`focus_symbol_bindings`) rows,
  where a revision would say nothing.
- **M6 — cross-tenant read paths. — done** (`465a5d9`). `openPlan`, `getPlan`,
  `compileSession`, `getSnapshot`, and `duplicatePlan` all take a `workspaceId`
  and callers pass it from `bootstrap()`.
- **M7 — full-catalog reload on every mutation. — partial** (`dc9ccfe`). The
  visible half is fixed: the library no longer revokes and re-decodes every media
  URL on each save, which blanked the pictures mid-session. The refetch itself
  remains — patching state per mutation only pays off once the store is remote, so
  it belongs with Phases 2–3 rather than a speculative rewrite now.
- **M8 — N+1 and full-library guards. — done** (`f7311fd`). `PlanRepository.getMany`
  and `CatalogRepository.listFieldValuesForEntityIds` replaced the per-row
  loads; `getLibrary` reuses the compile library's presets.
- **M9 — no UI identity context, static composition, no analytics choke point. —
  partial.** `SessionProvider` is now the single bootstrap and components read
  `useSession()`, so identity is no longer copied into six component states.
  Still open: `composition.ts` binds Dexie at module scope, and mutations have
  no wrapper, so analytics instrumentation still means touching every feature.
- **M10 — initial loads have no error path. — done** (`0d110e1`). The mount
  effects in `Library`/`Planner`/`Settings`/`Tuner`/`Runner` catch and render the
  error instead of a permanent "Loading…".
- **M11 — `UserPreferences` is a blind overwrite, and `lastPlanId` is
  device-local. — done** (2026-09-16). Preferences carry a `revision` in the
  domain, in Dexie (v12) and in SQL, and a save refuses a stale write instead of
  overwriting it — the shape `Plan.revision` uses, moved into the store so it can
  be one Dexie transaction locally and one conditional update remotely.
  `getActivePlan` never makes a remembered plan this device lacks the active one,
  and a signed-in reader's preferences are read through the cloud, with Dexie as
  the offline copy (`createCachedPreferences`). The store contract is in
  [ARCHITECTURE.md](./ARCHITECTURE.md#the-preference-store-phase-2).
- **M11 continued — every other synced row now has a version too.** The revision
  landed on `user_preferences` first (M11) and on the eight catalogue rows second
  (M5). The preference store is the one that *uses* it (Phase 2, above); the
  catalogue rows still carry a revision nothing acts on yet, because the per-row
  push belongs to sync proper.

## 4. Minor issues — track, do not block

Closed since the review:

- ~~Wrong `EntityTable` primary-key annotations for the compound-key tables.~~
  **Fixed** (`b8ab41a`): `members`, `focusSymbolBindings`, and
  `fieldValuesByEntity` are typed `Table<T, [string, string]>`.
- ~~Palette hardcoded across components.~~ **Fixed**: the palette lives in the
  one `@theme` block in `apps/web/src/app/globals.css` (Phase 4 stage 1).
- ~~`rls.test.ts` reads only `init.sql` for policy coverage.~~ **Fixed**: it reads
  every migration. The live branch still isolates `focus_points` only.
- ~~Text-size FOUC.~~ **Fixed** (`9cbcda4`): `applyTextSize` mirrors the value to
  `localStorage` and a blocking inline script in `layout.tsx` paints it before the
  first paint. Dexie stays authoritative and there is still one writer.
- ~~The engine lock is profile-scoped, not user-scoped.~~ **Fixed** (`9cbcda4`):
  the key carries the signed-in user, so a second account on one device is not
  blocked by the first one's session.
- ~~Binaural draft `sessionStorage` entries are never garbage-collected.~~
  **Fixed** (`9cbcda4`): `pruneBinauralDrafts` sweeps on every library load.
- ~~`table_views.symbol_filter` and `user_preferences.text_size` lack CHECKs.~~
  **Fixed** (`9ba598d`): a migration adds both, mirroring the domain unions, and
  `tests/unit/architecture/schema-unions.test.ts` reads the unions out of the
  domain and fails if the SQL drifts from them.
- ~~Identity copied into component state.~~ See M9.
- ~~Duplicated UI logic.~~ **Audited and fixed 2026-09-16** (`63fb2d5`), and the
  list was partly wrong. Two claims held: the symbols list re-sorted inline while
  `library-model.sortSymbolsForPicker` existed, and the binaural config screen
  restated the application's name rule with its own copy of the message — it now
  lets `catalog.nameRequired` be the one owner. Two did not: `formatDurationMs`
  ("7m 30s") and the run screen's `formatMs` ("7:30") are two different formats,
  not three copies of one, and the planner's block defaulting is a single site.
  The hardcoded route strings stay: they are Next.js route paths that must match
  the file tree, and a constants table would add a layer without catching a
  renamed route.

Still open:

- `compilePlan` falls back to `Date.now()` when `options.now` is omitted;
  `createId` reads the ambient `crypto`.
- The application uses `btoa`/`atob`/`structuredClone`, so it is not
  environment-isomorphic (~3.3× memory on a base64 backup). Only bites if the
  application ever runs outside the browser.
- Backup parsing validates shallowly (plan scalars, `kind`, and base64 content
  are unvalidated).
- `SessionEngine.start()/resume()` do not catch a rejecting `audio.resume()`, and
  a throwing event listener kills the timer chain; pause during the alarm hold
  arms a 0 ms timer.
- `snapshots.save` uses `Date.now()` directly in the adapter instead of the
  injected clock.
- `packages/ui` ships no CSS and no `"use client"`, and relies on the host app's
  Tailwind scan — not genuinely standalone. The scan does **not** reach the
  sibling package, so `apps/web/src/lib/ui-package-classes.ts` pins the class
  strings by hand; delete it once the scan can see the package.
- `SNAPSHOT_SCHEMA_VERSION` is written and never read.
- SQL: `init.sql` is not idempotent, has no explicit grants, some indexes are
  unused (`plans.updatedAt`, `sessionLogs.workspaceId`, `members.userId`),
  `profiles` is an orphan Postgres-only table, and the `media_assets` kind CHECK
  is init-only. All still true on 2026-09-16, and each is either a no-op for an
  existing database or a removal that deserves its own change; see the deferral
  list in [ROADMAP.md](./ROADMAP.md).

## 5. Schema divergence (domain ↔ Dexie ↔ Postgres)

| Area | Divergence | Impact |
| --- | --- | --- |
| `field_values` | ~~FK still → `symbols(id)` after the rename to `entity_id`~~ **fixed** (`20260915120000_field_values_entity_fk.sql`) | C2 |
| plan blocks | Dexie `blocksJson` vs Postgres normalized `plan_blocks` | sync needs a JSON ↔ rows mapper |
| media blobs | Dexie `mediaBlobs` inline vs Postgres `storage_path` only | needs object storage plus a mapping (documented) |
| `profiles` | Postgres-only table, no domain/Dexie equivalent | unused extra |
| timestamps/version | ~~missing on ~12 tables~~ **fixed for the synced rows** (`20260916180000_catalog_row_versioning.sql`); the append-only (`session_logs`, `session_snapshots`) and link (`focus_symbol_bindings`) rows are deliberately out | M5 |
| `symbols` history | init has `focus_point_id`; later migrations drop it | init no longer matches the model |
| `session_snapshots` | Postgres keeps the document in `snapshot jsonb`; Dexie stores the full object | sync needs a column mapping |
| unions | `text_size`, `symbol_filter`, and (partly) `kind` were unconstrained — **fixed** (`9ba598d`), with `tests/unit/architecture/schema-unions.test.ts` reading the unions out of the domain | Postgres accepted invalid values |

The claim "domain, Dexie, and `supabase/migrations` describe the same product" is
therefore the target contract, not the current state. The integrity test checks
that text, not the column sets, so the remaining drift is invisible to it today;
`review-phase0.test.ts` sees only the four specific Phase 0 shapes.

## 6. Review of the planned direction

Owner direction: analytics collection → user-account management (session storage
and config retention) → full UI redesign. Confirmed re-order: **accounts →
analytics + preference sync → UI redesign**.

1. **Accounts-last is the classic mistake; accounts-first is right.** Analytics
   attribution and cloud persistence both need a stable user id. Building
   analytics on `LOCAL_USER` means re-keying everything later.
2. **Analytics (recommended): first-party and event-sourced in Supabase.** No new
   client dependency. Shape: a domain `EventPort`/`AnalyticsPort` with
   `record(event)`; an `events` table (`id`, `workspace_id`, `user_id` nullable,
   `event_type`, `payload jsonb`, `occurred_at`, `received_at`); wired from
   `SessionEngine`'s existing `EngineEvent` union plus mutation events from
   `MeditaurApp`; idempotent `event_id` and `schema_version`. Defer third-party
   product analytics until needed, behind the same port.
3. **Config retention (preferences only) needs versioning first.** M5 and M11
   mean today's blind overwrite silently drops concurrent changes, and
   `lastPlanId` points at a plan that may not exist on the device.
4. **UI redesign last is correct.** It touches ~25 files and should target the
   final data model. Extract design tokens and route constants now — login and
   empty states need them regardless. *Superseded 2026-09-15:* the owner brought
   the redesign forward with no users yet, on the grounds that Phases 2–3 both
   want a hosted project to be meaningful. Stages 1–5 landed; the timing change
   did not change the content, and the guardrails from the Phase 4 section of
   [ROADMAP.md](./ROADMAP.md) still hold.
5. **Privacy and erasure are unaddressed.** Meditation history and
   chakra/intention data is health-adjacent. There is no consent mechanism, no
   user-data deletion or export path, and no retention policy. Add these to the
   accounts milestone, not after analytics.
6. **Time and timezone.** "Sessions completed this week" uses the device-local
   Monday plus `ports.clock`. Store client `occurred_at` and server
   `received_at` and aggregate in a fixed timezone; never mix device clocks
   server-side.
7. **Data durability.** Dexie-only means clearing site data wipes everything;
   manual JSON export is the only backup. Preference sync covers preferences
   only — the catalog/plans gap must stay explicit until full sync ships.
8. **Cross-device and multi-tab.** The engine lock and mixers are per-profile and
   per-tab, not per-user; the full-library reload is O(catalog); plan loading is
   N+1. All three need addressing before "session storage" and multi-device are
   real.

## 7. Phased remediation (agent-actionable)

**Status lives in [ROADMAP.md](./ROADMAP.md), not here** — that duplication is
what let the two documents drift twice. This section keeps only the *content* of
each phase, for the two that have not finished.

- **Phase 0 — critical fixes (land first, independent of features).**
  C1 (rebuild the Dexie v6 migration without a primary-key
  change), C2 (drop the FK), C3 (RLS onboarding and role hierarchy), C4 (atomic
  `savePlan`).
- **Phase 1 — accounts (P2.6).** `AuthPort`
  in `packages/domain/src/ports.ts`; one SDK-importing adapter in `packages/db`;
  identity adoption in one Dexie transaction (M3); cross-tenant reads closed
  (M6); a React session context (M9, the UI half — see §3 for what M9 still
  wants); `EntityTable` annotations fixed; M4's seeded intention ids are
  deterministic (`ea00dc3`). Left: real login against a hosted project.
- **Phase 2 — config retention (preferences only).** Add
  `updated_at`/`revision` to `user_preferences` (Dexie and SQL in one
  migration); merge-or-CAS `savePreferences`; null-guard `lastPlanId`; a
  cloud-authoritative sync adapter; verify multi-device on the local Supabase
  stack. The revision and the compare-and-swap landed 2026-09-16 (M11); the rest
  is open.
- **Phase 3 — analytics (first-party).** `AnalyticsPort` plus a
  domain `AppEvent`; wire the engine and app events; an `events` table in Dexie
  and SQL with an idempotent `event_id` and `schema_version`; a consent flag, a
  retention policy, and a user export/delete path.
- **Phase 4 — UI redesign (owner brought it forward).** Tokens,
  `Button`/`LatchButton`, the shared shell, the run screen's grouped intentions
  table, the library tab strip plus per-table toolbar, the column picker, and
  symbol pictures on the run screen.

Each phase ends with `./scripts/meditaur check:full` green.

## 8. Verification

What was asked for, and what actually happened:

- **Phase 0.** The Dexie v5→v6 upgrade and the three SQL fixes are covered by
  `tests/unit/architecture/review-phase0.test.ts`, which reads the source and the
  migrations and fails on a primary-key change, a polymorphic `field_values` FK,
  a read-check-write outside a transaction, or field-value access through the
  retired table. The RLS half is exercised live: the first-workspace RPC and the
  role-escalation denial ran against a local stack (Supabase CLI 2.117.0) on
  2026-09-14 and again on 2026-09-15. Not covered: a real concurrent `savePlan`
  race (Dexie needs IndexedDB, so it is not unit-testable there).
- **Phases 1–3.** The live RLS integration test (`./scripts/meditaur up` with
  keys set), unit + integration + e2e green, and `pnpm audit` unchanged. Phase 1
  meets this (6 live tests pass, re-run 2026-09-16 on the schema that added the
  union checks). Phases 2–3 have not started.
- **Phase 4.** The green e2e suite against the new UI, with visual parity on
  `/plan`, `/run`, `/library`, and `/tuner`. Met on `check:full` + e2e for
  stages 1–5, and the two leftovers landed 2026-09-16 (37 e2e specs at the last
  run) —
  including one that uploads a real PNG through the library and asserts it on the
  run screen, which is the only path that proves the picture travels in the
  snapshot.

## 9. Decisions and assumptions

- Order: **accounts → analytics + preference sync → UI redesign** (owner
  confirmed). **Amended 2026-09-15: the redesign was pulled forward and landed
  first**; Phases 2–3 stay behind it and behind a hosted Supabase project.
- Analytics: **first-party in Supabase**, no new client dependency (owner asked
  for the best fit).
- Config retention scope: **auth session and user preferences only** (owner
  confirmed); catalog/session sync is deferred but flagged.
- P2.6 still waits on a hosted Supabase project for real login verification (see
  [AGENTS.md](../AGENTS.md)). **Confirmed, and it is the single blocker on the
  whole forward plan**: Phase 1's last mile, Phase 2, and Phase 3 all need it.
  The local stack covers design, RLS, and adapter behaviour, not hosted login.
- The Phase 4 UI pass is an in-product visual pass, not the "brand / illustration
  / design-system rewrite" that [ROADMAP.md](./ROADMAP.md) forbids, and not a new
  UI kit.

## 10. Further considerations / open questions

1. Should consent and data erasure (GDPR / India DPDP) be explicit Phase 3
   acceptance criteria? **Still open** — and it is now the only *unblocked*
   design question left in this document.
2. ~~Should the Phase 0 critical fixes ship as one change or four separate
   changes?~~ **Answered**: they landed as one change (`49b10af`), because the
   Dexie migration, the FK, the RLS policies, and the CAS touch one contract and
   one test reads them together.
3. Is a hosted Supabase project available to unblock real P2.6 verification, or
   do we proceed local-stack-only? **Still open, and now the critical path.** See
   [ROADMAP.md](./ROADMAP.md) for what each answer unlocks.
