# Architecture

Hexagonal (ports and adapters). New features add a use case or an adapter; they do
not rewrite domain or shuffle folders.

**Status 2026-09-21.** The session was already complete, and the owner's rounds
13–17 have since moved the model on: the catalogue is a store the reader edits
(`/database`), a **meditation type is a row** rather than a code union, a block runs
**stages** with one timer each and carries its own **alarm** and its own **Display**
(both `null` for "the plan's answer"), `Intention` is the one table of sentences, and
the run screen is three regions in one viewport whose main region holds whatever the
stage on screen is for. Accounts, cloud preferences and the RLS work are landed and
verified against the hosted project.
**Done vs next** is [ROADMAP.md](./ROADMAP.md), the owner's answers are
[DECISIONS.md](./DECISIONS.md), the invariants are
[IMPLEMENTATION.md](./IMPLEMENTATION.md), and what already landed — including the
2026-09-15 review and its four critical fixes — is
[HISTORY.md](./HISTORY.md). Third-party libraries:
[DEPENDENCIES.md](./DEPENDENCIES.md). Throws are `AppError { code, message }`.

**The contract that holds it together:** domain types, Dexie and
`supabase/migrations` must describe the same product, and they move in lockstep —
a union or a column lands in all three in one change, guarded by
`tests/unit/architecture/integrity.test.ts` and `schema-unions.test.ts`.

## Dependency direction (no cycles)

```
apps/web  (composition + UI)
    → packages/application  (use cases / MeditaurApp)
        → packages/domain   (entities, compile, SessionEngine, port interfaces)
    → packages/db           (Dexie implements domain ports)
    → packages/audio-web    (Web Audio implements AudioPort)
    → packages/ui           (widgets)

tests/                      (depends inward; nothing in src depends on tests)
infra/  .github/  scripts/  (build/deploy; do not import from packages/*/src)
```

ESLint `no-restricted-imports` enforces the inner layers.

**The session** is the one path everything shares: `startSession` → `compileSession`
(the Lobby, the planner, and `/plan`'s tiles), with the run screen reading an
immutable `SessionSnapshot` and the engine deadline-based through `Clock`. Do not
add a second compile engine, a second start button, or a session service: the
realtime loop stays on the device, and audio is synthesized locally.

**The catalogue** is one store with one derived rule: an item is visible only if it
and everything it references are live. A type row generates its own library tab,
Database table, column pool and plan picker group, so a type the reader adds appears
everywhere at once with nothing to register.

## REST and gRPC later

Do not add a second API surface inside Next.js pages. `createMeditaurApp` is the application API.

When HTTP exists, both transports call the same methods:

```
REST handler  ─┐
               ├─→ createMeditaurApp(ports).compileAndStoreSession(plan)
gRPC service  ─┘
```

Suggested future layout (do not create until a transport is real):

```
apps/api/src/rest/   # map HTTP DTOs → MeditaurApp
apps/api/src/grpc/   # map protobuf  → MeditaurApp
```

Protobuf/OpenAPI belong in `infra/` or `apps/api`, not in `packages/domain/src`. Domain types stay the language of the core.

## Accounts — the design contract

Pinned 2026-09-15, and built. The port and both adapters exist: `createLocalAuthPort`
(no cloud config, the product stays Dexie-only) and the Supabase adapter in
`packages/db/src/supabase.ts`, which is the **only** module allowed to import
`@supabase/supabase-js` — the integrity test enforces both halves.
`composition.ts` picks between them from `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, so a build with no pair leaves the SDK inert.
Verified against the local stack (`./scripts/meditaur up`) and end to end against
the hosted project (2026-09-16); `./scripts/meditaur cloud` is the command that
keeps the two in step.

Identity adoption is in: `WorkspaceRepository.adopt` claims the unclaimed local
seed workspace for the first signed-in user in one Dexie transaction, and a
workspace another user already claimed is left inert rather than re-pointed. The
Supabase SDK persists the session itself, so a reload restores it and nothing
local is stored for that. `SessionProvider`
(`apps/web/src/features/auth/SessionProvider.tsx`) is the single bootstrap —
components read `useSession()` instead of calling `app.bootstrap()`.

Known limitation until cloud workspaces exist: a second user signing in on the
same device is also handed the local workspace, because Dexie holds one database.
Per-user workspaces belong to the sync step.

**The port.** `AuthPort` belongs in `packages/domain` beside the other ports: no
npm, no SDK types, no Supabase-shaped objects crossing the boundary. It exposes
the current `userId: string | null`, sign-in, sign-out, and a session-change
subscription. Session expiry is deadline-based via `ports.clock` — never
`setInterval`, the same rule the session engine already follows.

**The adapter.** Exactly one module may import the SDK:
`packages/db/src/supabase.ts` — the client, the auth adapter, the preferences
adapter and the events adapter. It lives in `packages/db`, which already carries
the repo's external persistence dependency (`dexie`) and the Postgres schema
alignment, and the integrity test pins the **path**, so a second importer cannot
appear by accident. If it outgrows the package, splitting it into its own adapter
package is allowed without touching domain.

**Sign-up is a second outcome, not a second flow.** `AuthPort.signUp` resolves a
`SignUpOutcome`: `signedIn` when the provider also signed the new reader in, and
`confirmationRequired` when it is waiting on the address — Supabase returns a
user and **no** session in that case, and claiming a session we cannot prove
would be worse than saying nothing happened yet. The application adopts the
device's workspace on `signedIn` only, and the panel has a real state for the
other branch rather than a form that silently did nothing. One `AuthPanel`
serves `/login` and `/signup`; the SDK stays behind the adapter in both.

**Identity is adopted, not replaced.** `seed.ts` mints stable UUIDs (`LOCAL_USER`,
`LOCAL_WS`) deliberately, so Postgres `uuid` columns accept them and tests stay
deterministic. On the first successful session the local workspace is rewritten
to the authenticated user id **in one Dexie transaction**; a workspace already
carrying that id is a no-op. Never randomize bootstrap ids per run.

**Two users, one device.** Every row is `workspaceId`-scoped, so: each
authenticated user opens their own workspace, and the unclaimed local seed
workspace belongs to the first user who signs in and stays inert for anyone else.
Never re-point another user's workspace at the signing-in user.

**Preferences are the one thing that syncs.** Signed in, the reader's
preference row is cloud-authoritative and Dexie keeps a copy of it. Everything
else — the catalogue, plans, history — stays local and is the separate change
under [Sync](#sync-when-accounts-exist).

**The account's flags are a second per-account row, and the owner's alone.**
`public.account_flags` holds one row per account — the flags, and the `is_admin`
marker that decides who may set them — keyed by `user_id`, so closing an account
takes it too (`on delete cascade`). RLS allows **self-select and no write at all**:
the browser has to read its own row, because the flags decide what the app draws,
and no account may edit its own, because a flag is the owner's decision about that
account rather than a preference. The writer is the service role inside the `admin`
function (`P0 · 23` slice 23e): it verifies the caller's marker with the service role,
refuses anything that is not an admin, and only then writes. The marker itself is set
once, by hand — the statement is at the foot of this section. The key list is a named check, and
`tests/unit/architecture/feature-flags.test.ts` keeps it in step with the domain's
union; every default is true, so an account with no row at all is an account with
everything on.

The app's copy of that row is a **Dexie mirror** (`accountFlags`, written only from a
read the cloud answered), and the read goes to the cloud first even so: a flag *hides*
a surface, so the mirror is the offline answer rather than the first one. A read that
fails serves the mirror and not the defaults — the other order would turn every tunnel
into "everything is on", which is the only direction that leaks a hidden surface.

**Where a gate is asked.** Every flag has one seam for the surfaces it hides, and it is the
**offer** — the list, the tab, the table strip, the column, the switch, the screen a reader
would choose the feature from — never the store read. The store keeps answering with the
whole catalogue, which is what keeps a reader's own row visible (a symbol that names no
system is never hidden by a system's flag).

**The session is the exception, and it is deliberate** (`P0 · 37`, the owner's answer
2026-09-23: *"session should never show items that are blocked on an account"*): the
library the compile is handed carries the account's own symbol list, so nothing a flag hides
can appear in a run — and a block that still names a symbol outside the account is
**refused**, with a sentence that names the symbol, says to point the block at another one (or
at `None`) so the session runs without it, and says who to ask to change the account instead.
Nothing is migrated for that, and the reason is not convenience: no account has been released,
so no stored plan's continuity is at stake, which is what makes refusing the honest answer
rather than the harsh one. `binaural` off is the same rule read as silence — the session
compiles **silent** (`binauralSilent`) rather than muting a switch after the fact.

And erasure is never gated: `Erase this device's data` and `Close this account` stay whatever
`account_management` says, because erasure is a right rather than a surface (`DECISIONS.md`
§11).

**Local-first is preserved.** With no signed-in user it is Dexie-only, exactly as
today: sessions, planner, library, and tuner keep working with no account. Signing
in adds identity and, later, cloud persistence — it must not gate `/plan`,
`/run`, or `/library`.

**Where keys live.** The browser gets the anon/publishable key only, via
`NEXT_PUBLIC_*`; on Vercel those are project settings, not repo files. The
service-role key stays in the operator's `.env` for tests and never reaches the
bundle. [IMPLEMENTATION.md](./IMPLEMENTATION.md) carries the gate that fails
`pnpm check` if key material is committed.

**The server surfaces.** Two things the browser cannot do, each because it needs the
service-role key, which never reaches the app bundle. `supabase/functions/close-account/`
is an Edge Function that reads the caller from the Auth API, runs `delete_my_data()`
with the caller's own token so RLS still decides, and only then deletes the
`auth.users` row. `supabase/functions/admin/` (`P0 · 23`, slice 23e) is the only
writer of `account_flags`: it resolves the caller the same way, then reads that
caller's own `is_admin` **with the service role** — with the caller's own token that
would be asking the reader whether they are an admin — refuses anything but `true`,
and only then serves `list`, `set-flags`, `create-account` and `set-password`.
Neither imports anything: the one-SDK-importer rule is about importers, and a
function is a second runtime rather than a second one. `./scripts/meditaur cloud
--yes` deploys both with the migrations, so a release cannot ship a caller without the
other half.

**The one manual step.** An admin is made once, by hand, and the marker is writable by
no action — so an admin cannot mint another, and its absence means false. Run this
against the hosted project (the SQL editor, or `psql` with the operator's `.env`):

```sql
insert into public.account_flags (user_id, is_admin)
values ('<the owner's user id>', true)
on conflict (user_id) do update set is_admin = true;
```

`<the owner's user id>` is the id the Account screen reports as `Signed in as …`.
After that the function is the way every other account's flags change; the screen that
calls it is the panel (`P0 · 23` slice 23f, `UI_DESIGN.md` §4.1).

**What the hosted project is set to.** Read, not assumed — 2026-09-21, via
`GET https://api.supabase.com/v1/projects/nuiuilnhshxyhtpjovbe/config/auth` with
the CLI's token (it lives in the macOS keychain, not in `~/.supabase`):

| Setting | Value | Why it matters |
| --- | --- | --- |
| `mailer_autoconfirm` | `true` | Sign-up returns a session, so **no SMTP is needed to sign in** or sign up. This is what makes the beta openable without a mailer |
| `site_url` · `uri_allow_list` | the Vercel address · production, preview and `localhost:3000` patterns | A redirect from any of the three is accepted, and from nowhere else |
| `password_min_length` | 8, no required character classes | What the sign-up form should mirror |
| providers enabled | email, **and nothing else** | Anonymous sign-ins, phone, CAPTCHA and passkeys are all off |
| `jwt_exp` · `mailer_otp_exp` | 3600 · 3600 | An hour; the adapter is deadline-driven off `expires_at` rather than polling |
| `mailer_secure_email_change_enabled` | `true` | **Changing an address sends a mail** — the one reader-facing action that the built-in mailer cannot serve, since it only reaches project team addresses |

What that means for mail, now that the owner has answered it. **A password reset sends
nothing.** The sign-in screen says to ask the person who set the account up, and that
person sets a new password from the admin panel — the `admin` function's `set-password`,
which needs the service role and no mailer (`DECISIONS.md` §11, `P1 · 36`). So no SMTP is
allowlisted and no mail provider is added to
[DEPENDENCIES.md](./DEPENDENCIES.md). **An address change still would**: the built-in
mailer reaches project team addresses only, and this app has no address-change screen, so
that is the half left in `P5 · 6`. A password change by a reader who is already signed in
needs no mail either, and neither do passkeys.

## Sync (when accounts exist)

The preference row is the first thing that syncs (the store contract below), and it
is where the protocol is already visible: a save is a compare-and-swap and the store
owns it. Everything else is cloud-authoritative when it lands: Dexie is an offline
cache of the reader’s workspace, not a CRDT, and a row is settled by **revision** —
the higher one is the row, quietly, with no conflict screen to answer
([DECISIONS.md](./DECISIONS.md) §7). `Plan.revision`’s CAS stays what it is: the
guard against a second tab on *this* device, not a merge.

Two halves of the schema are in place, because a pull cannot be written without them:

- **The delete mark.** Every catalogue row carries `deletedAt` — on `Versioned`, so
the mark sits with the revision it travels with — and `deleted_at` is in SQL and in
Dexie **v27**. A delete cannot travel as an absence: a row that vanished on one
device would look new to the other and come back. It is deliberately not
`archivedAt`, which is the reader’s own undo and drawable in the Archive. **Plans and
their blocks carry it too**, since `20260923140000_plan_delete_marks.sql`: slice 1 left
them out — correctly, about how a plan is *settled* — but `deletePlan` exists and only
the last plan refuses, so a plan has to be able to travel as gone; the same is true one
level down, for a block the reader removes from a plan. Neither table gained an index
with the mark, deliberately: a workspace holds a handful of plans and a pull reads them
whole to compare revisions, so an index nothing queries would be the dead structure the
id rules warn against.

**The device's own store marks too**, since `P2 · 3`'s slice 3: `packages/db/src/ports.ts`
marks the row rather than removing it and leaves the marked rows out of every read, so a
delete made offline is a change the protocol can carry instead of an absence the other
device would undo. `deleteMark` (`packages/domain/src/delete-mark.ts`) is the one rule
all three stores write.
- **The read a pull makes.** `(workspace_id, updated_at desc)` on each catalogue
table — “this workspace’s rows that moved since my watermark”, tombstones included,
which is why the index is not partial on the mark. `field_values` is scoped by its
entity rather than by a workspace, so its index is the timestamp alone. Migration
`20260921140000_sync_delete_marks.sql`.

What sync still owes is in [ROADMAP.md](./ROADMAP.md): the schema, the row mappers,
both cloud adapters, the local store's delete mark, the watermark store, both halves
of the protocol and the wiring that picks a port have all landed (`P2 · 3`'s slices
1–4), so what is left of the item is the copy that tells the reader their data moves.
What is left of the *proof* is a run against a real database, which has not happened
yet — item `3a` holds that gap and the decision it needs. This is also where the
two-users-one-device limitation ends.

### The preference store

`PreferencesRepository.save` is a compare-and-swap, and it belongs to the
**store**, not the caller: one Dexie transaction locally, one conditional update
(`revision` in the `where`) remotely. A read-then-write in the application cannot
be atomic anywhere but in the store — and a preference write may now be a network
call, which no caller-side transaction can span. The port returns `null` for a
refused write and the application turns that into the one sentence a reader sees.

`createCachedPreferences` (`packages/db`) is what the app is given when the cloud
pair is configured. The cloud answers reads and takes writes; the Dexie row is a
copy, written **only** from a row the cloud already accepted, so the two cannot
disagree about a revision nobody wrote. A read that cannot reach the cloud falls
back to the copy — settings must not become unreadable in a tunnel — while a
write that cannot reach it fails visibly, because there is deliberately no offline
mutation queue. Only the reader the session names is served from the cloud: a
signed-out device is local, exactly as before.

The cost, stated plainly: while signed in, loading or changing a setting waits on
the network, and the session compile reads the preference too. The fallback keeps
that working offline; it does not make it instant.

## Tests vs source vs pipeline

| Tree | Contents |
| --- | --- |
| `packages/*/src`, `apps/web/src` | Production code only |
| `tests/unit`, `tests/integration`, `tests/e2e`, `tests/fixtures` | Tests |
| `infra/`, `.github/`, `scripts/`, root `package.json` | Build and deploy |

Changing CI, Docker, or Playwright config must not require edits under `packages/*/src`.
