# What has landed — the archive

This file replaces six documents that described rounds which are over. It is a
record, not a plan: nothing here needs to be read before changing code, and the
rules that came out of these rounds now live in
[DECISIONS.md](./DECISIONS.md) (the owner's calls) and
[IMPLEMENTATION.md](./IMPLEMENTATION.md) (the invariants). What is *next* is
[ROADMAP.md](./ROADMAP.md); the owner's ask-by-ask record is
[REVIEW_LOG.md](./REVIEW_LOG.md).

**The documents this replaces, and how to read them again.** All six were retired
on 2026-09-21 and are unchanged at the commit that last carried them:

```bash
git show a95ed35:docs/ARCHITECTURE_REVIEW.md      # 2026-09-15, the code review
git show a95ed35:docs/HARDENING_REVIEW.md         # 2026-09-17, the outside review
git show a95ed35:docs/DATABASE_TAB_PLAN.md        # the Database tab's design
git show a95ed35:docs/MEDITATION_TYPES_PLAN.md    # round 15's design
git show a95ed35:docs/MEDITATION_TYPES_HANDOVER.md # a handover for finished work
git show a95ed35:docs/INTENTIONS_AND_SESSION_PLAN.md # round 16's design
```

Their §12/§2 answer lists, their deviation logs and their trap lists are the
detail this summary compresses; the deviations that still matter are in
[DECISIONS.md](./DECISIONS.md).

Seventh, on **2026-09-23**, when the last slice of `P0 · 35` landed:

```bash
git show 667b052:docs/ACCOUNT_FLAGS_PLAN.md   # the account's flags, the panel and the reset
```

The flags' plan is the one document that outlived its own item: item 23's slices
landed over three days and item 35's seven over one, and the detail it carried had
three homes by the end — the register's rows for the landings, [DECISIONS.md](./DECISIONS.md)
§11 for the owner's answers, and [ARCHITECTURE.md](./ARCHITECTURE.md) for the rule the
slices landed on (a gate is asked at the **offer**, never at the store read).

## At a glance

| Date | Round | Commits | Outcome |
| --- | --- | --- | --- |
| 2026-09-15 | The architectural review, and its Phase 0 | `49b10af`, `55581e6` | Four critical defects fixed, each with a regression test |
| 2026-09-15–16 | Phase 1 (accounts), Phase 4 (the UI redesign) | `b8ab41a`, `66a71da`, `9c4ba74`, `207517b`, `4c4ff46`, `2b2052f` | Real login end to end; the tokens/buttons/switch pass |
| 2026-09-16 | Phase 2 (config retention) | `99b17e0`, `10585e1`, `9e3c622` | The preference row syncs, and it compare-and-swaps |
| 2026-09-17 | The external hardening review (H1–H6) | `fd1cdba`, `dbb225b`, `56ca6ca`, `b9acd7d`, `05cfd32`, `bcaee25`, `2e730cf`, `b0d9dae`, `ff34e3f`, `c51c28d` | Nine items landed, one dropped by evidence, one removed by the owner |
| 2026-09-18 | The Database tab (rounds 13–14), then two owner rounds on top | `afd48d6`, `0244b89`, `424c346`, `f3cc2c1`, `85fec50`, `690554f` | The store, the grid, the Archive — and the surfaces the owner then reworked |
| 2026-09-19 | The meditation types and the session screen (round 15) | `80d407d`, `02b66d8`, `a670a76`, `02035c2`, `ecd06e8`, `af5165c`, `dfaf6c4`, `1719377`, `296deb1`, `61340cb`, `a7c1ecd`, `d4aa214` | Types as rows, stages, cool-off out, the three-region run screen |
| 2026-09-20 | Intentions, Karuna, the session screen (round 16) | `fb7ee38`, `c2a7969`, `d753127`, `a232615`, `a95ed35` | One sentence table, Karuna, the region framework, the reiki flags |
| 2026-09-21 | The session's clock, the plan card, the grid's view (round 17) | `ec6e67f`, `1d350c5`, `bdd8d68` | The stage strip is the clock, a stage is a control, the card opens a real editor, a filter and removable columns in the grid |
| 2026-09-21 | The card and its Display, rebuilt (round 18) | `7842050` | The app's last `<details>` goes: the Display becomes a switch grid inside an editor section, and the card becomes a handle with one caption line and two `sm` controls |
| 2026-09-21 | One identifier scheme (`P0 · 1`) | `4ac1d6b`, `8dddb59` | 17 documents become 12, and every item gets one integer id, a priority tag and a state — with a guard that fails on a retired label |
| 2026-09-21 | Closing an account (`P1 · 5`) | `e6ed084` | The repo's first server surface: the row goes, the device is wiped, and the reader lands back first-run |
| 2026-09-21 | The hosted project's auth settings, read (`P1 · 7`) | `a68282c` | One call settles which of two contradictory reads was the stale one, and records the values a screen has to agree with |
| 2026-09-21 | The guides catch up with the app (`P1 · 33`) | `a68282c` | The run screen's clock, the block editor, and the Database's filter and `Edit table`, in both guides |
| 2026-09-23 | The hand-run password reset (`P1 · 36`) | `0963bda` | Recovery is one sentence on the sign-in screen and a new password set from the admin panel — no mailer, no route, and nothing allowlisted |
| 2026-09-23 | The account's flags, and the panel that writes them (`P0 · 23`) | `b31c677`, `d591c5a`, `2bf8630`, `d638b27`, `53a3c06`, `6ba8234`, `58c3fac`, `967fb7d` | Eight flags in one vocabulary, every default true; `public.account_flags` with a self-select policy and no self-write at all; the read path through `bootstrap`/`useSession` with a Dexie mirror; a second Edge Function holding the service role, and the panel behind an `is_admin` marker — the only writer a flag has. Slices (a) to (h), the last being the live policy cases |
| 2026-09-23 | The device's own store, in Node (`P0 · 38`) | `46b73f2` | `fake-indexeddb` as an allowlisted devDependency, so a test builds the store the app actually ships: the flags mirror answering when the cloud cannot be reached, a failed read writing nothing, a row from an older build read as a complete set, and rows surviving a reopen. The owner chose this over a client-side flags hook — the reason no browser is shown a gate, which would need an account (`3a`'s decision), and this is the harness that decision will use |
| 2026-09-23 | A session refuses what the account is not offered (`P0 · 37`) | `a677d22` | The compiled library carries the account's own symbols, and a block naming one outside it refuses to start with a sentence that names the symbol, says to point the block elsewhere for now, and says who to ask — the owner's answer, taken the day after the gates landed, with no migration because no account has been released |
| 2026-09-23 | The surfaces a flag hides (`P0 · 35`) | `60bb742`, `f5f7325`, `1645c10`, `2a2a856`, `9e9cdd6`, `baccc2e`, `ec1cfc1` | Seven slices, one per feature: the chakra type out of every list that offered it, the reiki symbols by their system, the two Karuna tables, the binaural doors **and a silent compile**, the scroll, the account's sign-in and sign-out doors — and a guard per gate. A flag hides surfaces and keeps the data, a stored plan still runs, and erasure is never gated |

| 2026-09-24 | The grid's filter, one column at a time (`P3 · 9`) | `ebf66c8` | The one box over the table became a `⌕` on every heading, opening that column's own filter in a row under the header band: `|` splits alternatives at the top level of a case-insensitive regular expression, an alternative that will not compile is read as plain text, and every open column must match — which is the AND the owner asked for, and what the register row said had to widen `DatabaseTable`'s row sources. Bulk actions were the row's other half and were never asked for: they are not built |
| 2026-09-24 | Karuna's selector, removed (`P5 · 24`) | `ebf66c8` | Closed as no longer a question. The `Meditation · All meditations` strip drew a chip whose press opened the "acting" panel — `Open record` and `✕ Clear`, neither of which means anything for a heading — so its only button was `Cancel`. Removed at the owner's word, with `karunaFor` and `karunaSelection` behind it; the stack draws whole and the column filters narrow it |
| 2026-09-24 | The grid's filter read a cell helper declared below it, and a heading answered to its own control | `e4f5e38`, `f267e82` | Two defects this round shipped, both found by the e2e suite after `check` was green. `filterTexts` reached for `cellFor` 340 lines below the first line that called it — a `ReferenceError` at render that took every meditation table and `Symbols` to the screen's error boundary while `check`, lint and all 598 unit tests stayed green. The helper is declared above its caller and the file reads top-down, with `no-use-before-define` on for the class. The new `⌕` is also a labelled control, so a heading answered to "Name Open the filter for Name": every heading is named by its own column (`aria-label`) now |
| 2026-09-24 | The randomiser, the eight schemes, a session's own colour (`P2 · 44`–`47`) | `8d97cae` | Three flags and the three features they gate. `PlanBlock.intentionRandomiser` is `null` for a block that has never been asked, and the draw happens at compile time into the session's own snapshot, so no stored line moves; a count is a **ceiling**, `0` keeps none, the flat list is rebuilt from the drawn halves, and the affirmations stage is not drawn from. `UserPreferences.theme` stores the **name** of one of eight, the seven offered palettes are guarded against the CSS that paints them, and Warm Earth stays the untouched default. A run puts `data-chakra` on its shell and takes the meditation's colour on the controls **and** the ground — the one screen allowed a wash, its shell carrying `bg-bg` itself so the page tints too. Three findings worth keeping: the flags guard had to learn that adding a flag **is** a new migration re-stating the key check (it forbade that shape); the scheme guard caught the first set of palettes being one hue family each, so the seven were redesigned around genuinely complementary grounds and accents; and `LatchButton` had a chakra hue hard-coded in its track, the one control that ignored a reader's accent |
| 2026-09-24 | The file sizes and the raw buttons, pinned (`P3 · 50`, `P4 · 51`) | `5a83537` | Two source-text guards, in the repo's count-floor idiom, for the two survivors of the outside review. `file-size.test.ts` caps the four files that had outgrown one reading at the lines they stood at (DatabaseTable 2275, create-app 1797, Planner 1779, Runner 1123) and the number may only fall; `ui-primitives.test.ts` holds up the library's use while pinning every file that still hand-rolls a `<button>` — thirty-four tags across nine files, twenty of them in the Database grid and its cells — and a file that is not named may hold none. Both proved by breaking them: one line in `Runner.tsx` failed the cap alone, one tag in `Home.tsx` failed the pin alone. **The measurement changed the story the review suggested:** it was not one exception but thirty-four tags, so the guard reads the numbers off the tree rather than a guess. With them: the register's `P2 · 8` parked to `P5` (the owner runs the device test by hand once the app is polished, `DECISIONS.md` §18), `P2 · 49` opened for the accessibility pass, and `IMPLEMENTATION.md` gained the two rules these guards keep |
| 2026-09-24 | Pancreas and spleen are two points, and the circuit is the owner's five groups (`P2 · 52`) | `adec606` | The split round 22 made of `Thyroid and thymus`, made again: `Pancreas` keeps the id the combined row had, and `Spleen` is planted beside it with the whole of a point — its row, its own symbol-less row with its sentences, and its four reiki bindings (Dexie **v34**). The circuit became five groups, one per region, each with the circuit's own timers (1:00 intentions, 1:00 symbols, one minute a point of focus with a three-minute floor) and one tone taken from presets the catalogue already ships; every point is in exactly one group, which is also what stops the sixteenth being dropped from a five-at-a-time slice. A tone is named only while the store holds that preset, because `requireListed` fails hard on a missing one. **Two findings:** the new upgrade guard (`tests/unit/db/upgrade-path.test.ts`, which fabricates a v33 store from the schema the class declares and opens the real database) caught a **shipped defect** — v32's merge helper handed the rename to `withReikiBindings` but not the rows its own walk planted, so `Thymus` reached a device without its four symbols, and `withChanges` now appends what a repair adds; and the guard is the first test in the repo that runs an upgrade body at all, which the register had asked for since round 22 |
| 2026-09-24 | The `Esc back` legend goes back into the foot bar (`P2 · 53`) | `23ada50` | Round 8 asked for the legend "next to the save/edit button … the bottom bar that retains even if scrolled" and it landed there — then drifted back up to the title line in `EditorChrome`, and nothing failed, because `integrity.test.ts` read that each shell drew a *pressable* legend and never *where*. It is back in the bar in `EditorChrome` (drawn on every screen it builds, action or not), the dead-end screens draw one at the foot of the window, and the picker draws one too: `Choose` leaves the form for the bar (`Enter` still commits) and `Done` moves with its sentence. The guard now reads the place as well — a legend whose line comes before its shell's bar fails — and gains the dead-end shell round 24 left out; the e2e reads the bar's own parent on a record and on a picker |
| 2026-09-24 | One gate at a time, and a session's own containers (`P2 · 54`–`56`) | `8ca11e6` | The gate's three productivity defects, from the owner's "fix this so that productivity of all agents is not hampered", with the isolation **and** the lock they chose. The damage was the teardown: `clean-run.sh` ran `docker compose … down --remove-orphans` over `meditaur`, `meditaur-e2e` and `meditaur-tools` unconditionally and is called by five commands, so one session's gate stopped the other's running browser containers and killed a live `pnpm check` — round 24's `Protocol error … session closed`. `scripts/session.sh` is now the one place that names a session (an empty `MEDITAUR_SESSION` keeps every name as it was, so CI and a lone agent are untouched) and holds the lock: `check:full` takes it for its whole body and refuses by naming the holder and the single-spec way past it, a teardown runs only when the lock is free, and a lock holding a dead pid is taken over so a killed gate cannot wedge the machine. The e2e `run` is deliberately **not** locked, because a full suite must not block the other session's one-spec reading, and `e2e` now forwards its arguments to Playwright for exactly that. One finding worth keeping: the guard (`gate-sessions.test.ts`, the real scripts against a fake `docker` that only logs its calls) caught that a new script without an exec bit kills every caller at `set -e` — one line of silence and no teardown — so the file's mode is asserted too |
| 2026-09-24 | e2e is served a production build, and takes no retries (`P4 · 17`, first question) | `815ef56` | The suite stopped paying for the dev server: `scripts/e2e.sh` builds **inside the run container** and Playwright's web server is `next start`, with `retries: 0`, `serviceWorkers: "block"` and `trace: "retain-on-failure"`. The container's filesystem is its own and `.next` is excluded from the image context, so no run can test a build somebody made earlier. **The stage went from 14.8m (3 failed / 9 flaky / 89 passed) to 2.1m at 100 passed / 1 failed**, and the worker default is now **three** because that is what a truthful reading costs on this shared host: six workers give 94 passed / **7 failed**, six of those seven on contention and green at three in the same image. The old six-here/three-on-CI split was measured against `next dev`, so it is retired rather than contradicted. **The seventh failure was **not** the app, and reading it is what settled that: the spec presses the randomiser's master switch and then navigates with `openEditor`, which is a full `page.goto` — a store read — while the write is a **400ms autosave** that `Done` does not flush. It only ever passed because compiling `/plan` under `next dev` took longer than 400ms, so it was the same dev-server cost the switch removes, showing up in the test's own timing. `plans.spec.ts` now presses the screen's `Save` and waits for it to drop its `· unsaved` half before navigating — the idiom its neighbouring test already used — and the rule is in IMPLEMENTATION.md. Proved by stripping the field from the stored row and watching it fail at the same line. The comments the switch made false were corrected with it: the CSP is live during a run, the app-shell worker registers there, and `warmup.ts` is no longer required for a new route. The run's traces now reach the host (`compose.e2e.yaml` mounts `tests/e2e/test-results` and `playwright-report`), because a failure's evidence should outlive the container that produced it |
| 2026-09-24 | The gate is green again, and the failing spec learns to wait (`P2 · 58` closed) | `1a1a71c` | `check:full` end to end for the first time in three rounds: **87 files / 647 unit tests**, both live databases, the production build, and **e2e 101 passed in 3.6m at three workers** where round 24's was 14.8m and red. **The one failure the production build left standing was not the app**, and reading it is what paid for the switch: `plans.spec.ts` pressed the randomiser's master switch and then navigated — `openEditor` is a `page.goto`, which re-reads the store — while a planner edit is a **400ms autosave** that `Done` does not flush, so the test had only ever passed because `next dev` compiled `/plan` slower than that window. It now presses the screen's `Save` and waits for it to drop its `· unsaved` half, the idiom its neighbouring test already used, proved by stripping `intentionRandomiser` from `planRowForStore` and watching it fail at the same line — and the rule is in `IMPLEMENTATION.md` so no spec re-learns it. With it, a failed run's trace and `error-context.md` reach the host (`compose.e2e.yaml` mounts the two report directories), because evidence should outlive the container that produced it |

## What the old labels mean now

The repo used to identify work by letters — `M7`, `H5.2b`, `Phase 3`, `P2b`. Those
families are gone ([ROADMAP.md](./ROADMAP.md#how-work-is-identified)), and this is
the crosswalk, so an old label still resolves. Anything marked *closed* is a record,
not work; anything with an item id is still on the register.

| Old label | What it was | Where it is now |
| --- | --- | --- |
| `Phase 0` | The four critical defects (`C1`–`C4`) and the drift test | Closed 2026-09-15 — each fix has a regression test |
| `C1` | The Dexie v6 upgrade broke upgrades of existing databases | Closed 2026-09-15 |
| `C2` | The `field_values` foreign key still pointed at `symbols(id)` | Closed 2026-09-15 |
| `C3` | RLS blocked onboarding and allowed role escalation | Closed 2026-09-15 |
| `C4` | `Plan.revision`'s compare-and-swap was not atomic | Closed 2026-09-15 |
| `M1` | The transaction scope was hand-rolled per use case | Closed 2026-09-15 |
| `M2`, `M9` | The event port, and the analytics choke point | Item 2 (the port exists with no caller) |
| `M4` | Seeded intention ids were random | Closed 2026-09-16 |
| `M5` | Catalogue rows had no per-row version | Closed 2026-09-16 |
| `M6` | Use cases that take an id were not workspace-scoped | Closed 2026-09-15 |
| `M7` | The catalogue is refetched after every mutation | **Item 4** |
| `M8` | `getMany` on the repositories | Closed 2026-09-15 |
| `M10` | A failed load rendered "Loading…" for ever | Closed 2026-09-15 |
| `M11` | A preference write overwrote a newer one | Closed 2026-09-16 |
| `Phase 1` | Accounts: the port, both adapters, adoption, real login | Closed 2026-09-16, verified live |
| `Phase 2` | Config retention: the preference CAS and row versioning | Closed 2026-09-16 |
| `Phase 3` | First-party analytics | **Item 2** |
| `Phase 4` | The UI redesign: tokens, primitives, shells, run screen, library | Closed 2026-09-16 |
| `P2.6` | Email login | **Item 6** (never built; it is the decision brief now) |
| `H1.0` | Reproduce the backgrounding behaviour on a device | Closed by evidence 2026-09-17 |
| `H1.1` | Resync on visibility return, re-acquire the Wake Lock | Closed 2026-09-17 |
| `H1.2` | Pre-schedule the alarm on the audio clock | Dropped by `H1.0`'s evidence |
| `H1.3` | A Media Session | **Item 8** (the code landed; the device check is owed) |
| `H2` | Password reset | Closed 2026-09-23 (`P1 · 36`, `0963bda`) — by hand: one sentence on the sign-in screen and a new password from the panel, with no mailer integrated ([DECISIONS.md](./DECISIONS.md) §11); the address-change half is **item 6** |
| `H3.1`, `H3.2` | The PWA icon, the app-shell service worker | Closed 2026-09-17 |
| `H4.1`, `H4.2` | Security headers, error boundaries | Closed 2026-09-17; the reporting half is item 2 |
| `H5.1` | The full export | Closed 2026-09-17; its scope is item 16 |
| `H5.2a` | Erase this device's data | Closed 2026-09-17 |
| `H5.2b` | Close the account, the server half | **Item 5** |
| `H5.3` | A privacy notice at sign-up | Closed 2026-09-17 |
| `H6.1` | A vibration alarm | Removed by the owner 2026-09-17 — not to be built |
| `R1`–`R6` | The outside review's own numbering | One to one with `H1`–`H6` above |
| `D1`–`D5` | Decisions the owner took in round 12 | [REVIEW_LOG.md](./REVIEW_LOG.md)'s round-12 entry, and [DECISIONS.md](./DECISIONS.md) where the answer is still in force |
| `P1`–`P8` (round 15) | The meditation-types round's phases | Closed 2026-09-19 |
| `P2b`, `P2c` | The type-generated tabs, tables and pools | Closed 2026-09-19 |
| `P1`–`P7` (round 16) | The intentions round's phases, reusing the same letters as round 15 | Closed 2026-09-20 — see the round's entry in [REVIEW_LOG.md](./REVIEW_LOG.md) |
| `§12.x` of a retired plan | That plan's owner answers or deviations | [DECISIONS.md](./DECISIONS.md), or the round's entry in [REVIEW_LOG.md](./REVIEW_LOG.md) |

## The architectural review (2026-09-15)

An internal read of the whole tree. It found four critical defects and the gaps
that blocked accounts and sync, and it is where the phase order came from. All four
criticals landed the same day with a regression test each:

- **C1 — the Dexie v6 upgrade broke upgrades of existing databases.** A table's
  primary key cannot change in a version upgrade; v6 dropped `fieldValues` and
  added `fieldValuesByEntity`, with a schema-less v7 to repair a database already
  sitting at the broken shape.
- **C2 — the Postgres `field_values` foreign key still pointed at `symbols(id)`.**
  `20260915120000_field_values_entity_fk.sql` drops the leftover constraint by
  definition; polymorphic integrity is the application's job.
- **C3 — RLS blocked first-workspace creation and allowed role escalation.**
  `20260915130000_rls_onboarding_and_roles.sql` adds
  `create_workspace(...)` as `SECURITY DEFINER` and replaces `members_self` with
  four policies guarded by an owner check.
- **C4 — `Plan.revision`'s compare-and-swap was not atomic.** The read, check and
  write now run inside one `ports.runInTransaction`.

The majors followed: workspace-scoped reads (M6), one generic `runInTransaction`
with the right Dexie scope (M1), `getMany` on the repositories (M8), error states
instead of a permanent "Loading…" (M10), seeded intention ids minted deterministically
(M4), catalogue row versioning (M5, landed with Phase 2) and the preference
overwrite (M11, Phase 2). The event port the review asked for (M2/M9) landed as a
schema slice in `c51c28d` with no caller. **What remains is M7** — the catalogue is
still refetched after every mutation instead of patching state — and it belongs with
sync proper, because its visible cost is already fixed. The review's minor list is
closed; the deferrals it left are at the foot of [ROADMAP.md](./ROADMAP.md).

## The external hardening review (2026-09-17, H1–H6)

A source-only read of the public mirror plus the deployed URL. It never ran the
app, so its diagnosis is one step removed from the behaviour it describes, and
`H1.0` existed to close that gap. The verdicts:

| Item | Verdict |
| --- | --- |
| H1.0 — reproduce the backgrounding behaviour on a device | **Done 2026-09-17** by the owner on a Galaxy S26 Ultra: the alarm fired on time in both runs. The review's top finding does not reproduce |
| H1.1 — resync on returning to the tab, re-acquire the Wake Lock | **Landed** (`644af2a`), with the deadline guard for an already-queued timer |
| H1.2 — pre-schedule the alarm on the audio clock | **Dropped by H1.0's evidence**, not deferred |
| H1.3 — a Media Session | **Landed** (`fd1cdba`); the lock screen itself is still unverified on a device, and the effect now sets `playbackState` |
| H2 — password reset | **Decided 2026-09-22:** by hand — one sentence on the sign-in screen, and a new password set from the panel. No mailer (`P1 · 36`) |
| H3.1 / H3.2 — the PWA icon, an app-shell service worker | **Landed** (`d1c9789`, `b0d9dae`), the worker verified against a production build because no e2e run can cover it |
| H4.1 / H4.2 — security headers, error boundaries | **Landed** (`56ca6ca`, `dbb225b`); error reporting still only reaches the console |
| H5.1 / H5.3 / H5.2a — full export, privacy notice, erase this device | **Landed** (`b9acd7d`, `05cfd32`, `bcaee25`) |
| H5.2b — close the account | **Port half landed** (`2e730cf`); the server surface that holds the service-role key is what is left |
| H6.1 — a vibration alarm | **Removed by the owner** (round 12) — not to be built |

Six of the review's claims did not survive being checked against the code; the
ask-by-ask record of what was decided about each is in
[REVIEW_LOG.md](./REVIEW_LOG.md) (2026-09-17).

## The Database tab (rounds 13–14, 2026-09-18)

The Library's `Intentions`, `Views` and `Fields` tabs became one editable **Database**
store — four tables at the time, generated from the type rows since round 15 — with
the library left read-only, one **Archive** page, and the plan page turned into the
session's settings page. Architecturally it removed `TableView` and the block's
`Table` field, made an **entry** (meditation × symbol) the row that carries
intentions, and made visibility a derived rule: an item shows only if it and
everything it references are live.

It was built as one round, verified at the end, and merged whole as `afd48d6`
(stages in `62fcdce`, `f2e9118`, `866f209`, `9f32eeb`). The build's five defects —
a chip's panel escaping a sticky cell, a `Back` that left the tab mounted, a record
row with no `×`, a create undone by its own reload, and a picture dropped by the
save that raced it — are recorded in
[REVIEW_LOG.md](./REVIEW_LOG.md). Two owner rounds followed the same day: the grid
redone as a table (`424c346`) and adds moving into the grid (`f3cc2c1`), then the
grid grouping by meditation with the pair as two pinned columns (`85fec50`) and the
session as one table (`690554f`).

## Meditation types, stages, and the session screen (round 15, 2026-09-19)

Eight phases in one day, and the largest single change in the repo. A meditation
**type** became a row rather than a code union; the word `FocusPoint` was retired
everywhere; one timer per block became one per **stage**; cool-off was deleted
outright; affirmations got a table of their own (superseded the next day);
the alarm became a real switch; and the run screen was rebuilt.

- **P1** `02b66d8` — the Database left the library for `/database`, a nav
  destination of its own.
- **P2** `a670a76` (the model), `02035c2` (tabs, tables and pickers generated from
  the rows), `ecd06e8` (a column's pool is its type's or the reader's shared one).
- **P3** `af5165c` — the rename: `FocusPoint` → `Meditation`, `focus_points` →
  `meditations`, in the domain, the API, the ports, the components, the copy and
  the living docs. Dexie v18 copies the old table into the new one; a stored plan
  and an older catalog file are read under the old key rather than rewritten.
- **P4** `dfaf6c4` — stages: a type carries a template, a meditation may carry its
  own copy, a block materialises the rows, and the engine walks a stage index,
  firing one alarm per block.
- **P5** `1719377` — cool-off deleted from the model, a stored cool-off block
  dropped on the way in, and the plan's two Add buttons become one
  **`Add meditation block`**.
- **P6** `296deb1` — `Affirmation`, Protection and Thanks Giving, and the seeded
  plan `Chakra circuit`.
- **P7** `61340cb` — the alarm switch, and the per-stage binaural and auto-scroll
  switches.
- **P8** `a7c1ecd` — the three-region run screen with the auto-scrolling intentions
  column, the recorded ask about a chakra's columns finally answered.

**A device that predated the round showed no type tabs at all**, and that was a real
defect (`d4aa214`): the v17 upgrade wrote the seeded `meditationTypes` rows without
a `workspaceId`, and every read scopes by it, so the rows existed and were
invisible. The fix is Dexie v19 — a repair rather than an edit of v17, because a
version that has already run is never re-run.

The deviations taken while building (a `custom` row mapping to Point, a nullable
cloud `type_id`, ids namespaced rather than named, archiving a type versus removing
it, compile deliberately not filtered by pool, the alarm's session-level placement,
the scroll position being the app's own float) are in
[DECISIONS.md](./DECISIONS.md) and reviewed in
[REVIEW_LOG.md](./REVIEW_LOG.md).

## Intentions, Karuna, and a self-arranging session screen (round 16, 2026-09-20)

Seven phases in one day, and it relaxed some of round 15's model.

- **P1** `c2a7969` — the run screen became a **list of regions**: a region declares
  the slot it wants and whether it can draw anything, so a region with no data
  frees its room instead of leaving an empty box.
- **P2** `d753127` — `Affirmation` was deleted and became part of `Intention`, which
  gained `entryId: string | null` (`null` = an orphan). A block now reads **its own
  meditation's** sentences rather than every affirmation in the workspace, which
  fixed the reported *"Nothing for this stage"* on Protection. Dexie v23,
  `20260920120000_intentions.sql`.
- **P3–P7** `a232615` — Karuna (the former Entries table, with the meditation as its
  heading and a searchable selector), the Intentions cell on a meditation's table,
  the grid's two real defects (an unpinned `Name`, and a pinned header cell with no
  opaque fill painting text through the `Tune` button), volume displayed 0–10, the
  plan page's `Chakras` / `Points` / `Other meditation blocks` headings, and the
  reiki systems with four new empty symbols (Dexie v24,
  `20260920140000_symbol_reiki_system.sql`).
- **The round's one traded-away guarantee:** the e2e test that cleared the
  *meditation* half of a sentence's association cannot exist in Karuna any more,
  because the meditation is the heading. The gesture is still available in the
  Affirmations table and has no test; that is recorded rather than hidden.

**A real defect was found and fixed inside the round:** `karunaFor === null` means
"no filter", and the unowned rows draw under a heading whose `meditationId` is also
`null` — so one symbol-only sentence collapsed the whole stack to itself with no way
back. Fixed in `karunaSelection`, guarded by a unit test and an e2e test.

**Three documents claimed `20260919120000_catalog_order.sql` existed. It never did.**
The new migration is the first real SQL mirror of the catalogue's order, and the test
that guards it now parses that file rather than trusting a name.

## Round 17 — the session's clock, the plan card, and the grid's view (2026-09-21)

Three commits, one review round of fourteen asks, and the second round in a row
where the honest answer to *"this is broken"* was **a stored default the app itself
wrote**.

- **`ec6e67f` — the run screen.** One engine method carries four asks:
  `seek(blockIndex, stageIndex)` puts the session on a stage at **its own** length,
  clears the clock and holds at `loaded` — never `paused`, because a pause remembers
  a remainder and this is the move that must forget it. It serves `→` (next stage,
  twice: next meditation), `←` (restart this stage, twice: previous stage, thrice:
  previous meditation), the per-stage and per-meditation `Restart`, and the stage a
  reader picks before Start; `start()` therefore begins where the reader put it, and
  `positioned` is what keeps an ordinary Start at block 0. `beginStage` gained an
  `enteringBlock` flag, because a block entered in the middle has no boundary above
  it and the tones were otherwise never set. The header's clock is gone: each stage's
  wheels count down where the reader set them up, and stop taking edits once the
  session runs (`TimeWheels`' `readOnly` mode, on the wheel's own geometry). A
  `symbols` stage's main region is a sheet of the block's symbols, and the symbol in
  play follows the clock when the column has nowhere left to travel
  (`stage-progress.ts`). `DEFAULT_PLAN_DISPLAY` shows the meditation's `Location`,
  which is what puts a chakra's own panel back on the screen — it had compiled to an
  empty list, and `sessionRegions` had correctly declined to draw an empty box.
- **Dexie v25, and why a version was the only way.** `autoScroll` is stored per
  stage, so plans written by an older build disagreed with each other for ever, and
  the alarm's default had been written into the reader's data as `true`. `withAutoScroll`
  derives the flag from the kind; the alarm is corrected on the two rows the **app**
  wrote (the seeded preference and the seeded plan) and on no plan the reader made;
  and `isAppDefaultDisplay` lets a plan still carrying the app's old display be
  handed the new one. Each rule is a pure function with a unit test, because
  IndexedDB does not exist in the unit suite.
- **`1d350c5` — the plan card.** The card was five read-only picker fields and a
  timer row per stage, with the meditation's name — the one thing a card is for —
  squeezed into what was left. It is a handle again, and one press opens that
  meditation's editor: every block field, the stage rows, and the Display panel that
  used to sit at the foot of the plan screen. `PlanBlock` gained `alarmEnabled` and
  `display`, both `null` for *"the plan's answer"*, so nothing is copied into nine
  blocks and a plan nobody has edited behaves exactly as it did. A meditation with
  no symbols gets no Symbol control.
- **`bdd8d68` — the grid.** A filter on every tab, matching the row's **key** —
  applied where each table reads its rows, so none can be left out, which is what had
  happened to Karuna. `Edit table` puts an `×` on every heading that takes the column
  out of the **view** and not the store, kept per table in `sessionStorage`. And the
  binaural cell is the switch alone: `LatchButton.labelHidden` moves the word to
  `aria-label` rather than dropping it.
- **The reversal is recorded, not smuggled.** The alarm's default moved from on to
  off, which reverses §12.21; it is in
  [DECISIONS.md](./DECISIONS.md#5-the-alarms-default-and-what-belongs-to-a-meditation-owners-round-17-2026-09-21)
  with the owner's words.
- **The e2e suite caught the one defect nothing else could.** `currentGroupIndex` landed
  *after* `Runner`'s `if (!ready)` early return, so the hook count changed between the
  first render and the second and React threw — a run screen that typechecked, linted
  and passed every unit test, and offered no `Start` at all. The rule the repo already
  had ("green everywhere except runtime") now has a second example, and the comment at
  the hook says why it sits where it sits.
- **The gate:** `./scripts/meditaur check:full` — 47 unit files / **378 tests**, the
  hosted live suite (11 passed, 2 local-only skips) and the local one (13), the
  production build, and the e2e suite — 82 tests, the last run **81 passed with one
  retry** on the Database's drag test. No migration was needed: a plan and the grid's
  view are Dexie-and-`sessionStorage` only, so `./scripts/meditaur cloud` has nothing
  to push.

## Round 18 — the card and its Display, rebuilt (2026-09-21)

The owner's ask, in one line, was *"the display section in the card is absolutely
shabby"*, and their answer to the question of which card decided the shape: *"it is
the card itself, along with what it opens … Smaller buttons, more well-placed and easy
to operate. The details section shouldn't be that collapsed hedious thing it is
today."* Round 17 had already taken the card's picker fields and per-stage rows off
it, so this is what the two rounds add up to: a card that says one thing and opens
everything, and an editor whose sections are all the same kind of thing.

**The Display** was the app's last `details` disclosure. It is an `EditorSection`
now — always open, like the sections around it — and its body is a grid: a band per
table (`Meditation`, `Symbol`, `Entries`), then a row per column with the column's
name and two switches under the `Shown` and `Pin` headings that name them. Repeating
`Shown`/`Hidden` and `Pin`/`Pinned` in every row was the same sentence twice; the cell
switches are `labelHidden` and named `<group> <column> shown|pinned`, so the words the
cells drop are the words a screen reader hears, and the two `Name` columns — one per
table — stay told apart. A block that has made the Display its own can hand it back
with `Use the plan's Display`, the same shape the `Alarm` section uses.

**The card** is the handle — the meditation over its type, the type in the meditation's
own accent — one muted line (`<length> · <n> stages · <symbol>`), and a `sm` row on its
foot holding `Edit` and the armed `Remove`. Everything else on the card is the press
that opens that meditation's editor, so the reader has nothing to find. The line is a
caption and not a picker: the round-17 card was criticised for truncating, so it names
only what fits the fixed width — the sound, whose presets are named like
`Solfeggio Third-Eye 852/8`, is one press away in the editor.

Both shapes are written down in [UI_DESIGN.md](./UI_DESIGN.md)'s §1.9, the user guide's
§7.4 and §7.10 describe them to a reader, and the ask-by-ask record — including the one
judgement left open (whether the sound belongs on the caption line) — is in
[REVIEW_LOG.md](./REVIEW_LOG.md). The gate was `./scripts/meditaur check:full`: 391 unit
tests, both live databases, the production build, and 83 e2e tests with no retries.
## One identifier scheme (2026-09-21)

Seventeen documents described a repo that had moved on, in four different letter
families — `M1`–`M11` from the review, `H1.0`–`H6.1` from the hardening pass, `R1`–
`R6`, `C1`–`C4`, and a `P1`–`P8` that meant something different in each of two rounds.
Six documents were retired outright and their content absorbed; the living set is
twelve, and [AGENTS.md](../AGENTS.md) names what each is for.

What replaced the letters is one scheme, and it is enforced rather than agreed:
an integer per item, allocated once and never reused, so `item 5` resolves for ever;
a single lowercase letter for a subpoint and no second level; priority as a tag
(`P0` blocking to `P5` parked); state as `open`, `blocked` or `parked` with the
blocker or the reason named inline; and a round identified by its date rather than
by an id. [ROADMAP.md](./ROADMAP.md) is the register and the only place state lives.
[What the old labels mean now](#what-the-old-labels-mean-now) is the crosswalk, and
the rule is that a citation to a retired document is repointed rather than left to
rot.

`tests/unit/architecture/item-ids.test.ts` is what makes that true rather than
desirable: it checks the register's own shape (bands ascending, ids unique, subpoints
whose parent exists and whose letters are contiguous), fails on a retired label in
any living document or any code comment outside the crosswalk, fails if a living
document links a retired one, and **pins the count of dangling `§` citations** so it
can only fall — that count is `P3 · 32`, and the guard is what stops it growing
while that item is open. The one renamed file in the sweep was
`tests/unit/architecture/review-phase0.test.ts`, which described itself in a family
that no longer exists; it is `schema-invariant-guards.test.ts` now.

## Closing an account (2026-09-21)

The last piece of the external hardening review's H5.2 — an item that had been a port
half with nothing behind it since 2026-09-17.

**The server.** `supabase/functions/close-account/` is the repo's first server-side
code — and its only one until the `admin` function landed 2026-09-23 (`P0 · 23`). It
is an Edge Function that resolves the caller from the Auth API with the caller's
own token, runs `delete_my_data()` as that caller so RLS decides what goes, and then
deletes the `auth.users` row with the service-role key — the one step no browser may
take. It carries **no imports**: three `fetch` calls, deliberately, because the
one-SDK-importer rule is about importers rather than runtimes. `scripts/cloud.sh`
gained a `supabase functions deploy` step, so `cloud --yes` ships the caller and the
thing it calls together.

**The order**, which is the part that would be a bug if a screen owned it: the
server closes the account, the session is cleared, the device is wiped. A close the
server refused wipes nothing. `MeditaurApp.closeAccount` is the one place it happens,
and the guides and `/privacy` now say what closing does — the account *and* this
device.

**How it was proved**, since no unit test can reach a function that needs a
service-role key: three unit cases for the port's mapping and one for the group of
them, an e2e that the control is absent when no account can be closed, and a live
integration case that creates a user, onboards a workspace with their own token,
calls the function, and then asserts the workspace went, the `auth.users` row 404s
and the dead session cannot replay the call. The hosted suite came back **13 passed,
2 skipped** with that file in it.

**What it cost, honestly:** a Deno function is outside this repo's gate — no
typecheck, no lint, no unit test — so the live suite is the whole of its proof. That
is the register's `P4 · 34`, with the way out named: a Deno image, and therefore a
dependency decision. And that suite is the *hosted* one: the local stack serves
Postgres and Auth and no `functions serve`, so the file skips on the local target
rather than failing there for a reason that is not a defect. What the local stack
still covers is the data half — `rls.test.ts` calls `delete_my_data()` against it —
which is the honest split rather than a gap.

## The auth settings, read and settled (2026-09-21)

The register's `P1 · 7`, and a contradiction older than the register: the round-12
note in [REVIEW_LOG.md](./REVIEW_LOG.md) records one read of the hosted project's
auth settings as `mailer_autoconfirm: true` and a later read of the same four
values as `false`, with the conclusion that neither could be re-read because the
CLI's token was gone. It was not gone — the CLI keeps it in the macOS keychain
rather than in `~/.supabase` — so one call settled it: the settings applied in item
6 are the ones in force, and the stale note was the later one. The beta-opening
hazard it warned about (a reader signing up into an account that can never sign in)
is not live.

The durable half is in [ARCHITECTURE.md](./ARCHITECTURE.md#accounts): the values a
screen has to agree with — `password_min_length`, the redirect allow list, the
one enabled provider — read from the project rather than remembered. The finding
that matters most is one the register had wrong: with `mailer_autoconfirm` on,
**sign-up needs no mailer**, so "no SMTP" is a decision about recovery and address
change rather than a gate on the beta. Item 6's brief is now that shape.

## The guides catch up with the app (2026-09-21)

The register's `P1 · 33`. Round 17 changed three screens and the guides were still
describing the ones they replaced, which is the kind of drift a reader notices as a
bug rather than as a stale document.

**The run screen's clock.** The guides said "once the session is running, the length
control is replaced by the countdown" and "a stage's row is editable while it runs".
Both wrong: the wheels stay exactly where they are and become read-only the moment
`Start` is pressed, so the strip *is* the clock and the total timer the guide had a
reader looking for does not exist. A stage is also a control now — pressing its name
or its `↺` sets that stage back to its full length and holds the session there with
the tone off — and the key legend is `→` next stage (twice for the next meditation),
`←` restart stage, not the old "skip to the next block".

**The block card.** The card is a name, `Remove` and one `Edit` press, and
everything the guide listed as read-only text on it — the meditation field, the
symbol, the sounds, the alarm, a row of wheels per stage — is written in the editor
that press opens. The guide's §7.4 was a table of controls that no longer exist.
Dragging is also not a press-and-hold any more: the card moves as soon as the
pointer does.

**The Database's view controls**, which no guide section mentioned at all: the
`Filter <table> by name` box (the row's name only, never a cell value, cleared when
you change table) and `Edit table`, which hides columns from the grid and remembers
that per table for the browser session — a hide, not the empty-only `X` delete the
guide already described.

## The handover (2026-09-19)

`MEDITATION_TYPES_HANDOVER.md` was written mid-round for an agent picking the work
up with no history: what was already in `main`, exactly what P2b had to do, and the
traps that had cost time. Everything it handed over landed the same day, so it was
retired with the rest. Its durable half — the traps — is in
[AGENTS.md](../AGENTS.md).
