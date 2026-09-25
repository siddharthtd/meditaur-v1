# Meditaur — UI/UX Design Direction (v1)

**Status:** living. The design pass of 2026-09-15 is finished — stages
1–5 of §7 landed (`9c4ba74`, `207517b`, `4c4ff46`, `2b2052f`), the column picker
became a toolbar action (`9c30207`) and the run screen shows each symbol's picture
(`aab43f7`). The owner's rounds 13–16 then replaced parts of what this doc first
described: the library browses and a **Database** (`/database`) holds the store, the
plan page is the session's settings page, and **§2 is three regions** — a fixed
meditation panel, a symbol panel that updates in place, and one auto-scrolling
intentions column — instead of one table. §2 is the current run-screen rule; the
rest of the doc holds for the tokens, buttons, wheels, key-claiming and shells. The
binding half of all of it is in
[IMPLEMENTATION.md](./IMPLEMENTATION.md#ui-rules-from-the-2026-09-15-redesign), and
the owner's calls behind it are in [DECISIONS.md](./DECISIONS.md). §7 is kept as the
order the redesign was built in.

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

#### The eight colour schemes (the owner's round 24)

The tokens above are **Warm Earth** — the scheme the app has always painted, and the
document's default. Seven more schemes override the same seven tokens for the whole
document, so one attribute on `<html>` (`data-theme`) repaints every screen, every button,
every ring and the scrollbar at once. **No component knows a scheme exists**: the picker is
the only place a hex is written, and everything else reads `--color-*`.

| Scheme | Ground | Accent | Feel |
| --- | --- | --- | --- |
| Warm Earth (default) | near-black brown | sandstone cream | the app as it was |
| Midnight Indigo | deep indigo | sea green | cool ground, cool-to-green accent |
| Forest | forest black | amber | green ground, warm counterpoint |
| Slate & Copper | cool slate | copper | the one warm-on-cool pair |
| Plum Noir | aubergine | gold | purple and gold |
| Paper (light) | warm off-white | deep teal | paper and ink |
| Sea Glass (light) | pale blue-grey | coral | cool pages, warm accent |
| Sakura (light) | blush | deep violet | blossom and stem |

- **The default is untouched.** A reader who never opens Settings, a device with no stored
  row and a build with no cloud all paint exactly as they did, which is what makes eight
  schemes a subtraction nobody has to take.
- **Each scheme is more than one colour.** The ink is near-neutral in every one by design —
  it has to be readable — so what carries a scheme is its ground against an accent a good way
  round the wheel from it. A unit test measures that gap, and the legibility of every scheme's
  ink and accent, which is the half of "beautiful" that can be checked.
- **The scheme is a preference**, beside the text size, and the app's own is what a row that
  predates the field reads as.
- **Two homes, one palette, and a guard between them.** The hexes are declared once in
  `apps/web/src/lib/themes.ts` (which the picker draws its swatches from) and once as token
  blocks in `globals.css` (which the document paints from); `tests/unit/web/themes.test.ts`
  reads both and fails if they disagree. The one unavoidable duplicate in this design, so it
  is the one that is tested.
- **The picker draws three dots of each scheme** over a patch of its ground, with
  `aria-pressed` for the chosen one: a scheme named "Sea Glass" means nothing until it is
  seen, and colour alone must never be what says which is selected.

### 1.2 Color — chakra accents

One muted hue per chakra, used **sparingly** — a ring around the representation
image, the section's tinted primary button, a small label — never a large
background wash.

> **One screen is the exception, and it is the session** (the owner's round 24): a run draws
> itself in the colour of the meditation it is running, controls **and** ground alike — *"it
> should feel like a completely immersive experience"*. §2 has the shape. The rule above still
> governs the app a reader reads and edits in: the library, the Database and the planner keep
> the reader's chosen scheme, and no chakra hue is ever washed behind them.

| Chakra | Hex | Note |
|---|---|---|
| Root (Muladhara) | `#B5533C` | Muted terracotta |
| Hara (Svadhishthana) | `#C97A3D` | Muted amber-orange |
| Solar Plexus (Manipura) | `#C9A227` | Muted gold |
| Heart (Anahata) | `#6B8F5E` | Muted sage |
| Throat (Vishuddha) | `#4E85A3` | Muted slate blue |
| Third Eye (Ajna) | `#5B5C99` | Muted indigo |
| Crown (Sahasrara) | `#8A6BAF` | Muted violet |

Point and Custom meditations use a neutral accent — `#D8C9A8` (warm cream, not
one of the seven chakra hues) — since they have no inherent colour association.

**Destructive** actions get their own distinct hue: `#C0392B` (a clearly cooler,
more saturated red than Root's terracotta). Because colour alone must never carry
a safety-critical signal, destructive actions always pair the hue with a trash
icon and a confirm step.

**How the mapping lives.** There is no chakra→colour data today (`Meditation.colour`
is a free-text field, `null` in every seed). The redesign uses a **static
name→hue map in `packages/ui`** keyed by the seven canonical chakra names, with
the user-editable `Meditation.colour` field as an optional override. No schema or
seed change is required.

### 1.3 Typography

- **Fraunces** (weight 500) for headings and meditation titles — a warm, slightly
  organic serif that gives the app a point of view instead of reading as generic
  UI chrome.
- **Manrope** (weights 400/500) for everything else — body text, buttons, table
  content, labels. Clean and highly legible at small sizes, which matters given
  how much of this app is dense CRUD text.

Two families, one job each: Fraunces announces "you're on the Heart chakra page";
Manrope does the reading and doing.

**The reading scale** is the reader's `Text size` — `html[data-text-size=…]` in
`apps/web/src/app/globals.css`, four steps and no more: `Small` 16px, `Medium`
**18px, the default and the size everything here was designed against**, `Large`
20px and `XL` 22px. It is the one thing on the page that scales type: a button is
pinned out of it (§1.4).

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
| `sm` | 40px | Table rows, tight inline groups, the library's toolbars |
| `md` | 50px | Toolbars, secondary actions inline with content |
| `lg` | 63px | Only a screen's single page-level primary (sticky bottom bar) and full-screen form CTAs. A secondary button sitting *beside* the primary takes the same size — two buttons in a row must be the same shape (`/plan`'s `Save` + `Start session`, 2026-09-16); the fill, not the height, says which one is primary. |
| `xl` | 72px | The run screen's transport — Pause / Skip / Stop |

Size is chosen by **layout context, not by tier**: compact `sm`/`md` in rows,
toolbars, and inline with content; `lg` only where one action owns the screen.
This replaces the current one-size-fits-all block (`min-h-16 rounded-2xl` reused
~30 times). Centralize in a new `Button` (`tier` + `size` props) in
`packages/ui`.

**A button is not text (owner's round 14).** Every one of those metrics — the
label's own type size, the height, the padding, the radius, the gap and the icon
beside the label — is a literal `px` in `Button`, never Tailwind's rem scale, so a
control keeps its size whatever `Text size` is. The numbers are the ones the app's
18px root produced, so nothing moved when the rule landed; what changed is that
`Small` now shrinks the text *around* a button rather than the button itself.

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

**`labelHidden`** (the owner's round 17, on the Chakras table's binaural column:
*"there is no need for text in the binaural column's cells, only the toggle button
is enough"*) draws the switch without its word for a cell whose **heading already
says it**. The name is not dropped — it becomes the button's `aria-label` — so the
control a screen reader announces is unchanged, and the `On`/`Off` word goes with
it, because a cell that is one switch is not a row with three words in it.

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
meditation's `Default duration`, and the run screen. Press a wheel without moving
to type a number (`Enter` accepts, `Escape` reverts, a non-number does nothing),
and the arrow keys, `PageUp`/`PageDown` and `Home`/`End` work when it has focus.

**Round 15: a timer belongs to a stage, so the wheels come in rows.** A block runs
one timer per stage, and the same row shape is
drawn in both places the owner edits them (§12.7): on the plan card **and** on the
run screen before Start. A row is the stage's `label` over its `M`/`S` wheels — the
label above the wheels rather than beside them, because the card is a fixed 234px
and "Minutes"/"Seconds" beside two columns of digits did not fit. `M` and `S` are
the only time labels anywhere (§12.7). The per-stage `Binaural` and `Auto-scroll`
switches sit with these rows, because a switch and its timer are one thing — and
`autoScrollForKind` decides which rows get the second one, so a symbols or focus
stage shows one switch rather than a switch that would do nothing.

**Round 19: the row is a card, and the seconds column counts in circles.** The owner,
on the session screen: *"the timers' seconds should wrap around, after 59, it should
again become 0, minute wheel stays the same"* and *"The height of the stage cards
determines how much space the main screen - intentions gets. So it is imperative that
we reduce the height. The wheels can stay as they are, but the rest of it should take
less height which could be accomplished by making them horizontally wider instead of
more high."*

- **The seconds column wraps; the minutes column does not.** A wrapping column draws
  one value beyond each end of its range, so from `59` the next row down is `0`, and
  above `0` sits `59` — the wheel turns both ways round the seam. `wheelWrappedRows`,
  `wheelWrappedOffsetFor`, `wheelWrappedValueAt` and `wheelWrappedStep` are that
  arithmetic, unit-tested beside the plain geometry. It **carries nothing**: a typed
  `90` in a column of sixty lands on `30`, and no wrap ever moves the minutes. Every
  seconds wheel in the app wraps (`DurationSteppers`' `wrapSeconds` defaults to true —
  one control, one rule), and the read-only pair on a running session is untouched,
  because a reading cannot wrap.
- **The run screen's stage card is one line.** The binaural mark, the stage's name, its
  two wheels and its own `↺` sit **beside** each other rather than above and below, and
  the `Minutes`/`Seconds` captions are off there and nowhere else (`captions`) — the
  columns keep their accessible names, which are what a screen reader announces. A card
  is now as tall as its wheel window and nothing more, which is ~70px returned to the
  intentions. The editor's stage cards are taller on purpose (two switches and a
  `Remove`), and they are a carousel of their own (§1.12).

**The alarm is a block's, with the plan's answer behind it, and it is off until the
reader asks for it** (the owner's round 17, 2026-09-21). `Alarm` is a `LatchButton`
on the plan's latch row as the circuit's default, in the meditation editor where a
block answers for itself, in the run screen's footer beside `Auto-advance`, and in
Settings as the default a new plan is created with. `PlanBlock.alarmEnabled` is
`null` for "the plan's answer", so one silent Thanks Giving can sit beside seven
ringing chakras. The switch's *placement* still follows the old rule — wherever a
binaural switch is — but its scope is the block's, and a flag repeated on up to nine
stage rows would be nine controls for one answer.

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
- **One axis, and only one** (owner's round 20: *"The minute wheel is able to scroll
  horizontally as well, while the seconds wheel only scrolls vertically as it should.
  Fix the minute wheel to only move vertically."*). The column's `overflow-x` is
  hidden and its `touch-action` is `pan-y pinch-zoom`, so a trackpad's sideways swipe
  and a finger's sideways drag both do nothing while a vertical pan and a pinch-zoom
  still work. The minute column could move sideways at all because three digits
  (`180` is its ceiling) are a couple of pixels wider than it — `overflow-y: scroll`
  computes `overflow-x` to `auto`, so there was somewhere to go.

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
bar (`Esc back` beside `Save`), and the picker's own bar (`Esc back` beside
`Choose`/`Done`). It is never beside the title: a reader at the bottom of an
editor is looking at the bar, not at the top of the page. Since round 25 every
shell draws that bar — the dead-end screens included — and `integrity.test.ts`
reads the legend's **place** as well as its press, because the rule had quietly
drifted back to the title line in `EditorChrome` while the guard was only
checking that a legend existed.

### 1.9 The plan card is a fixed width, and the sound is not behind a screen

Round 5, plan-screen item 1 ("there is no need for the text `Drag` in all the
cards, if we remove it, the width of the cards can be fixed") and library item 1
("just have the tuner right below the name […] the buttons inside tuner are also
shabby").

- The card's handle read `Focus` / `Cool-off`, with the drag instruction in its
  `aria-label`, and the card is a fixed `w-52` (234px at the app's 18px root font
  — down from 288px). **Round 15 replaced what the handle says**: the two block
  kinds are gone, so it now reads the meditation's name with its type under it —
  a card is a meditation block, and what the reader needs to know is *which*
  meditation, which the old one-word handle never said.
- **The card is a handle, and the press is the point** (the owner's round 17):
  *"that card-view is become too cluttered, it doesn't even visibly show the chakra
  name clearly, it is all truncated, so it is not at all usable … the information it
  shows is read-only, so that is also useless … Whatever is meditation specific —
  symbols, ambient, alarm, binaural, stages of meditation etc, all should be
  updatable for that particular meditation … by clicking on the card."* So the five
  picker fields and the per-stage rows are **gone**; what is left is the handle, the
  meditation over its type, `Remove`, and one full-width `Edit` press that answers
  the rest of the card (UI_DESIGN §1.12's "a card answers a press everywhere").
  Everything the card used to print is editable one press away, in the app's editor
  shape, and the Display panel now lives there too.
- **The card carries one line of facts, and its controls sit on its foot** (the
  owner's round 18): *"it is the card itself, along with what it opens, there should
  be more beautiful way to represent that information. Smaller buttons, more
  well-placed and easy to operate."* So the title-line `Remove` and the full-width
  `Edit` band are gone. A card is the handle — the meditation over its type, the
  type in the meditation's own accent — one muted line under it
  (`<length> · <n> stages · <symbol>`), and a `sm` row on its foot holding `Edit`
  and the armed `Remove`. Everything else on the card is the press: it opens that
  meditation's editor. The line is a **body, not a picker** — the round-17 card was
  criticised for truncating, so the summary names only what fits the fixed `w-52`.
- **The Display is an editor section, and its switches are named once** (the owner's
  round 18: *"the details section shouldn't be that collapsed hideous thing it is
  today"*). It is an `EditorSection` like every other one — always open, no
  `details` disclosure — and its body is a grid: a band per group (`Meditation`,
  `Symbol`, `Entries`), then a row per column with the column's name and two
  switches under the `Shown` and `Pin` headings that name them. A cell's switch is
  `labelHidden` and named `<group> <column> shown|pinned`, so the words the cells
  drop are the words a screen reader hears, and the two `Name` columns — one per
  table — stay told apart. When the block has made the Display its own, the way back
  to the plan's answer is an `sm` action on the section's heading line, the same
  shape the `Alarm` section uses for its own inherited answer.
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
  There are three group headings and they are the owner's own words (round 16,
  §8): `Chakras`, `Points` and `Other meditation blocks` — plural, because each
  heading names a group of them. Only a chakra's and a point's tiles keep a
  heading of their own; the third collects every other live type — Protection,
  Thanks Giving, and whatever the reader adds later — so a type holding one block
  does not repeat a name the block card's handle already carries. The first two
  headings are their type row's own name, as the library's tabs and the Database's
  tables are, so renaming a type moves its heading and nothing else.
- A **plan tool** switches which plan you are editing: a compact `sm` outline
  button, all four (`Switch plan`, `New plan`, `Duplicate plan`, `Delete plan`)
  inside one bordered strip on `bg-surface`. The strip is the chrome for the plan
  below it, and nothing in it can be confused with a tile.

The rule behind it: two rows of buttons that do different things get different
shapes, not two sizes of the same shape.

### 1.12 One editor shape, and no dead band on a card (owner's round 6)

- **Editors are sections.** The meditation's, the symbol's and the intention's
  editor are the same shape: `EditorSection` (a `text-xl` heading, with the
  section's own action on the heading line at `sm`) and `EditorField` (the app's
  label-over-control). The screen's one primary action stays `lg` in the sticky
  bottom bar. The owner asked for exactly this — "clean up the buttons and the
  layout, I want the small buttons like there are in the rest of the application"
  — after a screen whose management rows mixed `md` and `sm` actions with no rule.
- **A block's editor: a carousel for what repeats, a row for what does not** (the
  owner's round 19). The meditation editor's `Stages` are cards in a horizontal strip —
  the circuit's own recipe one level down (drag sideways with the y half of the
  transform dropped, the `distance: 6` activation, `arrayMove` written optimistically,
  an armed `Remove` on each card) — with `Add stage` as the last thing **in** that
  strip, because the ask was to add stages "inside" it; the press opens the same
  `PickerPage` every other *which one?* in the app uses. A block's stages are a list, so
  a list is what they are drawn as. What does *not* repeat is a row: a `FieldButton` is
  44px with its name on the left and its value on the right, `Sound`'s two fields sit
  side by side, and a single switch belongs on the section's heading line (`Alarm`).
  The plan screen's own five settings are one bordered strip, the shape its toolbar
  above already uses — *"settings on the plan page don't need big bars for single
  settings, make them compact and better usable."*
- **The alarm's switch still says which answer it is showing** (round 17) now that it
  is compact: `Alarm (the plan's answer)` / `Alarm (this meditation)`, with
  `Use the plan's answer` beside it once the block has an answer of its own.
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
  same component on the meditation's editor and the symbol's (the symbol's had
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

### 1.13 The plan card's `Intentions` section (the owner's round 24)

The card's editor grew a section between `Meditation` and `Stages`, holding the one setting
that decides **what a session reads**:

- A master switch, `Draw a subset each session`. Off — and `null`, which is what a block that
  has never been asked carries — reads every line in the order the reader arranged them.
- While it is on, two rows: `Intentions of this meditation` (the lines that belong to the
  meditation and to no symbol) and `Intentions under a symbol` (one count for every symbol,
  drawn over that symbol's own lines together with the meditation's lines for it).
- Each row's count appears **only while that row is on**. A number beside a switch that does
  nothing is a promise nothing keeps, which is the app's own rule about controls.
- The count's top value is everything the meditation has: a count is a **ceiling**, so dialled
  to the top the session reads all of it. The exact pool is the compiler's business, and this
  control deliberately does not spell that rule a second time.
- `Read every line` on the section's heading line clears a block's answer back to `null`, the
  shape `Use the plan's Display` gives the neighbouring section.
- The section is drawn only when the account has the feature **and** the meditation holds
  lines for the counts to act on.

---

## 2. Run screen — three regions, one viewport

One meditation is active at a time (the staggered-timer model in `SessionEngine`
does not change) — but the space allocation flips. The clock shrinks to a
compact, always-visible element, and the remaining space goes to the
**intentions**.

No new data pipeline is needed: `CompiledBlock.focusIntentions`,
`CompiledBlock.symbolGroups` and `CompiledBlock.meditationFacts` already carry
exactly the lines, their symbol association and the meditation's own columns for the
active block (`packages/domain/src/models.ts`, populated by `compile-plan.ts`). This
is a rendering change to the run screen (`Runner.tsx`,
`features/runner/SessionRegions.tsx`), not a compile-plan change.

### 2.1 Three regions (owner's round 15 §6, landed 2026-09-19)

**Round 14's one table is gone; this replaces it.** The table still stacked a row per
symbol, and the owner's round 15 §6 wanted the *screen* to stop being a document: one
meditation is active at a time, so the screen paints that meditation, the symbol in
play, and its lines. The three regions:

1. **The meditation panel** (fixed) — the meditation's name, its **type** as an
   eyebrow (`CompiledBlock.meditationTypeName`), and the meditation's own Display
   columns below (`meditationFacts`). This is the ask the owner recorded in round 15
   item 1 rather than building ("no place for it, the current screen is already
   crowded") and it landed here.
2. **The symbol panel** (fixed, updates **in place**) — the pair whose lines are at
   the top of the column: its picture (`alt="<name> symbol"`), its name as the
   region's heading, and `facts` + `entryFacts`. As the reader's position crosses
   into another symbol's lines, the panel's *contents* change and nothing on screen
   moves. A block with no symbols says so rather than drawing an empty box.
3. **The intentions column** (the one scroller) — every line of the block in order,
   in one continuous list: the meditation's own lines first, then each pair's, which
   is the order `compile-plan` already emits. An **affirmations** stage shows the
   reader's sentences instead (`CompiledBlock.affirmations`), which is what Thanks
   Giving is. An empty stage says `Nothing for this stage.`

The rules the table carried still hold, because they were about the *Display*:

- **The facts are the plan's Display, not a hard-coded four.** A column the reader
  hides is gone from the screen exactly as before — the `Display` panel keeps its
  meaning; only the shape it paints changed.
- **Missing values** render an elegant `-`.
- **A pinned fact stays put.** `Display`'s `Pin` keeps its meaning on this screen: a
  pinned fact is drawn in a band at the top of its panel, `position: sticky` inside
  the panel, so it stays visible when the panel's own facts are taller than the room
  and scroll under it. A plan that pins nothing draws exactly one `dl` as before.
  Nothing pins horizontally any more — there is no sideways scroll to pin against.
- **Dynamic**: the regions reflect library edits automatically — intentions and
  symbols flow through `compile-plan`, so no manual syncing exists to maintain.
- **Nothing is per-line inside a cell any more.** The list *is* the column, which is
  the point of §12.20.

### 2.2 One viewport, and the column scrolls inside it

- **`run/layout.tsx` is `h-[100dvh] overflow-hidden`** and `Runner`'s `<main>`
  fills it, so the header, the regions and the transport bar are the only three rows
  and the page itself can never scroll. `plans.spec.ts` asserts it as computed
  style: the shell's `overflow-y` is `hidden`, its height is the viewport's, and the
  last control is inside the fold without anything having been scrolled to reach it.
- **The intentions column is the one scroller** — `overflow-y: auto` on a
  `min-h-0 flex-1` box inside the region, so a block with more lines than fit scrolls
  its own card and nothing else moves. The controls therefore never leave the bottom
  edge. The assertions live in `plans.spec.ts` ("the session is three regions, and
  the screen does not scroll"), beside the geometry ones.
- **It walks itself down while the stage runs**, at a rate of **content ÷ the
  stage's remaining time** (`features/runner/scroll-rate.ts`) — never a fixed px/s,
  so a short block does not scroll and a long one finishes with the timer (§12.20).
  Pausing holds it with the clock and resuming carries on. A **hand on the list
  re-syncs** rather than being fought (§12.18): the position the app holds is
  re-seeded from the element when the element moved away from what the app last
  wrote. Reduced motion is the exception — a reader whose system asks for less
  motion gets the column **still** until they press that stage's own `Auto-scroll`
  (§6.3, §12.19).
- **The grid is three columns on a wide screen**,
  `lg:grid-cols-[minmax(13rem,18rem)_minmax(11rem,15rem)_minmax(0,1fr)]`: the panels
  are bounded rather than fixed, and the intentions take what is left. A narrow
  screen stacks the three (`grid-cols-1`) inside the same one viewport, so nothing
  is pushed off the page.
- **Landscape needs no rule of its own.** The layout is viewport-driven, so a wider
  screen simply shows more of the intentions column; the earlier note asking for a
  `@media (orientation: landscape)` override has been dropped rather than left
  standing.

Files: `apps/web/src/features/runner/SessionRegions.tsx` (the three regions),
`apps/web/src/features/runner/scroll-rate.ts` (the scroll rule),
`apps/web/src/features/runner/Runner.tsx` (the grid, the header and the footer) and
`apps/web/src/app/run/layout.tsx` (the viewport box).

### 2.3 The strip is the clock, and a stage is a control (owner's round 17)

- **The wheels are the clock, and the header has none.** *"rather than the timer on
  top of the page, I would want to see the actual wheels for the 3 stages decrementing
  automatically (once the session starts, these can become read-only (no more
  modification) and display the decreasing time in the same place for each block)."*
  Each stage's wheel reads what **that** stage has left — `0:00` for the stages
  already walked, the remainder for the one on screen, its own length for the ones to
  come — so before Start the strip is exactly the block's set times and nothing moves
  when the session begins. `TimeWheels`' `readOnly` mode draws the same two columns on
  the wheel's own geometry, with no scroller, no spinbutton role and no text box: the
  number the reader set is the number they watch, in the same place.
- **A stage is pickable.** *"clicking on the stage highlights it, and should be able
  to press Space or Start button to start from that stage onwards."* The stage's own
  name is a button; the press seeks, which highlights it and holds the session there.
  A control press that lands on the wheel is the wheel's, and one that lands on the
  mark is the mark's.
- **Two restarts, and they mean the same thing.** *"a restart button for each of the
  stages (a small button below the binaural beats button at each stage) … Another
  restart button for the entire meditation."* The `↺` on each stage's own line resets
  that stage. The whole meditation's restart is the fourth of the footer's transport
  squares (round 19): *"the restart button for whole meditation restart is for the
  complete meditation, so it stays on the bottom"*, *"restart should be just the
  circular arrow besides these buttons"* — so it stands with `Pause`/`Skip`/`Stop`, and
  it is not drawn while the alarm holds, because `seek` refuses there. Both restarts are
  `seek`: they clear the clock and wait for Start rather than resuming a remainder.
- **The transport is four squares of one size** (round 19). `Button`'s `iconOnly` shape
  is the same tiers at the same heights, square and without a label's padding — `xl` is
  the 64px floor exactly. Pause/Skip/Stop carry drawn glyphs and an `aria-label` rather
  than a word: *"make pause-skip-stop buttons all of same size, no text only symbols of
  pause, skip, stop so that they take up less space."* The three session latches are the
  compact `sm` switch, named `Alarm`, `Scroll` and `Advance`: *"need to be of the same
  size, smaller, give them smaller names so that they take up less space."* This is the
  deliberate exception to the 64px run-mode floor (§1.5), which covers the primary
  controls and no longer the three secondary ones.
- **The legend is two keys.** *"all the instructions that you have coded at the bottom
  are taking up more space than I can offer, only retain Esc and Space."* The arrow keys
  still step a stage and a meditation — the bullet below is unchanged — they are simply
  no longer advertised on the page.
- **The arrow keys step, and they never start.** `→` next stage, `→→` next
  meditation; `←` restart this stage, `←←` previous stage, `←←←` previous meditation —
  each inside two seconds. The `KeyHints` legend says so, and says it only while the
  arrows do something (§1.8), which excludes the alarm hold.
- **A `symbols` stage shows symbols.** *"The symbol stage doesn't need to show me the
  intentions, only symbols"* — its main region is a sheet of the block's symbols,
  pictures where a symbol has one and names until then, and the panel beside it follows
  the **clock**, because a sheet has nothing to scroll. An intentions or affirmations
  stage whose column has run out of travel falls back to the clock too: *"it should be
  updated with time even though the scrolling stops."*
- **The sheet is the whole stage, and it is boxes in rows** (owner's rounds 20 and 22). The rail
  beside it is gone — it drew the same symbols twice, in the width the boxes needed — and the
  boxes are large and **framed** (`h-36 w-36`, a picture at `h-24 w-24`). Round 20 laid them out
  as one staggered line; round 22 replaced that with `symbolRows`: balanced rows, the extra box
  of an odd count in the **middle** row, and every other row nudged half a box across —
  *"something like hexagonal shape for 6 intentions in Heart, or if there are 5 then 3 in first
  row 2 in the 2nd row in the middle … something that feels organized but not constricted like a
  list."* There is **no panel behind them**: *"that background strip or panel is not required,
  just the boxes."*
- **A `focus` stage draws the meditation and its symbols, in one colour, breathing** (the same
  round, built 2026-09-24). *"During focus, we would want to show beautiful visuals of the
  chakra's picture in its colour, as well as all the symbols in the same colour breathing etc.
  occupying the entire space that was earlier occupied by the intentions table."* So the region
  holds the meditation's picture — the reader's own upload, or the glyph `focus-glyphs.tsx`
  draws for it — and the block's symbols under it, all in the meditation's accent, each
  breathing on a stagger. **The accent is ink, never a fill**: every glyph is a line drawing in
  `currentColor`, because §1.2's rule about a large background wash matters most on the largest
  surface the app has. A chakra's petal count is data (2, 4, 6, 10, 12, 16, and a bloom for
  Crown), a place on the body gets a location mark instead, and the symbol the stage's clock
  has reached is drawn larger. Reduced motion gets the same picture, still.
- **The whole screen takes the meditation's colour** (the owner's round 24). `Runner` puts
  `data-chakra="root|hara|…"` on its `<main>`, and one rule per chakra replaces the ground,
  the two surface tiers, the hairline and the accent token **for that subtree** — so the stage
  strip, the latches, the table borders, the focus ring and the scrollbar all follow at once.
  The wash is mixed into a base of the reader's own scheme, so a dark scheme gets a dark wash
  and a light one a light one: the reader still decides how bright the screen is, the chakra
  decides what colour it is. A reader's custom `Meditation.colour`, and a point's neutral
  accent, get the ink accents and no wash — there is no rule for a colour the app did not
  choose. The shell carries `bg-bg` itself, or the wash would tint the panels and not the page.
- **The stage card's own controls stay out of the way** — the artwork is not a control: a focus
  stage's region takes no press, and the strip above it is still how a stage is chosen.
- **The whole stage card is a target before Start.** *"Clicking anywhere on meditation
  stage cards while the session has not started should take the user to that stage …
  (same behavior as pressing the right arrow)."* The card's press is a labelled button
  painted **under** its own controls, so the wheels stay editable and `♪`/`↺` keep their
  own presses; once the session has started it is gone.
- **A stage's two switches share its end** (the same round). The `♪` sits after the
  wheels and the `↺` after that; the name and its clock keep the left-to-right reading
  order they had.
- **The arrow window is one second** (the same round: *"reduce that timer to 1 second. If
  an arrow is pressed after a second, consider it a stage advancement not a meditation
  advancement."*) Nothing about what the gestures *mean* changed.

### 2.4 Wireframe

```
RUN — one viewport; the intentions column is the only thing that scrolls:
┌───────────────────────────────────────────────────────────────────┐
│ ◂ back   Third-Eye Chakra · cycle 1                               │
│ ┌───────────────────────────┐ ┌─────────────────┐ ┌────────────┐  │
│ │ ♪ Intentions ↺            │ │ ♪ Symbols    ↺  │ │ ♪ Focus ↺  │  │
│ │  0 : 12  (a wheel)        │ │  1 : 00         │ │  6 : 00    │  │
│ └───────────────────────────┘ └─────────────────┘ └────────────┘  │
│                                                     ↺ Restart     │
├──────────────┬────────────┬───────────────────────────────────────┤
│ Third-Eye    │ ⟨picture⟩  │ INTENTIONS                            │
│ Chakra       │ Harth      │                                       │
│ CHAKRAS      │            │ I am completely protected against …   │
│              │ Description│ My past traumas have been identified… │
│ Location     │ All of my  │ I trust myself and have become …      │
│ Between the  │ fear and … │ I always radiate beauty, grace and …  │
│ eyebrows     │            │                                       │
│              │ Usage      │ I am completely grounded, stable …    │
│ Element      │ Love,      │ I have mastered unbreakable …         │
│ Light        │ compassion │                                       │
│              │ have been  │  ← this column scrolls; nothing else  │
├──────────────┴────────────┴───────────────────────────────────────┤
│ ⏯ pause   ⏭ skip   ⏹ stop        [Alarm ⚪──●] [auto-advance ⚪──●] │  always on screen
└───────────────────────────────────────────────────────────────────┘
   fixed panels, facts = the plan's Display      the symbol swaps in place as the
                                                 top of the column crosses a pair
```

---

## 3. Library page — tabs + button layout

The library is one client component (`apps/web/src/features/library/Library.tsx`)
driven by an in-memory `Screen` state machine plus the `TableId` union
(`apps/web/src/features/library/library-model.ts`). The `TableId` union has
**seven** sections, in this order: Meditations, Symbols, Archive, Audio files,
Presets, Plans, History. The last-viewed section is remembered in `sessionStorage`
under `meditaur:libraryTable`. The **Database** is no longer one of them: since
2026-09-19 it is a nav destination of its own (`/database`, between `Library` and
`Settings`), because it is the one screen in this app that writes.

**Round 15 landed 2026-09-19 and supersedes the list above wherever it disagrees.**
The strip is **generated**: one tab per live meditation type, in the type rows'
order, then the six fixed ones — Symbols, Archive, Audio files, Presets, Plans,
History. The old `Focus points` tab is gone: `Chakras`, `Points`,
`Protection` and `Thanks Giving` are the seeded rows a reader sees, and a type the
reader adds gets its own tab, its own Database table and its own columns with
nothing to register. A type's tab shows only that type's meditations — a filter
over the one list, not a second store — and its `Add` says just `Add`, because the
tab above it already names the type. Tab ids are namespaced (`type:<id>`), so a
rename moves the label and nothing else: the remembered section and the scroll
memory survive it. The round's plan (retired 2026-09-21; the amounts that stayed are
in [DECISIONS.md](./DECISIONS.md)) is the authority on the round; §12 of it is the
owner's own answers.

### 3.1 Tabs

A persistent top tab strip mirroring the `TableId` values exactly, with the
content pane below swapping per selected tab. This is a chrome change, not a data
change — the underlying section-switching logic and the remembered-last-section
behaviour stay exactly as they are. The strip wraps today (`flex-wrap`); when a
tab is added for every meditation type it scrolls sideways instead (round 15).

**Swipeable on mobile**: native horizontal scroll + scroll-snap on the strip;
tap selects. Content-pane swipe between tabs is progressive enhancement, not a
first-pass requirement.

### 3.2 Button layout

When this was written the list screen stacked a full `CatalogBackupPanel`, a
9-tile `TileGrid`, the list, and a full-width "Add …" block at the very bottom.
The arrangement below replaced that, and is what the app does now:

1. **Sticky tab strip** at the top.
2. **Per-table toolbar row** — the **Add** action leads it on the left, and
   everything that is a *setting for the list* goes to its right edge. (Round 14:
   the Add action used to sit on the right with the view switch beside it, which
   read the switch as an action on the section rather than a setting for its
   list — "meditations being arranged as table/cards should be to the right-most
   of the page instead of beside the add meditation button".)
3. **One `Table` switch** (cards / table) in a section that has both views, at the
   right edge, with the **`LibraryColumnPicker`** beside it — the column filter
   appears with the table it belongs to, and the `Columns` button reads as
   selected while its panel is open. (2026-09-16: this replaced a two-button
   `ListModeToggle`, which read as navigation rather than a view setting.)
4. **Backup/restore** stays visible (export visibility is a hard guardrail). It
   moved to the **foot of the page** on 2026-09-16 and then to the **top row**, in
   the place the `Library` heading held, on the same day: the owner's point is
   that these two act on the whole library, so they belong to the page and must
   not read as belonging to the section whose view switch sits beside them.
   **Both halves are `Button`s in one row** (round 14). `Restore` was a `<label>`
   wrapping its own file input, and a label in the page's column flex stretches —
   it drew a full-width bordered bar under the last list, "like a divider between
   different displays".
5. **Destructive** actions stay bottom-of-row, with the in-app arm/confirm step
   (extending the existing `deleteArmed` pattern — no native `confirm()`). Every
   card carries its own `Edit` and `Delete`. Since 2026-09-16 the arm is visible
   (light red, then dark on the confirming press) and expires after five seconds —
   `apps/web/src/lib/armed.ts`. Since 2026-09-16 (round 4) there is no `Open`
   button on the card: **pressing the card opens the entry**, and so does
   pressing anywhere on a table row, because "edit" is no longer what opening
   something means.

### 3.2a Open means read (2026-09-16, round 4 items 6–8; one screen since round 22)

The owner's ask split one screen into two jobs, and the split is the model for
any entity that grows an open view:

- **Open is read-only.** Pressing a card or a row lands on the entry's own record:
  chakra block, custom field *values*, the bound symbols in `Rotate next` order, the
  intention lines, the binaural state. No inputs, no switches, no remove buttons —
  "there should be no editable or selectable options, only displaying current statuses
  and values". Since round 22 that record is a **route of its own** (`/record`, with the
  door it came through in the address), and arriving on it always draws this half.
- **Edit is where change lives, on the same screen.** The reading half's `Edit`
  (`EditorChrome.actions`) turns the record into its editor **in place** — the address does
  not move, and there is no second screen to travel to — and the editor carries every
  management control that used to sit on the sheet: attach and unbind symbols,
  add and edit intentions, write custom fields, `Open binaural config`. The
  card's own `Edit` is a shortcut to the same record. A **preset** is the exception: it has
  nothing to read, so its page *is* its editor.
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
  list stays for browsing. One shape for every picker in the app — meditations,
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
  point's `Default sound` use. A button labelled `Pick meditation` did not say
  what the intention currently held.

Button sizing follows §1.4: `sm`/`md` in the toolbar, `lg` only for full-screen
form CTAs.

Files to change: `apps/web/src/features/library/Library.tsx` (tab strip + toolbar),
the list components (`FocusList`/`SymbolsList` in `FocusTable.tsx`,
`IntentionsList` in `IntentionsTable.tsx`, `FieldsList`, `PresetsList`,
`ViewsList`, `AudioList`) to move **Add** out of the
list tail into the toolbar, and `CatalogBackupPanel.tsx` (compact action).

### 3.2c The Database's grid (2026-09-18, owner's round 13)

The owner's review of the built tab: *"I was hoping to get a table like view and
when something new is added, it shouldn't look like a shitty visual basic type
interface … It doesn't look like notion at all!"* The data model and the
interaction design were not the complaint — the **surface** was. Four things made
it read as a form rather than as a table:

1. **No table chrome at all.** The grid was bare `<td>`s directly on the page
   background: no card, no header band, no rule between rows, no highlight under
   the pointer. Nothing said where a row began or which column a value belonged
   to.
2. **Every cell was an outlined box.** The cell input carried
   `border border-line` in its resting state, so a 35-row grid drew 70 visible
   boxes. A cell must *read as text* and become a control only when it has the
   press (§3.2a's rule, applied to the grid).
3. **Rows were 198px.** Every intention line was a `min-h-16` (72px) input, and
   the Intentions cell held a nested `max-h-40` scroller. The input is one line
   either way — the height bought nothing.
4. **Every control was on at once.** The leading cell stacked six of them
   (`⠿`, a `↑↓` pair, two full-width chips, `×`, `＋`), and the heading `+`, the
   row `+` and `Add` were permanently visible.

The treatment, which is the rule from here on:

- **One card.** The grid is a `rounded-2xl border border-line bg-surface` surface
  with `overflow-hidden`; the scroll container lives inside it.
- **A header band.** `text-xs uppercase tracking-wide text-muted` labels over a
  `border-b border-line`, with the add-column `＋` at the far right.
- **A hairline under every row**, `border-line/50`, and a hover fill
  (`bg-surface-raised`) that the **pinned** lead cell follows — `bg-inherit` on
  that cell, so it can never show scrolled content through it. The pinned column
  also carries a `border-r` hairline, which is §15.15's "reads as stuck, not just
  first".
- **Cells are text.** Borderless and unpainted at rest; on focus they paint
  `bg-bg` and a `ring-2 ring-accent/40`. A record's `Name` is the one cell in
  `font-medium`.
- **Quiet controls.** `REVEAL` in `DatabaseCells.tsx` is
  `opacity-100` plus `pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100
  pointer-fine:group-focus-within:opacity-100` — hidden until the pointer or the
  keyboard is there *on a device that has a hover*; a phone draws them always,
  which is what §12.33's one-time hint exists to offset. `opacity`, never
  `display`: the row's geometry must not move under a gesture, and the grid's e2e
  drags read a handle's box before it is hovered.
- **One line for the pair.** `Chakra × symbol` is the heading, so on a computer
  the two chips share a line (`sm:flex-row`) with a `×` between them; on a phone
  they stay stacked, because a pinned cell wide enough for both at once would
  leave nothing to scroll (§12.27).
- **`+ New` at the foot**, full width and quiet, instead of a stray `＋` in an
  empty cell. A phone's Intentions cell says `☰ N intentions` and opens the
  focused editor (§6.3) unchanged. The invitation names its noun — `New row`,
  `New symbol`, `New affirmation` — and its accessible name is `Add a row`, `Add a
  symbol`, `Add an affirmation` (`withArticle` picks the article, so the copy reads
  as English whatever the noun).
- **A record's `Open` is drawn only where a page exists** (round 15, 2026-09-19). A meditation, a
  symbol and a preset have a record page; a **type** is edited in the grid and an
  **affirmation** *is* its sentence, so neither shows a control that cannot act.
- **An affirmation's one column is its `Name` cell, labelled `Affirmation`.**
  Every record table's leading cell is the row's `name` in the draft — the one a
  reader types into, the one that takes the caret when the row arrives, and the one
  a save reads the record out of — so the Affirmations table uses that key rather
  than a `text` cell of its own. A `text`-keyed cell would write `builtins.text`,
  which nothing reads, and the saved row would be dropped for having no name. Its
  width comes from a `width` on the column (`min-w-[28rem]`: a sentence needs the
  room) rather than from `BUILTIN_WIDTH`'s per-key table.
- **The Add-column form is a form**: `Heading` and `Description` labels over
  their controls, `Type` and `Points at` under `TileGrid`s, `Add column` as the
  one action and `Cancel` on the heading line.
- **A filter on every column** (the owner's round 22, which replaces round 17's one box:
  *"Clicking on any column header should convert that into a filter bar. It should display all
  the rows that contain the particular text for that column. This should be for all columns.
  Including having multiple filterable columns, if multiple columns' filters are activated, it
  should be an 'AND' action. Each search table should be able to do an | for OR, regular
  expression search should also be supported."*). Every heading carries a quiet `⌕` that opens
  that column's input in a **filter row under the header band**; a second press, or `Escape` in
  the input, closes it. Presence in the map is "this column's input is open", so an empty one
  narrows nothing. `grid-filter.ts` is the whole rule: one column's text is a case-insensitive
  regular expression list split on `|` (a `|` inside a group or a class belongs to the pattern),
  and an alternative that will not compile is read as plain text — a typo must never hide every
  row. Every open column has to match, which is the AND. It is applied where each table reads
  its rows (`recordRows`, `sentenceList`, `karunaVisible`), so no table can be left out — and
  **Karuna's `Meditation · All meditations` selector is gone**, because it was a second way to
  narrow the same stack whose only press offered `Cancel` (the owner: *"it needs to be removed
  if it is not usable"*). A heading goes when nothing under it matches.
- **`Edit table`, and a column that leaves the view** (the same round: *"Columns
  should be able to be removed (Add an edit table button which should enable x button
  next to every column heading which removes the column where-ever not required by
  the user)"*). One press on the toolbar puts an `×` on every heading; the press takes
  the column out of the **view** and not the store, so it is safe on a builtin like
  `Location` as well as on a column the reader added — the column still holds its
  values and a plan's Display can still name it. It is remembered per table in
  `sessionStorage` (`DATABASE_COLUMNS_KEY`, the shape `DATABASE_TABLE_KEY` already
  had), and `Show N hidden columns` is the way back. It is deliberately **not** a
  `DraftState` field: that would make the screen dirty for a change `Save` has
  nothing to write, and leaving would silently lose it.
- **A switch whose heading already said the word** (the same round, on the binaural
  column): `LatchButton`'s `labelHidden`, §1.5.

Two sizing notes worth keeping:

- **Widths are hints, never `width: 100%`.** In an auto-layout table a column with
  `w-full` resolves against the table's own width and the table grew to
  **500000px**. A wide column asks for its own minimum instead (`BUILTIN_WIDTH`), and the one
  that is a sentence — an entry's or a meditation's `Intentions`, Karuna's own `Intentions` —
  asks for `min-w-[28rem]` through `INTENTIONS_WIDTH`, one constant for both tables. Left to
  "take what is left", that column was given its minimum content width, which is *three letters
  of an intention* and the owner's round-22 report.
- **`min-w-[40rem]`, not `min-w-max`.** A max-content floor kept the grid wider
  than a 1024-wide laptop, so it scrolled sideways with room to spare. The
  sideways scroll is still there on a phone, where it is the point.
- **A row's controls are the row's own** (owner's round 20: *"the 1st column is the open
  button, drag handle and remove row. This needs to go … ideally, drag and remove row
  should be innate to the row itself, open actually opens the table's key menu."*). There
  is no leading controls column: the grip, the `＋` insert and the `×` sit in the row's
  **last** cell, revealed by the pointer or the keyboard, and the row's own press opens
  the record — mouse anywhere on its surface, or Enter/Space with the row focused, so the
  worded `Open` button is gone. That cell **stays at the row's right edge** while the
  columns scroll under it, because the first cut left it in the flow and a table wider
  than its room scrolled drag and remove out of reach. The armed box (`Archive` /
  `Remove` plus what the delete would take) is a full-width band **under** its row, where
  the sentence has room to be read.
- **Two pins, and they are the two edges.** The first data column — a record's `Name`, a
  sentence's words, Karuna's `Symbol` — stays at the **left** edge while the columns beside it
  scroll under it (`LEAD_CELL`, `LEAD_HEAD`), and the row's own controls stay at the **right**
  (`TAIL_CELL`). The owner asked for the second in round 20 and, when round 20's "nothing
  pinned" turned out to have taken the first with it, answered *"Pin Name so it stays visible"*
  ([DECISIONS.md](./DECISIONS.md) §15). Neither costs width: both are cells the table already
  had. What they buy is a reader scrolling a wide table sideways who can still see which row
  they are on and still reach its grip.

### 3.2d Adds happen in the grid (2026-09-18, owner's round 14)

The owner's second review of the tab: *"the new column or new row still opens a
form like structure, it is absolutely iky. I need adds to be there itself, like
adding a column should literally add a column, header should look like a textbox
and the cells below should also look like text boxes that I can fill. No need for
a new menu at the bottom of the page."* And, of the library: *"I wanted that
button to take the user to the database where they'd be able to just update stuff
in the cell itself."*

- **A column is added where it will live.** `＋` (on a heading, or trailing)
  inserts the column *now*, with an empty heading and cells under it. The heading
  is a text box that takes the keyboard on arrival; the column's type, what a
  reference points at, and what it is for sit behind a small chip on that same
  heading line. Nothing is collected before the column exists, and nothing appears
  at the foot of the page.
- **An unnamed column is not stored**, the same rule as a row with nothing to
  point at. A column's `key` is derived from the first heading written and never
  moves again, so a later rename cannot strand a plan's pinned column.
- **A row is added where it lives.** A type tab's `Add` and `Add symbol` land in the
  Database's grid with the caret in the row's name — there is no new-record page for a row.
  A record's `Edit` is not one of these doors any more (round 22): it opens the record
  itself, which reads first and edits in place. Only a **preset**'s empty editor is still
  the Database's, because a preset with no row yet has no id for an address to name.
- **A chakra's own settings are columns**, which is the owner's answer to where
  they live now that the page is gone: `Picture`, `Default sound` (a preset chip,
  with `Tune` beside it — the control sits with the sound it tunes) and `Binaural`
  (the app's switch and nothing else, the owner's round 16: *"binaural column …
  doesn't need this much text, just the toggle button should be good enough"*).
  Symbols gained `Picture` too. A record view still exists behind a row's `Open` for
  whatever a table has no column for.
- **A table's leading name is pinned, and its header cell paints.** The name stays
  put while the columns beside it scroll, which needs two things: the pinned pair's
  width as **both** clamps (`w-32 min-w-32`, since a lone `w-*` is only a maximum and
  these tables lay out at their minimums), and a **fill** on the pinned header cell —
  a transparent sticky cell at `z-20` lets the columns travelling under it draw
  through it, which is how a text box came to be painted over `Tune` (round 16, item
  6). `BODY_LEAD` had `bg-inherit`; `HEAD_LEAD` did not.
- **`Tune` writes the draft first.** It is the one door out of the Database that is
  not leaving, so the grid's draft is saved on the way through rather than
  discarded — the rule `saveDraftThen` keeps everywhere else.
- **A floating panel is one at a time, and looking away puts it down.** Opening a
  second chip or column menu closes the first; a press anywhere else closes it and
  blurs the cell with the caret, because a grid that keeps a caret in a cell the
  reader has moved on from shows two live places at once; and `Escape` is handled
  by the panel in the capture phase, so the same press can never also mean "leave
  the Database" (§12.25). The owner reported all three.

### 3.3 Wireframes

```
LIBRARY — list:
┌──────────────────────────────────────────────────────────┐
│ ◂ back   Library                                     [+ Add]│ toolbar (Add = secondary, top-right)
│ [Chakras][Points][Protection][Thanks Giving][Symbols][Archive][Audio]… │ tab strip
├──────────────────────────────────────────────────────────┤
│ Chakras            [Table ⚪] [☰ columns]               │ per-table toolbar (compact actions)
│ ┌──────────────────────────────────────────────────────┐ │
│ │ row / card …                                        │ │
│ │ row / card …                               [🗑]     │ │ destructive bottom-of-row
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Cross-page consistency — one shared shell

Every screen follows the same structure: a top bar (title, and the tab strip where
applicable) → scrollable content → a bar at the foot holding the `Esc back` legend beside
the screen's one primary action. The bar is drawn on **every** screen the shell builds,
including one whose only control is the way back, and the legend is never beside the title.

**There is one way back, and it is the `Esc back` legend** (owner's round 20: *"There is
no need for a separate back button, just have the Esc Back directive double as a back
button, if people want to go back, they can use that button"*). `KeyHints` takes an
optional `onPress`, and a screen that has a legend draws it as a real control instead of
a `Back` button beside it — so the reader can press what the screen told them to press,
with or without a keyboard. `EditorChrome`, `PickerPage`, the dead-end screens, the run
screen's `Esc end the session` and the Database's own bar all follow it, and
`integrity.test.ts` reads all five shells — for the press **and** for the place — so a
second button, or a legend that drifts back up beside the title, cannot come back.

Formalize this as a shared layout shell — extending or replacing the current
`EditorChrome` (`apps/web/src/features/library/EditorChrome.tsx`, which today draws the
title, the content, the error line and the foot bar) — adding a **bottom action-bar
slot**. `AppNav` stays for the `(app)` route group; the run screen keeps its
minimal chrome but obeys the same placement rules.

This is how button placement is kept from quietly drifting screen to screen as
new pages get added.

```
LIBRARY — editor (shared shell):
┌──────────────────────────────────────┐
│                       Edit meditation│ top bar
├──────────────────────────────────────┤
│ form fields (scrolls)                │
├──────────────────────────────────────┤
│ [🗑 Delete] (bottom of its section)   │
│            Esc back      [Save] (lg)│ sticky bottom bar
└──────────────────────────────────────┘
```

### 4.1 The one screen that is not the reader's — the admin panel

`/admin` (`P0 · 23`, slice 23f) is the owner's own tool, and the only screen in this app
written for somebody who is not the reader. It keeps §4's shape — a title, scrollable
content, and each action beside the thing it acts on — and departs in three places on
purpose, all of them recorded in `DECISIONS.md` §11:

- **It is not a nav destination.** The door is a link on `/account`, drawn only for the
  account that runs the beta, because `AppNav` is the reader's five destinations. Typing
  the address works for an admin and gets one sentence for everybody else — here, and
  again from the function that holds the service role, which is what makes this screen's
  gate an affordance rather than the boundary.
- **One account at a time, opened in place.** A row is a name, a line of facts — reader or
  admin, when it was made, when it last signed in — and one `Open`. Opening it draws the
  eight flags as `sm` switches with the flag's name over its one-line summary, which is the
  only place a flag is explained to a human, and it is why `FEATURE_FLAG_INFO` exists.
- **The unrecoverable press is armed.** `Set a new password` is the one action there that a
  reader cannot undo, so it is a two-press control with its own field, like every other
  destructive control in the app. `Create account` says in a line that the address is
  confirmed on the spot, because this deployment sends no mail.

The flag list is drawn from the domain's union (`FEATURE_FLAGS`, labelled by
`FEATURE_FLAG_INFO`), so a flag added to the vocabulary appears here with no edit to the
screen — the same reason §4 wants one shell, one level down.

### 4.2 A gate takes a surface out whole, and never half of one

`P0 · 35` gated every surface the account's flags name. The rule that came out of the seven
slices is a design rule rather than an implementation detail: **a flag removes the surface
whole.** A control that cannot act is not drawn, and a thing a reader cannot reach is not
named. Looking down the app:

| Where | With the flag off |
| --- | --- |
| The library's tab strip | The Presets tab goes, and so does a hidden type's tab — a remembered `type:<id>` falls back to the strip's first tab. The **Archive** keeps drawing a hidden row on purpose: that is where hidden data is *managed* rather than where it is offered |
| The Database's rail | `Karuna`, `Affirmations` and `Presets` go; a plain `/database` lands on a table the rail still draws, and a remembered one is re-landed rather than shown |
| The Database's grid | The two binaural columns leave the **column list**, so `Edit table` cannot add them back either, and a stored key that is no longer offered is simply not drawn |
| The plan editor | The `Binaural` field, the `Auto-scroll` switch and the `♪` mark go; a hint that named the Karuna table stops naming it. Everything the plan already holds still shows, because a stored row is a fact rather than an offer |
| The run screen | The `♪` mark and the footer's `Scroll` latch go — the latch is already drawn only for a stage that scrolls, and a second gate on top of that must not leave it dead — and with `binaural` off the session compiles **silent** rather than muting a switch after the fact. A plan whose block names a symbol outside the account **refuses to start**, with a sentence that names it, says which field to change so the session runs now, and says who to ask to change the account instead |
| `/tuner` | One sentence and no controls at all: the screen exists for the tones, and its address is the only way in |
| `/login` and `/signup` | One sentence saying who to ask instead — which is what the privacy notice's stale sign-up link lands on, and why the sentence says what to do rather than only that the door is shut |
| `/account` | The sign-in link, `Create an account` and `Sign out` go. The **status line stays**, because it is a fact about the device rather than an offer, and so do both erasures — `Erase this device's data` and `Close this account`. Erasure is a right, not a surface (`DECISIONS.md` §11) |

The `sentence instead of a form` pattern is the one that carries the weight here: a gated
route is reachable by address even when no link points at it, so each of these screens
answers in the reader's own voice rather than rendering empty.

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

## 7. The order the redesign was built in

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

- ~~Run-screen table columns: settle the exact merged-cell contents (name now /
  image later) once the symbol picture lands.~~ **Answered:** the symbol's picture
  sits beside its name in the merged cell (`aab43f7`).
- Should the library content pane also swipe between tabs on mobile, or is the
  tab-strip swipe enough?
- ~~Confirm whether `next/font/google`'s build-time fetch is acceptable, or
  whether fonts should be self-hosted.~~ **Answered:** accepted. Fonts load
  through `next/font/google`, so no npm package is added and the dependency
  allowlist is untouched. If that build-time fetch ever has to go, self-host the
  same WOFF2 families instead of adding a font package.
- ~~The column picker as a toolbar action: settle whether it becomes a collapsed
  popover (and update the e2e that clicks a visible column toggle), or stays
  inline and the doc's §3.2 item 3 is dropped.~~ **Answered:** it stayed in the
  toolbar as a disclosure, and shows itself selected while open (`9c30207`).
