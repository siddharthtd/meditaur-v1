# The owner's decisions, in force

The owner answers questions before the code is written, and those answers are
binding rather than advisory. This file is where they live once the plan document
that carried them is retired.

**What belongs here.** A decision that still constrains new work and that code
cannot enforce by itself — a judgement call a later round might otherwise reverse
by accident. It names the round it came from.

**What does not.** A decision the code now enforces and a test guards is an
*invariant*, and it lives in [IMPLEMENTATION.md](./IMPLEMENTATION.md) — do not copy
it here, because two copies drift and the repo has paid for that before. The
product's shape is [ARCHITECTURE.md](./ARCHITECTURE.md); what is next is
[ROADMAP.md](./ROADMAP.md); the ask-by-ask record is
[REVIEW_LOG.md](./REVIEW_LOG.md); what already happened is
[HISTORY.md](./HISTORY.md).

The plans that carried these answers — round 15's meditation-types plan, round
16's intentions plan, the Database tab's plan, and the two reviews — were retired
on 2026-09-21. Every one of them is still readable at the commit that last carried
it (`git show a95ed35:docs/MEDITATION_TYPES_PLAN.md`, and so on).

## 1. Vocabulary (set 2026-09-15, extended 2026-09-19)

- One run is a **session**; the word *sit* is retired, and so are
  `Circuit sit` / `Focus sit` as plan names.
- The overall loudness is **master volume** (`masterGain` is gone).
- A **meditation** is one catalogue row (a chakra, a point, a protection, a thanks
  giving, or whatever a reader adds). `FocusPoint` was retired as a word on
  2026-09-19; it survives only in applied migrations, older Dexie versions and the
  historical documents.
- A **meditation type** is a row (`meditation_types`) that says what kind of thing
  a meditation is, which stages it runs and which columns it has. A **meditation
  block** is one card in a circuit plan. A **stage** is one subsection of a block
  with its own timer (intentions, symbols, focus, affirmations). A **circuit
  plan** is what the plan page edits.
- **Karuna** is the former Entries table: the rows that carry a meditation *and* a
  symbol.
- Seeded type names are the plural words the owner asked for (`Chakras`, `Points`)
  because a name is a heading as well as a label.

## 2. The Database (owner's rounds 13–14, 2026-09-18)

The screen's mechanics are in
[IMPLEMENTATION.md](./IMPLEMENTATION.md#the-database-screen-owners-design-2026-09-18).
These are the calls behind them:

- **Archive first, no undo.** Archiving is a single tap and recovers from the
  Archive page; a permanent delete exists only on that page; Remove reuses the
  app's armed two-press control everywhere except a column header.
- **The Database is data only.** It holds no display settings, no pinning and no
  column picker. What a session shows is the plan's `Display`, and the plan page is
  where that is chosen.
- **Everything has a drag handle and keeps its order** — rows, lines and columns.
  A column's order belongs to the table and is shared by every reader.
- **The heading `+` inserts where it is pressed; the trailing `+` appends.**
- **A column can be removed only while it is empty**, and its type is fixed once it
  holds a value, so no stored value is ever reinterpreted. A `select` option in use
  cannot be removed, by the same rule.
- **Leaving discards.** The Database is the one screen where leaving loses the
  draft; that is why it interrupts the leave rather than hinting at it.
- **A save report names what the orphan sweep archived**, up to five, rather than
  giving a count.
- **A chip offers `Open record` and `Clear`** — never a "choose another". There is
  no native `<select>` anywhere in the product; the chip's picker is a hand-built
  ARIA combobox.
- **One rule covers archiving:** an item is visible only if it and every record it
  references are live. That is what makes "associations are preserved" true by
  construction rather than by bookkeeping.
- **`Record`, `Entry` and `Line` are spec vocabulary** and never appear verbatim in
  shipped copy. The reader thinks in chakras, symbols and intentions.

## 3. Meditation types and stages (owner's round 15, 2026-09-19)

The full answer list is recoverable at `a95ed35`. What still constrains work:

- **A type is a real table**, managed as a visible **Types** table, so a type added
  later gets its own library tab, Database table, column pool and plan picker group
  with nothing to register.
- **A column belongs to one type or to every type.** A symbol is not typed: symbols
  stay one shared table.
- **Stage timers live on the card *and* before Start**, labelled `M` and `S` only.
  The template is seeded in `packages/domain/src/stages.ts` (chakra/point
  2:00 / 1:00 / 6:00; Protection 3:00 / 1:30 / 6:41 — 11:11 in total, a seed value
  rather than an invariant; Thanks Giving one 3:00 affirmations stage). A seeded
  meditation carries its own copy so a reader can tune one row at a time.
- **Binaural is per stage and off for intentions and affirmations.** The tones are
  set once per block and only fade where two neighbouring stages disagree.
- **The alarm rings once, at the end of the block**, never at a stage boundary.
- **Scope: the alarm is session-level; binaural and auto-scroll are per stage.**
  The alarm's switch sits on the plan's latch row, in the run screen's footer beside
  `Auto-advance`, and in Settings — not repeated on a stage row.
- **Auto-scroll defaults on** and the last saved value is what a session starts
  with. Its rate is content ÷ the stage's remaining time, never a fixed px/s, and a
  long column scrolls faster rather than being clamped.
- **Cool-off is gone from every plan**, seeded or stored, and the seeded plan is
  `Chakra circuit`: Thanks Giving → the seven chakras → Thanks Giving.
- **The run screen is the app's centrepiece** — extra effort there is wanted, and
  what it shows is the plan's Display.
- **A meditation on a card can be changed**; symbols follow the meditation; tapping
  any type's tile starts a one-block session.
- **Every library tab stays**, and the strip scrolls sideways rather than dropping
  one.

### Round-15 build deviations that are still open questions

Both are one-way, so **ask before reversing either**:

- A `custom` row that is not Protection maps to **Point** rather than being
  deleted, in both the Dexie upgrade and the SQL migration. A migration is not the
  place to throw a reader's own row away.
- The cloud's `type_id` is **nullable** (`on delete set null`) while the domain
  requires a type, because the cloud receives rows one at a time and a save must not
  fail on a reference the reader cannot see.
- A type's **stage template is not editable in the Database yet** — that wants a
  cell type for a list of stages, so a type a reader adds has one intentions stage
  until it lands. Round 14's open row (a column per *field* rather than per
  definition) is the neighbouring question.

## 4. One sentence table, Karuna, and a self-arranging screen (owner's round 16, 2026-09-20)

- **An intention and an affirmation are one table of sentences.** An intention may
  be associated with a chakra or point, with a symbol, with both, or with nothing
  yet (an orphan). The Affirmations tab is a *view* over that table, and its columns
  are still its own pool — the `FieldScope` name `"affirmation"` stays, so nothing
  has to be migrated.
- **The same words in two places are two rows.** Editing one leaves the other alone.
- **A meditation + symbol pair stays a real row**, so its custom columns keep
  working. Karuna is those rows with the meditation chosen by the selector.
- **A chakra's own Intentions cell holds its chakra-only lines**; chakra+symbol
  lines live in Karuna.
- **Nothing is drawn where there is no data for it** — a region that draws nothing
  frees its slot instead of leaving an empty box. The same rule for every type,
  never a Thanks Giving special case.
- **Karuna's selector** is a searchable auto-complete over the meditations that have
  symbol-carrying sentences. With the box empty, every table is stacked in series
  and the heading follows the reader's scroll. Dragging a row out of its group is
  not offered, because a row's owner *is* its association chips.
- **Plan-page headings are Chakras, Points, Other meditation blocks**, generated
  from the type rows.
- **Volume displays 0–10 in steps of 1**; the stored value stays `0..1`, so this is
  a display rule and nothing else.
- **The reiki flags land now, all true**, until an admin panel exists. A symbol
  carries `reikiSystem`; `karuna_reiki` is today's eight symbols, with
  *Hon Sha Ze Sho Nen*, *Sei Hei Ki* and *Cho Ku Rei* as `usui_reiki` and
  *Dai Kyo Mo* as `reiki_master`, seeded with empty Description and Usage for the
  owner to fill in the Database. The **Karuna tab is gated on `karuna_reiki`**;
  nothing is gated on the other two yet. **Extended 2026-09-22:** the enabled set is
  no longer a constant — the flags are per account and the admin panel is their
  writer, so the "until an admin panel exists" this bullet rests on has arrived (§11).
  **Extended 2026-09-23:** the "nothing is gated on the other two yet" is spent — all
  eight flags hide their surfaces now (`docs/ROADMAP.md` item 35, slices (a) to (g)) —
  and the seeded map this bullet names was checked against the owner's three lists: the
  Karuna tag also carries `Harth` and `Rama`, and the seed spells `Iava` where the owner
  wrote `iawa`. **Confirmed by the owner, 2026-09-23 — the seed was right as it stood:**
  `Iava` is the correct spelling, `Harth` and `Rama` are Karuna Reiki, and the three Usui
  rows with `Dai Kyo Mo` as the master symbol are exactly as named. What looked like two
  mismatches was the owner's shorter list, so nothing was re-authored — and the four rows
  round 16 added still carry the Description and Usage the owner fills in.
- **Auto-scroll lives in the footer next to Alarm** and is drawn only for a stage
  that scrolls.
- **A sentence's leading cell is its `text`, never `name`** — a `name`-keyed cell
  writes `builtins.text` and the row is dropped on save for having no name.

## 5. The alarm's default, and what belongs to a meditation (owner's round 17, 2026-09-21)

- **The alarm is off unless the reader turns it on.** This **reverses the default the
  app shipped with**, on the owner's words: *"the thanks giving session has alarm on, noone
  asked for an alarm-on on this screen, it always was an alarm - off here."* So
  `DEFAULT_ALARM_ENABLED` is `false` — the seeded plan, the preference a new plan is
  built from and `compilePlan`'s fallback — while `Plan.alarmEnabled` stays the
  switch on the plan and a plan that carries `true` is still obeyed. Dexie v25
  corrects only the two rows the app itself wrote (the seeded preference and the
  seeded plan); a plan the reader made keeps whatever it carries.
- **A meditation may answer the alarm question for itself.** `PlanBlock.alarmEnabled`
  is `boolean | null`, `null` for "the plan's answer", so a circuit can hold a silent
  Thanks Giving beside seven ringing chakras. Nothing is copied into a block until
  the reader says otherwise.
- **A meditation carries its own Display.** `PlanBlock.display` is the same shape of
  `null`-means-inherit, and the panel that used to sit at the foot of the plan screen
  now belongs to the meditation it describes — *"The display menu at the bottom
  should be per-meditation block as well."* `Plan.display` is the answer a block that
  has never been asked inherits.
- **Auto-scroll is on for every stage that is read**, derived from the stage's kind
  rather than stored per plan: *"Some chakra sessions have auto-scroll and some
  don't … we need this to be consistent."* The flag is still the reader's afterwards
  — the derivation runs once, as a repair.
- **Arrow keys move the clock, they never start the session.** `→` next stage, `→→`
  next meditation; `←` restart this stage, `←←` previous stage, `←←←` previous
  meditation — each inside a two-second window, and each landing on a stage at its
  own length with the clock cleared and holding: *"Jump to the previous block's first
  stage and hold until start is pressed. Not paused at all, clock should be cleared."*
- **A stage's timers are read-only once the session runs**, and the run screen's
  clock is the stage strip rather than a number at the top of the page.
- **A `symbols` stage shows symbols** — pictures where a symbol has one, names until
  then — in the main region, and the symbol in play follows the clock when the
  column has nowhere left to travel: *"it should be updated with time even though the
  scrolling stops."*
- **The Database's filter and its hidden columns are view settings, not stored
  ones.** Filtering matches a row's **key**; removing a column takes it out of the
  view only, so it is safe on a builtin and never makes the screen dirty.

## 6. Closing an account (the owner's answer, 2026-09-21)

Round 12 settled that the account itself goes — *"delete it from everywhere and serve
the app to the user again as if they have never been seen before"* — and left one
question open: whether closing also erases the device. It does.

- **Closing an account erases this device as well**, and the reader comes back to a
  first-run app: the seeded catalogue, nobody signed in. Their material is theirs to
  keep, so `/privacy` and the confirm step both say to download the catalog first.
- **The service-role key never leaves the server.** Removing the `auth.users` row is
  the one thing a browser may not do, so it happens in an Edge Function that holds
  the key, and every other step — the sole-member workspaces, the preferences — runs
  with the reader's own token so row level security still decides what goes.
- **The order is the application's, not a screen's**: the server closes the account,
  then the session is cleared, then the device is wiped — and a close the server
  refused wipes nothing.

## 7. Sync: how two devices settle one row (the owner's answer, 2026-09-21)

Sync proper is `P2 · 3`, and it carries one question that no amount of code answers:
when two devices have edited the same row, what does the reader see? The owner's
answer is **last write wins, quietly**.

- **The later write wins, and nobody is asked.** A row held by two devices is settled
  by revision, and the higher revision is the row. No conflict screen, no merge, no
  "this changed elsewhere" banner — not on the catalogue, and not on a plan.
- **What that costs, said plainly:** a device that edited while offline can have that
  edit replaced by a later one from somewhere else and will not be told. That is the
  trade the owner chose, having been offered the alternative — stop and show the
  reader a conflict — and having refused it.
- **It is not a licence to overwrite without looking.** `Plan.revision`'s
  compare-and-swap stays exactly as it is. It is how a second tab on one device is
  caught today, and its message (`Plan was changed in another tab`) describes a save
  that never happened — not a sync. Sync resolves what two devices have already
  stored; the CAS refuses a write that was made against a stale copy.
- **A delete is a tombstone, and not an absence.** Last-write-wins cannot tell a row
  that was deleted from a row that was never seen, so a delete travels as a row with
  a later revision. That is item 3's first slice, and it is the reason the slice comes
  before the protocol.
- **It lands before the beta opens** (the owner's answer, 2026-09-21). The copy the app
  and the beta guide carry today — that an account is identity only and that plans and
  material "still live in this browser" — stops being true the moment sync ships, so
  the register's slices run in order and the beta waits for them rather than the other
  way round.
- **That raises what password recovery is worth.** Once a reader's catalogue is in the
  cloud, forgetting a password locks them out of their own material, so recovery stops
  being a nicety. It is the one thing on this list that needs a mailer, and it is where
  item 6's brief and the reset work meet. **Answered 2026-09-22:** recovery needs no
  mailer — the sign-in screen says to ask, and the panel sets a new password
  (`P1 · 36`, §11), which leaves item 6 the address change alone.

## 8. The Library's lists get an order (the owner's answer, 2026-09-21)

`P2 · 4` removes the catalogue-wide refetch that every mutation does today, and one
half of it needed an answer no amount of code gives: a screen that patches a list in
place has to know **where** a new row goes. A preset's own `sortOrder` already said;
a media asset had no order at all, so an upload could only be appended blind.

- **Media assets carry a real order.** `MediaAsset.sortOrder` joins the domain row,
  Dexie **v26** numbers the rows a device already holds (`assetsWithOrder`), and the
  column is in the SQL with them — the lockstep the register requires of any stored
  field. Migration `20260921120000_media_asset_order.sql`, applied to the hosted
  project the same day.
- **The order beats the alphabet.** Today's list is effectively "whatever the store
  returned"; the numbering a device receives once is by name, and from there an upload
  goes last and stays last. Nothing reorders the store on every open, and a row that
  already carries a number is never renumbered.
- **The cheaper alternative was offered and refused.** Option (a) was to re-read just
  the presets and the media files after a mutation — two small reads, no schema change.
  The owner took the column instead, so a list can be patched from the write's own
  answer rather than re-read at all, which is what makes the rest of `P2 · 4` worth
  doing rather than a smaller refetch.
- **What it costs, said plainly:** a Dexie version, a SQL migration, and one read per
  upload (the last order handed out) — not the nine scans `getLibrary` performs.

## 9. The round-19 session and editor answers (the owner's answers, 2026-09-21)

Four questions were put back before anything was built, and the answers are binding.

- **"Make them horizontal" is about the card's height, not the wheel's axis.** Asked
  what should turn horizontal, the owner said: *"The height of the stage cards
  determines how much space the main screen - intentions gets. So it is imperative that
  we reduce the height. The wheels can stay as they are, but the rest of it should take
  less height which could be accomplished by making them horizontally wider instead of
  more high."* So the wheels keep their axis **and** their size, and everything else in
  a card — the binaural mark, the stage's name, the stage's own `↺` — moved beside them.
  The `Minutes`/`Seconds` captions are off inside that strip too: they are the last line
  of height a card was carrying above its wheels, and they are decoration, not a name
  (the columns keep their accessible names).
- **A stage can be added, removed and reordered.** Of the three scopes offered, the
  owner took the fullest: `Add stage` from a kind picker, an armed `Remove` on each
  card, and a sideways drag to reorder — the circuit's own gesture, one level down. The
  floor of one stage is not a preference: `blockStages` falls back to the meditation's
  template the moment a block's own list is empty, so removing the last stage would grow
  back exactly what the reader had just deleted.
- **The session's three latches are named `Alarm` · `Scroll` · `Advance`.** Offered the
  short names against keeping `Auto-scroll`/`Auto-advance`, the owner took the short
  ones: the switch is in the session's own footer, and there is nothing else for either
  word to be about. With `sm` they also lose the `On`/`Off` word, so the state lives in
  `aria-pressed`.
- **Every seconds wheel in the app wraps.** The choice was the session screen alone or
  the whole app; the owner took the whole app, so `DurationSteppers`' `wrapSeconds`
  defaults to true and one rule covers the run screen, a plan's editor, a Database cell
  and a library editor. The minutes column is untouched and a wrap carries nothing — a
  typed `90` in a column of sixty is `30`.

## 11. The account's flags, the panel, and a hand-run reset (the owner's answers, 2026-09-22)

The owner asked for feature flags that could gate account management and a panel, and
settled the reset in the same exchange: it is manual, so the beta integrates no
mailer. The detail is in [HISTORY.md](./HISTORY.md), which absorbed the plan document and
carries both items' at-a-glance rows (`P0 · 23` for the flags, the table and the
panel; `P0 · 35` for the surfaces they hide); the answers themselves are here.

- **A feature flag belongs to an account, and the admin panel is its only writer.**
  *"I want the feature flags to be enabled per account, the admin-panel should be the
  one that enables it. For every account that I create, the page should have these
  feature flags, I'll enable the ones that I deem fit for the user."* A flag a reader
  can edit is a different thing and was not built: the value is the owner's say over an
  account, so it lives in its own table with no self-write policy and is written
  through the service role.
- **Every flag defaults to true.** A device with no cloud, nobody signed in, or no row
  behaves exactly as the app does today, so a flag is only ever a subtraction the owner
  makes for one account.
- **A flag hides the feature's surfaces and keeps the data.** Tabs, tables, editors,
  switches and run-screen controls go; every stored row stays, and a plan made while a
  feature was on still runs. Nothing is dropped and nothing is refused.
- **Account management is the account surfaces, not a demo tier.** With it off there is
  no sign-in, no sign-up and no account half of the Account screen; the `This device`
  half stays, and the app is otherwise complete and local-first. The owner's first
  reading — a demo over the seeded catalogue — was put back and not taken.
  **Extended 2026-09-23, written out from the code (`35f`) and approved:** "no account
  half" means the session's own doors, not every surface that says *account*. What goes:
  the sign-in link, the create-an-account link, **`Sign out`** — with the sign-in door
  shut the way back is the same flag, so signing out would be a one-way exit — the Home
  screen's `Account` link, and the auth panel, which is the whole of `/login` and
  `/signup`, so both addresses answer with one sentence saying who to ask instead. What
  stays: the status line, because it is a **fact** about this device rather than an offer,
  and the two erasures — `Erase this device's data` and `Close this account`. Erasure is a
  right rather than management: a flag about who *manages* an account must not take away
  what `/privacy` and the guides promise, which is the same line the Archive draws when it
  keeps a row a flag hides.
- **Administering is a marker in the database**, not an env allowlist and not a
  hard-coded address, and the panel may **create accounts** and **set a new password**.
  *"For every account that I create"* is the flow it is built for.
- **The reset is by hand, and no mailer is integrated for the beta.** The sign-in screen
  says to ask; the owner sets a new password from the panel. Nothing is allowlisted in
  [DEPENDENCIES.md](./DEPENDENCIES.md), because no mail provider is added.
- **The panel is not the "dashboard" the do-not list refuses.** That rule is about the
  reader's app growing an analysis surface; this is the owner's own tool over accounts,
  and the one place a flag's value is written.
- **The beta ships everything working** — account management, the panel and the flags
  all live — with the per-account values the owner's to set.

- **A session never shows what an account's flags hide, and it says so.** The owner, 2026-09-23: *"session should never show items that are blocked on an account"*, and where a plan already names one: *"your account rights prohibit you from accessing this symbol. Talk to the owner if this is a mistake."* The compiled library therefore carries the account's own symbols, and a block naming one outside it is **refused** rather than quietly walked as something else. The sentence the reader gets is the owner's ask in the app's words — it names the symbol, says to point the block at another one (or `None`) so the session runs without it, and says to talk to *whoever set up your account*, which is what the sign-in screen already calls the owner. Nothing is migrated for it: **no account has been released**, so there is no stored plan whose continuity refusing would cost. (Asked and answered 2026-09-23, the day after the gates landed.)
- **The panel's door is a link on `/account`, shown to an admin only.** Not a nav
  entry — `AppNav` is the reader's five destinations — and `/admin` still refuses a
  non-admin who types the address, because the marker is checked in the function rather
  than by hiding a link. (Asked and answered 2026-09-23, before the panel was built.)
- **With `binaural` off the tones are silent.** The feature *is* its sound, so hiding
  only the knobs would leave a flag that does not do what it says; the session still runs
  every stage, and the stored rows are untouched, so turning the flag back on restores
  exactly what was there. (Asked and answered 2026-09-23, before the gate was written.)
- **A reader's "delete my data" does not drop the flags row.** `delete_my_data()` is the
  reader's own purge and knows nothing about `account_flags`; the row is the account's
  metadata — the owner's say about that account — rather than the reader's material, and
  it goes when the account goes, by the `auth.users` cascade that `close-account`
  reaches. Corroborated against the migration, `ARCHITECTURE.md` and the function on
  2026-09-23: the close flow is the only reader-facing door, so it is the case that
  matters; editing an applied purge function for the other one would buy no honesty.

## 12. The sync protocol's local state (the owner's answer, 2026-09-23)

The protocol has to know which local rows to push, and there are only two ways to know:
a flag on every row, written by every write path, or a watermark per table, compared
against the row's own `updatedAt`. Asked which, the owner answered **per-table**:

> *"I would rather not have a per-row flag, that would be too much. but per-table seems
> okay."*

- **What that buys:** no write path changes. Every row already carries `revision` and
  `updatedAt` (`Versioned`), and a push reads the rows whose `updatedAt` is past the
  table's watermark. A flag would have meant every save, in every adapter, remembering
  to set it — and the failure mode of forgetting is a change that never syncs, silently.
- **What it costs, said plainly:** the watermark is the table's, not the row's, so the
  push is per table (`P2 · 3` says so anyway), and the watermark may only move to the
  last row actually written. A row edited *during* a push is then pushed next time
  rather than missed, because the mark never passes it.
- **It does not replace the revision.** The watermark says *what to send*; the revision
  is still what settles two devices (`§7`). A row that arrives behind a watermark and a
  row that arrives ahead of it are settled the same way.
- **The first consequence to get right:** a local delete is a **removal** today
  (`db.symbols.delete(...)` and its siblings). A removed row is not there to be pushed,
  so a delete made offline cannot travel at all — which is the exact failure the delete
  mark exists to prevent, one level down. The local store has to mark instead of
  removing, and its reads have to leave the marked rows out, exactly as the cloud
  adapter's do. That is the protocol's first unit, not a detail of it.

## 13. Sync's live proof, and the lock-screen run (the owner's answers, 2026-09-23)

Two register rows were put back to the owner in the same pass, because neither is
an agent's call to take.

**`P2 · 3a` — the live proof gets both routes.** The protocol is proven over fakes
and no run has ever touched a database. The register offered `fake-indexeddb` as a
test-only dependency, *or* an e2e build pointed at the local Supabase stack. Asked
which:

> *"I want both 1 and 2."*

Both, then — and that is not redundancy, because they prove different halves.
`fake-indexeddb` puts a real Dexie store under the **integration** suite in Node,
so the protocol meets real RLS and the write path's own revision triggers against
the hosted project. The e2e build boots the **app** against the local stack, so the
run `SessionProvider` fires is exercised end to end with a signed-in session and
the real rules applying. The first costs a `DEPENDENCIES.md` entry and an allowlist
line; the second costs the e2e image a Supabase pair it deliberately does not carry
today, plus a way to sign in inside the suite.

**`P2 · 8` — the phone run is held.** The row opens with a device run, and a
lock-screen claim cannot be tested without a lock screen:

> *"Hold item 8 until a phone is available."*

So the row stays open with nothing built ahead of the evidence. The fix it names —
a Media Session registered over a real silent audio element, because Web Audio alone
does not keep a session alive on either platform — stays a candidate until a device
says whether the existing `navigator.mediaSession` handlers surface at all.

## 14. The row's controls, the symbols stage, and the round's scope (the owner's answers, 2026-09-23)

Round 20 arrived as one long list, and four things in it were put back as questions before
anything was built. The answers are what the work was shaped by.

**The Database row's controls.** The leading cell — `Open`, the drag handle, the `×` in
one column — was offered as four shapes: the row is the button; one narrow `Row` cell with
a `⋯` menu; selection plus one toolbar; a hover band with nothing pinned. The answer was
**the hover band, nothing pinned**, with *"ideally, drag and remove row should be innate to
the row itself, open actually opens the table's key menu."*

What landed honours it and departs from it in one place, and the departure is worth
knowing: the row's controls **stay at the row's right edge** while the columns scroll
under them. The first cut read "nothing pinned" literally — an ordinary last cell — and a
table wider than its room then scrolled drag and remove out of reach. Pinning *furniture*
is not pinning a *column*: no column is charged for it, and the reader's `Name` column
scrolls with the rest exactly as the owner chose. §12.27's rule is retired; the
reachability it was really about is not.

**The symbols stage.** *"I don't want a rail or a strip of bigger symbols, I want
individual scattered (yet arranged) boxes of individual symbol names (later going to be
replaced by images of those symbols) on the screen."* So the rail beside a symbols stage
is gone (it drew the same symbols twice, in the width the boxes needed), the boxes are
large, and the arrangement is a fixed stagger rather than a grid of equal cells — a
pattern, not a shuffle, so it is the same screen every time.

**The round's scope.** Asked whether the five database/library reports — one edit surface
per record, the library's `Open` reaching it, the hidden backend-only fields — should land
in the same pass as everything else or get their own item, the answer was **everything**.
They are one change and they landed together.

**The points.** The seeded points arrived as a list of body parts with the intentions the
owner had in mind for each, and one instruction: *"Construct sentences for all of these in
present perfect tense like - 'My eyes have been healed whole and complete. My vision has
improved manifold'."* That was `P1 · 40b`, and it was built in round 21: the twelve missing
points, each with its own place and its own sentences in the present perfect.

## 15. The name stays visible, and the dead ends join the rule (2026-09-24)

The owner's answer to round 20's two open calls, given while the queue behind them was being
built.

**The `Name` column is pinned.** Round 20 offered four shapes for a row's controls and the
owner chose "the hover band, nothing pinned", which took the sticky `Name` with the controls
column it had been written beside. That reversed a round-14 ask, so it was put back as a
question with the cost stated (nothing: it is a column the table already had), and the answer
was **pin it** — *"Pin Name so it stays visible"*. The pin is a **lead cell** now (`LEAD_CELL`,
`LEAD_HEAD`): the first data column stays at the left edge while the rest scroll under it,
mirroring the row's own controls at the right edge. Nothing else about round 20's shape
changed.

**The dead-end screens draw the legend.** Three files — `Library.tsx`, `DatabaseScreen.tsx`,
`DatabaseRecord.tsx`, four screens between them — said *"That meditation is gone."* with a lone
`Back` button, which was the last plain `Back` in the app. They were not asked about: round
20's own words are the rule — *"There is no need for a separate back button, just have the Esc
Back directive double as a back button"* — and this was the one place it had not been applied
because there was no legend to make pressable. They draw one now (`GoneScreen`), Escape works
there as it does everywhere else, and it is reversible on a word: a legend on an otherwise
empty screen is a look the owner may dislike, and nothing depends on it.

## 16. The point blocks, the grid's own filters, and the symbols stage (the owner's answers, 2026-09-24)

Round 22 arrived as one list of bugs and one feature, and six things were put back as
questions before anything was built. The answers are what the work was shaped by, and two of
them retire an earlier answer of the owner's own.

**A point block is one pass.** Asked whether a block that clubs several points runs its
stages once for the whole block or once per point, the answer was **once**: *"All the points
in that block will share the same intentions, symbol and focus stages and timers."* So a
block's `meditationIds` is a list, its lead point carries the stages, the sound, the Display
facts and the Focus picture, and the intentions stage reads all of them at once — each
point's own lines first, then a symbol two of them share **once**, holding both points'
lines. Point-only lines carry no label, exactly as a chakra's own lines do.

**Points carry their own symbols, and blocks group by them.** *"Today, points don't have a
symbol column. Each point must have user-defined symbols. Symbols may be repeated between
different points (also different points that are grouped together, you will display the
intentions together for points that have common symbols…)"* So a point block walks every
symbol its points carry (`symbolScope: "all"`) and the compiler merges the ones they share.
Nothing new was needed for this: an `entry` already is a meditation × symbol row.

**The reader groups the points, not the app.** *"Multiple blocks, ability to add as many
blocks as the user wants. Each block will have different points clubbed together, need not be
based on region or anything, it is completely up to the user"* — and the card is the chakra
card, with an `Edit` that opens the block's own settings. So the seeded circuit's split
(five points a block, in catalogue order) is a suggestion and nothing more, and the block's
`Meditation` field became a **set** picker in the same round rather than a later follow-up.
Chakras and points may be chained in one circuit but never inside one block.

**The grid's filter is per column.** *"Clicking on any column header should convert that into
a filter bar … This should be for all columns. Including having multiple filterable columns,
if multiple columns' filters are activated, it should be an 'AND' action. Each search table
should be able to do an | for OR, regular expression search should also be supported."* So
the single box over the table is **gone** — the answer to round 17's ask is a `⌕` on every
heading — and one column's filter is a case-insensitive regular expression list split on
`|`, with an alternative that will not compile read as plain text. This closes `P3 · 9`.

**Karuna's selector is removed, not fixed.** The `Meditation · All meditations` strip opened
the chip's "acting" panel, whose only useful entries (`Open record`, `✕ Clear`) mean nothing
for a heading — so the press offered one button, `Cancel`. The owner's call: *"I think this is
a remainent of some older functionality, it needs to be removed if it is not usable"* →
remove. Karuna draws the whole stack, and the column filters are what narrow it. `karunaSelection`
and the state behind it go with it, and `P5 · 24` closes as no longer being a question.

**The symbols stage is boxes in rows, and no panel.** On round 20's sheet: *"I didn't mean
floating on a giant panel … that background strip or panel is not required, just the boxes and
maybe spread them … they still need to follow an organized grid structure, but, something like
hexagonal shape for 6 intentions in Heart, or if there are 5 then 3 in first row 2 in the 2nd
row in the middle."* So the panel behind the boxes is gone, and `symbolRows` arranges them in
balanced rows with the extra box of an odd count in the middle — 6 → 3 + 3, 5 → 3 + 2, 7 →
2 + 3 + 2 — each row nudged half a box across from the one above it. §14's *arrangement*
sentence is superseded by this; the half of it that said no rail, big boxes and not a list
stands.

**Set aside at the owner's word.** The `Space` hint in the session footer was the subject of a
question — should it be pressable, the way `Esc end the session` is? The answer: *"leave it be
for now, the start button has its own thing, let us not disturb it, discard this change."*
Nothing in the footer changed.

## 17. The randomiser, the eight schemes, and a session's own colour (the owner's answers, 2026-09-24)

Three things arrived in one message and the owner separated them himself: *"The colour-scheme
change and the chakra hues for meditation screen is a completely different ask."* Six
questions were put back before anything was built, and the answers are what the round was
shaped by.

**The randomiser is a plan card's setting, and it changes no data.**
*"The randomize setting should ONLY live in the plan's card's edit page. Where the
stages/symbols/display etc live. This is a plan specific setting, no data should be altered
due to this."* So it sits with the per-meditation answers (`alarmEnabled`, `display`) rather
than on the meditation row or in the Database, and it is read **at compile time**: the
selection lands in the session's own snapshot, which is what makes a chosen subset
reproducible, keeps a repeat cycle showing the same lines, and leaves every stored line
exactly where the reader put it.

- **Its shape: a master switch, then two switch-and-count rows.** The one for the
  meditation's own intentions, and the one for what it shares with symbols — *"Another
  toggle for chakra/symbol intentions along with their count. The count set to chakra/symbol
  intentions applies to all the symbols for that chakra, and includes the symbol-only
  intentions which should be randomly chosen together (the final result should be intentions
  from symbol only as well as chakra/symbol pair)."* So the per-symbol count is drawn over
  the whole box that symbol's name stands over: its own lines pooled with the meditation's
  lines for it.
- **A count is a ceiling, not a quota.** At or above the list it keeps all of it, `0` keeps
  none, and nothing is ever duplicated. The dial's top value is therefore an upper bound
  rather than an exact pool — the pairing rule lives in one place, and a cap only has to be
  large enough.
- **The affirmations stage is not drawn from.** The counts name *intentions*, and a block's
  sentences are a different reading of the same table; a Thanks Giving block's affirmations
  stage still reads every sentence it did.
- **The flag's off answer is "run every line, and hide the knob"** (offered against "keep the
  counts working"). It is the `binaural` precedent: the flag subtracts the behaviour, not
  only the control, and nothing stored is touched — so the counts are heard again the day the
  flag comes back.

**The schemes are eight, and they are the whole of the customisation.** *"To increase the
visual appeal, I want to allow users to use some color-scheme picker so that they can update
the appearance, accents, button colours, background etc as per their choice. There is no need
to have huge customization in this area, Only a pre-offered diverse 8 different themes should
be good enough."* Asked what a scheme is made of, the owner asked for variety rather than
subtlety: *"none of them should be single colour, it should have at least 3 different colours
complimenting each-other per theme."*

- **One choice of eight, not two axes.** An earlier answer would have been "appearance
  (dark/light/system) and an accent hue"; this one replaces it with a single pick from eight
  complete schemes.
- **The scheme is a preference**, stored beside `textSize` and therefore per account and
  synced — not a device setting.
- **The app's own scheme is the default and is not repainted.** `warm` stays exactly as it
  was, which is what makes a device with no row, a build with no cloud and a reader who has
  never opened Settings all paint as they did.
- **What is stored is the name**, so a scheme can be tuned without rewriting anybody's row.
- **Build, then look.** *"Sure, built and then we can examine and update based on my
  opinion"* — the eight palettes are a first cut for the owner's eye, and the round's numbers
  are the ones the gate printed.

**A session wears the meditation's colour, and it is the one screen allowed to.** *"The
chakra hues for the session is a different ask, it has to be only for the sessions screen,
which would change with each meditation … an attempt to make the star of the show even
better."* Asked how far the colour should reach, the owner took the fullest option: the
controls **and** a tinted page and surface — which deliberately overrules §12's "never a
large background wash" for that screen alone. The library, the Database and the planner keep
the reader's chosen scheme.

**Three flags**, one per feature: `intention_randomiser`, `colour_scheme` and
`chakra_immersion`. Four register items carry the work — the flags themselves, the
randomiser, the schemes and the session's colour — because the flag half is the piece that
touches the table, the Edge Function and the guard, exactly as `P0 · 23` and `P0 · 35` were
split.

## 18. The lock-screen run waits for the polish pass (the owner's answer, 2026-09-24)

**`P2 · 8`'s device run is the owner's own, by hand, and it waits.** *"I will
manually do the lock screen test, but that has to wait for some more time, until
the app is more polished."* This replaces the reason §13 gave: the blocker was
never the phone as such, it is the app's own polish, so the row is `parked` at
`P5` and it closes when the run has been made and its findings recorded.
Everything else stands — the run's list is as the row prints it, the silent-audio
Media Session fix stays the candidate rather than a decision, and no agent builds
toward it until a device says whether the existing `navigator.mediaSession`
handlers surface at all.

## 19. The pancreas and the spleen, the circuit's five groups, and the legend's place (the owner's answers, 2026-09-24)

The owner's round 25 came in two parts — a seed change and a UI correction — and the answers
below are what the work was shaped by. One of them retires an exception the round-8 answer had
made for the pickers.

**`Pancreas` and `Spleen` are two points, and the row already written as one is renamed rather
than replaced.** *"There should be 2 seperate points called pancreas and spleen. All the records
for both the points will need to be created."* Asked whether to reuse the combined row or mint two
new ones, the answer was the reuse: `Pancreas` keeps the id every other device already knows, and
`Spleen` is planted beside it — the same shape as round 22's split of `Thyroid and thymus`. A
point's records are its row, its own symbol-less row with its sentences, and its four reiki
bindings, and both points end up with all of them (Dexie **v34**).

**The circuit is the owner's five groups, and the timers are the circuit's own.** The groups:
the head's three points (`Eyes, Temples, Ears`), the throat's four (`Thyroid, Thymus, Shoulders,
Tips of the lungs`), the organs' four (`Liver, Kidneys, Pancreas, Spleen`), the legs' three
(`Thighs, Knees, Lower legs`) and the feet's two (`Ankles, Soles of the feet`). Every point the
catalogue holds is in exactly one, which is also what stops the sixteenth being dropped — the
round-22 circuit sliced the catalogue five at a time. Each block runs **1:00 of intentions, 1:00
of symbols, and one minute a point of focus with a three-minute floor**, which is the owner's own
arithmetic: four points → 6:00, three → 5:00, and the two-point group → 5:00 as well. The order
*within* a group is `FOCUS_ORDER`'s, not the order the ask listed them in — one ordering rule, and
the order the library's Points tab shows.

**Each group gets a tone, named from rows the catalogue already ships.** *"Find out what binaural
beats are good for the group … and set it properly, otherwise remove all of them."* What the
research supports is a **convention**, not a finding: the evidence for region-specific binaural
effects is not there (the 2023 systematic review, Ingendoh/Posny/Heine, *PLOS ONE* 18(5):
e0286023, found 5 of 14 studies agreeing with brainwave entrainment, 8 contradictory and 1 mixed,
and calls the evidence inconclusive), and the Solfeggio frequency system is a modern convention
too. So the groups read the app's own region language — 852 Hz for the head, 741 for the throat
and the chest, 528 for the organs, 396 for the legs and the feet — from presets the seed already
has, which is the owner's "build them in" rather than a new claim or a new row. A tone is named
**only while the store still holds that preset**: `requireListed` fails hard on a missing
reference, and a plan that refuses to start is worse than a silent block.

**A device that already holds the circuit is regrouped: *"regroup always"*.** Asked whether the
repair should leave the round-22 blocks alone on the chance the reader had regrouped them, the
owner took the opposite: the blocks are the app's grouping, and it changes whether or not they
had been edited. The plan's own name, switches, Display and `revision` are kept, because what
changed is the app's grouping and not the reader's plan. This is the tree's one repair that may
overrule a press, and Dexie **v35** is where it happens.

**The `Esc back` legend lives in the foot bar, and pickers are no longer the exception.** Round 8
put the legend "with the screen's own primary action, in the bar that survives scrolling" and
excused the picker, which had no bar. Round 25 asked for one place everywhere: `EditorChrome`
draws its bar on every screen it builds (action or not), the dead-end screens get a bar at the
foot of the window, and the picker gets one holding the legend and its own action — `Choose`
leaves the form for the bar, and `Enter` still commits because the form's submit is unchanged.
The legend is never drawn beside the title.

## 10. Still the owner's

Anything the owner has not answered is listed in
[REVIEW_LOG.md](./REVIEW_LOG.md#still-open-from-the-reviews), which is the only
list that may not be dropped. If a decision here contradicts the code, the code is
wrong or this file is: say so rather than quietly following one.
