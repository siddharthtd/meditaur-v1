# The account's flags, the panel, and a hand-run reset

**What this is.** The detail behind three register rows. The owner's answers of
2026-09-22 are in [DECISIONS.md](./DECISIONS.md) §11; the ids, priorities and
states are in [ROADMAP.md](./ROADMAP.md), which is the only place state lives. This
file holds what a builder needs and a row cannot carry: the slices, the seam each
gate lands on, the traps, and how each slice is verified.

It is **retired into [HISTORY.md](./HISTORY.md) when item 36 closes**, the way the
round-15, round-16 and Database plans were retired before it. Until then it is the
one document allowed to describe work that is not built.

## Where the work is tracked

| Item | P | State | What it is |
| --- | --- | --- | --- |
| 23 | P0 | open | The flags' vocabulary, the table they live in, and the panel that writes them |
| 35 | P0 | open | The surfaces a flag hides |
| 36 | P1 | open | The reset by hand — the copy, the panel action, and the four documents that assert a mailer |
| 6 | P5 | parked | Narrowed by 36: what remains parked is the address change |

**23 blocks 35** — nothing can be hidden until a flag has a value — and **35 blocks
the beta**, because the owner's gates are flags rather than a build. Item 34 (the
Edge Function outside the gate) covers the second function this plan adds once it
exists; nothing here changes that row today.

## The owner's answers, 2026-09-22

- *"I want the feature flags to be enabled per account, the admin-panel should be
  the one that enables it. For every account that I create, the page should have
  these feature flags, I'll enable the ones that I deem fit for the user."*
- *"a regular usui-reiki feature flag which enables hon-sha-ze-sho-nen, sei-hei-ki
  and cho-ku-rei, then a usui-master ff which enables the dai-kyo-mo and a
  karuna-reiki feature flag which enables the gnosa, iawa, shanti, kriya, halu and
  zonar"* — plus *"The Karuna Database is only available on the karuna-reiki FF,
  chakras should also be on their own FF (default enabled everywhere), binaural
  beats as their own FF (also enabled by default), auto-scroll should be its own
  feature flag etc."*
- *"Where you keep these feature flags depends on how this affects your
  architecture."* The storage shape is therefore this plan's, recorded in §11.
- **Account management is the account surfaces, not a demo tier.** The owner's
  first reading — a demo over the seeded catalogue — was put back, explained, and
  not taken: with the flag off there is no sign-in, no sign-up and no account half
  of the Account screen, and the app is otherwise complete and local-first.
- **A flag hides surfaces and keeps the data, and a stored plan still runs.**
- **Administering is a marker in the database**, and the panel may create accounts
  and set a new password.
- **The reset is by hand** — one sentence on the sign-in screen, no mailer, no
  SMTP.
- **The beta ships everything working**: account management, the panel and the
  flags all live, with the per-account values the owner's to set.

## The shape

**One vocabulary.** `packages/domain/src/feature-flags.ts` exports the union —
`account_management`, `admin_panel`, `karuna_reiki`, `usui_reiki`, `reiki_master`,
`chakras`, `binaural`, `auto_scroll` — with a label and a one-line summary each,
`DEFAULT_FEATURE_FLAGS` with every flag **true**, and the pure questions a surface
asks: `flagIsOn`, `visibleSymbols`, `visibleTypes`. The three reiki names are
already `ReikiSystem`'s values, so the flags add no second vocabulary for them, and
`isSymbolSystemEnabled` in `packages/domain/src/reiki-systems.ts` takes the flag set
instead of reading a constant — which is what finally gives `DECISIONS.md` §4's
Karuna gate a caller. `ENABLED_REIKI_SYSTEMS` retires.

**Every default is true**, so a device with no cloud, nobody signed in, or no row
behaves exactly as the app does today; the beta's gates are then the owner's
per-account choices rather than a build.

**A value lives in one new cloud row.** `public.account_flags` — `user_id` primary
key to `auth.users` with `on delete cascade`, `is_admin boolean not null`, `flags
jsonb not null default '{}'` (a sparse set: an absent key is the default),
`updated_at`. Row level security allows **self-select only** and grants **no
self-write policy at all**, so the browser can read its own row and no account can
edit its own flags; the writer is the service role inside an Edge Function. A
migration is additive and re-runnable, its check is named, and it widens the flag
key list when a flag is added — `tests/unit/architecture/feature-flags.test.ts`
reads the union out of the domain and the key list out of the migration, the way
`schema-unions.test.ts` does for `text_size`.

**The app learns them once, at bootstrap.** A `FeatureFlagsPort` in
`packages/domain/src/ports.ts`; the Supabase adapter reads the caller's own row
through `packages/db/src/supabase.ts` (still the one SDK importer); a Dexie mirror
table, written only from an accepted cloud read, keeps a reader with flags off from
seeing them on while offline. `MeditaurApp.bootstrap()` resolves them beside the
session, so `useSession()` is the one source and no screen paints the wrong tabs
before the flags arrive.

**What a flag does.** It hides its feature's **surfaces** — tabs, Database tables,
editors, switches, run-screen controls — at **one seam per feature**, and leaves
every stored row alone. A plan made while a feature was on still runs. Flags are
product gates, not security boundaries: the local catalogue is the reader's own
data, and the only real boundaries are the table's policies and the function's
admin check.

**Who administers.** `is_admin` on the account's own row, set once by a documented
statement (the plan's one manual bootstrap step). The panel is reachable iff the
account is an admin **and** `admin_panel` is on, and it is not a nav entry.

## Item 23 — the flags, the store, and the panel

Each slice leaves `./scripts/meditaur check` green; the item closes on `check:full`.

- **23a — the vocabulary.** `packages/domain/src/feature-flags.ts`; export it from
  `packages/domain/src/index.ts`; change `isSymbolSystemEnabled` and drop
  `ENABLED_REIKI_SYSTEMS`; update `tests/unit/domain/reiki-systems.test.ts`.
  `tests/unit/domain/feature-flags.test.ts` is the new pure half: defaults, an
  absent key, a symbol that names no system never being hidden.
- **23b — the table and its policies.** `supabase/migrations/<new>_account_flags.sql`
  and its named check. Proved inside the local stack before it is applied anywhere:
  `./scripts/meditaur up`, then the file through `psql` with `begin; … rollback;`.
- **23c — the port and the two adapters.** `FeatureFlagsPort` in the domain;
  `packages/db/src/flags-local.ts` answering defaults and `notConfigured`; the
  Supabase read in `packages/db/src/supabase.ts`; the Dexie mirror at a **new Dexie
  version** (a new table is safe — never a primary-key change) with its row in
  `tests/unit/db/transaction-scope.test.ts`. `normalizeFeatureFlags` is the
  function a row written before a flag existed goes through.
- **23d — the read path.** `create-app.ts` exposes `getFeatureFlags()`;
  `apps/web/src/features/auth/SessionProvider.tsx` resolves it with the session and
  its `SessionValue` carries it; the screens that draw a gated surface read it from
  `useSession()`. The integrity test's "only the provider calls `bootstrap()`" rule
  is unchanged.
- **23e — the function.** `supabase/functions/admin/index.ts` (Deno, service role):
  verify the caller's JWT, read the caller's own `is_admin` **with the service
  role**, then `list`, `set-flags`, `create-account`, `set-password`. It follows
  `supabase/functions/close-account/index.ts` — its own `ALLOWED_ORIGINS`, its own
  deploy step in `scripts/cloud.sh`, a deploy-surface row in
  [DEPENDENCIES.md](./DEPENDENCIES.md) (no new package). Writes return the stored
  row so a screen patches rather than re-reads, the shape item 4 landed.
- **23f — the panel.** `apps/web/src/app/(app)/admin/page.tsx` with the screen in
  `apps/web/src/features/admin/`. A table of accounts, each row carrying the eight
  latches, plus `Create account` and `Set a new password`. A new route owes four
  things: the page, a `Suspense` boundary if it reads the query string, `ROUTES` in
  `tests/e2e/warmup.ts`, and `SHELL` in `apps/web/public/sw.js` with the cache
  `VERSION` bumped. Any class only `packages/ui` names is pinned in
  `apps/web/src/lib/ui-package-classes.ts` in the same change.
- **23g — the guards.** A source-text test in `tests/unit/architecture/` that the
  panel's flag list, the domain union and the migration's key list come from one
  constant; `tests/unit/application/create-app.test.ts` cases for defaults when
  signed out, a cloud row when signed in, and a non-admin refused even with
  `admin_panel` on; `tests/integration/admin-flags.test.ts` for self-select allowed
  and self-write refused, live.
- **23h — the bootstrap step.** Marking the owner's account `is_admin` is one
  documented statement, written into [ARCHITECTURE.md](./ARCHITECTURE.md) with the
  accounts section. It is not a script: agent and owner tooling never lives in
  `scripts/`.

## Item 35 — the surfaces a flag hides

One seam each, so a gate cannot be forgotten in half the app.

- **35a — `chakras`.** Filtered inside the type listing every surface already
  shares, so the library tab, the Database table and the plan headings all inherit
  one answer. A stored plan that uses a chakra still runs.
- **35b — the reiki systems.** One symbol-listing seam — the library's Symbols tab,
  the Database's Symbols table, the plan picker and the run screen — filtered
  through `isSymbolSystemEnabled(system, flags)`. A symbol naming no system is
  never hidden, which is the property the flag already documents.
- **35c — `karuna_reiki`.** The Database's `Karuna` table (the `entries` grid), the
  `Affirmations` table that draws the same rows, and the planner's symbol-carrying
  sentence picker. `DECISIONS.md` §4 called this "the Karuna tab"; the tab is a
  Database table since the Database landed, and the gate lands there.
- **35d — `binaural`.** The binaural editors, the preset editor's entry points, the
  tuner's way in, and the run screen's binaural latch.
- **35e — `auto_scroll`.** The `Scroll` latch on the run screen and the editor's
  auto-scroll switch, with the derivation defaulting off rather than the stored
  stage being rewritten.
- **35f — `account_management`.** The sign-in and sign-up links, the `/login` and
  `/signup` screens, and the `Account` page's account half — status line, sign-in
  link, `Close this account`. The `This device` half stays, so the `Account` nav
  entry stays; that is a deliberate deviation from the option the owner picked and
  is recorded in §11.
- **35g — the e2e proof.** A spec that fabricates an `accountFlags` row in Dexie
  **on the app's own origin** — the technique the upgrade-path work pioneered, since
  the e2e suite runs with no Supabase pair — then reloads and asserts the gated
  surfaces are gone while the stored plan still runs. The default state stays
  asserted by the existing specs.

## Item 36 — the reset, by hand

- **36a — the copy.** One sentence on the sign-in screen. No route, no form, no
  redirect URL, no mailer.
- **36b — the panel action.** `Set a new password`, from 23e. That is what "manual"
  means: the owner presses it and hands the password over.
- **36c — the four documents.** `REVIEW_LOG.md`'s still-open rows assert the reset
  "needs SMTP … two routes"; its accounts-round row says "the reset flow sends its
  own mail, so it still needs an allowlisted SMTP"; `HISTORY.md`'s password-reset
  row says the gate is unchanged; `DECISIONS.md` §7 calls recovery "the one thing on
  this list that needs a mailer"; and `ARCHITECTURE.md` says a reset and an address
  change "both wait on an allowlisted SMTP in DEPENDENCIES.md", where there is no
  mail row to allowlist. Each is corrected in the same pass, and the retired
  password-reset label closes in [HISTORY.md](./HISTORY.md)'s crosswalk.
- **36d — item 6.** Rewritten to the address change: `mailer_secure_email_change`
  is on, the built-in mailer reaches project team addresses only, and the app has no
  address-change screen.

## What this deliberately does not do

- **Not the "dashboard" the do-not list refuses.** That rule is about the reader's
  app growing an analysis surface; the panel is the owner's own tool over accounts.
- No mail provider, no SMTP, no `/forgot-password`, no recovery link.
- No demo tier — the owner considered a seeded-catalogue mode for
  `account_management` and took the account surfaces instead.
- No reader-facing way to edit a flag: defaults plus the admin, nothing else.
- No workspace-scoped flags (item 30 is where sharing lives) and no new npm package,
  Docker image or CI tool.
- Nothing in the other session's items 3 and 4 — `ROADMAP.md`, `packages/db/src/schema.ts`,
  `packages/db/src/supabase.ts` and `scripts/cloud.sh` are shared files, so the
  next agent re-reads each before editing it.

## Standing rules for whoever builds it

- Name every file in a commit; never `git add` a directory. Read `git diff --cached
  --stat`, and a shared file's hunks, before committing.
- Domain, Dexie and `supabase/migrations` move in lockstep; a union gets its SQL
  check in the same change.
- e2e runs in a private compose project against a freshly built image, and two
  consecutive clean runs are the bar for a new UI test. Grep the log for `flaky`.
- Stop at the peak-hours gate; do not retry a refused call.

## How each slice is verified

1. `./scripts/meditaur check` after every slice; `check:full` to close an item,
   with the unit / both live suites / build / e2e counts and the flaky grep
   recorded.
2. The migration proved in the local stack with `begin; … rollback;` before any
   `cloud --yes`.
3. Live proof of the boundary: self-select works, self-write is refused, the
   function refuses a non-admin caller.
4. Every guard proved by disabling the fix and watching it fail — the gate helper,
   the function's admin check, the Dexie-fabricated spec.
5. A manual pass on the deployed beta: flip one flag for a test account and watch
   that reader's app change after a reload.
6. `./scripts/meditaur check` after the docs, because markdown is a unit-test input.

## To confirm with the owner before the slice that needs it

1. **`binaural` off**: silent, or a stored plan still audible? The recorded rule is
   "a stored plan still runs", which is satisfied either way; hiding only the knobs
   is the weaker reading.
2. **The panel's actions**: does it also need `Close this account` for another
   account, or is closing the reader's own business (item 5's answer)?
3. **The symbol lists**: the seed already tags twelve symbols with a system, and the
   owner's three lists name six Karuna, three Usui and one master symbol. The slice
   verifies the map against the seed and reports a mismatch rather than re-authoring
   the catalogue.
