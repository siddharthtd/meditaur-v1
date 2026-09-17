# Architecture

Hexagonal (ports and adapters). New features add a use case or an adapter; they do not rewrite domain or shuffle folders.

**Status 2026-09-16.** The session is complete and proven: one `startSession` →
`compileSession` path (Lobby **Start session**, Plan **Start session**, `/plan` focus tiles),
`/run` as its own full-screen shell, ambient/alarm media with size and mime
caps, snapshot/log GC, `Plan.revision` CAS, isolated tuner/runner mixers, and
run-mode Playwright. Requirements v2 is landed: kind `point`, chakra
representation fields, `Intention` with a nullable focus, `FieldDef.entityType`
pools, per-entity library tables, and the draft-based binaural config screen.
Catalog backup is `schemaVersion` 4 (v1/v2/v3 restore backfills). Throws are
`AppError { code, message }`. Domain, Dexie, and `supabase/migrations` must
describe the same product; the 2026-09-15 review
([ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md)) found divergences from that
contract, and **its Phase 0 — the four critical fixes — plus Phase 1 (accounts),
Phase 2 (config retention) and all of Phase 4 (the UI redesign) have since
landed.** What is left: the review's M7 (the refetch-per-mutation, which only
pays off against a remote store), M9 (the event/analytics port), Phase 3, and the
deferrals at the end of the roadmap. The review's §5
divergence table is down to those same items. Local/CI Node is **24.20.0**;
`engines` and Vercel are
**24.x**. No second API, no brand rewrite.
Third-party libraries: [DEPENDENCIES.md](./DEPENDENCIES.md). Done vs next:
[ROADMAP.md](./ROADMAP.md).

## Review 2026-09-15

The full review is [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md). It found
four critical defects — a Dexie v6 primary-key change that breaks upgrades of
existing databases, a Postgres `field_values` FK that still points at
`symbols(id)`, RLS policies that block first-workspace creation and allow role
escalation, and a non-atomic `Plan.revision` CAS — plus the major gaps that block
accounts and sync (missing `AuthPort` and event ports, no per-row versioning,
cross-tenant reads).

**All four critical fixes landed 2026-09-15**, each with a regression test, so
none of them is a live constraint on new work. The gaps that remain — no per-row
versioning (M5), the full-catalog reload per mutation (M7), the event port
(M2/M9), and the blind preferences overwrite (M11) — belong to the phases in
[ROADMAP.md](./ROADMAP.md).

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

## Accounts (P2.6 design contract)

Email login is the next product step. Pinned **2026-09-15**. The port and both
adapters exist: `createLocalAuthPort` (no cloud config, the product stays
Dexie-only) and `createSupabaseAuthPort` in `packages/db/src/supabase.ts`,
which is the **only** module allowed to import `@supabase/supabase-js` — the
integrity test enforces both halves. `composition.ts` picks between them from
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, so a build with no
pair leaves the SDK inert. Verified against the local stack
(`./scripts/meditaur up`); real login is verified against the hosted project
(2026-09-16), and `./scripts/meditaur cloud` is the command that keeps the two in
step.

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
`packages/db/src/supabase.ts`, the Supabase module — the client, the auth adapter,
and (since Phase 2) the preferences adapter. It lives in `packages/db`, which
already carries the repo's external persistence dependency (`dexie`) and the
Postgres schema alignment, and the integrity test pins the **path**, so a second
importer cannot appear by accident. If it outgrows the package, splitting it into
its own adapter package is allowed without touching domain.

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

**Preferences are the one thing that syncs (Phase 2).** Signed in, the reader's
preference row is cloud-authoritative and Dexie keeps a copy of it. Everything
else — the catalogue, plans, history — stays local and is the separate change
under [Sync](#sync-when-accounts-exist). No CRDT, no merge vectors, no offline
mutation queue, no realtime in this step.

**Local-first is preserved.** With no signed-in user it is Dexie-only, exactly as
today: sessions, planner, library, and tuner keep working with no account. Signing
in adds identity and, later, cloud persistence — it must not gate `/plan`,
`/run`, or `/library`.

**Where keys live.** The browser gets the anon/publishable key only, via
`NEXT_PUBLIC_*`; on Vercel those are project settings, not repo files. The
service-role key stays in the operator's `.env` for tests and never reaches the
bundle. [IMPLEMENTATION.md](./IMPLEMENTATION.md) carries the gate that fails
`pnpm check` if key material is committed.

**Pre-requisites (2026-09-15 review).** These were the blockers, and they are
**all landed**: Phase 0's RLS work lets a user create their first workspace and
stops `members_self` from granting role escalation (C3); the legacy `local-dev`
identity is gone and adoption runs in a Dexie transaction (M3); every id-taking
use case is workspace-scoped (M6). **The hosted project exists as of
2026-09-16** — created that day, all 14 migrations applied by
`./scripts/meditaur cloud` (the last two, `user_preferences.revision` and the
catalogue row versioning, pushed 2026-09-17), and real login verified end to end
(live suite green against it, browser sign-in with adoption, `/account` naming
the user), so this
last blocker is gone. Phase 2 is what took it up, and it landed 2026-09-16 — the
preference store below is the first thing an account does beyond identifying the
reader.

## Sync (when accounts exist)

The preference row is the first, and for now only, thing that syncs (Phase 2 —
[the store contract](#the-preference-store-phase-2) below). Everything else is
cloud-authoritative when it lands: Dexie is an offline cache of the user’s
workspace, not a CRDT. Do not invent merge vectors. Conflicts on plans fail
visibly via `Plan.revision` CAS — the read, the check, and the write run in one
transaction, so the CAS is actually atomic (review C4, landed 2026-09-15).
Schema contract: domain types, Dexie, and `supabase/migrations` must describe the
same product; the remaining divergences are in the review §5 and must be closed
before cloud sync is real.

### The preference store (Phase 2)

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

The realtime loop stays on the device: `SessionEngine` is deadline-based,
`SessionSnapshot` is the immutable run document, and audio is synthesized
locally. Do not add a session service, streaming, or a CRDT — that decision is
made, not open.

## Tests vs source vs pipeline

| Tree | Contents |
| --- | --- |
| `packages/*/src`, `apps/web/src` | Production code only |
| `tests/unit`, `tests/integration`, `tests/e2e`, `tests/fixtures` | Tests |
| `infra/`, `.github/`, `scripts/`, root `package.json` | Build and deploy |

Changing CI, Docker, or Playwright config must not require edits under `packages/*/src`.
