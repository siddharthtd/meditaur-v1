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
mailer. The detail — the slices, their order and how each is verified — is
[ACCOUNT_FLAGS_PLAN.md](./ACCOUNT_FLAGS_PLAN.md); the register rows are `P0 · 23`,
`P0 · 35` and `P1 · 36`.

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

## 10. Still the owner's

Anything the owner has not answered is listed in
[REVIEW_LOG.md](./REVIEW_LOG.md#still-open-from-the-reviews), which is the only
list that may not be dropped. If a decision here contradicts the code, the code is
wrong or this file is: say so rather than quietly following one.
