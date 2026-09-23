# Roadmap

**Status 2026-09-21.** This file holds the **register**: every piece of tracked
work, one row each, and the only place its state lives. The coding contract is
[IMPLEMENTATION.md](./IMPLEMENTATION.md); the owner's decisions are
[DECISIONS.md](./DECISIONS.md); the ask-by-ask record is
[REVIEW_LOG.md](./REVIEW_LOG.md); what already landed — and the crosswalk for any
older label you meet — is [HISTORY.md](./HISTORY.md).

Work one item at a time. An item is done when `./scripts/meditaur check:full` is
green — typecheck, lint, unit, both live databases, the production build and e2e.
`./scripts/meditaur check` is the edit loop, not the gate.

**Where the app is.** The owner's rounds 13–18 have landed: the Database, the
meditation types and stages, one sentence table with Karuna, the three-region run
screen, round 17's session clock, plan-card editor and grid filter, and round 18's
rebuilt card and Display section. The
repository holds **33 migrations, all applied** to the hosted project (newest
`20260921140000_sync_delete_marks.sql`), Dexie is at **v27**, the catalog backup
schema is **9** and the snapshot schema is **6**. Real login, cloud preferences and
the live RLS suite are verified against the hosted project. The last full gate
(2026-09-21) was **417 unit tests**, both live databases (13 hosted, 13 local), the
production build, and **85 e2e tests with no retries**.

---

## How work is identified

One scheme, and it is the only one:

- An **item** has one integer id, allocated once and **never reused**. An item that
  closes keeps its number in [HISTORY.md](./HISTORY.md), so `item 5` resolves for
  ever.
- A **subpoint** is a single lowercase letter (`26a`), one level deep and no more.
  Something that needs sub-subpoints is its own item.
- **Priority is a tag, not part of the id.** `P0` blocking — nothing else lands
  until it does, at most two at a time, each naming what it blocks · `P1` current ·
  `P2` next · `P3` later · `P4` optional · `P5` parked. In prose an item is
  `P1 · 5`; in the register the priority is its own column.
- **State** is `open`, `blocked` (and it names the blocking id) or `parked` (and it
  names why, and what would unpark it). `done` and `declined` are outcomes
  [HISTORY.md](./HISTORY.md) records; they are not states here.
- **Provenance is not an id.** "The owner's round 17 (2026-09-21)" names a scene; a
  round is identified by its date. A **rule** has no id either — the do-not lists
  below are instructions, not items.
- A **living document's own section numbers** (`UI_DESIGN.md` §1.4) are navigation
  and stay. A citation to a **retired** document is not allowed: the content is in
  [HISTORY.md](./HISTORY.md), [DECISIONS.md](./DECISIONS.md) or
  [IMPLEMENTATION.md](./IMPLEMENTATION.md) now.
- Storage versions (`Dexie v25`, `schemaVersion 9`), the guides' chapter numbers and
  the beta guide's `Task N` are not work-item ids and are untouched.

## The register

| P | Id | State | Item | What it needs |
| --- | --- | --- | --- | --- |
| P0 | 23 | open | **The account's feature flags, and the panel that sets them** | [ACCOUNT_FLAGS_PLAN.md](./ACCOUNT_FLAGS_PLAN.md) is the detail; this row and 35 are the work. A flag belongs to an account and the panel is its only writer, so this is a new `account_flags` table with a self-select policy and **no** self-write policy, a second Edge Function holding the service role, and a panel behind an `is_admin` marker. Unparked by the owner's answer (2026-09-22): the reason it was parked — a preference with no writer — is exactly what this removes. **Blocks 35**, because nothing can be hidden until a flag has a value. Slices, each leaving `check:full` green: (a) the vocabulary and the defaults in the domain, with `ENABLED_REIKI_SYSTEMS` retiring; (b) the table, its named check and the port; (c) the read path through `bootstrap` and `useSession`, with a Dexie mirror; (d) the function and the panel screen; (e) the docs |
| P0 | 35 | open | **The surfaces a flag hides** | [ACCOUNT_FLAGS_PLAN.md](./ACCOUNT_FLAGS_PLAN.md) · depends on 23. One seam per feature, so a gate cannot be half-applied: the chakra type out of the listing every surface already shares; symbol rows through the system flags; the Database's `Karuna` and `Affirmations` tables and the planner's symbol picker behind `karuna_reiki`; the binaural editors, the tuner's way in and the run screen's latch behind `binaural`; the `Scroll` latch and the editor's switch behind `auto_scroll`; the account surfaces behind `account_management`. A flag hides surfaces and keeps the data, and a stored plan still runs. **Blocks the beta**, because the owner's gates are flags rather than a build |
| P1 | 36 | open | **The reset, by hand** | [ACCOUNT_FLAGS_PLAN.md](./ACCOUNT_FLAGS_PLAN.md). The owner's answer (2026-09-22): no mailer for the beta, so the sign-in screen carries one sentence and the owner sets a new password from the panel. Four documents assert the opposite today — `REVIEW_LOG.md`'s still-open rows, `HISTORY.md`'s password-reset row, `DECISIONS.md` §7's "the one thing on this list that needs a mailer", and `ARCHITECTURE.md`'s "both wait on an allowlisted SMTP" — and each is corrected in the same pass, along with `DEPENDENCIES.md`'s dangling instruction to allowlist a mail provider that is no longer added |
| P2 | 2 | blocked | **Analytics: the privacy decisions, then the first caller** | The blocker is its own decisions, not code. Decide first: what is measured, the retention window, opt-in or opt-out, the export/delete path, per-workspace or per-user. Then `error.tsx` becomes the first caller, `event_type` grows past `client_error`, and `/privacy` is revisited. The `events` table and `EventPort` already exist (`c51c28d`) with no caller |
| P2 | 3 | open | **Sync proper** | Cloud-authoritative, Dexie as an offline cache, no CRDT. Push-then-pull per row on the catalogue's revisions, tombstones for deletes, `Plan.revision`'s CAS as the conflict surface. Do item 4 first or sync amplifies it — item 4's Planner slice has landed and its Library and Database slices come with this one. **Slices, each leaving `check:full` green:** (1) the schema — an additive, re-runnable migration giving the catalogue's tables a delete mark and the indexes a pull needs, with the union checks moving in lockstep; (2) the port — a cloud adapter for `CatalogRepository` and the plan repository in `packages/db`, taking its client from `supabase.ts` so the one-SDK-importer rule holds, with Dexie staying the read path; (3) the protocol — push the rows the local store marked dirty, then pull the rows whose revision is ahead, one table at a time, idempotent on the row id; (4) the wiring — `composition.ts` picks the cloud adapter only when the Supabase pair is set, and the app keeps working with no session; (5) the copy — the sign-up screen's "still live in this browser", the beta guide's "you can ignore the `Account` button", and the user guide's "not copied between devices" all stop being true, and the guides say how to move devices. **Slice 1 landed 2026-09-21:** `20260921140000_sync_delete_marks.sql` gives the ten catalogue tables `deleted_at` — null means live, a timestamp means gone — and the index a pull reads, `(workspace_id, updated_at desc)` on nine of them and the timestamp alone on `field_values`, which is scoped by its entity rather than by a workspace. The mark lives on `Versioned` in the domain, so it sits with the revision it travels with, and Dexie **v27** writes `null` into the rows a device already holds. Deliberately **not** `archivedAt`: archiving is the reader's one undo and the Archive draws those rows, while this mark is final and invisible. Deliberately not on **`plans`** either, which are versioned by `revision` alone — their tombstone is slice 2's, with the CAS that guards them, rather than a guess here. Nothing writes the mark yet; slice 3 is its first caller. Guarded by `tests/unit/architecture/sync-marks.test.ts`, which keeps the ten tables equal in the domain, in Dexie and in the SQL and refuses a mark or an index it does not know about. **Slice 2, scoped 2026-09-21 — recon done, no code yet:** the cloud has **no catalogue adapter at all**. `supabase.ts` holds the auth, preferences, events and account ports, and `plan-mapper.ts`'s `savePlan` is the *local* write — so this is new code rather than a rename of something that exists. The adapter is a module beside `preferences-cache.ts`, implementing `CatalogRepository` (and the plan repository) against an **injected** client exactly as `createSupabasePreferencesPort` does, so `supabase.ts` stays the only SDK importer and the one-client rule holds (a second client would mean a signed-in app whose own catalogue is invisible to it, because RLS reads the session on the client). Three things the recon settles. **(a) `SupabaseDataLike` is too narrow as it stands** — its three methods are select-where-one-equals, update-where and insert; a pull needs a *range* (`updated_at > watermark`) and `field_values` needs `in` over entity ids, so the interface grows in this slice rather than a builder chain leaking into it. **(b) No delete method is needed anywhere** — slice 1's mark makes a delete an ordinary write of `deleted_at` with a revision bump, which is the first thing that mark buys. **(c) Every row needs a mapper pair**, because the SQL names are the *stored* ones: `meditations` (not `focus_points`), `plan_blocks` as rows where Dexie keeps one `blocksJson`, `field_values.entity_id` where the domain says `entityId` — and only the plan has a mapper today. Ten tables, so it is a session's unit: the adapter, its mappers, and a fake `SupabaseDataLike` for the unit suite, with `tests/integration` carrying the RLS half. **Traps:** the cloud receives rows one at a time, so a reference the reader cannot see must not fail a save — which is why the cloud's `type_id` is nullable (item 27), and sync is what makes that matter rather than a curiosity; a delete must be a tombstone, or the other device resurrects the row; and preference retention already syncs by compare-and-swap, so it is the pattern to follow rather than a second scheme to invent. **Settled 2026-09-21 — last write wins, quietly:** the higher revision is the row, no conflict screen, and a device that edited offline can be overtaken without being told; a delete therefore travels as a tombstone, which is why slice 1 comes first ([DECISIONS.md](./DECISIONS.md) §7). **Settled 2026-09-21 — sync lands before the beta opens** ([DECISIONS.md](./DECISIONS.md) §7), which makes this row a **gate on the beta** rather than a follow-up: the three pieces of copy above have to stop being true before testers arrive, so the slices run in the order given and the beta waits. It also changes what matters next — once a reader's catalogue is in the cloud, a forgotten password costs them their material, so recovery stops being optional and item 6's brief is where that decision lives. **Slice 2, part 1 landed 2026-09-23:** the seam, not the adapter, because the seam was what was too narrow — `SupabaseDataLike` could ask for one equality and nothing else, and a pull is neither thing. `selectRange` answers rows ahead of a per-table watermark, ordered by the column the pull's index carries and **bounded**, because an unbounded "what changed since X" is the whole table and the watermark would never advance past the first batch; `selectIn` is `field_values`, which is scoped by the entity it hangs off rather than by a workspace. No delete method joined them: slice 1's mark makes a delete an ordinary write with a revision bump, which is the first thing that mark buys. What remains is the adapter, its mapper pairs and the fake `SupabaseDataLike` for the unit suite — and the mappers are the bulk of it, because the SQL names are the stored ones: ten tables, and only the plan has a mapper today. **Slice 2, part 2 landed 2026-09-23** (`3abe399`): the first pair, `meditations`, with the two tolerant reads pinned as cases — a row older than `archived_at`, `deleted_at` or `binaural_enabled` is live and on, and an absent `stages` reads as `null` (the type's template) rather than `[]` (runs no stages at all). Nine pairs remain, and their stored names do not need the migrations read: one `information_schema.columns` query against the local stack lists all of them, which is how this pair was written. **Three more pairs landed 2026-09-23** (`0ca14ab`): `symbols`, `entries` and `intentions` — the rows that are a name and a reference — in one module, with the time helpers extracted into `row-time.ts` rather than copied, so ten pairs cannot disagree about milliseconds versus `timestamptz`. Four of the ten are done; what remains is the plan's two tables, the presets, the media assets, the types and the three field tables. **Six are done 2026-09-23** (`1fc6675`): the types and the media assets joined them, and each carries a decision the others do not — a type's `stages` is the template every block of it is built from, so an absent column reads as `[]`, while a meditation's own copy reads as `null` for "ask the type"; and `media_assets` is the one catalogue table with no `archived_at` at all, so its pair carries none and has a case that asserts it does not invent one. **Eight are done 2026-09-23** (`8b85ad8`): the field tables joined them — `field_values`, which has no `id` of its own, so its pair and `CatalogChangeSet` are two views of one decision rather than two decisions (a cascade names the entity, never the value), and `field_options`; neither is archivable, so neither pair carries `archivedAt` in either direction. What remains is `field_defs`, the presets, and the plan's two tables |
| P2 | 4 | open | **The catalogue's refetch-per-mutation** | Every mutation refetches the whole catalogue instead of patching state. **The seam, read 2026-09-21:** one loader (`MeditaurApp.getLibrary`, nine IndexedDB scans), four call sites (`Library.tsx:89`, `DatabaseScreen.tsx:76`, `Planner.tsx:665/676`, `Tuner.tsx:28`) and three screen-local `reload`/`refreshLibrary` helpers that children receive as `onReload`. Every single-row write returns the stamped row, so a *create or an update* can be patched from its own return value — but a delete cannot, and the register used to say otherwise: **every delete here is a cascade.** `deletePreset` clears `meditations.defaultBinauralPresetId` and every plan block that named it before it removes the row; `deleteMediaAsset` clears `meditations.representationAssetId` and `symbols.imageAssetId` first. So dropping the deleted id from one list would leave `meditations` and `symbols` stale in the very view that shows them, which is the same trap the Database's refetch hides. **The Planner's slice landed 2026-09-21:** `MeditaurApp.listPlans` returns the summaries verbatim, in the adapter's own order, and the three handlers that move the list patch `library.plans` in place; `switchPlan` refreshes nothing, because opening a plan does not change the list of them. Guarded two ways: the read-count test in `create-app.test.ts` (no catalogue load) and `tests/unit/web/planner-refetch.test.ts` (the file's only `app.getLibrary` is the mount load) — both proved by restoring the refetch and watching them fail. Because of the cascades, the Library slice's **first unit is the application's return value, not the screen**: a delete (and a duplicate, which mints a name) has to answer with what it changed — rows removed, rows updated, rows added — before any screen can patch instead of re-read. Concretely that is one exported type, roughly `{ added?: {presets?, mediaAssets?}, updated?: {meditations?, symbols?}, removed?: {presets?: string[], mediaAssets?: string[]} }`, returned by the write and covering **plans too**, because `patchPlanBlocks` clears the reference there as well — plans are outside the Library's view, but a change-set that hides them is the same half-truth this row started with. Then the screen's patch is exact and the ordering question below only affects the *insertions*. `mediaAssets` is what decides the ordering half, and it is worse than it looked: `byOrder` requires a `sortOrder`, and `MediaAsset` has none (`id`, `workspaceId`, `kind`, `name`, `storagePath`, `durationMs`), so ordering that list the way presets are ordered is a **domain, Dexie and migration change moving in lockstep** — not a patch. **Settled 2026-09-21 — media assets get the order** ([DECISIONS.md](./DECISIONS.md) §8): the column on the domain row, Dexie v26 numbering what a device already holds, and the SQL column with them. The other reading — re-read just the two lists after a mutation — was offered and refused, because a patched list has to know where a new row goes and only an order can say. The Database grid comes last, because its own refetch also replaces the draft's baseline, so `commitDatabaseDraft` has to return what it wrote rather than a `SweepReport` alone. Value arrives with item 3. **The delete's answer landed 2026-09-21:** `packages/application/src/catalog-change.ts` holds `CatalogChangeSet` — `removed.presets` and `removed.mediaAssets` as ids, `updated.meditations`, `updated.symbols` and `updated.plans` as the stored rows — and the two writes whose cascade no returned row can express return it: `deletePreset` and `deleteMediaAsset`. `patchPlanBlocks` answers with the plans it stored rather than a count, which is what makes `updated.plans` possible. A create or an update still answers with its stamped row, so this adds no second vocabulary: the type exists for what one row cannot say, and its `added` bucket is deliberately absent because nothing in this slice adds as a side effect — an always-empty bucket is the dead structure the id-scheme section warns about. Each answer is compared against a refetch row for row in `create-app.test.ts`, and both tests were proved by collecting the *untouched* row in place of the stored one. Still for the Database slice: the same answer for `deleteMeditation`, `deleteSymbol` and `deleteMeditationType`, whose rows this shape does not cover. **The order landed 2026-09-21:** `MediaAsset.sortOrder`, Dexie v26 via `assetsWithOrder` (its rule pure, in `tests/unit/db/asset-order.test.ts`), `listMediaAssets` as the single read an upload needs, `20260921120000_media_asset_order.sql` applied to the hosted project, and `getLibrary` answering `mediaAssets` in that order. **The Library's screen landed 2026-09-21:** `apps/web/src/features/library/library-patch.ts` is the merge — `withRow` puts a row the write returned at its own `sortOrder`, and `patchLibrary` applies a delete's change-set (drops the ids that went, takes the meditations and symbols it rewrote, passes untouched rows through by identity, and leaves `plans` alone because this view holds only their ids and names) — and the three mutating handlers (`uploadMedia`, the preset duplicate, `cardDelete`) patch from that answer while **only the mount and the catalog restore still call `getLibrary`**: a restore rewrites every table at once, which is the one operation no change-set can describe. Guarded two ways: `tests/unit/web/library-refetch.test.ts` counts the loads and the reloads and reads the handlers as text (proved by restoring one `await reload` in `cardDelete` and watching two cases fail), and `tests/unit/web/library-patch.test.ts` proves the merge. **Still open in this item:** the Database grid comes last, because its own refetch also replaces the draft's baseline, so `commitDatabaseDraft` has to return what it wrote rather than a `SweepReport` alone. **Sized 2026-09-21, before starting it:** that unit is bigger than this row reads — `apps/web/src/features/database/` holds **eighteen `onReload()` call sites** (`DatabaseTab.tsx` 13, `DatabaseRecord.tsx` 3, `ArchiveTable.tsx` 2), so the entry point named above is the *first* of eighteen handlers to convert rather than the whole of it, and `CatalogChangeSet` has to grow to cover what only that screen holds — entries, the field definitions and their options, field values, types and lines. One session's work, not one commit's, and it is in the folder the other agent works in — **taken 2026-09-23 by the owner's answer**, since that agent is not running. **The three deletes landed** (`7cb7bf4`, `312a73a`): `deleteSymbol`, `deleteMeditation` and `deleteMeditationType` all answer with a change-set now, and every bucket each one needed has its writer rather than being reserved for later — `symbols`, `entries`, the `intentions` inside those entries (a line belongs to its row), and for the last two `meditations` and `meditationTypes`. Those two are the type's first **removals** as opposed to rewrites, which is the distinction the doc now draws: a preset's delete clears a reference and hands the row back, while a removed meditation is gone from the plans too, so a screen has to be handed the plan rather than a row to replace by id. The type also now says why a field **value** is still not named: `field_values` is keyed by `(entityId, fieldDefId)` rather than by an id, and every value a cascade removes belongs to an entity the same cascade removed. What remains here is the screen: the Database grid's own entry point and its eighteen `onReload()` handlers, and `commitDatabaseDraft` returning what it wrote rather than a `SweepReport` alone — which is what lets a screen patch from those answers instead of spending a `getLibrary` per mutation. **Sized 2026-09-23, while taking it:** `commitDatabaseDraft` is one function in `apps/web/src/features/database/database-model.ts` that returns `SweepReport` to a single screen call site (`DatabaseTab.tsx:378`) and about twenty test call sites, so "return what it wrote" is a shape change and not an added field — and it needs this type to grow **again** first, because the rows that screen writes are ones the change-set does not carry: the columns, the options, the lines it retypes and the field values (`updated.entries`, `updated.intentions`, `updated.fieldDefs`, `updated.fieldOptions`). The good news is the same as the bad: they all have one writer, in that one function |
| P2 | 8 | open | **The lock-screen controls, on a real device** | One run on a phone: binaural on, screen locked, look for transport controls; repeat with it off; record model, OS, browser and whether audio kept playing. If they never appear, the fix is to register the Media Session over a real silent audio element — recommended, because a session on a locked screen is the product's core case |
| P3 | 9 | open | **The grid's filter matches a row's key only** | Cell values are not searched and two words are one string, so a reader cannot find a row by what is in it. Bulk actions are still absent. Widening it is a change to `DatabaseTable`'s row sources. The owner's call comes once the store has grown |
| P3 | 10 | open | **A table view for the card-only tabs** | `Audio files`, `Presets`, `Plans` and `History` show cards only. Each needs fixed columns and a `CatalogDataTable` row list. Deferred by the owner |
| P3 | 11 | open | **Delete on the `Plans` cards** | Flagged when the card actions landed and never asked for; deleting a plan lives in the planner, which refuses to remove the last one. Owner's call |
| P3 | 12 | open | **The record page still holds what the grid does not** | A meditation's `Description`, its custom fields and its duration live behind the row's `Open`. Promoting one to a column needs a column *per field* rather than per definition — a real question about the grid, not a chore |
| P3 | 32 | open | **The dangling section citations to retired plans** | ~300 code comments and a handful of doc lines (in `IMPLEMENTATION.md` and `UI_DESIGN.md`) cite a plan by section — `§5.4`, `§12.21`. Repoint each to `IMPLEMENTATION.md`, `DECISIONS.md` or the item that now carries the rule, as the file is touched. The guard pins the code count so it can only fall |
| P4 | 13 | open | **The plan's own `Display` is now uneditable** | Round 17 moved the panel onto each meditation, so `Plan.display` survives only as the default a block inherits; round 18 gave a block the way back to that default (`Use the plan's Display`), but nothing writes the plan's own. Restore a plan-level panel that writes the default, or leave it. Owner's call |
| P4 | 14 | open | **A stage's length during a run** | Editable in the editor and before Start, and nowhere once running — which is round 17's ask, and narrower than round 5's "before and during". Owner's confirmation, then either way is a small change |
| P4 | 15 | open | **"No block yet." on a finished session** | Quoted by the owner as something seen and left alone because it is true. If it reads as "not started", the completed state wants its own line |
| P4 | 16 | open | **What "everything you have on me" means** | The export is per-workspace and leaves out `userPreferences` and snapshots. Owner's call: device-wide, and whether preferences and snapshots belong in it |
| P4 | 17 | open | **The three suite-audit questions** | Serve e2e a production build instead of `next dev`; shard the e2e job in CI and stop `deploy.yml` re-running `check`; fold the cheap layout assertions together. All three change what the suite exercises, so they are the owner's |
| P4 | 18 | open | **PostCSS via Next** | An accepted risk, re-read on each Next upgrade |
| P4 | 19 | open | **`SNAPSHOT_SCHEMA_VERSION` has no reader** | Written and never read. Giving it one (rejecting or migrating an old snapshot) is a real change with a real decision in it, not a cleanup |
| P4 | 20 | open | **`btoa` / `atob` / `structuredClone` in the application layer** | The layer is not environment-isomorphic and a base64 backup costs ~3.3× memory. Both matter only if the application runs outside the browser |
| P4 | 21 | open | **The review's SQL leftovers** | `init.sql` idempotency, explicit grants, unused indexes, the orphan `profiles` table. Either changes nothing for a database that already ran the baseline, or needs its own change and the owner's call |
| P4 | 22 | open | **A type's stage template as cells; a column per *field*** | A cell type for "a list of stages" would let a type's template be edited in the Database. The neighbouring question is item 12's |
| P4 | 34 | open | **The Edge Function is outside the gate** | `supabase/functions/close-account/index.ts` is Deno, and this repo's toolchain is Node in Docker: no typecheck, no lint, no unit test reaches it. The hosted live suite is what proves it end to end. A Deno image would close the gap, and adding one is a dependency decision — [DEPENDENCIES.md](./DEPENDENCIES.md) is where it starts |
| P5 | 6 | parked | **The address change, now that recovery is by hand** | Parking was the owner's call, with the brief owed before a decision: passkeys (off today, and the one option that signs a reader in with no mail at all), anonymous sign-ins, a social provider by provider, an in-app password change for someone already signed in (no mail either), and email-plus-password kept as it is. Costs and consequences, and what each does to the beta. The evidence — the project's live settings — is recorded in [ARCHITECTURE.md](./ARCHITECTURE.md#accounts), and one premise in this row was wrong: with `mailer_autoconfirm` on, **sign-up needs no mailer at all**. **The recovery half is decided** (2026-09-22): it is by hand, so no mailer is integrated for the beta (`P1 · 36`). What is left here is the address change and the sign-in options — `mailer_secure_email_change_enabled` is on, the built-in mailer reaches project team addresses only, and the app has no screen for it. Unparked by a mailer the owner is willing to run, or by dropping that surface |
| P5 | 24 | parked | **Karuna's selector, as built, is the general rule** | Every live meditation with a symbol-carrying row, so Protection has a table instead of no home. Narrowing it to chakras and points would leave Protection's sentence visible only in the Affirmations tab. Owner's confirmation |
| P5 | 25 | parked | **A symbol-only sentence sits under `No meditation`** | The heading has no id, and `null` already means "no filter", so it is deliberately not an option in the selector. Making it selectable needs an id of its own. Owner's call |
| P5 | 26 | parked | **A `custom` row maps to Point rather than being deleted** | A one-way migration. Ask before reversing |
| P5 | 27 | parked | **The cloud's `type_id` is nullable while the domain requires one** | The cloud receives rows one at a time, so a save must not fail on a reference the reader cannot see. Changing it means a save that can fail. Ask before reversing |
| P5 | 28 | parked | **A hosted demo and real PWA icons** | Not before the beta's own gates |
| P5 | 29 | parked | **REST / gRPC around `createMeditaurApp`** | Only when a second client exists |
| P5 | 30 | parked | **Workspace sharing** | Membership exists in SQL and is unused in the UI |
| P5 | 31 | parked | **A native shell over `packages/domain` + `AudioPort`** | Only after item 29's client exists |

## Landed — do not rebuild

The detail is in [HISTORY.md](./HISTORY.md); these are the shapes that must not be
re-created a second way.

**How work is identified.** One scheme: an integer per item, a letter per subpoint, a
priority tag, a state, rounds by date — the section above is the rule, and nothing
in this tree is identified any other way. It is guarded by
`tests/unit/architecture/item-ids.test.ts`, which fails on a label from a retired
family in a living document or in a code comment, on a malformed register row, and
on a new dangling `§` citation. [HISTORY.md](./HISTORY.md) carries the crosswalk for
the labels that came before, and adding a new family instead of an item is exactly
what that guard exists to stop.

**The session.** One `startSession` → `compileSession` path, shared by the Lobby,
the planner and `/plan`'s tiles; a live session stays on its `instanceId`. A block
is a meditation with **stages**, one timer each, and carries its own alarm and its
own Display (`null` = the plan's answer). One alarm per block. `/run` is its own
full-screen shell whose main region holds whatever the stage on screen is for, and
the stage strip is the clock. Deadline-based expiry, a wake lock, a Media Session,
and an auto-scrolling intentions column whose rate is content ÷ the stage's
remaining time.

**The catalogue.** A meditation **type is a row**, and every surface that used to
switch on a kind — library tabs, Database tables, plan pickers, column pools — is
generated from those rows. One `Entry` (meditation × symbol) carries its sentences,
and `Intention` is the one table of sentences, with `entryId: null` for an orphan.
Visibility is derived: an item shows only if it and everything it references are
live.

**The Database.** `/database` is a destination, not a tab: a grid with a draft and
one Save, a filter per table and a view-level `Edit table` that hides a column
without touching the store, the library read-only and routing into it, and an
Archive page holding every archived thing with Restore and the only permanent
Delete.

**Persistence and identity.** Dexie locally, Postgres in the cloud, one workspace
per device; `AuthPort` is the only identity seam and `packages/db/src/supabase.ts`
is the only module that may import the SDK. Catalog JSON carries the whole store and
restores by merge. Deletes cascade; only the last plan and the last preset refuse.

**Already in the product.** Plans (create / switch / duplicate / delete, cycles,
autosave, drag reorder), the library's sections with card and table views, custom
fields per pool, audio files with mime and size caps, the tuner, settings with the
volume and text-size scales, session history with a weekly count, the PWA shell and
service worker, and security headers with a production-only CSP.

## Do not rebuild — the rules that keep it one app

- Do **not** add a second start button on `/plan`: `Start session` is the circuit
  session, and one-tap sessions are the **focus tiles**, not another button.
- Do not add a second compile engine, a second start path, or a second way to
  invoke Playwright.
- Do not add a display setting to the Database: what a session shows is the plan's
  `display`, and a block may answer for itself.
- Do not restore `TableView`, a plan block's `Table` field, cool-off, or a
  `BlockType`.
- Do not re-add a `FocusPoint`-shaped word, or a legacy name "for compatibility":
  stored data is **read** under the old names, never rewritten into them.
- Do not add a native `<select>`, a dropdown, a UI kit, a design-token rewrite or a
  brand pass.
- Do not add a third-party analytics SDK, an HTTP client or a state library — see
  [DEPENDENCIES.md](./DEPENDENCIES.md).
- Do not move identity, the clock, the audio graph or the compile pipeline into a
  component or an adapter's peer.
- Do not add helper scripts to `scripts/` unless this project's own command flow
  runs them (agent and owner tooling lives outside the repo).

## Not this product (do not reopen)

Already decided against. These are rules, not register items — do not start them to
"make it nicer":

- YouTube, Spotify or any streaming catalogue.
- A second timer model, or a fixed 12-stage list.
- REST / gRPC before a real second client; a native shell before that client.
- A brand, illustration or design-system rewrite.
- Notifications, calendars, social share, AI-written intentions.
- Install-app banners, another UI kit, a second HTTP client, a dashboard.
- A wizard that rebuilds `makeStarterPlan`.
- Host-global Node as the toolchain.
- A vibration alarm (removed by the owner, 2026-09-17).
- Deleting a session-history entry (declined by the owner, 2026-09-18).
- A post-session journal field — not free, and worth it only if journaling becomes
  the product.
