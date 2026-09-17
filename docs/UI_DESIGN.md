# Meditaur — UI/UX Design Direction (v1)

**Status:** Direction brief for Phase 4 (the UI redesign). This is the starting
point the implementation builds from — a visual and layout pass, not a rebuild,
and not a pixel-perfect spec. It supersedes the earlier `meditaur-design-direction-v1.md`
draft and folds in the owner's decisions.

> **Implemented — and finished 2026-09-16.** Stages 1–5 of the order in §7 all
> landed (commits `9c4ba74`, `207517b`, `4c4ff46`, `2b2052f`), green on
> `check:full` + e2e. The two items this doc left open are also in: the column
> picker is a toolbar action (`9c30207`) and the run screen shows each symbol's
> picture in its merged cell (`aab43f7`) — §7 records both. Nothing in this doc is
> outstanding. The binding rules that came out of it live in
> [IMPLEMENTATION.md](./IMPLEMENTATION.md#ui-rules-from-the-2026-09-15-redesign),
> and §7 is kept as the order it was built in.

**Scope:** design tokens (color, type, buttons, toggles, scrollbars), the
session/run screen layout, the library page layout, and a cross-page consistency
rule. Everything else stays as-is.

---

## 0. Status and scope

This is an **in-product visual pass**, not a brand or design-system rewrite and
not a new UI kit. It covers four things: the design-system tokens, the run-screen
layout, library-page navigation and button placement, and one shared screen
template.

What stays exactly as it is:

- The **data model**, **compile pipeline**, and **session engine**
  (`SessionEngine`, `CompiledBlock`, `compile-plan.ts`) — the run-screen change is
  render-only.
- The **no-dropdown** interaction model — `TileGrid`, `PickerPage`, `TimeWheel`
  and `Stepper` remain the only pickers (the repo ESLint rule bans `<select>`).
- The **tap-target floor** — ≥44px everywhere; `LatchButton`'s outer target stays
  64px even after its visual redesign.
- The **chakra names** — the app seeds **Root, Hara, Solar Plexus, Heart, Throat,
  Third Eye, Crown** (`packages/db/src/default-workspace.ts`). "Hara" is the
  app's word for the sacral centre; it is **not** renamed (a rename is a
  stored-name change touching UI copy, the domain type, the Dexie schema string,
  a SQL migration, and catalog-backup compatibility).
- The **local identity scheme** — `LOCAL_WS`, `LOCAL_USER`, and the deterministic
  seed ids are untouched.
- **Catalog export visibility** — pre-accounts users have device-only data, so
  backup/export must stay reachable. This doc restyles it; it never hides it.

---

## 1. Design tokens

Before this pass the app had no tokens: the palette was hard-coded as
`stone`/`amber`/`teal` Tailwind utilities plus two raw hexes (`#1c1410` page
background, `#f8edd9` text), there was no custom font, no scrollbar styling, and
no shared button component (~30 hand-rolled button strings across
`apps/web/src/features/**`). This section is the foundation everything else in
the doc builds on, and §7 records what landed.

### 1.1 Color — base and surface tiers

Dark, warm, unchanged in spirit from today — just given actual depth instead of
one flat tone.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#17120D` | Page background |
| `surface` | `#241C16` | Cards, rows, sections |
| `surface-raised` | `#2F251D` | Nested content inside a card (e.g. a symbol thumbnail) |
| `text` | `#F3E9D6` | Primary text |
| `text-muted` | `#A89A86` | Labels, secondary text |
| `line` | `#3B2F24` | Hairlines and borders (new — the current flat tone gives no border distinct from surface) |

These **replaced** the hard-coded `stone-*`/`amber-*`/`teal-*` +
`#1c1410`/`#f8edd9` palette. In Tailwind v4 (CSS-first config,
`apps/web/src/app/globals.css`), they are defined once in an `@theme` block so
utilities like `bg-bg`, `text-muted`, and `border-line` are generated.

### 1.2 Color — chakra accents

One muted hue per chakra, used **sparingly** — a ring around the representation
image, the section's tinted primary button, a small label — never a large
background wash.

| Chakra | Hex | Note |
|---|---|---|
| Root (Muladhara) | `#B5533C` | Muted terracotta |
| Hara (Svadhishthana) | `#C97A3D` | Muted amber-orange |
| Solar Plexus (Manipura) | `#C9A227` | Muted gold |
| Heart (Anahata) | `#6B8F5E` | Muted sage |
| Throat (Vishuddha) | `#4E85A3` | Muted slate blue |
| Third Eye (Ajna) | `#5B5C99` | Muted indigo |
| Crown (Sahasrara) | `#8A6BAF` | Muted violet |

Point and Custom focus points use a neutral accent — `#D8C9A8` (warm cream, not
one of the seven chakra hues) — since they have no inherent colour association.

**Destructive** actions get their own distinct hue: `#C0392B` (a clearly cooler,
more saturated red than Root's terracotta). Because colour alone must never carry
a safety-critical signal, destructive actions always pair the hue with a trash
icon and a confirm step.

**How the mapping lives.** There is no chakra→colour data today (`FocusPoint.colour`
is a free-text field, `null` in every seed). The redesign uses a **static
name→hue map in `packages/ui`** keyed by the seven canonical chakra names, with
the user-editable `FocusPoint.colour` field as an optional override. No schema or
seed change is required.

### 1.3 Typography

- **Fraunces** (weight 500) for headings and focus-point titles — a warm, slightly
  organic serif that gives the app a point of view instead of reading as generic
  UI chrome.
- **Manrope** (weights 400/500) for everything else — body text, buttons, table
  content, labels. Clean and highly legible at small sizes, which matters given
  how much of this app is dense CRUD text.

Two families, one job each: Fraunces announces "you're on the Heart chakra page";
Manrope does the reading and doing.

Loading: via `next/font/google` (built into Next — **no npm package**, so
`docs/DEPENDENCIES.md` needs no change). The fonts are mapped as
`--font-sans`/`--font-serif` in the `@theme` block and wired in
`apps/web/src/app/layout.tsx`. Note the trade-off: `next/font/google` downloads
the font files at build time; if a build-time fetch to Google Fonts is
undesirable, self-host the WOFF2 files in the repo instead (same families, same
weights).

### 1.4 Buttons — tier × size

Two orthogonal axes. **Tier** is what a button *is*; **size** adapts to the
*layout* it sits in.

| Tier | Style | Use |
|---|---|---|
| Primary | Filled, section's tinted accent (or neutral cream outside chakra contexts) | The one main action on a screen — Save, Start, Open binaural config |
| Secondary | Outline, same accent, transparent fill | Add, Duplicate, secondary actions |
| Tertiary | Text only, no border | Back, Cancel |
| Destructive | `#C0392B` outline or fill + trash icon | Delete, Remove — always behind a confirm step |

Destructive has three states, and all three are visible (2026-09-16): idle is an
outline; **armed** is filled with a light red (`bg-destructive/20`) and says what
it will remove (`Delete Heart Chakra?`); the **confirming** press fills it dark
the moment it fires. An armed control disarms itself after five seconds.
Every control — including the switches, steppers and tile grids — also shrinks
and dims while held, because a button with no press state reads as a broken one.

| Size | Height | Where it is used |
|---|---|---|
| `sm` | 36px | Table rows, tight inline groups |
| `md` | 44px | Toolbars, secondary actions inline with content |
| `lg` | 52–56px | Only a screen's single page-level primary (sticky bottom bar) and full-screen form CTAs. A secondary button sitting *beside* the primary takes the same size — two buttons in a row must be the same shape (`/plan`'s `Save` + `Start session`, 2026-09-16); the fill, not the height, says which one is primary. |

Size is chosen by **layout context, not by tier**: compact `sm`/`md` in rows,
toolbars, and inline with content; `lg` only where one action owns the screen.
This replaces the current one-size-fits-all block (`min-h-16 rounded-2xl` reused
~30 times). Centralize in a new `Button` (`tier` + `size` props) in
`packages/ui`.

`Stepper` follows the same two-size rule (2026-09-16): `md` is the page-level
numeric control, `sm` is the compact row inside a plan block card, where two
`md` buttons crowd a 256px card. Both sizes keep the 44px tap floor, and the
component's no-dropdown behaviour is unchanged — see
[IMPLEMENTATION.md](./IMPLEMENTATION.md#ui-rules-from-the-2026-09-15-redesign).

`TileGrid` follows it too (the owner's round 8, library item 1): `md` is the grid
of full-height tiles a choice gets when it *is* the screen, and `sm` is a
wrapping row of 44px buttons for a choice that sits **inside a form**. The focus
point's `Kind` (Chakra / Point / Custom) was three 64px tiles for one line of
input — "It doesn't need this big of buttons, bring them up to spec". The chosen
tile is the filled accent one and carries `aria-pressed`, so the choice is
readable rather than only coloured. The intention editor's `Associated with` is
the same shape and still `md`; that is in the [review log](./REVIEW_LOG.md)'s
queued list, not an oversight.

**Fixed placement, the same on every screen:**

- Back/context nav always top-left, as a tertiary text button.
- The primary action always lives in a **sticky bar anchored to the bottom** of
  the screen — not wherever the last content block happens to end.
- Secondary actions live inline with the content they act on.
- Destructive actions live at the bottom of the specific row or section they
  remove — never at the top. One owner-requested exception (2026-09-16):
  `/plan` keeps `Delete plan` in its plan toolbar row, beside `Switch plan`,
  `New plan`, and `Duplicate plan`. It still arms before it fires.

### 1.5 Toggle switches

Replace `LatchButton`'s current "block that changes fill colour" with a real
track-and-thumb switch — a coloured track when on, a sliding thumb, matching the
iOS/Material switch pattern. Keep the component's name, props, and `aria-pressed`
so all ten call sites are unaffected, and keep the outer tappable area at the
existing 64px even though the visual switch itself is smaller, so the
accessibility floor doesn't move.

File: `packages/ui/src/LatchButton.tsx` (internals only).

### 1.6 Images — one frame everywhere

Carried over from the landed v2 requirements (its §5), because it is a rendering
rule rather than a design preference: a picture that arrives with a white or
opaque background must not sit as a hard rectangle on the dark surface. Every
image slot — a symbol's picture, a chakra's representation, a card thumbnail, a
table cell — goes through `apps/web/src/features/library/ImageFrame.tsx`, which
paints the same soft, rounded, muted container behind the picture, with an empty
frame and the words `No image` when there is none. Nothing renders a bare `<img>`:
transparent artwork looks deliberate, and a plain white-background scan looks
intentional rather than broken. The frame takes an optional `className` for size
and accent ring, and every caller that sizes an image sizes the frame.

### 1.7 Time is set with wheels, not with plus and minus

The owner's round 5, plan-screen item 3: "I want the time-setting appearance like
in android alarm clocks. The minutes/seconds slides vertically upwards to
increase, downwards to decrease, also you can click on it to edit it like a
textbox. Use the same form in the cards on the plan screen."

`TimeWheel`/`TimeWheels` (`packages/ui/src/TimeWheel.tsx`, wrapped for the app as
`DurationSteppers`) replaced every `−`/`+` duration stepper: the plan's cards, a
focus point's `Default duration`, and the run screen. Press a wheel without moving
to type a number (`Enter` accepts, `Escape` reverts, a non-number does nothing),
and the arrow keys, `PageUp`/`PageDown` and `Home`/`End` work when it has focus.

**Round 7: the wheel is a scroller, not a stack of numbers dressed as one.** The
owner: "it is not scrollble on web, and, the minutes and seconds are not at the
same height, minutes is aligned properly, but seconds is dangling above […] You
can remove the : from the middle, properly adjust the layout and Fix this. It
needs to look professionally made (The textbox one is working fine)".

- **It really scrolls.** The column is `overflow-y-scroll` with one fixed-height
  row per value and `scroll-snap-type: y mandatory`, so the mouse wheel, a
  trackpad and touch turn it natively and the browser does the momentum and the
  snapping. Before this only a hand-rolled mouse drag moved it, which is exactly
  why it read as "not scrollable". The drag stays, for the mouse that would
  rather pull the number, and the column is deliberately not `touch-none`: a
  finger pans the wheel instead of dragging the page.
- **Fixed geometry, so the columns cannot drift apart.** The window is always
  `TIME_WHEEL_ROWS` (3) rows at a fixed height — `sm` is 36px, used by the plan
  cards and the run screen; `md` is 52px, used by the library editor. The old
  column rendered a neighbour line only when that neighbour existed, so any value
  at its minimum lost the line above it and sat ~24px higher than its neighbour:
  that is the "seconds dangling above".
- **The offset is the value.** `wheelOffsetFor` / `wheelValueAt`
  (`packages/ui/src/wheel-math.ts`, unit-tested in
  `tests/unit/web/time-wheel.test.ts`) are the whole geometry, and the two
  directions round-trip. A programmatic scroll lands on the value it scrolled to,
  so the value/offset loop cannot run away.
- **It comes to rest on a digit, not beside one** (round 9: "the time scroller
  doesn't land exactly on the digit when scrolled using trackpad and often lands
  between two digits, or lands slightly above or below the marked line"). While
  the reader is turning it, the component writes **nothing**: a mandatory-snap
  scroller that is written to mid-momentum loses the momentum and the snap it was
  going to make, which is how it came to stop between two rows. The gesture is
  over when it has been quiet for `SETTLE_MS`, and the quiet ends by writing the
  row the value names — so the wheel lands itself wherever the browser did not
  snap for it (momentum is not snapped everywhere) or where the value and the
  offset had drifted apart. The e2e test turns the browser's own snapping off and
  places the offset between two rows: it fails without that write, and the
  resting row is measured against the band.
- **One band, no colon.** `TimeWheels` draws a single highlight band across both
  columns and the `:` between them is gone: two captioned columns inside one band
  read as one value — the way an Android alarm clock does — and the colon was
  taking the width a digit of the pair needed.
- **The neighbours fade** into the band instead of being cut off by it, and the
  scroll indicator is hidden by `.time-wheel` (§1.10).

`Stepper` keeps its job for values that are not minutes and seconds — Hz, gain,
decibels, milliseconds — because a wheel for "2000 Hz" would be unusable.

### 1.8 A screen only claims a key that works there

The owner's round 5, plan-screen item 4: "All the places where Esc is going to
enable going back, state it on the page […] can you do a better job at
representing this information? what is the arrow button supposed to be? right
arrow didn't do anything."

`KeyHints` (`packages/ui/src/KeyHints.tsx`) draws keys as keys — a bordered cap,
the way a keyboard prints its own legends — each with one plain label. It shows
**only what is live on that screen, at that moment**: the run screen offers
`Space start` before the first block, `→ skip to the next block` only while
skipping does something (it used to promise a skip that was a silent no-op before
the session started, which is exactly what the owner reported), and `Esc end the
session` always. `EditorChrome` and `PickerPage` carry `Esc back`, so every screen
Escape leaves says so.

**And it says so in the same place everywhere** (the owner's round 8, library
item 2: "the Esc back instruction should be at the same place everywhere […] it
was next to the save/edit button (the button at the bottom bar that retains even
if scrolled)"). The legend sits with the screen's **own primary action, in the
bar that survives scrolling**: the run screen's footer, `EditorChrome`'s sticky
bar (`Esc back` beside `Save`), and — since a picker has no bottom bar — the row
holding `Choose`. It is never beside the title: a reader at the bottom of an
editor is looking at the bar, not at the top of the page.

### 1.9 The plan card is a fixed width, and the sound is not behind a screen

Round 5, plan-screen item 1 ("there is no need for the text `Drag` in all the
cards, if we remove it, the width of the cards can be fixed") and library item 1
("just have the tuner right below the name […] the buttons inside tuner are also
shabby").

- The card's handle reads `Focus` / `Cool-off`, with the drag instruction in its
  `aria-label`, and the card is a fixed `w-52` (234px at the app's 18px root font
  — down from 288px).
- A preset's editor holds the sound under its name: name, then the shared
  `BinauralBody` — tones, fades, EQ. There is no `Open tuner` button, no
  `L1/R1 tones` heading, and `Back` returns to the list, because the screen is
  inside the library rather than a route of its own. `Duplicate` moved out to the
  card, next to `Edit`.
- The tuner's own screen (`/tuner`) renders the same body, with an eyebrow saying
  `Tuner` and its heading naming the sound it is playing.

### 1.10 Scrollbars

A custom thin overlay scrollbar — slim track, accent-tinted thumb, visible on
hover/scroll on desktop rather than the default browser scrollbar. On touch, keep
native momentum scrolling with the same subtle styled indicator. CSS-only
(`::-webkit-scrollbar` + `scrollbar-width`/`scrollbar-color`); no custom JS
touch-scroll (custom touch-scroll reimplementations are a common source of jank).

**The one exception is the time wheel** (§1.7): it is a scroller the reader must
read as a wheel, so `.time-wheel` hides the indicator entirely. That is a rule in
`apps/web/src/app/globals.css` rather than a utility — hiding a
`::-webkit-scrollbar` needs a rule — and it is also why that class name, which
`packages/ui` names and only `apps/web` defines, is pinned in
`ui-package-classes.ts` like the rest of them. Only the indicator: momentum,
snapping and keyboard scrolling are untouched.

### 1.11 A plan tool is not a focus tile (owner's round 6)

The owner's plan-screen ask: "switch plan/new plan/Duplicate plan all should have
a different button layout than the point/chakras tile so that they can be
differentiated better." The two rows had grown into the same shape at the same
size, so the page read as one set of buttons doing one kind of thing.

- A **focus tile** is a shortcut that starts a session: a loose, accent-filled
  button only as wide as its name, in a wrapping row under its group heading.
  The groups are `Chakras`, `Points` and `Custom` — plural, because each heading
  names a group of them.
- A **plan tool** switches which plan you are editing: a compact `sm` outline
  button, all four (`Switch plan`, `New plan`, `Duplicate plan`, `Delete plan`)
  inside one bordered strip on `bg-surface`. The strip is the chrome for the plan
  below it, and nothing in it can be confused with a tile.

The rule behind it: two rows of buttons that do different things get different
shapes, not two sizes of the same shape.

### 1.12 One editor shape, and no dead band on a card (owner's round 6)

- **Editors are sections.** The focus point's, the symbol's and the intention's
  editor are the same shape: `EditorSection` (a `text-xl` heading, with the
  section's own action on the heading line at `sm`) and `EditorField` (the app's
  label-over-control). The screen's one primary action stays `lg` in the sticky
  bottom bar. The owner asked for exactly this — "clean up the buttons and the
  layout, I want the small buttons like there are in the rest of the application"
  — after a screen whose management rows mixed `md` and `sm` actions with no rule.
- **A custom field is its own heading — in the editor too.** In the open
  (non-edit) views the owner asked to "remove that heading from the open
  (non-edit) view and replace the heading with the actual field heading": a field
  value is a section named by the field — and, with no fields, nothing renders
  rather than an empty heading. Round 9 asked for the same in the editor, "I
  wanted it as its own field": each field is a section of the form, titled by its
  heading, holding one box for that entry's text, with its own two-press
  `Delete <heading>` on the heading line. There is no `Custom fields` heading
  anywhere, and the description is not drawn here — it is the field's note, and
  it belongs to the Fields tab's card and the open views. `Add custom fields` is
  one line at the foot of the fields rather than a section action, and it is the
  same component on the focus point's editor and the symbol's (the symbol's had
  no custom fields at all while its open view promised them).
- **A card answers a press everywhere.** The action row paints above the card's
  open target, so the bottom band was the one part of a card that did nothing:
  "clicking on the upper portion of the card executes the open view, lower portion
  is still unresponsive." It is one target now — a press that lands on a button is
  that button's, and every other part of the card opens the entry.
- **A screen remembers its scroll position.** Coming back from a nested screen
  returns to where the reader was; a screen they have not opened yet starts at the
  top. The library's screens are state, not routes, so this is the only thing that
  can hold a position.

---

## 2. Run screen — the grouped intentions table takes the space

One focus point is active at a time (the staggered-timer model in `SessionEngine`
does not change) — but the space allocation flips. The clock shrinks to a
compact, always-visible element, and the remaining space goes to the
**intentions**, rendered as a real table rather than a bulleted list. Intentions
are what actually get read during a session, not the symbol artwork.

No new data pipeline is needed: `CompiledBlock.focusIntentions` and
`CompiledBlock.symbolGroups` already carry exactly the intentions text and their
symbol association for the active block (`packages/domain/src/models.ts`,
populated by `compile-plan.ts`). This is a rendering change to the run screen
(`Runner.tsx`), not a compile-plan change.

### 2.1 Table layout

- **Top section — focus-level intentions** (`focusIntentions`): intentions bound
  to the chakra itself, with **no symbol column**. Plain rows of intention text.
- **Then one section per symbol** (`symbolGroups`): the symbol identity — its
  **name now, its picture later** — is a **merged cell spanning that symbol's
  intention rows**. The symbol's `description` and `usage` are shown once, inside
  the merged cell. Each intention is its own row. If a symbol has four
  intentions, the symbol cell appears once, spanning all four rows.
- **Missing values** render an elegant `-` (e.g. a symbol with no description or
  usage).
- **All symbols for the active chakra appear on one screen.**
- **Dynamic**: the table reflects library edits automatically — intentions and
  symbols flow through `compile-plan`, so no manual syncing exists to maintain.

Suggested columns: symbol identity (merged) + intention text. The symbol tag is
de-emphasised (smaller, muted) since intentions are the primary read.

### 2.2 Responsive behaviour

- **Desktop / wide viewport**: render as much of the table as fits without
  scrolling; the clock docks into a corner or a slim header bar rather than
  taking centre stage.
- **Laptop / narrower**: a compact clock area up top, with the table taking the
  remaining space and scrolling vertically underneath.
- **Landscape, including auto-rotate**: reflow the table to use the wider
  horizontal space rather than staying in the narrow portrait shape. Implement
  with a `@media (orientation: landscape)` query to start; this app already has
  precedent for document-level adaptive state (the `textSize` attribute applied
  to `<html>`), so the same pattern extends naturally. The Screen Orientation
  API's `change` event is worth reaching for later only if JS needs to actively
  recompute layout (e.g. how many rows fit) — not required for a first pass.

File to change: `apps/web/src/features/runner/Runner.tsx` (`Runner` renders the grouped intentions table itself).

### 2.3 Wireframes

```
RUN — desktop / wide (clock docked, full table):
┌───────────────────────────────────────────────────────────────┐
│ ◂ back      Root · cycle 1                     ⏱ 12:34  (clock)│
├───────────────────────────────────────────────────────────────┤
│ INTENTIONS                                                     │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ I sit grounded and still                 (no symbol)      │  │  focus-level intentions,
│ │ I notice the breath                                       │  │  no symbol column
│ ├─────────────────┬─────────────────────────────────────────┤  │
│ │ ● Root symbol   │ intention 1                             │  │  merged symbol cell
│ │   description   │ intention 2                             │  │  (name now, image later)
│ │   usage         │ intention 3                             │  │  spans all its intentions
│ │                 │ intention 4                             │  │
│ ├─────────────────┼─────────────────────────────────────────┤  │
│ │ ● Hara symbol   │ …                                       │  │
│ └─────────────────┴─────────────────────────────────────────┘  │
│ ⏯ pause   ⏭ skip   ⏹ stop        [auto-advance ⚪──●]          │
└───────────────────────────────────────────────────────────────┘

RUN — laptop / narrow (compact clock, table scrolls below):
┌───────────────────────┐
│ ◂ back                │
│        12:34  ⏱       │  compact clock
│    Root · cycle 1     │
├───────────────────────┤
│ INTENTIONS (scrolls)  │
│ ┌───────────────────┐ │
│ │ (no symbol)       │ │
│ │   intention…      │ │
│ ├─────────┬─────────┤ │
│ │ ● symbol│ intent  │ │
│ │         │ intent  │ │
│ │         │ intent  │ │
│ └─────────┴─────────┘ │
│          ⋮            │
├───────────────────────┤
│ ⏯  ⏭  ⏹   [auto ⚪●] │
└───────────────────────┘

RUN — landscape / auto-rotate (reflow wider):
┌──────────────────────────────────────────────────────────┐
│ ◂ back      12:34        Root · cycle 1                  │
│ ┌──────────────┬─────────────────────────────────────────┐│
│ │ ● symbol     │ intention · intention · intention (wrap) ││
│ └──────────────┴─────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

---

## 3. Library page — tabs + button layout

The library is one client component (`apps/web/src/features/library/Library.tsx`)
driven by an in-memory `Screen` state machine plus the `TableId` union
(`apps/web/src/features/library/library-model.ts`). The `TableId` union has
**nine** sections, in this order: Focus points, Symbols, Intentions, Fields,
Audio files, Presets, Views, Plans, History. The last-viewed section is already
remembered in `sessionStorage` under `meditaur:libraryTable`.

### 3.1 Tabs

A persistent top tab strip mirroring the nine `TableId` values exactly, with the
content pane below swapping per selected tab. This is a chrome change, not a data
change — the underlying section-switching logic and the remembered-last-section
behaviour stay exactly as they are.

**Swipeable on mobile**: native horizontal scroll + scroll-snap on the strip;
tap selects. Content-pane swipe between tabs is progressive enhancement, not a
first-pass requirement.

### 3.2 Button layout

When this was written the list screen stacked a full `CatalogBackupPanel`, a
9-tile `TileGrid`, the list, and a full-width "Add …" block at the very bottom.
The arrangement below replaced that, and is what the app does now:

1. **Sticky tab strip** at the top.
2. **Per-table toolbar row** — section title on the left, the **Add** action
   (secondary tier) top-right in a fixed spot.
3. **One `Table` switch** (cards / table) in a section that has both views, and
   the **`LibraryColumnPicker`** beside it — the column filter appears with the
   table it belongs to, and the `Columns` button reads as selected while its
   panel is open. (2026-09-16: this replaced a two-button `ListModeToggle`, which
   read as navigation rather than a view setting.)
4. **Backup/restore** stays visible (export visibility is a hard guardrail). It
   moved to the **foot of the page** on 2026-09-16 and then to the **top row**, in
   the place the `Library` heading held, on the same day: the owner's point is
   that these two act on the whole library, so they belong to the page and must
   not read as belonging to the section whose view switch sits beside them.
5. **Destructive** actions stay bottom-of-row, with the in-app arm/confirm step
   (extending the existing `deleteArmed` pattern — no native `confirm()`). Every
   card carries its own `Edit` and `Delete`. Since 2026-09-16 the arm is visible
   (light red, then dark on the confirming press) and expires after five seconds —
   `apps/web/src/lib/armed.ts`. Since 2026-09-16 (round 4) there is no `Open`
   button on the card: **pressing the card opens the entry**, and so does
   pressing anywhere on a table row, because "edit" is no longer what opening
   something means.

### 3.2a Open means read (2026-09-16, round 4 items 6–8)

The owner's ask split one screen into two jobs, and the split is the model for
any entity that grows an open view:

- **Open is read-only.** Pressing a card or a row lands on the entry's own page
  (`FocusSheet`, `SymbolSheet`): chakra block, custom field *values*, the bound
  symbols in `Rotate next` order, the intention lines, the binaural state. No
  inputs, no switches, no remove buttons — "there should be no editable or
  selectable options, only displaying current statuses and values".
- **Edit is where change lives.** One `Edit` in the open view's bottom bar
  (`EditorChrome.actions`) goes to the editor, and the editor now carries every
  management control that used to sit on the sheet: attach and unbind symbols,
  add and edit intentions, write custom fields, `Open binaural config`. The
  card's own `Edit` is a shortcut to the same place.
- **Order is dragged, not stepped.** Symbols and intentions reorder by drag
  (`@dnd-kit/sortable`, x locked, the mirror of the planner strip's y lock), with
  the keyboard as a second sensor (Space, arrows, Space). `Up`/`Down` are gone;
  `Remove` stays, and only `Remove`.
- **`Add …` sits on the section's heading line** — in a library section's toolbar
  and inside the editor.
- **Unsaved editor drafts are written before the editor hands over** to a picker
  or the binaural config (`saveDraftThen`), so `Back` from one of those cannot
  eat a name or a description.

### 3.2b The picker, and the intention editor (2026-09-16, round 4 item 9)

- **`PickerPage` is a text bar, not a list with a filter.** The owner asked for
  "a text bar there which allows you to choose from the available options and
  filters automatically. If invalid input is entered, don't save the selection,
  rather send an error message." So: typing filters as you go (labels *and*
  hints), `Choose`/Enter commits an exact name or the one remaining option, an
  unmatched name chooses nothing and says `Nothing matches “…”`, and the option
  list stays for browsing. One shape for every picker in the app — focus points,
  symbols, presets, tables, ambient, alarm.
- **Option rows truncate.** The owner's "the text overflows and looks shabby" was
  the Button base's `whitespace-nowrap` fighting multi-line hints; the label and
  hint are now separate one-line spans with `truncate`, and the row's height is a
  minimum rather than a fixed `h-11`.
- **The intention editor is section-shaped, like every other editor.** `Text`
  keeps the label-over-control form, and `Associated with` is a section: a
  `text-xl` heading, the four assoc tiles, and one field row per association —
  the app's field language (small-caps field name over the value, `Choose` when
  empty, full width), the same row the planner's block cards and the focus
  point's `Default sound` use. A button labelled `Pick focus point` did not say
  what the intention currently held.

Button sizing follows §1.4: `sm`/`md` in the toolbar, `lg` only for full-screen
form CTAs.

Files to change: `apps/web/src/features/library/Library.tsx` (tab strip + toolbar),
the list components (`FocusList`/`SymbolsList` in `FocusTable.tsx`,
`IntentionsList` in `IntentionsTable.tsx`, `FieldsList`, `PresetsList`,
`ViewsList`, `AudioList`) to move **Add** out of the
list tail into the toolbar, and `CatalogBackupPanel.tsx` (compact action).

### 3.3 Wireframes

```
LIBRARY — list:
┌──────────────────────────────────────────────────────────┐
│ ◂ back   Library                        [+ Add focus point]│ toolbar (Add = secondary, top-right)
│ [Focus][Symbols][Intent][Fields][Audio][Presets][Views][Plans][History] │ swipeable tab strip
├──────────────────────────────────────────────────────────┤
│ Focus points        [Table ⚪] [☰ columns]               │ per-table toolbar (compact actions)
│ ┌──────────────────────────────────────────────────────┐ │
│ │ row / card …                                        │ │
│ │ row / card …                               [🗑]     │ │ destructive bottom-of-row
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Cross-page consistency — one shared shell

Every screen follows the same structure: a top bar (back button top-left, title,
and the tab strip where applicable) → scrollable content → an optional fixed
bottom bar holding the primary action.

Formalize this as a shared layout shell — extending or replacing the current
`EditorChrome` (`apps/web/src/features/library/EditorChrome.tsx`, which today
renders only back + title + children + error) — adding a **bottom action-bar
slot**. `AppNav` stays for the `(app)` route group; the run screen keeps its
minimal chrome but obeys the same placement rules.

This is how button placement is kept from quietly drifting screen to screen as
new pages get added.

```
LIBRARY — editor (shared shell):
┌──────────────────────────────────────┐
│ ◂ back (tertiary)     Edit focus point│ top bar
├──────────────────────────────────────┤
│ form fields (scrolls)                │
├──────────────────────────────────────┤
│ [🗑 Delete] (bottom of its section)   │
│                        [Save] (lg)   │ sticky bottom bar
└──────────────────────────────────────┘
```

---

## 5. Non-goals

- No change to the underlying data model, compile pipeline, or session engine.
- No departure from the no-dropdown interaction model — `TileGrid`, `PickerPage`,
  and `Stepper` stay exactly as they are (the one later addition is `Stepper`'s
  compact size variant in §1.4, which changes no behaviour).
- No change to the existing tap-target size floor — only the visual treatment and
  hierarchy change.
- No chakra rename — "Hara" stays "Hara".
- No change to `LOCAL_WS`, `LOCAL_USER`, or the deterministic seed ids.
- No new UI kit or brand-system rewrite; this is an in-product visual pass.
- Catalog export stays visible.

---

## 6. References

- **Thumb zone** — Steven Hoober's mobile UX research on one-handed phone use:
  the bottom third of the screen is where a thumb reaches without adjusting
  grip, hence bottom-anchored primary actions.
- **Muted category hues** — Google Calendar's category colours are the standard
  example of distinguishing categories at a glance without turning the screen
  into a rainbow.
- **Track-and-thumb switches** — the iOS and Material switch patterns most people
  read at a glance.
- **Thin overlay scrollbars** — the look common in Notion, Linear, and Spotify's
  web app: present but never competing with content.
- **Top tabs** — the segmented tab-group pattern throughout iOS (Settings) and
  Material Design's Tabs component.
- **Fraunces** and **Manrope** — Google Fonts, SIL Open Font License.

---

## 7. How this drives Phase 4

The implementation order as built. **Stages 1–5 all landed 2026-09-15**, each
green on `./scripts/meditaur check:full` + e2e:

1. **Tokens — done.** The `@theme` block in `apps/web/src/app/globals.css`
   (base/surface/line colours, chakra accents, `--font-sans`/`--font-serif`,
   scrollbar CSS).
2. **Primitives — done.** `Button` (tier × size) in `packages/ui`, `LatchButton`
   rebuilt as the switch, scrollbar styling applied.
3. **Shared shell — done.** `EditorChrome` has the bottom action-bar slot and
   every library editor uses it.
4. **Run screen — done.** `Runner.tsx` renders the grouped
   intentions table with the responsive/landscape rules.
5. **Library — done.** The tab strip and per-table toolbar are in, and Add, the
   view switch and **columns** live in the toolbar, with backup/restore in the
   page's **top row** (see §3.2 item 4). The column picker was
the last to move (2026-09-16, `9c30207`): it is a disclosure opened from the
toolbar, and the e2e that clicks a visible column toggle opens it first.

One thing this doc did not anticipate, learned the hard way — Tailwind's source
scan cannot see the sibling `packages/ui` package, so the class strings that
package names were never generated. A missing `bg-chakra-heart` renders as an
element with no fill and reads like a styling choice.
`apps/web/src/lib/ui-package-classes.ts` pins those strings in a file the scan
does see; `@source`, the `source()` import function, and the PostCSS plugin's
`base` option were all tried and none of them reach the package. Delete the file
once the scan can.

### No longer deferred

- ~~Symbol pictures on the run screen~~ — **landed 2026-09-16** (`aab43f7`).
  `CompiledSymbolGroup.imageAssetId` carries the asset, the run screen resolves it
to a blob URL, and the picture sits beside the name in the merged cell. The
run-screen e2e uploads a real PNG through the library and starts a session from a
focus tile, which is the only path that proves it travels in the snapshot.
  Worth knowing when reviewing the merged cell: in a narrow column the name wraps
  beside the 56px picture, so it is worth an eye on a tablet width before this is
  considered finished.

## Open questions (for the next iteration)

- Run-screen table columns: settle the exact merged-cell contents (name now /
  image later) once the symbol picture lands.
- Should the library content pane also swipe between tabs on mobile, or is the
  tab-strip swipe enough?
- ~~Confirm whether `next/font/google`'s build-time fetch is acceptable, or
  whether fonts should be self-hosted.~~ **Answered:** accepted. Fonts load
  through `next/font/google`, so no npm package is added and the dependency
  allowlist is untouched. If that build-time fetch ever has to go, self-host the
  same WOFF2 families instead of adding a font package.
- The column picker as a toolbar action: settle whether it becomes a collapsed
  popover (and update the e2e that clicks a visible column toggle), or stays
  inline and the doc's §3.2 item 3 is dropped.
