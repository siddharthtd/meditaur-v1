# Meditaur — the owner's review log

**Status:** living. Newest round at the bottom. Last entry: 2026-09-21.

## What this is

A record of what the owner asked for while reviewing the app, what was decided,
and where it landed. [ROADMAP.md](./ROADMAP.md) says what is *next*;
[HISTORY.md](./HISTORY.md) holds the rounds that have landed. This is the third
thing: the owner's own words, kept so a request cannot be quietly dropped,
half-done, or re-litigated later.

Each round below is the record of its own date and names the documents as they were
then; a plan it points at may since have been retired, which
[HISTORY.md](./HISTORY.md) accounts for.

It exists because the review is iterative and verbal — "make the + and − smaller",
"remove Mandatory completely" — and a commit message alone buries the ask under
the change. A request that is *answered* rather than implemented (a question, or
"keep it for now") matters just as much: two of the layout decisions below exist
because of an answer, not a request.

## How to add a round

1. Append a `## <date> — <what was reviewed> (commit …)` section when a review
   round happens. Do not rewrite earlier rounds; add a new one.
2. One table row per request: **the ask**, then **what was done about it**.
3. **Quote the ask.** Trim it, mark cuts with `[…]`, keep the owner's wording —
   "Mandatory" is spelled that way in the ask below, and the summary line in
   ROADMAP is where it gets spelled properly.
4. Record **questions and answers** too. When a request was really "is this a
   design choice?", the answer *is* the outcome.
5. Anything not done goes in [Still open](#still-open-from-the-reviews) at the
   foot, with where it should be done. Never leave a request unrecorded because
   it was declined — say so, and say why.
6. Confirm the claim. Every "done" row names the commit, and the behaviour it
   describes is covered by a test or is visible in the built app — this repo has
   a bad history with docs describing code that is not there.

| Status | Means |
| --- | --- |
| **Done** | Landed, commit named. |
| **Info only** | The owner said it is context, not a change. Kept in view so a later round does not re-open it by accident. |
| **Queued** | Accepted as real work, in the app's own backlog rather than the owner's head. Listed under [Still open](#still-open-from-the-reviews) with what it is waiting on. |
| **Deferred** | Agreed as real, deliberately not now, with where it goes. |
| **Declined** | Considered and not done, with the reason — including "the owner said this is fine". |

---

## 2026-09-16 — the plan screen, first pass (commit `1528556`)

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "the + and - buttons are too big for the cards, they should be smaller, elegant" | **Done.** `Stepper` gained a compact size (`sm`: 44px buttons, 40px value column) and the block card uses it. Found on the way: the value's `min-w-20` was never generated at all, because Tailwind builds this stylesheet from `apps/web` and its scan cannot see `packages/ui` — so the number jittered as its digits changed. Now pinned in `apps/web/src/lib/ui-package-classes.ts` with the rest. |
| 2 | "cards are able to be dragged upwards and downwards, they go behind the buttons on top, it should only be a left-right movement, if there are a lot of cards, they should be scrollable only horizontally, not vertically" | **Done.** The y half of the sortable transform is dropped, the strip hides vertical overflow (`overflow-y-hidden`), and the dragged card gets a z-index while it moves. The drag handle also takes `touch-none`, which is what dnd-kit needs to start a drag on touch rather than scroll the page. |
| 3 | "the text alignment on the binaural/table/ambient/alarm/focus/symbol elements inside the card is completely messed up, it should be fixed elegantly in the middle of the button" | **Done.** Each field is one centred button: the field name in small caps over its value. The whole `Focus: Heart Chakra` line stays the *accessible* name, so a screen reader and the e2e selectors still know which field is which. |
| 4 | "There is no need for a toggle for the 'stop binaural when alarm rings' on this screen, it should be a global setting (I want you to keep it like this for now, but later on if I say you will have to update it. This is for information only)" | **Info only, until round 5.** The switch stayed on the planner then; the owner has since said the word ("it is there in the settings, that is enough"), so the planner's copy is gone and the preference is what compile reads — see the round at the foot of this file. |
| 5 | "Points can also have symbols and so can the custom […] When the custom focus-point is displayed, it should not be displayed as custom, it should be displayed as the name of the focus point" | **Done — no change needed, verified.** Nothing in the code blocks symbols on a Point or Custom focus point (the card's `Symbol` picker lists whatever is bound, whatever the kind), and the planner never renders a kind word as an *item* label. Asked to be sure; the answer was "Nothing is blocked — no code change needed". The follow-up answer set the rule: "The heading can say custom, but the items under that heading must have a name." |

Round notes: `docs/USER_GUIDE.md` §7.4 and `docs/BETA_GUIDE.md` Task 1 follow the
card change, and `tests/e2e/plans.spec.ts` gained three tests — the plan tools
share one line, every card field keeps its accessible name, and a card dragged
straight up does not leave its row.

---

## 2026-09-16 — the plan screen, second pass (commits `1528556`, `b613bc4`)

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "Stop and Load buttons on the plan screen are of different sizes? Is that a design choice or an oversight? […] they can be different from the other buttons, but it just looks odd when 2 buttons side by side are of different shapes and sizes" | **Done.** It was the documented rule (`lg` was reserved for the one action that owns a screen, and the pair is really `Save` + `Load` — there is no `Stop` there). The owner overruled it for a pair: both are `lg` now, and the fill still says which is primary. `docs/UI_DESIGN.md` §1.4 carries the new rule. |
| 2 | "The chakras and points that are listed below the headings have large long buttons and only 2 can be placed horizontally on the screen at a time, instead, it would be better if we could just make them small buttons of the size of the text inside. Same for points and any custom ones that are added later" | **Done.** The two-column grid of full-width buttons is a wrapping row of small buttons, each only as wide as its name. Seven chakras take two lines instead of four. |
| 3 | "Delete plan should be in the same row as the Switch plan/ New plan/duplicate plan buttons" | **Done.** It sits in the plan toolbar row and still arms before it fires. `UI_DESIGN.md` records it as the one exception to "destructive actions live at the bottom of what they remove". |

---

## 2026-09-16 — the library (commit `b613bc4`)

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "Insteaf of buttons for cards/table, there should be a table toggle which adds filter for columns. Clicking columns doesn't show it selectd, that needs to be updated. Choose a different place or layout to place these card/table toggle." | **Done.** One `Table` switch (`LatchButton size="sm"`, a new compact variant) replaces the two buttons, turning it on is what brings the `Columns` filter with it, and `Columns` now shows itself selected while its panel is open (`aria-expanded` plus the primary tier). Placement came from the owner's answer — see the round note. |
| 2 | "I must say the focus point/sumbol tabs I am loving, keep them as is! (good job on that, no action required)" | **Info only.** The tab strip is untouched. |
| 3 | "Remove the 'Mandetory' completely from the codebase, nothing is mandetory, if it is not being used or consumed anywhere else, there is no need for it" | **Done.** `Symbol.isMandatory` was a picker label that never bound a symbol to anything. Removed from the domain type, the seed, the symbol editor and its `Mandatory` column, the picker's mandatory-first sort and hint, catalog backup, the fixtures, and both stores. Dexie **v9** is a data-only migration that drops it from stored rows, so a catalog export stops carrying a dead field; SQL migration `20260916130000_drop_symbol_mandatory.sql` drops `symbols.is_mandatory`. The integrity test fails if anything but those two migrations ever names it again. |
| 4 | "In the cards view, there should be a delete and edit button on the card itself so that it is easier to operate. Clicking the card does nothing." | **Done.** A card is a container now, not one big button, with `Edit` and `Delete` (plus `Open` on a focus point, for its symbol sheet). Every button is named after its row (`Edit Heart Chakra`), so three identical "Delete" buttons are not ambiguous to a screen reader. `Delete` is the same two-press arming as the editors' — one `armedCardId` in `Library.tsx`, so arming a card in one section cannot leave another section armed. Applied to focus points, symbols, intentions, fields, presets, views and audio files; the table view keeps its first-cell open. Shared card: `apps/web/src/features/library/CatalogCard.tsx`. *Superseded in the split round (`7219e35`): the owner asked for the `Open` button to go — pressing the card **is** opening it, and the whole table row opens it too.* |
| 5 | "Esc for going back doesn't work everywhere, it didn't work when I was inside the symbol edit screen (esc for going back is universal, it should be applied everywhere)." | **Done.** Escape now lives in `EditorChrome` and `PickerPage` rather than in each editor, so a new screen cannot forget it, and it does exactly what `Back` does — including leaving an unsaved draft behind. The run screen keeps its own Escape, which stops the run. |

Round notes — the placement question, which took two answers:

> "Since all the tabs have cards/table view, this setting should be applicable for
> all tabs at the same time. Keep it above the tabs so that it is apparent that
> this setting affects all tabs"

Only three of the nine tabs actually have a table view (`Focus points`, `Symbols`,
`Intentions`), so this was put back to the owner, and the answer changed the plan:

> "If that is the case, then move it below the tabs, and make it visible only on
> the tabs that support the table view. But it should not co-mingle with the
> Download Catalog/Restore catalog buttons, move them to the bottom as it makes
> more sense for the table/card view to stay at the top next to the title of the
> focus point, below the tab selector"

Also settled in this round: the library focus-point card keeps showing its kind
(`custom · Aura`) as a subtitle. It was flagged as the one place a custom focus
point is described by its kind rather than its name; the owner said it is fine.

---

## 2026-09-16 — the plan screen and the library, again (commit `dd90a52`)

The round that needed splitting in two. The plan-screen asks were small; the
library asks included a data-model change (cascading deletes) and an open/edit
rework, so those are **Queued** with the rest, not half-built.

**Plan screen**

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "the remove button should be next to the card's title, not at the bottom, that is causing it to be at different heights depending on how many elements the card has. We are going to in the future add another card and slowly eliminate the cool-off card. It is imperative that all cards have the same layout on the plan screen." | **Done.** Title and `Remove` share the card's top line, the fields stack under it, and every card stretches to the tallest in the row, so all 17 seeded cards share one top and one height. |
| 2 | "move switch/new plan/duplicate plan/delete plan button row above the plan name. The only buttons I should see under plan name are add focus and add cool-off" | **Done.** And the page title went with it — the nav already says `Plan`. |
| 3 | "All the buttons should have a press/unpress sort of state, right now it feels like clicking the button doesn't do anything (even though it does, the button doesn't feel interactive at all)" | **Done.** `Button`, `LatchButton`, `Stepper` and `TileGrid` all shrink and dim while held, and the planner's own card buttons carry the same treatment. |
| 4 | "There should be a start session button at the bottom with the save/load buttons, that lets you start executing the plan" | **Done by renaming.** The bottom pair is `Save` + `Start session`; the button that was called `Load` always did exactly this, and IMPLEMENTATION.md's "one start button per screen" rule still holds. |
| 5 | "The Chakra heading and the chakra buttons below take me to a screen. On this screen, there are intentions, Cycle 1 and 2:00 which doesn't change ever. I think this is of no use, let us completely remove these views from the plan page, Rather, when the chakra button is clicked, you take them directly to the library's chakra open view." | **Declined — kept as it is, after the ask was explained.** The screen is the one-point run a focus tile starts; the ask was to retire it and re-point the tiles at the library. Asked to decide between four shapes of the row, the owner chose "leave it as it is (one-tap session)", so the tiles, `startSessionFromFocus` and the reserved Focus session plan all stay. Worth recording for the next round: the `2:00` is not frozen, it is that focus point's stored default duration — `Library → Focus points → Edit → Default duration` changes it — and the run screen's back control already returns to the planner. |

**Library**

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "The tab already shows which is selected, remove the redundant heading which again displays the same thing below. Same for plan/settings/library tabs. Remove those redundant headings and only keep the tab buttons" | **Done.** `/library` and `/settings` lost their titles, the section lost its heading, and `/plan` lost its title in the same pass. The run screen keeps its eyebrow. The integrity test now fails if any of the three comes back. |
| 2 | "Where there is library heading today, move the download catalog/restore catalog buttons there (since they process and download the entire library, we don't need the confusion that they serve each tab seperately)" | **Done.** Top row, where the `Library` heading was. This reverses the previous round's "move them to the bottom" — the owner saw that placement and asked for this one. |
| 3 | "Move the 'Add X' button in the place of the heading of X (add symbol will go where the symbol heading is right now, in the same line as the table toggle, and same for every other tab inside library)" | **Done.** Each section's `Add …` sits at the left of the row that holds the `Table` switch and `Columns`. |
| 4 | "The delete button asks for confirmation. If no confimation is provided, it should go back to its original thing after 5 seconds. Also add a light red colour filled when clicked once, and a dark red colour before deleting after confirming. Do this for the remove buttons as well, everywhere on all the pages. If for some reason, remove cannot be executed, some sort of message should be presented to the user, instead of just a no-op" | **Done.** `apps/web/src/lib/armed.ts` disarms after five seconds; armed fills light red and the confirming press fills dark; every remove in the app goes through it (the planner's block Remove and the sheet's symbol Remove had no arm step at all before). Failures already surface as the error line — `persistThen` sets it. The one exception kept: `Remove tone` inside the binaural draft, where the draft's own `Revert` is the undo. *The refusal messages this row says are queued landed as the impact sentence in `ee4dc76`; there are only three refusals left, and none of them is about a thing being in use.* |
| 5 | "Deleting a symbol/chakra/intention should not throw an error that it is being used, rather, remove it from the used things, remove all entries this way, there should be no need to manually remove something from 12 different places for removing it. […] if it is removed from the library, it is removed from all the plans" | **Done in round 5** — see below. It needed the owner's answer to the data-loss question first, so it was built in its own round rather than half-built here. |
| 6 | "remove the 'open' button from the card view, default action when the card is clicked should be open action (edit button inside the open action)" | **Done in the split round** (`7219e35`) — see below. |
| 7 | "In the table view, clicking on the name text opens the edit view first, back fromt here opens the 'open view' next and a back from there brings back to the table view. Firstly, the whole row should be clickable (not just the text), after clicking on the row anywhere, should be taken to the open view" | **Done in the split round** (`7219e35`). |
| 8 | "In the open view in library for any chakra/symbol etc, there should be no editable or selectable options, only displaying current statuses and values of configured fields. Whatever you remove from here should be added to the edit mode for that particular chakra […]. Also, in edit mode, the symbol order is important, instead of the up/down/remove buttons, only retain the remove button, the up down button should rather be draggable. Same for Intentions. Along with that the add new button should be in line with the heading" | **Done in the split round** (`7219e35`): the sheets are display only, `FocusManage` holds the controls, and symbols and intentions drag. |
| 8 (second) | "The page where add new symbols (attach symbols), the text overflows and looks shabby." | **Done in the picker round** (`bdaff8e`) — the `Button` base's `whitespace-nowrap` was the cause. |
| 9 | "New intention page is still shabby and uses the old formatting, it should also be updated with the new type of buttons and alignment we have decided for everywhere else. The pick symbol/pick focus point screens also have text overflowing. Rather, I'd have a text bar there which allows you to choose from the available options and filters automatically. If invalid input is entered, don't save the selection, rather send an error message." | **Done in the picker round** (`bdaff8e`): `PickerPage` is a text bar with a refusing `Choose`, and the intention editor uses the app's field rows. |

Round note: two questions were put back to the owner at the end of this round rather
than guessed, because either answer changes what gets built. Both came back:
the focus-tile row is **kept as it is** (see plan item 5), and deleting a focus
point **removes the plan blocks that use it, after a confirmation that names the
damage** — which was built as `ee4dc76`, and library item 5 above carries the
detail.

---

## 2026-09-16 — the cascade, built (commit `ee4dc76`)

Not a new review round: this is round 4's library item 5, the one that was
**Queued** because it reverses a written-down rule and decides what happens to
data. The owner answered the blocking question in the same round —

> "if it is removed from the library, it is removed from all the plans"

— so the answer was built. Nothing here was asked for twice.

**What a delete does now.** Every catalogue delete runs inside one transaction
and removes or clears what pointed at it. A focus point takes its plan blocks
with it; a symbol is unbound, loses the intentions that named it, and its blocks
are *cleared* so they fall back to `Rotate next`; a field takes its values and
its column key; a preset, a view and an audio file leave the blocks that used
them in place with the reference blank.

**But never silently.** Cascading without saying so is data loss behind a
button, so the first press now answers "what else?" before the second one fires.
While a control is armed the damage is printed under it:
`This also removes 2 blocks from 1 plan, 1 intention and 3 symbol attachments.`
for things that stop existing, `1 place that pointed at it is cleared.` for
things that stay but lose their target. Nothing is printed when nothing else is
affected.

**Three refusals stay**, because a workspace must always keep one:
`Keep at least one plan`, `Keep at least one preset`, `Keep at least one table
view`. Everything else the guides used to describe as a refusal
(`Remove this focus point's symbols first`, `This symbol is used in a plan`, …)
is gone from the product.

**Moved with it:** the delete guards in `catalog-writes.ts`/`media-writes.ts`,
`packages/application/src/deletion-impact.ts` (new), `patchPlanBlocks`, a new
migration (`20260916140000_cascade_catalog_deletes.sql`) turning three
`on delete restrict` foreign keys into cascade/set-null, the application tests,
and the guides — `USER_GUIDE.md` §9.1, §9.2, §9.4–§9.7 and §9.11 rule 2,
`IMPLEMENTATION.md`, `BETA_GUIDE.md`'s rough-edge list, `ROADMAP.md`.

---

## 2026-09-16 — round 4's queue cleared (commits `7219e35`, `bdaff8e`)

Nothing new was asked for here: these are round 4's **Queued** items, built in
order, which is what the owner meant by "either is fine as long as all the
highlighted work gets done".

**Open is read, edit is change** — `7219e35` (items 6, 7, 8).

| The ask | What landed |
| --- | --- |
| remove the `Open` button; pressing the card opens it | The card *is* the open target — a full-card labelled button under the action row, so `Edit` and `Delete` still win their own area. The table's whole row opens it too (the name cell keeps a real button for the keyboard). |
| the open view shows, and nothing in it can be changed | `FocusSheet` is display only and the new `SymbolSheet` is its shape for symbols: no inputs, no switches, no remove. The integrity test fails if one comes back. |
| whatever you remove from here goes into edit mode | `FocusManage` — attach/unbind symbols, add/edit/delete intentions, custom fields with `Save fields`, `Open binaural config` — all in the editor, one `Edit` away. |
| symbols and intentions reorder by dragging; only keep remove | `@dnd-kit/sortable` with the x axis locked, pointer *and* keyboard sensors, the whole list's `sortOrder` written on a drop. `Up`/`Down` are gone. |
| the add button in line with the heading | Section headings carry their `Add …` on the same line, in the editor's sections too. |

**The picker and the intention editor** — `bdaff8e` (items 8b, 9).

`PickerPage` became a text bar: typing filters (labels and hints), `Choose` or
Enter commits an exact name or the single remaining option, and an unmatched name
chooses nothing and says `Nothing matches “…”` — the owner's "if invalid input is
entered, don't save the selection, rather send an error message". Every picker in
the app is that component, so the planner's picks gained it as well. The
overflow was the `Button` base's `whitespace-nowrap` meeting a two-line hint; the
label and hint are now one line each, truncated, with a minimum row height. The
intention editor's association is a section with one field row per association
(small-caps field name over the value, `Choose` when empty) instead of buttons
labelled `Pick focus point`, which never said what the line currently held.

One decision recorded rather than guessed: **intentions have no read-only view.**
A card or row opens the intention's editor directly, because the entry is one
line of text and there is nothing to display that the editor does not already
show. If that reads wrong when the next pass happens, the fix is a sheet like the
other two.

---

## 2026-09-16 — the documentation squared off (commit `25e7f79`)

Not a review round: the owner's instruction,

> "It is time to update all the documentation, remove any redundant documents,
> update the ones with new items accomplished and get everything squared off"

read as: make the written record match the app again, and stop it drifting. So
this pass is mostly *subtraction and correction* rather than new prose.

**The documents that are left** (nine, each with one job): `USER_GUIDE.md` (the
reader's manual), `BETA_GUIDE.md` (tester onboarding), `ARCHITECTURE.md` (system
shape + the P2.6 design contract), `ARCHITECTURE_REVIEW.md` (the findings record
and ordering rationale), `IMPLEMENTATION.md` (the coding contract), `UI_DESIGN.md`
(the design rules and rationale), `ROADMAP.md` (done vs next — the *only* place
status lives), `DEPENDENCIES.md` (the allowlist), `REVIEW_LOG.md` (this), plus
`README.md` and `AGENTS.md` at the root.

**Retired:** `meditaur-requirements-v2.md`. Its own §2 said "this is not the
current state", everything in it had landed, and its live rules were restated
elsewhere first — the binaural toggles and the field pools into
`IMPLEMENTATION.md`, the image-frame rule into `UI_DESIGN.md` §1.6. The roadmap
says where it went, so the deletion is not silent.

**Corrected — every one of these was a claim the app no longer matched:**

| Was written | Is now |
| --- | --- |
| `Remove` on a planner block happens with no confirmation | It arms like every other delete (`Remove?`). The only un-armed remove left is `Remove tone` on an unsaved draft |
| `Download catalog` sits at the foot of the library page | Top row, where the `Library` heading was |
| The library has **nine tiles** to press | A tab strip, and the same words in both guides |
| Focus-point cards also carry `Open` | There is no `Open`; pressing the card is opening it |
| Phase 4 has "two leftovers open" | The whole phase landed, and so did the unblocked backlog |
| `BlockSheet` renders the run screen | `Runner.tsx` renders it; `BlockSheet` has not existed for a while |
| dnd-kit is "(Planner only)" | The library editors use it too |
| The review's §5 `unions` row is unconstrained | Fixed (`9ba598d`) — the review said so in §4 and not in §5 |
| M9 "closed", M4 "left", Phase 4 "left" — inside the review's own file | Reconciled; the review no longer carries any status, it points at the roadmap |

**And three real defects fell out of checking the documents against the code** —
fixed in the same commit, each with a test: a delete could display the *previous*
row's damage sentence, an unsaved focus-point draft was lost on the way to an
intention, and the Escape guard on a drag handle was silently overwritten by
dnd-kit's own `onKeyDown`, so cancelling a keyboard drag also left the editor.

The integrity test now also fails if any `*.md` link anywhere in the docs points
at a file that is not there — retiring a document is the one edit that silently
breaks its referrers, and that is exactly what happened to the roadmap's link.

---

## 2026-09-16 — the plan card, the clock, and the tuner (commit `7d8b1cb`)

The owner's fifth pass, in their words. Six asks; five of them are layout, one is a
data decision.

**Plan screen**

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "There is no need for the text 'Drag' in all the cards, if we remove it, the width of the cards can be fixed, should be much better." | **Done.** The handle says `Focus`/`Cool-off`, the drag instruction moved into its `aria-label` (`Drag focus block`), and the card is a fixed `w-52` — 234px at the app's 18px root font, down from 288px, uniform, and verified not to clip either label. |
| 2 | "In the chakras tiles, after clicking on the tile, the cycle 1 and 2:00 text is still present […] Either let me edit the time on that screen so that the quick-meditate can be accomplished properly" | **Done.** Before the first `Start`, the clock *is* the block's length, so it is the length control: `Length of this block` with the wheels, and the session plays what you set. It stays editable while paused or running (the remaining time moves by the same difference), and `saveSessionBlockDuration` writes it so a reload keeps it. `cycle 1` is gone from single-cycle sessions — it now reads `cycle 2 of 3` only when a plan really repeats. |
| 3 | "I want the time-setting appearance like in android alarm clocks. The minutes/seconds slides vertically upwards to increase, downwards to decrease, also you can click on it to edit it like a textbox. Use the same form in the cards on the plan screen" | **Done.** `TimeWheel`/`TimeWheels` replaced every duration stepper — plan cards, a focus point's `Default duration`, the run screen. Drag up/down, press to type, arrow keys as well. `Stepper` stays for Hz, gain, dB and milliseconds. |
| 4 | "All the places where Esc is going to enable going back, state it on the page like you do inside the one-time chakra meditation view […] can you do a better job at representing this information? what is the arrow button supposed to be? right arrow didn't do anything" | **Done.** `KeyHints` draws keys as keys and lists only what works there. The run screen now says `Space start`, `→ skip to the next block` (only while skipping does something — before `Start` it *was* a silent no-op, which is what the owner hit) and `Esc end the session`; `EditorChrome` and `PickerPage` say `Esc back`. |
| 5 | "You can actually remove the Stop binaural when alarm rings knob from the plan page, it is there in the settings, that is enough" | **Done, and the setting now means something.** Removing the knob alone would have left the plan's copy driving the run, so the preference became the single source: `Plan.stopBinauralOnAlarm` is gone from the model, both stores and the backup, `compilePlan` takes the resolved flag, and compile reads it from `ports.preferences.get(userId)`. The existing plans in a stored workspace have the dead field dropped by a data-only Dexie version and an SQL migration. |

**Library**

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "after clicking on the edit button at the preset, it opens the name, duplicate preset and open tuner. Can you move Duplicate preset at the earlier screen next to edit […] there is no need to have a button for open tuner, just have the tuner right below the name (what is the need for L1/R1 tones heading?). The buttons inside tuner are also shaby, can you bring them up to the spec? Another issue was that there is no back button from this page" | **Done.** `Duplicate` is on the card next to `Edit`; the preset editor renders the tuner's controls under the name through one shared `BinauralBody`; the `L1/R1 tones` line is gone; the tuner's raw buttons became `Button` primitives; and `Back`/Escape return to the list, because the screen is inside the library rather than a route of its own. `/tuner` still exists and renders the same body. |

**A real defect fell out of that last one.** The config screen and the tuner each
had their own copy of the binaural controls, and they had drifted: the config
screen passed an EQ band's *index* where `setBandGain(eq, hz, gainDb)` wants the
frequency, so moving one slider could move a different band. One body fixes it by
construction, and `IMPLEMENTATION.md` now says not to copy it a fourth time.

---

## 2026-09-16 — the plan tools, the editors, and custom fields (commit `5d4b4cc`)

The owner's sixth pass. One plan-screen ask and six library ones.

**Plan screen**

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "switch plan/new plan/Duplicate plan all should have a different button layout than the point/chakras tile so that they can be differentiated better. (also make the 'Point' tile as 'Points')" | **Done.** The four plan tools (`Switch plan`, `New plan`, `Duplicate plan`, `Delete plan`) now sit in one bordered strip of compact `sm` buttons — chrome for the plan below it — instead of the loose accent-filled wrap the focus tiles use, and the group heading reads `Points`. `Delete plan` stays on that line, which is where the owner asked for it in round 1. |

**Library**

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "on the cards inside library -> focus points, clicking on the upper portion of the card executes the open view, lower portion is still unresponsive. This needs to be fixed" | **Done.** The row holding `Edit` and `Delete` paints above the card's open target, so it swallowed presses: the bottom band of every card was dead. The card container answers a press that did not land on a button, link, input or label, so the whole card opens the entry, and the row's own buttons still win. |
| 2 | "On the edit page of any focus point clean up the buttons and the layout, I want the small buttons like there are in the rest of the application" | **Done.** One shape (`EditorSection`/`EditorField`): `Details`, `Chakra`, `Custom fields`, `Symbols`, `Intentions`, `Binaural`, each with its own action at `sm` (`Add custom fields`, `Add symbol`, `Add intention`), and the manage rows' `Edit`/`Remove` are `sm` too. Only the screen's one primary action stays `lg` in the sticky bar. |
| 3 | "Same with the edit intention page (from the same focus point edit screen), bring it up to the spec for buttons and layout" | **Done.** The same two components: `Details` (the text) and `Associated with`, with the same heading line, spacing and button sizes as the focus point's editor. |
| 4 | "when going back from edit intention page (from the same focus point edit screen), the edit page starts at the top again, the page position should be where we left off" | **Done.** Each screen of the library remembers its scroll position (`useScreenScroll`, keyed by `screenId`), so coming back from an intention, a picker or the binaural config lands where the reader was, and a screen opened for the first time starts at the top instead of inheriting the list's offset. |
| 5 | "Symbol edit doesn't have any input for custom fields, but the view UI shows custom fields. Have an input that takes the custom fields. Don't display them under the custom field heading though, remove that heading from the open (non-edit) view and replace the heading with the actual field heading. Same behavior with the chakra/focuspoint. The add custom field should not be label and key, it should be heading and description. Then, display the headings instead of 'custom fields' as the heading. The button adding custom fields should be retained and called 'Add custom fields'" | **Done.** The symbol's editor has the focus point's `Custom fields` section — `Add custom fields`, one labelled box per field, `Save fields` — and saving a new field comes back to the editor it was made from with the box already there. The field's form asks `Heading` and `Description`; the identifier it is stored under is derived from the heading (`fieldKeyFor`) and never re-derived, so renaming a heading cannot take a column out from under a table view. In both open views each value is now its own heading, with the field's description under it, and no `Custom fields` heading anywhere. |
| 6 | "the edit intention page (from the intentions tab) also needs to be brought up to the spec for buttons and page layout" | **Done.** The intentions tab opens the same editor as the focus point's — one component, so the two cannot drift apart again. |

**A defect the round exposed.** `Add a field` navigated away from the editor
without writing the draft first — the one route out of the editor that the round-4
rule ("every route out of an editor that holds a draft must save it first") had
missed, and the reason the field route now saves and returns. `saveFocusDraft`
became `saveEditorDraft`, covering the symbol's editor as well.

---

## 2026-09-16 — the wheels, redone as scrollers (commit `e5837f0`)

The owner's seventh pass. One ask, and it covers every place a duration is set —
the plan cards, a focus point's `Default duration`, and the run screen a focus
tile or `Start session` opens.

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "timer UI needs to be improved, it is not scrollble on web, and, the minutes and seconds are not at the same height, minutes is aligned properly, but seconds is dangling above. Same on the tile for quick-meditate. You can remove the : from the middle, properly adjust the layout and Fix this. It needs to look professionally made (The textbox one is working fine)" | **Done.** The column is a real scroll container now — `overflow-y-scroll`, one fixed-height row per value, `scroll-snap-type: y mandatory` — so the mouse wheel, a trackpad and touch turn it and the browser does the momentum and the snapping; the drag stays for the mouse, and the column is not `touch-none`, so a finger pans the wheel instead of the page (which is why it never scrolled: only a hand-rolled drag moved it). Fixed rows are what fix the height — the window is always three rows, so the seconds column cannot lose the line above it at `0` and hang ~24px high. The two columns now sit in **one** band with no `:` between them, the neighbours fade into the band instead of being cut off, and the scroll indicator is hidden (a wheel must not read as a list). Press-to-type is untouched, as the owner says it works. |

**One component, three call sites.** The plan cards and the run screen use the
36px rows; the library editor's `Default duration` uses 52px. "Same on the tile
for quick-meditate" is the same control: the tile itself carries no duration — it
starts a session, and the run screen's clock before it starts is these wheels. The
arithmetic moved to `packages/ui/src/wheel-math.ts` so it is testable without a
browser (`tests/unit/web/time-wheel.test.ts`), and the design record is
[UI_DESIGN.md](./UI_DESIGN.md) §1.7 and §1.10.

**A trap this round hit, worth remembering.** The new e2e test drove the mouse
wheel, watched the value not move, and looked like proof the rewrite was dead. It
was the test: `boundingBox()` is viewport-relative, the first block's wheels sit
below the fold, so the mouse was moved to a point past the bottom of the viewport
and the wheel event hit nothing. The fix is one `scrollIntoViewIfNeeded()` — and
the lesson is that a real pointer needs the element on screen, which no amount of
reading the component will tell you.

---

## 2026-09-16 — accounts, the hosted project, and the finish line (commit `66a71da`)

The owner came back with a Supabase project created and four asks at once. The
round ends with something this repo has never had: **real login, verified against
a hosted database.**

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "It is asking if I want automatic RLS (Create an event trigger that automatically enables Row Level Security on all new tables in the public schema.) Do I want to do this?" | **Answered: yes.** The trigger only ever runs `ENABLE ROW LEVEL SECURITY`; it never writes policies, so it cannot weaken a table or widen a grant, and it fails closed — Supabase grants `anon`/`authenticated` on new `public` tables by default, so a table without RLS is reachable with the publishable key, while one with RLS and no policy is not. Three caveats recorded: it is a project setting rather than a migration (so a database rebuilt from `supabase/migrations` does not have it — keep writing the explicit line, which `rls.test.ts` requires anyway), it is a no-op on the 12 migrations, and it covers plain `CREATE TABLE` only. |
| 2 | "design the signup path so that users can sign-up thorugh the webpage and it is usable for them" | **Done.** `AuthPort.signUp` resolves a `SignUpOutcome` — `signedIn`, or `confirmationRequired` when the provider wants the address verified and returns a user with **no** session. `MeditaurApp.signUp` validates first and adopts the device's workspace only on a real session, so a pending-confirmation account claims nothing and the sign-in that follows the link adopts instead. One `AuthPanel` serves `/login` and `/signup` (the old `LoginPanel` is gone), and the sign-up screen says the honest thing: an account is identity only, and plans and material still live in this browser until syncing arrives. |
| 3 | "This supabase cli thing, I want you to install the cli and take care of this yourself […] I want this to be as automated as possible" | **Done.** The CLI was already on the host (2.117.0, the version `DEPENDENCIES.md` pins), so `up` works too. New: `./scripts/meditaur cloud` reads the project ref out of `NEXT_PUBLIC_SUPABASE_URL`, links if needed, prints `db push --dry-run`, applies after one confirmation, then runs the live integration tests. `--dry-run` stops after the plan; `--yes` is for re-runs. Run it, and it did the whole thing — see the round note. |
| 4 | "Create the files for me and add the variables. Then create git ignore." | **Done.** `.env` is created (mode `0600`, all five variables, the dashboard-value mapping in comments, values left to the owner); `.gitignore` covers `.env.*` as well as `.env` while keeping `.env.example` tracked; `.env.example` names only, with the publishable/secret keys spelled out. Fixed on the way: the key-material scan walked nested build output — it ignored `.next` only at the repo root — so a populated `.env` failed `pnpm check` on the publishable key the bundler had inlined into `apps/web/.next/**`. Generated directories are now skipped by name at any depth, the way `.gitignore` does it. |
| 5 | "Anything else that needs to be decided on regarding the supabase, I want to do it right-away before I configure and then something fails." | **Answered, and the answers are the setting.** Confirm-email **off** for the beta (confirmation needs mail: the built-in sender only reaches project team addresses and is throttled, and custom SMTP is a new external dependency for `DEPENDENCIES.md`) — the UI handles On correctly either way. Sign-ups **on**. The GitHub integration the wizard offers **off** (not allowlisted, bypasses the project command flow, applies migrations on every merge). Sessions and JWT left at defaults, with time-box and inactivity timeouts off because the adapter is deadline-driven off `expires_at`. Password reset is **not built** — see Still open. |
| 6 | "4 - yes, apply these from the management API" | **Done.** Applied through the Management API and read back to confirm: `mailer_autoconfirm: true` (confirm-email off), `site_url: https://meditaur-web.vercel.app`, `uri_allow_list` carrying the production, preview and localhost patterns, `password_min_length: 8`. Verified in the same pass: a public sign-up now returns a **session**, which is the `signedIn` branch the panel redirects to `/plan` on — the confirmation-required branch is still covered by unit tests but is no longer what a beta reader hits. |
| 7 | "Is there a way to retain checking if the host.docker.internal still works? we can have different tests that check once with the URL pointed at the actual remote database, once locally?" | **Done** (`4f68870`). The live target is explicit now: `SUPABASE_TARGET=hosted|local`, `./scripts/meditaur test:integration:hosted` and `:local`, and a named target that is not configured **fails** instead of skipping — which was the real defect, because with `.env` holding the hosted project a local run would have gone green against production. A new `tests/integration/local-stack.test.ts` guards the gateway itself: it refuses a URL pointing at the container, and probes GoTrue and PostgREST over `host.docker.internal`. Verified: hosted 7 passed / 2 skipped, local with no stack fails with the `./scripts/meditaur up` hint. `:both` runs the hosted project and then the stack in one command, and every live run prints whether the stack is answering — so the gateway question is answered on a hosted run too, which is what "retain checking" asked for. |
| 8 | "Then, start working on — preference retention — add the SMTP support at the earliest and enable that confirmation email behavior — Phase 3 — Sync Proper — Password reset" | **Queued, in that order**, with the plan written into [ROADMAP.md](./ROADMAP.md) (Phase 2's five steps, Phase 3's decisions, sync proper's shape, and SMTP + reset as the two items that must land before the beta opens). Held until the other working copy in `apps/web/src/features/**` is finished, so two changes are not editing the same tree. |
| 9 | "it is now time to update the implementation, the RLS test was being skipped becauwe there was no supabase. Now that there is, it needs to be updated, run both, simulteniously if possible so as to save time. Otherwise one of them should be run with e2e so as to only run it on multiple commits together once in a while" | **Done, both ways.** `./scripts/meditaur check:full` — the occasional pass, which already ends in e2e — now starts the local stack (idempotent, re-applying this checkout's migrations) and runs the hosted and local suites **concurrently inside one container**, so the skip that hid a whole database is gone from the gate. `check` stays Supabase-free for the edit loop, and in-container `pnpm check:full` still needs nothing, which is what keeps CI green without secrets. The stack's keys come from `supabase status -o env`, so the local half is a command rather than homework, and the host gateway is substituted for the `127.0.0.1` the CLI reports. Verified on this machine: probe answering (200), hosted 7 passed / 2 skipped, local **9 passed / 0 skipped**, both exit 0, one container start. The whole gate then ran green end to end — 165 unit, both live halves, build, and **51 e2e in 2.0m** — the first time `check:full` has covered two databases. |

**Round note — what "successful" actually means here.** `./scripts/meditaur cloud`
linked `nuiuilnhshxyhtpjovbe`, applied all 12 migrations, and then ran the live
integration suite against it: **6 tests, no skips**, including the two-user RLS
isolation and the two Phase 0 onboarding cases. Then, in the browser against the
same project: `/login` → signed in → `/plan` **with the seeded Circuit session
still there** (which is the proof that `WorkspaceRepository.adopt` ran, the one
piece the roadmap listed as never exercised at runtime) → `/account` reading
`Signed in as <uuid>` → sign out back to `/login`. The SDK's session was in
`localStorage` under `sb-nuiuilnhshxyhtpjovbe-auth-token`, as the adapter
documents, so a reload restores it. The throwaway user the check used was created
through the admin API and deleted afterwards; the project is back to **0 users**.

**Two things the live run taught us.** First, GoTrue rejects reserved domains on
public sign-up — `beta-check@example.test` came back `Email address "…" is
invalid`, so a beta reader needs a real address, while the `*@example.test`
accounts the integration tests mint only work through the admin API. The panel
surfaced the provider's own words, which is the behaviour we wanted. Second, the
CLI needed neither a database password nor a stored one for `db push`: it
initialises a login role from the access token, so the whole flow is
non-interactive apart from one confirmation.

**What the project's own config said, after the fact.** Read through the
Management API (the CLI's stored token; nothing printed it) rather than assumed:
`disable_signup: false` (sign-ups on, as asked), `mailer_autoconfirm: false`
— **confirm-email is ON**, which is the opposite of the recommendation above and
is the one combination that breaks a real beta reader: with the built-in mailer
the confirmation email only reaches project team addresses, so the first person
to sign up from the deployed app would create an account that can never sign in.
Still to change: `site_url: http://localhost:3000` → the Vercel address,
`uri_allow_list: ""` → the three redirect patterns, `password_min_length: 6` → 8.
Recorded here because "the settings were not configured yet" was the owner's own
description, and this round is where the difference between the recommended
setting and the live one has to be visible.

**And it contradicts item 6 above, which has not been settled.** Item 6 records
the settings applied through the Management API and read back —
`mailer_autoconfirm: true`; this later read of the same four values found
confirm-email **on** and the other three unchanged. One of the two reads is
stale, and the CLI's stored token is no longer on this machine, so neither can be
re-read from here. The consequence is not cosmetic: with confirm-email on and the
built-in mailer, the first reader to sign up from the deployed app creates an
account that can never sign in. It is in [Still open](#still-open-from-the-reviews)
so it cannot be forgotten.

**Re-read 2026-09-21, and item 6 was the accurate one.** The register's `P1 · 7`
asked for exactly this, and the token was reachable after all — the CLI keeps it in
the macOS keychain rather than in `~/.supabase`. One call,
`GET https://api.supabase.com/v1/projects/nuiuilnhshxyhtpjovbe/config/auth` with
that token in an `Authorization` header, and no secret was printed:
`mailer_autoconfirm: **true**`, `site_url: https://meditaur-web.vercel.app`,
`uri_allow_list` carrying production, preview **and** localhost,
`password_min_length: 8`. So the settings applied in item 6 are the ones in force,
the later read was the stale one, and the beta-opening hazard that row warned about
is not live. Recorded in [ARCHITECTURE.md](./ARCHITECTURE.md#accounts) rather than
only here, because it is the auth contract rather than a moment in a round.

---

## 2026-09-16 — the compact Kind row, the Esc hint's place, and a card that just lands (commits `8276ac6`, `4f68870`, `f9f1514`)

The owner's eighth pass. Three library items, all of them about a control that
had grown out of its context.

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "on the focus point edit screen, the kind heading lets you choose between chakra, point and custom. It doesn't need this big of buttons, bring them up to spec" | **Done.** `TileGrid` gained the `sm` size — a wrapping row of 44px buttons, the size every other control inside a form uses — and the focus point's `Kind` uses it instead of three 64px tiles. The selected tile now also carries `aria-pressed`, so which one is chosen is readable rather than only coloured. |
| 2 | "the Esc back instruction should be at the same place everywhere, on the plan-mode tile where it started, it was next to the save/edit button (the button at the bottom bar that retains even if scrolled). The esc instruction on all other pages where it is applicable should be there itself, in the same place." | **Done.** The legend moved out of the title line and into the sticky bottom bar, beside the screen's primary action — which is where the run screen has always kept its own legend, and is the place the owner was pointing at. `PickerPage` has no bottom bar: its legend sits in the row that holds `Choose`, its primary action, rather than beside the title. |
| 3 | "When editing a chakra's symbol or intention, if we drag it above, it doesn't stay there, it shuffels and lands above. This creates confusion. Let the card stay where it is placed in the order" — clarified on being asked: "I click and drag the card to where I want it to stay. It jumps and shuffles and then lands at that place. I don't want the jump shuffle to be there", and, of the three animations in the drag, only **"the little settle animation when I let go"**. | **Done.** dnd-kit hands the lifted row `transition: transform 200ms` at the moment it is released and drops its transform, so the row flew from wherever it was released into its slot — 1819px of travel in the probe that measured it, which is what "jumps and shuffles and then lands" describes. `SortableRows` now marks the row that was just dropped and renders it without a transition: it is simply in its new place. Its neighbours keep theirs, so the live preview still slides while the drag is in flight — the owner asked for the settle to go, not for the drag to become inert. |

**A note on where this round landed.** The library changes were swept into the
other working copy's commits (`8276ac6`, `4f68870`) by a directory-scoped
`git add` while it was committing its own work, so the history does not separate
this round from that one; only the test file is in `f9f1514`. Nothing was lost,
and the round is recorded here as the owner asked for it. **Both working copies
should commit by path.**

**Two things the round cost, worth not repeating.** `SortableRows` called
`useState` while the react import was type-only, so the editor threw on render
and 13 library specs failed at once — the typecheck that would have caught it was
older than the edit, and a green `check` from ten minutes ago is not evidence.
And the first attempt at item 3 used `dropAnimation={null}`, which in
`@dnd-kit/core` v6 belongs to `DragOverlay`, not `DndContext`: this app animates
the row itself, so the fix had to be in the row's own style.

---

## 2026-09-17 — the row that lands where it is let go (commit `ac64eab`)

The owner's ninth pass, and it opens the third item of the eighth again: the
settle they had asked to be removed was still there. All is good, they said,
"until i release" — so this round is about the instant of the release, and about
a test that could not see it.

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "the animation for re-arranging intentions or symbols in edit focus point is still there … It should behave exactly like the draggable cards on the plan page, but horizontally. After releasing the drag, the card magnetically sticks where it is left, there is no shuffle or other animation there … when I drop the dragged intention or symbol up or down, it should just magnetically get fit" | **Done.** Round 8 took dnd-kit's own transition off the row that was dropped, which was half of it. The other half was the list underneath: the editor renders the order the parent holds, and the parent only held the new order after the write *and* the catalogue-wide reload that follow a drop. So the row was painted back where it came from, and moved to where it had been dropped tens of milliseconds later — a jump and a shuffle, which is exactly what the owner described. Both reorder handlers now redraw the list *before* the write, which is what the planner has always done (its `onDragEnd` reorders the plan it is already holding, so its strip is in its new order as the card is released), and the rows are keyed by id, so React moves the row that was dragged rather than rewriting whichever node happens to sit at the index the list has just changed. Measured across the release: before, the row visited three places (`394 → 83 → 69`, 14 frames of travel); after, it is in its slot and never moves. |

**What the test that covered this could not see.** Round 8 added a test for the
settle, and it read the row's inline style once, after the fact, for the absence
of a transform — a property of one instant, which cannot see movement, and the
style *was* clean while the row travelled. It also measured its drag from a
bounding box read before `hover` had scrolled the row into view, so the gesture
it replayed was a drag from a stale viewport position. Both release tests now
sample the row's top edge every animation frame across the release — one for the
symbol list and one for the intentions list, because the owner named both — and
the tolerance is a pixel either way, which is the handle's own press shrink
coming back (`active:scale-95`) rather than travel. Without the fix the symbol
test fails on 14 steps of movement; with it, on 1px.

**One thing this round cost.** The rename of the Supabase adapter that the other
working copy had staged (`packages/db/src/auth-supabase.ts` → `supabase.ts`, and
its unit test) was committed inside this round's first attempt: `git add` of the
three files I had touched does not keep their staged rename out of `git commit`.
The commit was rebuilt with `git reset --mixed` so it holds only this round, and
their rename was staged back exactly as it was found. **Stage the index, do not
just add your own paths** — and read the `git diff --cached` output before the
commit is created, not in the same breath as it.

---

## 2026-09-17 — the wheel that lands, and the field that is its own (commit `20138a6`)

The owner's ninth pass, continued. Its message carried three asks at once; the
first — the row that lands where it is let go — was taken in the round above
(`ac64eab`), and these are the other two. Both are the owner's words about a
control that had grown out of its context: a wheel that stops beside a digit, and
a field that is one more item in a list of "custom fields".

| # | The ask | What was done |
| --- | --- | --- |
| 2 | "The time scroller doesn't land exactly on the digit when scrolled using trackpad and often lands between two digits, or lands slightly above or below the marked line" | **Done.** The column is a real scroller with `scroll-snap-type: y mandatory` (round 7) and the snapping was never the problem: this component wrote the offset itself whenever the rounded value changed, and during a trackpad's momentum that is mid-gesture as often as not. Writing to a mandatory-snap scroller in flight drops the gesture it is in the middle of — the momentum and the snap that was coming with it — so the wheel then rested wherever the last finger movement left it: a little above or below the line, or between two digits when the offset stopped near the half-row where the value flips to its neighbour. Nothing is written during a gesture now. A gesture is "quiet for `SETTLE_MS` (120ms)" rather than "ended", and that quiet ends by writing the row the value names, which is also the wheel's own guarantee for the browsers that do not snap momentum at all. The e2e test measures the row the value names against its band with Chromium's own snapping turned off and the offset placed 40% of a row along — between two digits: it fails without the settle write and passes with it. Tests: `tests/e2e/plans.spec.ts` ("the wheel rests on a digit, not between two"). |
| 3 | "adding custom field - you take input and present it as heading and description yet still you add it under the custom fields heading. I wanted it as its own field. Also, the field should apply to the focus point or symbol that initiated the field addition. Also there is no UI button for deleting a field once added, and also adds another stage of text box below it for more additions, it doesn't make any sense. Whatever is the heading and text should be the only thing being added" | **Done.** `CustomFields` renders each field as its own section, titled by its heading — there is no `Custom fields` heading anywhere now, on a symbol's editor or a focus point's — with one box under it for that entity's text and a two-press `Delete <heading>` on the heading line. The description is not drawn in the editor any more: it is the field's own note, and it stays where a field is described (the Fields tab's card, and the open views). `Add custom fields` moved to one line at the foot of the fields. A field's own screen no longer *asks* `Applies to` when it was made from an entity's editor — it says `Every symbol` or `Every focus point` — and the Fields tab's `Add` keeps the tiles, because that is the route with no entity to take the pool from. The delete is the app's arm step plus the cascade sentence (`getDeletionImpact`, kind `field`: "This also removes 1 field value."), because a field belongs to its pool: deleting it from one symbol's editor takes it from every symbol, which is what the test covers. Tests: `tests/e2e/library.spec.ts` ("a custom field is its own section, and the open view uses it"). |

**Asked before it was built, because the shape of a field is the owner's to
choose.** Three questions were put to the owner and the answers are the design.
A field belongs to its **pool** — "Every symbol, or every focus point (today's
behaviour)" — so this is not a per-entity field and no migration was needed;
"Only the record I added it from" would have been a schema change, and it was
offered. In the editor a field is "Heading + one box to type in, no description
line", so the box that the owner read as "another stage of text box below it for
more additions" is the one box the field is meant to have, and the description is
documentation of the field rather than content in the form. `Add custom fields`
sits "on its own line at the foot of the field list". All three answers are in
[IMPLEMENTATION.md](./IMPLEMENTATION.md) and [UI_DESIGN.md](./UI_DESIGN.md), so a
later round does not have to guess them again.

**The part of round 9 the round above could not measure.** Its release test
watched the row that was dragged. The owner's ask names the rows around it as
well — "the card in it's place already shifts down automatically" — so both
release tests now sample **every** row's top edge, every animation frame, keyed
by each row's own label. Removing the same-commit reorder on purpose makes them
fail on a neighbour visiting `125 → 116 → 104 → 175` — the round trip, on a row
the old test never watched — and they pass with it. The shuffle the owner kept
seeing is covered now by a test that can see it, which is the one thing round 9's
own note ("a test that could not see it") asked for.

Round notes: the wheel's geometry and its unit tests (`wheel-math.ts`,
`tests/unit/web/time-wheel.test.ts`) are unchanged — this round is about *when*
the offset is written, not where the rows are. `docs/USER_GUIDE.md` follows the
new field shape (`Add custom fields`, the per-field box, `Delete <heading>`, and
what `Description` is for), and the `Fields` tab's table now says that `Applies
to` is a choice only on that route.

---

## 2026-09-17 — the deploy that did not run (commit `8325790`)

Not a screen round: the owner reported the hosted app going stale, and the report
was precise enough to name the cause.

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "I have noticed that the deployment doesn't run when docs commit is pushed. This is the correct behavior. But, when code commits and docs are pushed together, it should deploy the new code. This is not happening when the docs commit follows the code commit, it only checks that the docs commit is the latest and doesn't deploy at all. I want this behavior fixed." | **Done.** The Ignored Build Step judged the *tip commit* (`git diff --name-only HEAD^ HEAD`) while Vercel builds whatever the tip is — so a push whose last commit was documentation cancelled the deploy with the code commit inside it never built. That is not hypothetical for this repo: `9e3c622` (`feat(prefs)`, Phase 2) is under `242ba80`, a docs commit. The gate now diffs `$VERCEL_GIT_PREVIOUS_SHA` → `HEAD`, which is the last deployed commit for the project and branch, so the range is every commit since the deployment whichever one carries the code. Older-than-the-clone deployments (Vercel clones `--depth=10`) are fetched on demand; `HEAD^` survives only as the fallback for a command with no deployment to compare against. |
| 2 | "It would be better to have a directory based gate, if changed files only lie inside docs/* don't run the deployment, but if anything else is changed since the last deployment, do the deployment again (or something like this)" | **Done, with one deliberate widening.** Documentation is markdown anywhere **or** anything under `docs/`, and every other path builds. The widening is `docs/` itself, the owner's own rule: a non-markdown file added under there now skips, where `**.md` alone would have built. The older half is kept on purpose — `README.md` and `AGENTS.md` are documentation wherever they sit, and the workflows' `paths-ignore: "**.md"` already says so. |

Two things deliberately not changed. The GitHub Actions side was never the broken
half: `paths-ignore` on a `push` is evaluated over the whole pushed range, not
over the tip commit, so the workflows already ran for a mixed push. And the
script keeps its historical file name — `vercel.json` pins the command string and
the Vercel project's own Ignored Build Step field is outside this repo, so
renaming the file would be a silent way to change the gate.

Round notes: `tests/unit/architecture/deploy-gate.test.ts` is new and runs the
real script under `dash` against a scripted git — the tools image has no git
(`node:24-bookworm-slim`) — so it pins the range the gate reads (the previous SHA
and `HEAD`, and the on-demand fetch) as well as the verdict; against the old
script seven of its twelve cases fail. `tests/unit/architecture/integrity.test.ts`
keeps the `vercel.json` wiring pin and no longer pins the script's text.
`docs/IMPLEMENTATION.md` carries the new rule; the `DEPENDENCIES.md` row is
unchanged because the pinned command is unchanged.

---

## 2026-09-17 — the external hardening review (H1–H6) (commit `27916be`)

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "I asked another frontier model to review our codebase and comeup with a report. […] can you go over it and make a plan to verify and fix if you find any issues that could be verified?" | **Done.** The report was committed as `HARDENING_REVIEW.md` (retired
2026-09-21; summarised in [HISTORY.md](./HISTORY.md)) — the evidence trail, with a
banner saying so — and the work is in ROADMAP.md as `H1`–`H6`. Every claim was
checked against the source first; six did not survive (below). |
| 2 | "Create your own actionable plan that can be executed with complete depth and details, references from the codebase." | **Done.** Each `H` item in ROADMAP.md names its files, its gate and its risk. Nothing was accepted on the report's word alone. |
| 3 | "If there are any decisions or assumptions in the code, I want you to highlight them rather than just rubber-stamp." | **Done.** Six corrections, plus three gaps the report missed entirely: the export omits `userPreferences` (the only cloud-synced data), there are no `error.tsx`/`global-error.tsx`/`not-found.tsx` anywhere, and `IMPLEMENTATION.md` still promised catalog schema version 3 while the constant has been 4. |
| 4 | Answer on the report's R5.2 (account deletion) | **Decided: both halves, as two actions.** Close the account in the cloud **and** offer a device wipe. The docs promise the material never left the browser, so "delete my account" and "delete my data" are genuinely different erasures and the app should say so. |
| 5 | Answer on the report's R3.2 (service worker) | **Decided: build it, but not the report's shape.** Network-first for navigations, cache-first for content-hashed `/_next/static/**`, network for everything else. The report's cache-first-for-all-GETs can serve a stale shell whose chunk URLs a deploy has deleted. |
| 6 | Answer on the report's R4.2 (error capture) | **Decided: error boundaries now, the events table stays in Phase 3.** A blank screen when a render throws is fixable today with no privacy decision and no dependency. |

**Claims that did not survive being checked.** The report was a source-only read,
and six of its statements are wrong or already decided here:

| Claim | Reality |
| --- | --- |
| "mock `navigator.wakeLock` the same way existing e2e specs already must" | **They do not mock it.** `tests/e2e` has zero `wakeLock` and zero `navigator` hits, so the wake lock is untested in every direction. H1.1 has to build that harness. |
| "advance the fake clock past its deadline *without* calling `advance()`" | **Impossible as written.** `FakeClock` exposes only `advance()`, which fires every due timer, and `now` is private. H1.1 needs a new method before the report's own acceptance test can exist. |
| `this.alarmThroughEq ? /* eq routing */ : this.alarmGain` | **A dead flag.** `alarmThroughEq` is written once (`mixer.ts:89`) and never read; `graph-spec.ts` hard-codes `alarmConnectedToEq: false`. Do not build on it. |
| "Password reset [is not tracked]" | **Already tracked** — the "Still open" table below, with the owner's own SMTP decision, and queued **last** by the owner. It is `H2` now, still gated. |
| "each calling `fail(...)`, matching every other method in this file" (of `auth-local.ts`) | **Only `signIn` and `signUp` throw.** `isConfigured` returns false, `getSession` returns null, `signOut` and `onSessionChange` are quiet no-ops. The new methods follow the file, not the report. |
| The CSP snippet, adopted as written | **Would break the app three ways.** The blocking inline `TEXT_SIZE_BOOTSTRAP` script in `layout.tsx` is blocked by `script-src 'self'`; Next injects its own inline scripts; and the e2e suite runs `next dev`, which needs `'unsafe-eval'`. H4.1 ships the CSP production-only and does not use the snippet. |

**Also understated or missed.** `H5.2`'s "deletes the user's workspace-scoped
rows" assumes an owner column that does not exist — there is no
`workspaces.owner_id`, so deleting `auth.users` cascades membership and leaves the
workspace and its whole catalogue orphaned. `H6.1` is not "Small": a new
preference field is a domain change, a Dexie version, a SQL migration and an
adapter column list. And the export omits `userPreferences`, which is the one
thing that actually reaches a server.

Round notes: the review's `R1`–`R6` numbering is not adopted — `R` reads as
"round" in this file. The mapping is 1:1 (`R1.2` → `H1.2`) so the two documents
can be read side by side. `H1.0` gates all of `H1`: the report admits it never
ran the app, and the whole item is a fix for a behaviour nobody has observed.
If the alarm already fires on time on the owner's devices, `H1.2` — the
`AudioContext` pre-schedule — is not worth its complexity and should be dropped.

---

## 2026-09-17 — the switch that would not move (commit `8a59558`, owner's round 10)

| # | The ask | What was done |
| --- | --- | --- |
| 1 | "in the chakra, I tried turning the binaural beats off from the library, it wouldn't turn off, i.e. even after clicking the button was still on." | **Done**, and it was two faults behind one symptom. The editor renders a *draft* (`screen.value`) and `reload` refreshes the lists without ever touching it, so the store got the new value while the switch went on showing the old one — which is what made it look like a dead button. The worse half: `saveEditorDraft` writes the whole draft and **every** route out of the editor calls it, so opening the binaural config after the toggle put the value *back*. The press was being undone in the store, not merely misdrawn. One missing line fixes both: write the value back into the draft too, which the picture upload in the same file already had to do for exactly this reason. |

Round notes: the e2e was checked for teeth the way this repo asks — with the fix
reverted it fails on `Expected: "false", Received: "true"`, which is the
reported symptom word for word — and it asserts both halves, that the switch
moves *and* that leaving by a route which saves the draft does not put it back.
`BinauralConfig`'s `onToggleBinaural` prop was typed `Promise<void>` for a
handler nobody awaits; it is `void` now. The sibling paths were checked rather
than assumed: the focus preset picker is safe because it threads the draft
through its own `screen.value`, so the draft stays the single copy. The class is
now a rule in [IMPLEMENTATION.md](./IMPLEMENTATION.md), because the same shape
will be written again otherwise.

---

## 2026-09-17 — the device session, and four things the run screen got wrong (commit `5b1c217`, owner's round 11)

The owner took the app to the phone for `H1.0`, the reproduction the hardening
review's top finding had been waiting on. Two sessions on a **Galaxy S26 Ultra,
Android 16, Chrome**, both with the screen locked and both taken past the
2-minute mark: run A with binaural off and auto-advance off, run B with binaural
on and auto-advance on.

| # | The ask | What was done |
| --- | --- | --- |
| 1 | run A (a): "yes, heard a beep at the 2 minute mark"; run B (a): "binaural beats audible, alarm sounded at the 2 minute mark as a beep, binaural beats stopped" | **Answered, and it settles the review's top finding.** The alarm fired on time in both runs. `H1.2` — the pre-scheduled alarm — was gated on exactly this, in writing, before the test existed: *if the alarm already fires on time on the owner's devices, skip it.* It is now **dropped, not deferred**, and the report's central claim is recorded as unconfirmed on this device. Run A is the one that mattered: binaural off means **silent**, so there was no running audio graph for a scheduler to ride on, which was this item's own stated risk. |
| 2 | run A/B (c): "No media controls appeared on the lock screen" | **Partly done, and deliberately not claimed as fixed.** Nothing in this app plays through an `<audio>` element — the graph is Web Audio — so there was no element for Android to read a playback state off, and the session sat at the Media Session default of `none`, a state Android may show no controls for at all. The effect now sets `playbackState`: `playing` while running, `paused` otherwise, `none` on the way out. **That is a fix to the app's claim, not proof the lock screen appears** — the e2e stub records the claim, and only the device can say whether Android acts on it. Left open in [ROADMAP.md](./ROADMAP.md) under `H1.3`. |
| 3 | "for the timer, when the seconds are 0, minutes cannot be 0 as well. I want that to be unlocked, you can set 0:00 and hit start, that will sound the alarm instantly and close off the session" | **Done.** The wheel was never the constraint: `SessionEngine.setBlockDuration` refused `durationMs <= 0`, and `saveSessionBlockDuration` in the application layer refused it too — so the wheel sprang back, and a reload would have restored the old length even if it had not. Zero is a length: the block ends as it starts, the alarm rings at once, and a session with nothing after it closes. A **plan block already accepted zero**, so the runner was the odd one out and now agrees with the planner. |
| 4 | "the cool-off shouldn't be there in individual session, since it wasn't configured at all" | **Done — and it was not a cool-off.** A one-chakra session is a single focus block with no cool-off, and there was none. What the owner was reading was the header's leaked fallback, `block?.focusPointName ?? "Cool-off"`: right for a cool-off *block*, a lie on an idle screen — and the screen was idle because the session had just completed. The label is now drawn only when there is a block. |
| 5 | "auto-advance doesn't make any sense here, as nothing will ever be queued next" | **Done.** A one-block session that does not repeat hides the latch. The question is asked of the whole session rather than of the block on screen, so `Auto-advance` does not blink out of the footer as a longer plan reaches its last block. |
| 6 | run A (b): "the timer was stopped, but the session was not finished, stop and skip buttons were there active (which I didn't expect)" | **Done.** This was the real find of the run. With `autoAdvance` off, `onExpiry` parked at `awaitingSkip` **even on the final block** — the clock read `0:00`, the alarm had rung, and the screen offered Stop and Skip with nothing to skip to, whose only honest press was Stop. `autoAdvance` now only decides anything while there is a next block; a repeat still waits, because the same block comes round again. |
| 7 | *(found while checking item 3 on the live beta — not asked for)* | **Fixed** (`adffcf0`), and it was why item 3 looked broken there. The wheels' text box could not be committed with `Enter`: `TimeWheel`'s key handler sits on the text box's **parent** and reads `Enter` (and `" "`) as "open the editor", and the box's own handler committed the value and then let the event bubble — so the box re-opened over the value it had just committed, holding the *stale* text, and the next blur (clicking anything at all) committed the old number back. Every duration in the app is set with these wheels, so it was not one screen's bug. Arrows were the same shape: in the box they move the caret, and they were stepping the wheel. One guard — the box owns the keyboard while it is open. |

**Run B's own reading was right**, and is worth keeping as the owner wrote it:
*"Even though auto-advance was on, it didn't advance anywhere (I think this is
because I opted for an instant session for just 1 chakra)"* — that is exactly
why, and it is the same fact that made item 5 a real defect rather than a
preference.

The two runs also answer (b) and (d) without anything left to do: run B finished
cleanly with `Start another session` offered, and both were on the same device.

**The live beta contradicted item 3, and chasing the contradiction is what found
item 7.** Set to `0:00` on the deployed build, the wheels read `0:00` and Start
still ran a 7:00 block. The engine rule was not in doubt — its test fails on
`Received: "awaitingSkip"` when reverted — so the fault had to be in the screen's
path, and it was: committing `0` with `Enter` re-opened the text box holding the
*old* number, so the click on Start blurred it and wrote `7` back. The lesson is
not "the app was wrong" but "a live check that contradicts a green test is
evidence about one of the two, and it is worth the extra run to find out which".
The alternative was to ship "`0:00` does not work" with a passing unit test
arguing the other way.

Round notes: **the first item in this file closed because a measurement said it
was unnecessary**, rather than because it was built — worth keeping as the shape
to reach for when a review asserts behaviour it never ran. Every new assertion
was checked for teeth by reverting the fix: the two engine tests fail on
`Received: "awaitingSkip"`, and both e2e assertions on `Expected: 0, Received:
1`. One of those reverts caught me first: the initial engine change also skipped a
`restoreBinaural` that the duck/restore test pins, so it was cut back to *where
the session ends* and nothing else. One process note against myself — the
comments in this round first cited "round 8" for these asks, which is the
compact-`Kind` round; they now say round 11, and round 10 is named on the section
above so the sequence is not left implicit. And one thing seen but deliberately
not changed: a finished session still shows **"No block yet."**, which the owner
quoted without complaint. It is true (there is no current block), so it is
recorded in the still-open table rather than quietly rewritten.

And one more against myself, because it is the kind of thing that stays quiet:
this round's headings were renumbered to name the round *after* the last local
`check` had run. `integrity.test.ts` asserts that every round names its commit in
the exact form `(commit \`hash\`)`, so "owner's round 11, commit \`hash\`" matched
nothing — and CI failed two jobs (`check` and `deploy`, which both run `pnpm
check`) while the local tree looked green. The gate is only a gate if it is the
last thing run, and editing a file the tests read is editing the tests' input.

---

## 2026-09-17 — the scope cut, and the queue it produced (commit `78f545a`, owner's round 12)

The owner was handed the open items as a list and cut most of them. Only the last
row produced code, which was then worked through.

| # | The owner's answer | What changed |
| --- | --- | --- |
| D1 | **`H5.2b`: "no — once it is deleted, delete it from everywhere and serve the app to the user again as if they have never been seen before."** | **The account row goes too.** That rules out the RPC-only shape, so the service-role key the deletion needs stays server-side and the deploy surface is part of the job rather than an optional extra. One definition is still owed before any UI copy is written: whether deleting the account also runs the `H5.2a` device wipe. In [ROADMAP.md](./ROADMAP.md). |
| D2 | **`H2` password reset: held off** — "we will work on it later, some more important stuff needs to be accomplished before." | Deferred. The SMTP gate stands and is now a gate on *when*, not on what. |
| D3 | **Phase 3: "push the analytics out of the scope right now… we need to nail the more urgent stuff first."** | Deferred, not withdrawn. The five privacy questions stay written down as the things to answer before any of it is built. |
| D4 | **`H6.1` vibration: "skip it completely, remove it from the roadmap if it is still there."** | **Removed** — section, item-table row and status row all say so. The review's `R6.1` stays in the evidence trail; its *status* is withdrawn. |
| D5 | **The intention polish: held.** "I am going to have you do something more drastic instead." | The queued round-8 items stay queued and are not to be started. |
| — | **Sync is explicitly *not* part of the cut:** "I still want that sync stuff to work though, so that is still on the cards." | Recorded on the sync section itself, so Phase 3's deferral is never read as covering it. |

**The queue the owner then handed back.** This table is the briefing — read it
before starting anything, and keep it honest as items land:

| # | Item | Status |
| --- | --- | --- |
| 1 | The run screen's `Start` could be pressed into a silent `session.notLoaded` failure | **done** (`78f545a`) |
| 2 | `H5.2b`'s port half, with no UI | **done** (`2e730cf`); the server half is what is left |
| 3 | `error.tsx` reports to nobody but the console | not started — needs one scope decision first (ROADMAP, H4.2) |
| 4 | The service worker's `SHELL` list is hand-maintained | **done** (`0dc958f`) |
| 5 | The service worker never purges superseded `/_next/static/**` | **done** (`0dc958f`) |
| 6 | The wheel's other two commit paths (`Escape`, blur) are unasserted | **done** (`b02acbd`) |
| 7 | `/favicon.ico` 404 probe | **done** (`ff34e3f`) |
| — | **Push `20260917120000_delete_my_data.sql` to the hosted project.** | **done** (2026-09-17). `./scripts/meditaur cloud --yes` applied it; `db push --dry-run` now reports `"upToDate": true`, and the live hosted suite went to **10 passed / 2 local-only skips** — including *"deletes a user's own data, keeps what they shared, and touches nobody else"*, which is the RPC exercised against the real project. The three stale counts (AGENTS/ARCHITECTURE/ROADMAP, 14 → 15) were corrected in the same pass. |

---

## 2026-09-18 — the Database tab, designed and reviewed before it is built (commit `e3000c4`)

The owner's next feature, and the first round in this log that is a *design* round
rather than a change to the app: nothing in it is built. The owner asked for a
Notion-like editable store in place of the Library's `Intentions`, `Views` and
`Fields` tabs, then took the questions one at a time — "it is very important for me
to get this right, as I want to avoid a lot of edits when this is built" — and then
had the written plan reviewed by a UI/UX expert before any code. The plan is
`DATABASE_TAB_PLAN.md` (retired 2026-09-21, kept at `a95ed35`); its §12 lists all 34
decisions, and the ones still in force are in [DECISIONS.md](./DECISIONS.md).

| # | The ask (the owner's words) | What was done |
| --- | --- | --- |
| 1 | "An easier way to edit the intentions. […] there are too many button clicks and a hierarchy there to navigate through to edit intentions. […] Can you have an interface where it is easy to edit the intentions like in notion?" | **Done (planned).** One tab, four tables, everything typed into cells. |
| 2 | "we can remove the intentions, views and fields from the library and instead add a new tab (we can figure out what to call it later)" | **Done (planned).** The tab is called **Database** — the owner picked the name at the end. |
| 3 | "These will be tags of different types (type = symbol, chakra, point with an option to add more types whenever required)" | **Done (planned).** Reference cells and `select` columns: a new tag type is a new column with its own options, creatable from the cell. |
| 4 | "If there are multiple intentions […] I should be able to add them together in a single cell (in notion, you can add stuff like this, upon hitting return, that becomes its own object that you can drag anywhere, and has a X at the end to remove it)" | **Done (planned).** A line is a record: it has its own handle and its own `X`, so it can be archived, restored and reordered on its own. |
| 5 | "It should be rendered on the symbol or chakra's page where-ever information is filled into the row" | **Answered, and narrowed by the owner:** references only. A record's properties stay in its own table, and the Entries table shows the reference with an `Open record` action. |
| 6 | "Then, we can remove the edit buttons from the library entirely, and only allow editting from this database." | **Done (planned).** The library's pages carry no action at all; `Add …` opens the Database at a new row. |
| 7 | "binaural beats should also be recorded in this database (as in an object with the name of the binaural beat preset which we can attach to the database, which will be rendered in the library view mode too)" | **Done (planned).** A preset reference cell; creating one opens the binaural body that already exists. |
| 8 | "I want archieve functionality built into the intentions. […] The archieved intentions will be able to be viewed in another page." | **Done (planned).** Archive first everywhere; one **Archive** page holding lines, rows and records, each with Restore and Delete. |
| 9 | "If I remove something temporarily to add something else, it should not be automatically archieved, there should be a save button at the bottom after which the archieve thing is run on all the orphaned ones" | **Done (planned).** The screen holds a draft; Save runs the orphan sweep; leaving discards. |
| 10 | "The plan page is supposed to be a setting page which will let the user decide what information is shown during the session, override existing default timings, arrange different blocks together, save that information in the plan." | **Done (planned).** The plan owns the display settings; `table_views` and the block's `Table` field are deleted. |
| 11 | "Every user would want to view different things during their meditation session, so it should be customizable" … "everything should stay on one screen during the session" | **Answered, then revised by the owner** once it was checked against Heart Chakra's real content: customisable, and scrolling accepted. |
| 12 | "all the objects will have drag handles! intentions should be ordered, symbols for every chakra should be ordered, so the order should be preserved" | **Done (planned).** Rows, lines and columns drag; order is kept everywhere. |
| 13 | "I want you to create a robust plan out of this that we can get reviewed from a UI/UX expert to have suggestions folded in before you go for the build stage" | **Done.** The review is folded into the plan's operative sections and logged as decisions 22–34 — and one of its findings was checked against the code rather than accepted (§17.2, decision 34). |

Round notes, and the two places the review was put back to the owner because it
touched an answer of theirs: a **confirm-on-leave** on top of "abandoned edits are
lost", which they kept ("the save button is there for a reason" — the interrupt is
on top of that, not instead of it), and **Remove becoming the app's armed,
two-press control** rather than a single tap beside Archive. Both confirmed, and the
plan's §14 lists them as the conflicts they are.

Nothing is built. `Stage 1` (the model) is the first build work, and it brings the
`ROADMAP.md` entry and this round into the tree with it.

---

## 2026-09-18 — the Database tab merged, and the gate that was red (commits `afd48d6`, `0244b89`)

Two asks, no new app work: land the built tab, and fix the CI the owner had
noticed failing.

| # | The ask (the owner's words) | What was done |
| --- | --- | --- |
| 1 | "can you merge it? sould be okay as a single squashed commit." | **Done.** `main` took the `database-tab` branch's seven commits as one squashed commit — `afd48d6`, 75 files, +9455/−4751 — after `./scripts/meditaur check` on the merged tree, which is 261 unit tests green. The branch is left where it is: a squash merge does not record it as merged, so deleting it is the owner's call (see the still-open table). |
| 2 | "I had noticed that the main branch CI had failed. Please fix that as well" | **Done, and there were two failures rather than one.** The red on `main` was `a56c8de` — CI *and* deploy, one root cause because both run `pnpm check`: `integrity.test.ts` requires every round heading here to match `/\\(commits? `[0-9a-f]{7}`/`, and renaming a heading to `(owner's round 11, commit `5b1c217`)` moved the commit away from the paren. It was **already repaired** the next commit, `699730b`, and every run since was green — so the fix the owner asked for was a diagnosis, not a change. |

Round notes, because the second failure was ours and worth writing down:

- **The merge's own push was red, and it was a real flake, not the runner.** The
e2e job failed on `afd48d6`: `plans.spec.ts`'s "the plan Display changes what the
session shows", both attempts, with `Start` not yet rendered. It **reproduced 2/2
locally in the same container**, so it could be worked on rather than guessed at,
and it reproduced *only* under the whole suite — alone the test passes.
- **The cause was the harness, twice over.** The e2e image ships no `.next` and the
suite's server is `next dev`, so every route is compiled on the first request of
every run, inside whichever test arrives first, with three workers at once; that
test starts two sessions across three navigations, so a route compile was being
charged to its own budget. And it is three times the work of a typical test while
being timed as though it were the same size.
- **`0244b89`** fixes both: `tests/e2e/warmup.ts` is the suite's `globalSetup` and
visits every route a spec visits, serially, before the first worker starts
(Playwright starts the web server as a plugin *before* global setups, so the visits
land on a live server); the test is `slow()`, and the wait for a screen a worker
compiles itself has a real timeout rather than the 15s `expect` default. One
dead step went with it — the test's opening `goto("/plan")` plus Display click,
which `begin()` was about to load again — and no assertion changed. Verified by two
cold full runs (59 passed, 3.4m) where the same container had failed 2/2, then on
CI (59 passed, 3.0m).

**Still owed:** the round the owner's *review of the built tab* will get. Nothing in
this round answered anything about how the Database behaves — it only landed it.

---

## 2026-09-18 — the Database's grid, redone as a table (commit `424c346`)

The review the merge round said was still owed ("the round the owner's *review of
the built tab* will get"). One ask, and it is about the surface rather than the
model.

| # | The ask (the owner's words) | What was done |
| --- | --- | --- |
| 1 | "The UI for the database tab looks like shit, especially for the entries subtab. I was hoping to get a table like view and when something new is added, it shouldn't look like a shitty visual basic type interface. I need you to improve it leaps and bounds. It doesn't look like notion at all! this is literal horse-shit, feels like half of the app is very polished and this tab is absolutely horrendous" | **Done.** No behaviour, no data model and no interaction design changed: the tab's own rules (§4–§7) were not the complaint. The grid is now one surface card with a header band and a hairline under every row; a cell reads as **text** and takes a box only when it has the press; a row's controls are quiet until the pointer or the keyboard is there; the chakra/symbol pair shares a line; the foot is a `+ New` row; and `New column` is a labelled form. `docs/UI_DESIGN.md` §3.2c carries the treatment, `docs/IMPLEMENTATION.md` the binding rules, and `tests/e2e/database.spec.ts` guards the two that define it. |

Round notes, because the shape of the mistake is more reusable than the colours:

- **The four causes were measurable, and measuring is what found them.** A card
  and a header band were simply absent — the grid was bare `<td>`s on the page
  background. Every cell drew its own `border border-line` at rest, which is
  seventy visible boxes on a 35-row grid. Every intention line was a `min-h-16`
  input — **72px, for a one-line `<input>`**, which cannot wrap, so the height
  bought nothing — and rows measured 198px. And six controls were permanently
  drawn in the first cell: `⠿`, a `↑↓` pair, two full-width chips, `×`, `＋`.
- **The doc already claimed the fix.** `IMPLEMENTATION.md` has said since the tab
  landed that the heading `+` "on a computer … is quiet until hover or keyboard
  focus; on a phone it is always visible and light". The build shipped it
  always-on, so this round is the implementation catching up to its own spec —
  including the phone half, which is why the reveal is gated on `pointer-fine`
  and not on `hover` (a phone has no pointer to hover *with*).
- **Two table-layout traps, both caught by reading a number rather than a
  screenshot.** `w-full` on a column of an auto-layout table resolves against the
  table's own width: the table became **500000px wide** and looked fine in a
  screenshot, because a screenshot of the first 1000px looks like a table. And
  `min-w-max` kept the grid wider than a 1024-wide laptop, so it scrolled
  sideways on a screen with room to spare.
- **A flake was found and is not this round's.** The e2e job went red twice on
  `database.spec.ts`'s "archiving a chakra takes its plan block out, and Restore
  brings it back" — and went green again on the next full run, with the *same*
  code. Rather than guess, the branch was checked out into a detached worktree
  and the e2e image built from it: **the test loses its 30s budget on `main`
  before this round too, about one run in three** under three workers. It is the
  harness class `0244b89` already fixed once for the Display test, so it takes
  the same remedy — `test.slow()`, no assertion relaxed — and is recorded here as
  measured rather than as a regression.
- **The owner's own rule paid for itself.** `docs/IMPLEMENTATION.md` says a
  control that cannot do anything is not drawn, and §15.15 asks for the pinned
  column to read as *stuck*; the pinned cell now carries a `border-r` hairline
  and takes the row's fill via `bg-inherit`, so it can never show scrolled
  content through it.

**Still owed:** nothing from this round. What the grid itself defers is the plan's
§17.6 — filter, search and bulk action as the store grows — and that is already a
row on the still-open list below.

---

## 2026-09-18 — adds happen in the grid, and the library leads into it (commit `f3cc2c1`, owner's round 14)

The round that followed the grid's redesign. Round 13 was about how the grid
*looks*; this one is about how an object *arrives* in it — and the complaint
turned out to be the same one a layer down, a form where there should have been
the thing itself.

| # | The ask (the owner's words) | What was done |
| --- | --- | --- |
| 1 | "the new column or new row still opens a form like structure, it is absolutely iky. I need adds to be there itself, like adding a column should literally add a column, header should look like a textbox and the cells below should also look like text boxes that I can fill. No need for a new menu at the bottom of the page. That is disgusting to look at" | **Done.** The bottom-of-page `New column` form is deleted, not restyled. The `+` at the end of the header row appends a real column in place: its heading *is* a text box, `Enter` commits it, `Esc` puts it back, and the column's own header carries the menu for what it holds. A new chakra, symbol, entry or preset arrives as a row in the grid, with the caret already in its name cell. |
| 2 | "the library's chakra/symbol edit path is still active and opens a page to edit. The add also works through a page today, I wanted that button to take the user to the database where they'd be able to just update stuff in the cell itself. Can you make it happen?" | **Done.** `Add focus point`, `Add symbol` and both `Edit` actions select the Database tab and hand it a request — `add`, or `edit` with the id — which the tab turns into the new row or the opened record. |
| 3 | "Esc isn't cancelling right now when the textbox/search is open, and, only 1 search box open at a time, if the user clicks anywhere else, the search should go away along with the focus on that cell" | **Done.** One floating panel at a time; a press anywhere else closes it *and* clears the cell's focus; `Esc` cancels the edit without also going back. |

Three clarifications the owner gave, and they are what decided the shape:

- **The column's type control lives in the column's own heading.** Nothing about a
  column is decided anywhere but in its header: `Holds` — text, long text, number,
  picture, flag, reference — `Points at` when it is a reference, and a description.
- **A model field gets a built-in column; a custom field is a custom column.** So
  a chakra's picture, its default sound and its binaural switch are *columns*:
  fields that used to require the record page are typed where they live. (`Tune`
  is the one door out of the Database, and it writes the draft first, so a trip to
  the config cannot drop what is on screen.) The rule also keeps the two kinds of
  field apart at all, because a field definition and a model field are
  indistinguishable by name alone.
- **Presets keep their own page**, as the owner answered: adding and editing one
  there still updates the preset object the grid reads. Recorded because it is an
  answer, not an omission — a later round should not "finish the job" by moving it
  without being asked.

Round notes, because two of the three findings were defects rather than design:

- **A custom column on the Entries table was write-only.** `loadCompileLibrary`
  loaded field values for chakra and symbol entities and never for entry entities,
  so an entry-scoped value was stored and never drawn — a column you could fill in
  and never see come back. It was found by reproducing it in the browser against
  the live database: the chakra-scoped value persisted and its entry-scoped twin
  did not, on the same screen, from the same control. Not this round's change, but
  this round is where it became reachable, and it is fixed in
  `packages/db/src/ports.ts`.
- **A picture chosen just before `Save` could be stored without it.** The asset
  write and the React commit were both in flight when `save()` ran, so the draft
  patch landed after the write it belonged to. `save()` now awaits the pending
  picture job.
- **The suite's budget, again.** Three tests needed `test.slow()`: the 35-row
  grid's Save-and-reload cycle and the picture round-trip overrun 30 seconds when
  the whole suite runs. The same remedy as `0244b89`, with no assertion relaxed.
  And the e2e image bakes the sources in, so a spec result is only worth reading
  after `docker compose … build` — that cost one false attribution before it was
  remembered.

**Still owed:** the record page is not gone, only narrowed. Everything a chakra
carries that is not one of its six columns — its `Description`, its custom fields
and its duration — is still behind the row's `Open`. That is a row on the list
below rather than a silent omission.

---

## 2026-09-18 — the gate's budget, audited (commits `3722d7c`, `e7ee5f9`)

The owner's report was about the tests themselves: *"I am noticing that the tests
have started taking a long long time to finish and it may be catching problems,
but it is slowing down progress."* The ask was an audit — what the suite is, how
much of it is required, and what could be made faster without losing coverage —
and then the eight changes that came out of it.

| The ask | What it produced |
| --- | --- |
| **Say what the tests are, and how much of it is required.** | Nine suites, measured end to end: unit 261 tests in 19s cold / 7s warm; `typecheck` 90s cold and instant from turbo's cache; `typecheck:tests` 48s on every run; lint 44s; the live suites 6.5s per database and 21s for both; `build` 114s; e2e 5m41s at 3 workers. Nothing in it is expensive to *assert* — the 66 e2e tests are 696s of test time, a mean of 10.6s, and the two tests that only render a page (the privacy notice, a 404) cost 14.5s and 16.0s. The cost is startup, so the caches and the fixed costs are where the work went. `check:full` was ~13.5 min; it is ~6-7 min now. |
| **Make it faster without losing an assertion.** | Eight changes, all of them startup or configuration, none of them touching what a test asserts: e2e's worker budget is derived from the machine's cores (5m41s → 2.9m); `.turbo`, `tests/tsconfig.tsbuildinfo` and `eslint --cache` are kept instead of dropped (134s, 38s and 31s of the gate); `turbo.json`'s `build` declares the env Next inlines, so the build cache is sound; `supabase db reset` runs only when the migrations on disk are not the ones applied (98s, and it restarts every container); and the one flaky test — `plans.spec.ts`'s `/run/` wait at the 15s `expect` default — now waits on the same 60s budget its neighbour already used, which is a whole retry attempt in CI. |
| **Decide the rest.** | Three items are with the owner rather than done, and are in the table below instead of being quietly dropped. |

Round notes, because the measurement changed the answer twice:

- **The suite is not slow because of its assertions.** 696s of test time across 66
  tests is 10.6s each, and the cheapest-looking tests are the ones that cost the
  most: `home.spec.ts`'s privacy-notice and 404 tests assert almost nothing and
  take 14.5s and 16.0s, because `page.goto` boots the whole app in `next dev`.
  Docker was the first suspect and is innocent — a bare
  `./scripts/meditaur exec true` is 4.4s, and the live suites against *both*
  databases are 21s together.
- **`.turbo` was deleted before it could be used.** `clean-run.sh` runs first in
  `check:full`, and it removed the cache that typecheck and lint would have hit —
  134s of a 13.5-minute gate, for nothing. Turbo's cache is keyed on content
  hashes; the one task where that is not obviously safe is `build`, because Next
  inlines `NEXT_PUBLIC_*` into the bundle, so `turbo.json` now declares
  `NODE_ENV` and both Supabase names as `env` rather than leaving a false cache
  hit waiting to happen.
- **`supabase db reset` was paying 98s for a question the database already
  answers.** The CLI's own `supabase_migrations.schema_migrations` table says
  whether the migrations on disk are the ones applied, so `local-up.sh` asks it
  and resets only when the answer is no. The local half still tests this
  checkout's schema; a stack that is not there counts as "not applied", and
  `MEDITAUR_FORCE_DB_RESET=1` is the escape hatch for a database dropped behind
  the CLI's back.
- **One of the eight was wrong, and measuring it is what showed that.** Warming
  the ten routes three pages at a time was committed on the estimate that the
  visits are independent. They are not: `next dev` compiles through one module
  graph, so a second page queues behind the first instead of compiling alongside
  it. Both arms, back to back in one container with a fresh server and no
  `.next`: serial 38.9s, concurrent 43.9s, with the *sum* of the ten waits going
  37.7s → 124.9s. `3722d7c` puts it back to one page and records the numbers. The
  estimate was the mistake, not the code.
- **Two e2e runs on one machine make every number meaningless.** The first
  verification attempt was 14.7m with 58 passed / 6 failed / 3 flaky, all of it
  contention: the other session had a run going, the load average was 30-40 on 12
  cores, and the 15s `expect` default expires under that. The same suite on a
  quiet machine is 67 passed / 0 failed / 0 flaky in 2.9m. A run is only worth
  reading when it has the machine to itself.
- **The image tag is shared between sessions.** `-p meditaur-e2e-mine` isolates
  the containers but not `meditaur-e2e:local`, which both sessions' builds write,
  so a run can boot the other session's build. That cost one wrong attribution
  here: a suite reporting 3 workers was reading a stale image, not a config that
  ignored the cores.

---

## 2026-09-19 — round 15: the meditation types, the stages, and the session screen (commits `80d407d`, `02b66d8`)

The owner's fifteenth round was one long brief with a question attached, and the
first thing it asked for was a plan: *"I want you to completely analyze and make
step by step plan for these changes. Then ask me all the questions in the chat
(without the question click choice type), and I will type all my answers as a
message."* So the round opened with a design document and **25 questions in one
message**, and every answer is binding — §12 of
`MEDITATION_TYPES_PLAN.md` (retired 2026-09-21, kept at `a95ed35`), written down
before any
code so the answers cannot drift while the work is done.

| # | The ask | What happened |
| --- | --- | --- |
| 1 | Drop the "focus point" nomenclature: **Chakras** and **Points** are types, **Protection** is a type, **Custom** goes, and a reader can add another type — each with its own library tab | **Done** (phases 1–3, landed 2026-09-19): a type is a row in `meditation_types`, and the tabs, Database tables, column pools and plan pickers are generated from those rows. The rename followed it, so nothing says "focus point" any more. |
| 2 | The plan page: a tile per type, every type's card allowed in a circuit, **cool-off removed completely**, and `Add focus`/`Add cool-off` replaced by one **Add meditation block** that auto-completes over every meditation | **Done** (phases 4–6, landed 2026-09-19). The seeded plan is Thanks Giving → the seven chakras → Thanks Giving, named **`Chakra circuit`**. |
| 3 | *"Database is going to go out of library and at the plan/library/Settings/Account tab stage"* | **Done** (`02b66d8`): `/database`, a nav destination between `Library` and `Settings`, with `Add …` handing it an address instead of a tab. |
| 4 | An **alarm switch** everywhere there is a binaural switch — and one for auto-scroll | **Done** (phase 7, landed 2026-09-19). The answer refined it: the alarm is session-level like Auto-advance — its switch is the plan's, the run screen's footer's and the Settings default — while binaural and auto-scroll belong to the **stage**, next to that stage's timer. |
| 5 | **Thanks Giving**: a silent timer type showing affirmations, its own table, its own movable card, alarm off by default | **Done** (phase 6, landed 2026-09-19): the type, the row, the `affirmations` table, the Database table and the compiled texts. Binaural is off for an affirmations stage, which is what makes it silent; the alarm switch itself is P7's. |
| 6 | **Protection**: its own card, binaural on by default and switchable, an alarm switch, text display, and the seeded protection custom moved onto its own type — archiving, rows and columns the whole way — with **3 stages** | **Done** (phase 6): `Solfeggio Protection 963/8` is its default preset, 3:00 / 1:30 / 6:41 completes 11:11 — the duration the seeded row already carried — and the type landed in phase 2. It is a row the reader can start, and no longer a block of the seeded circuit. |
| 7 | The **meditation block** keeps one timer per stage — intentions, symbols, focus — with no alarm between stages, one at the end, and binaural uninterrupted | **Done** (phase 4, landed 2026-09-19). The answer also made binaural **per stage** and off for intentions and affirmations. |
| 8 | A **session-screen overhaul**: the chakra's columns on the page, the symbol's description and usage, and the intentions all readable at once, with the intentions auto-scrolling at a rate that finishes with the timer; the symbol and its information updating in place | **Done** (phase 8, landed 2026-09-19). The screen is three regions — a fixed meditation panel that heads itself with the meditation over its **type** and carries the Display's own columns (the ask below), a symbol panel that updates in place, and one intentions column that is the only thing on the page that scrolls. The rate is content ÷ the stage's remaining time, and the reader's `prefers-reduced-motion` starts it off with their own switch as the way back. |

Round notes:

- **The Database's move was small and its plumbing was not.** The request from
the library used to be a prop; a route cannot take one, so it travels in the
address (`/database?mode=add&table=focus`). The first version read
`window.location.search` in a lazy `useState` initializer, which looked
equivalent and raced the navigation: it arrived empty, and on screen the grid
simply ignored the press. `useSearchParams()` is the one Next keeps correct at
render time.
- **`check` does not run `next build`.** The `Suspense` boundary that
`useSearchParams` needs is invisible to typecheck, lint and the e2e suite, all of
which boot `next dev`. It is the second time this class of mistake has cost a
round, and it is why the phase gate is `check:full`.
- **A real papercut came out of an e2e assertion that had been passing for the
wrong reason.** The old Escape test ended by asserting the Database tab was
visible — true whether or not `Escape` had done anything. With a route to leave,
the same test showed that a reader whose cursor sat in a grid cell could never
leave the screen with `Escape`: cancelling a cell left its input focused for
good. Cancelling now releases the keyboard, and a ref keeps the blur from
committing the text the press just threw away.
- **Grep for a label, do not trust the file you have in mind.** Three specs
clicked `Database` in the library's tab strip; two were obvious and the third
(`run.spec.ts`) only appeared under a grep.
- **Two flakes showed up and both were pre-existing behaviour**, not new
failures: the `/plan` boot expiring a 15s `expect` under a loaded machine, and
the Escape test above. The full gate then ran 67 e2e tests with no flakes.

---

## 2026-09-19 — the library's missing tabs (commit `d4aa214`)

**The owner's report, verbatim:** *"I noticed that the chakras and points aren't
there in the currently deployed meditaur's library. Is this an oversight? can you
investigate?"*

**It was neither an oversight nor a missing feature.** The rows existed and were
correctly typed. The four `meditationTypes` rows had been written without a
workspace, so no read could see them — an invisible row fails nothing: no error, no
compile failure, no failing test.

- **The cause.** v17 seeded the types as `{ ...seeded, sortOrder, archivedAt,
  revision, updatedAt }`, and `SEEDED_MEDITATION_TYPES` holds only `{ id, name }`,
  so `workspaceId` was never written. Every read scopes by it
  (`db.meditationTypes.where("workspaceId").equals(workspaceId)`), and a row with no
  key in the index is never returned. `liveTypes([])` is empty, so the tab strip
  emitted only the fixed tabs and fell through to `Symbols` — which is exactly what
  the deployed app looked like.
- **Who was hit.** Only devices that existed *before* round 15: every reader who
  had already opened the app, and the deployed beta. The seed
  (`buildDefaultWorkspace`) sets the field, so a device that arrived afterwards was
  always correct. That is also why the suite was green — every test runs a fresh
  database, so only the seed path is ever exercised, and `library.spec.ts` asserts
  `libraryTab(page, "Chakras")` and passes.
- **How it was pinned down.** Read out of the live deployment rather than inferred
  from the code: IndexedDB at v17, four `meditationTypes` rows all with
  `workspaceId === undefined`, and ten `focusPoints` correctly scoped and typed (7
  chakra, 2 point, 1 protection). The meditations were never in doubt.
- **The fix, and why it is a new version.** `d4aa214` adds Dexie v19, which repairs
  the scope; the rule itself lives in a pure function
  (`packages/db/src/meditation-type-scope.ts`), so it is testable without IndexedDB,
  which the unit suite has none of. v17 is deliberately **not** edited: it has
  already run on every affected device and Dexie does not re-run a version, so a
  change there would repair nobody. The repair is a no-op on a correct device and
  keeps the name, the order and the archive a reader set.
- **The gap that let it through, and its guard.**
  `tests/unit/db/meditation-type-scope.test.ts` covers both the rule and the wiring
  that calls it, on purpose as source text, because the failure mode was an
  *omission*. It has teeth: disabling either half fails three of its six cases.
- **One known hole left open.** `tests/unit/application/memory-ports.ts` still
  ignores its `workspaceId` argument (`listMeditationTypes(_workspaceId)`), so an
  app-level test cannot catch a scoping mistake. That file belongs to the other
  session's in-flight port work, so it was left alone rather than edited from here.
- **A second hazard met while landing it.** The other session had P4 in flight in
  the same tree, and by the time this was ready `packages/db/src/schema.ts` held
  hunks from both of us — one of their lines in `focusDefaults` beside the v19
  block. Only this change's content was staged (`git hash-object -w` +
  `update-index`); their hunk is still in the worktree, untouched. The gate could
  not run in the shared tree either, because their P4 was typecheck-red, so it ran
  in a scratch worktree of `af5165c` plus these three files: 39 files, 283 tests,
  green.
- **And the same hazard got through once — on the one file that looked safe.**
  `d4aa214` was pushed with `packages/db/src/meditation-type-scope.ts` carrying four
  lines of the other session's: an import of `copyStages`, and
  `stages: copyStages(row?.stages ?? seeded.stages)` in the row it builds — their P4
  making `stages` required on `MeditationType`. `copyStages` does not exist at that
  commit, so `main` failed `pnpm check` and **CI and the deploy both went red**; the
  repair did not reach production until `69171b6`. The two *new* files were staged
  with a plain `git add`, which takes the working-tree content — the copy verified in
  the worktree was taken at 12:12 and their four lines landed before the 12:15 add.
  **An untracked file is not an untouched one.** The blob technique used for the
  shared `schema.ts` was not applied to the new files because they were new, which
  was exactly the wrong reason to trust them.
- **The end-to-end proof, in production.** The deployed library was reloaded in the
  same browser and origin that had shown no type tabs at all: its store went from
  v17 with four `workspaceId: undefined` rows to **Dexie 19** with all four scoped,
  and the strip went from `Symbols, Archive, …` to
  **`Chakras, Points, Protection, Thanks Giving`** ahead of them. That is the
  upgrade path running for real, on real data — the one thing a fresh-database suite
  can never exercise. The two surfaces the report named were then checked one by
  one: the `Points` tab lists `Liver` and `Kidneys` (each labelled `Points · …`,
  with its row count), and `/plan`'s tile groups read **`Chakras`, `Points`,
  `Protection`** again, and `/database`'s table switcher reads the same four ahead
  of `Entries`, `Symbols`, `Presets` and `Types`. Nothing needed a repair by hand —
  the upgrade did it on the reader's own store.

---

## 2026-09-20 — round 16: intentions, Karuna, and a session screen that arranges itself (commits `a232615`, `c2a7969`)

The owner's sixteenth round was ten asks in one message, and it ended with *"Ask
clarifying questions and we can take it from there"* — so it opened with two rounds
of questions and then a plan, and every answer is binding: §2 of
`INTENTIONS_AND_SESSION_PLAN.md` (retired 2026-09-21, kept at `a95ed35`). Its §13
records
the eleven places the build had to give, and §14 what is still the owner's.

| # | The ask | What happened |
| --- | --- | --- |
| 0 | The session screen wastes space: **intentions and the symbol should take the most room, and the chakra block goes** — its name is already at the top | **Done** (`c2a7969`, P1). The screen is now a list of **regions** (`session-regions.ts`) and the meditation panel is gone; the meditation's own Display columns stay, in a top strip, and are *not drawn at all* when none of them has a value. |
| 0.1 | Affirmations that were in the Protection table show as *"Nothing at this stage"* | **Done** (`d753127`, P2) — and it was a model defect, not a display one: a block read **every affirmation in the workspace**, so Protection's stage read an empty table while its sentence had always been a line on a Protection × Zonar row. A block now reads its own meditation's sentences. |
| 0.2 | Put the binaural switch in the stage's **name** | **Done** (P1): a `♪` mark in the label that *is* the switch, quiet and unpressable where the kind cannot carry tones (an intentions stage is silent, and that is information). |
| 1 | Move **auto-scroll next to alarm**; nothing that will not scroll should sit beside the intentions | **Done** (P1): the footer carries Alarm, Auto-scroll and Auto-advance, and the scroll latch is drawn **only for a kind that is read** — the plan's §13.4 records that this means intentions *and* affirmations, because a Thanks Giving stage is the one that most needs it. |
| 2 | Thanks Giving will never have symbols | **Done** (P1), and generalised on the owner's instruction: a region with nothing to show is not drawn and **frees its room**, so Thanks Giving has no rail and no gap. `tests/e2e/run.spec.ts` measures the intentions starting at the screen's own edge. |
| 3 | Arrange the stages **horizontally** with their timers | **Done** (P1): `StageStrip`, one row, before Start and during the run, with the active stage marked. |
| 4 | Intentions take the largest space, with **table-like borders** between them | **Done** (P1): the column is a real `<table>` — one `<tbody>` per symbol, its name in a left column spanning its lines, a hairline under every line. |
| 5 | Protection and Thanks Giving lose their headings; club them into **Other meditation blocks** | **Done** (`a232615`, P6): the headings are Chakras, Points and Other meditation blocks, the last folding in every other live type. The owner's answer also settled the wording: Points keeps its own heading. |
| 6 | Name must be **anchored**; the Binaural column needs only its toggle; a text box is drawn **over** `Tune` | **Done** (`a232615`, P5), and both defects were in the code: the pinned cell was the *controls* cell rather than the name, and `HEAD_LEAD` had no fill where `BODY_LEAD` has `bg-inherit` — a transparent sticky cell at `z-20`, which is the text box the owner saw. `Tune` moved beside `Default sound`. |
| 7 | Volume is **0–10**, not decimal points | **Done** (P6): whole steps, and the stored value is untouched — `0.7` reads as `7` and a press writes `0.8`. |
| 8 | The session page should be able to **arrange itself** as more data arrives | **Done** (`c2a7969`): a region declares its slot and whether it has anything to say, and a new column becomes a region descriptor rather than new JSX. |
| 9 | The Affirmations tab is empty and its use unclear: one place for every sentence **with what it is associated with**, edits flowing both ways | **Done** (`d753127` + P4): an affirmation and an intention are **one table** — a sentence, optionally written about a pair — so the tab is a view over every sentence with an `Associated with` cell, and a chakra's own table gained an `Intentions` cell for its symbol-less ones. |
| 10 | Entries becomes **Karuna**: the chakra is the table's heading, symbols and intentions its columns; symbols get a reiki feature flag | **Done** (`a232615`, P3 + P7). Karuna's selector is a searchable auto-complete over the meditations that have a symbol-carrying row; with it empty every table is stacked under a sticky heading. The four new symbols landed with their systems, all flags true. |

Round notes:

- **The round's own tests found two defects the reading did not.** A sentence
written about a symbol and *no* meditation collapsed the whole Karuna stack to that
one heading with no way back — "no filter" and the `No meditation` heading were both
`null`. And `tests/e2e/database.spec.ts`'s row lookup had been matching **zero** rows
since before this round (`filter({ has })`'s inner locator is queried *inside* the
row), which is why an affirmation test waited ninety seconds instead of failing.
- **The e2e image bakes the sources, and that cost an hour.** `docker compose … run
--no-deps e2e` without a preceding `compose build` silently tests the **previous**
commit: a suite reported 11 passed for a file that held 13 tests, and the four it was
not running had real failures. The tell is the **test count**; the memory file said
this already, and it is now in the plan's §12 too.
- **One guarantee was traded away and it is written down rather than dropped.** The
e2e test that cleared the **meditation** half of a sentence's association cannot
exist in Karuna any more (the meditation is the heading), so it clears the symbol
half instead; the meditation half is still clearable in the Affirmations table
(`[data-association="meditation"]`) and that gesture has no test. Plan §13.9.
- **`Symbol.reikiSystem` is optional rather than required**: a reader's own symbol
names no system, and the flag treats that as never-hidden, so a flag they cannot see
can never turn off a row they made. Making it required is a two-line follow-up in
`apps/web`. Plan §13.7.
- **A file the plan named has never existed.** §6 pointed at
`20260919120000_catalog_order.sql` as the catalogue's SQL mirror; no such path is on
any ref. This round wrote the first real one. Plan §13.1.
- The gate: `./scripts/meditaur check:full` — 45 unit files / **356 tests**, the hosted
live suite (11 passed, 2 local-only skips) and the local one (13), the production
build, and the e2e suite at **76 passed with 3 flaky**: two `/plan` boots and one
assertion whose session closed under a loaded machine, all three of which passed on
their retry. The flakes are the known cold-boot class, not new failures — they are
the reason the suite's first `/run/<id>` waits on a 60s budget rather than the 15s
`expect` default.

---

## 2026-09-21 — round 17: the session's clock, the plan card, and the grid's view (commits `ec6e67f`, `1d350c5`, `bdd8d68`)

The owner's seventeenth round was fourteen asks in one message, and one of them
arrived after the questions were answered. Five were put back as questions before
anything was built — what the Thanksgiving alarm should do, what a `symbols` stage
should show, what "consistent" auto-scroll means, what `←` `←←` `←←←` do to a
running clock, and what shape the block editor takes — and the answers are binding,
quoted below where they settled something the ask left open.

| # | The ask | What happened |
| --- | --- | --- |
| 1 | *"the timers for symbols and focus cannot be updated"* | **Done**, by the two asks that turned out to be about it. On the **session** screen only the stage on screen was ever editable, which is what item 2 asks for anyway; on the **plan** screen the answer is item 13's editor, where every stage's wheels are editable at any time (`1d350c5`). `tests/e2e/plans.spec.ts` types a length into the editor's wheels and reads it back. |
| 2 | *"rather than the timer on top of the page, I would want to see the actual wheels for the 3 stages decrementing automatically (once the session starts, these can become read-only … and display the decreasing time in the same place)"* | **Done** (`ec6e67f`). The header's clock is gone; each stage's wheel shows what that stage has left — nothing for the stages walked, the remainder for the one on screen, its own length for the ones to come — and `TimeWheels` grew a `readOnly` mode on the wheel's own geometry, so nothing moves when the session starts. |
| 3 | *"a restart button for each of the stages (a small button below the binaural beats button at each stage) … Another restart button for the entire meditation"* | **Done** (`ec6e67f`): `↺` under each stage's mark, and one `↺ Restart` beside the strip for the whole meditation. Both are `engine.seek`, which is what a restart is — back to the set length, holding, waiting for Start. |
| 4 | *"The symbol stage doesn't need to show me the intentions, only symbols"* — and, answered: *"Symbols for the meditation all shown as icons (only names if images are not available, images if they are available). They should be shown in the main region only instead of the intentions"* | **Done** (`ec6e67f`): a `symbols` stage's main region is a sheet of the block's symbols. `sessionRegions` now takes the stage's kind, so the main slot holds the stage's content rather than always the intentions column. |
| 5 | *"Chakra details are no-where to be seen on the entire page, we had decided to show both the chakra details and the symbol details"* | **Done**, and the cause is worth keeping: nothing had been removed. `factsFor` emits a fact per **shown** column and `DEFAULT_PLAN_DISPLAY` hid the meditation's only builtin one, so a chakra compiled to an empty region and `sessionRegions` correctly declined to draw a box with nothing in it. `Location` is shown by default now, and v25 hands a plan still carrying the old default the new one. |
| 6 | *"Some chakra sessions have auto-scroll and some don't (some which don't have enough intentions still have auto-scroll), we need this to be consistent"* — answered: **every** intentions/affirmations stage defaults to auto-scroll on | **Done** (`ec6e67f`). The flag is stored **per stage**, so a plan written by a build that defaulted it to `false` kept that for ever while a plan made today started from the kind's own answer — which is exactly the inconsistency seen. `withAutoScroll` derives it from the kind, and Dexie v25 runs it once over every stored stage. |
| 7 | *"When the scroll ends … the symbol details stop updating completely, it should be updated with time even though the scrolling stops"* | **Done** (`ec6e67f`): `stage-progress.ts`. The panel followed `scrollTop` alone, so a column whose lines fit the card — which never scrolls at all — froze on the first symbol for the whole stage. The column now reports whether it has anywhere left to travel, and the clock takes over when it does not. |
| 8 | *"card on the plan screen for thanksgiving still has symbols - All, the thanks giving session has alarm on, noone asked for an alarm-on on this screen, it always was an alarm - off here"* — and, answered: *"the card entry for symbol needs to go. As for the alarm, on the session screen for thanksgiving, the alarm is ON"* | **Done** (`ec6e67f`, `1d350c5`). A meditation with no symbols gets **no** Symbol control — the rule is one helper, `symbolsForMeditation`, asked both by the picker and by whether to draw the control. And the alarm now defaults **off** at every layer that decides what a new thing starts with, which reverses §12.21's default; see [DECISIONS.md](./DECISIONS.md). Dexie v25 corrects the two rows the app itself wrote — the seeded preference and the seeded plan — and leaves a plan the reader made alone. |
| 9 | *"pressing '→' once should take the user to the next stage, and pressing it twice in 2 seconds should take you to the next meditation. '←' … once will reset the stage timer, twice … previous stage and … thrice … previous meditation in the circuit. Don't start the meditation though"* — answered: *"Jump to the previous block's first stage and hold until start is pressed. Not paused at all, clock should be cleared … If arrow keys are pressed, don't start the session automatically"* | **Done** (`ec6e67f`). One `engine.seek` serves all of it: the press lands on a stage at **its own** length, clears the clock and holds — `loaded`, never `paused`, because a pause remembers a remainder and this is the one move that must forget it. Where a key has nowhere to go nothing happens: wrapping a reader into a block they did not ask for is worse than no answer. |
| 10 | *"there is no need for text in the binaural column's cells, only the toggle button is enough"* | **Done** (`bdd8d68`): `LatchButton` grew `labelHidden`, which moves the name to `aria-label` rather than dropping it, so what a screen reader announces is unchanged. |
| 11 | *"Add filter functionality to all the tabs in the database based on the key … Columns should be able to be removed (Add an edit table button which should enable x button next to every column heading …)"* | **Done** (`bdd8d68`). The filter matches a row's **key** — a record's name, a sentence's words, a pair's meditation and symbol — applied where each table reads its rows, so no table can be left out. `Edit table` puts an `×` on every heading, and the press takes the column out of the **view** and not the store, which is why it is safe on a builtin and why it is a session preference rather than a draft edit. |
| 12 | *"There is no filter functionality in Karuna table in database"* | **Done** (`bdd8d68`). It was the one tab with no way to narrow it and the one whose rows grow without bound. A heading goes once nothing under it matches, and a heading the filter *names* is kept whole. |
| 13 | *"The cards in the plan need to be better functional … it doesn't even visibly show the chakra name clearly … Whatever is meditation specific — symbols, ambient, alarm, binaural, stages of meditation etc, all should be updatable for that particular meditation … by clicking on the card. The display menu at the bottom should be per-meditation block as well."* | **Done** (`1d350c5`). The card is a handle again — the meditation over its type, `Remove`, and one press that opens that meditation's editor, in the app's editor shape. `PlanBlock` gained `alarmEnabled` and `display`, both `null` for "the plan's answer", so a plan nobody has edited behaves exactly as it did and a session holds one meditation's columns and one meditation's alarm. The Display panel is gone from the foot of the plan screen. |
| 14 | *(after the questions)* — *"When the session screen is displayed but the session is not yet started, clicking on the stage highlights it, and should be able to press Space or Start button to start from that stage onwards. If auto-advance is true, it automatically advances to the next stage (and the next meditation automatically)"* | **Done** (`ec6e67f`). The stage's own name is a button; the press seeks, which highlights it and holds the session there, and `start()` begins where the reader put it. `beginStage` takes an `enteringBlock` flag, because a block entered in the middle has no boundary above it and the tones were otherwise never set. |

Round notes:

- **Item 8's clarification and item 2's are the same sentence about defaults.** Both
  describe a value the app hands a reader who has said nothing, and both were being
  answered by *three* layers that each had to agree — the preference, the seed and
  the fallback. The alarm's three all said `true`; a repair that only changed one of
  them would have left the owner looking at the same switch.
- **Two stored values were wrong and only a later Dexie version could fix them.**
  `autoScroll` and the alarm were written into the reader's data by the app, and a
  device that has run a version never runs it again — so v25 repairs them, and only
  where the app is the author: `withAutoScroll` derives the flag from its kind, the
  alarm is corrected on the two rows the app seeded, and a plan the reader arranged
  keeps its display (`isAppDefaultDisplay` is the gate). Every rule is a pure
  function with its own unit test, because IndexedDB does not exist in the unit
  suite.
- **The whole `/run` screen was dead and every unit test was green.** A `useMemo` was
  added *after* `Runner`'s early return, so the hook count changed between the first
  render and the second and React threw — typecheck, lint and 378 unit tests all
  passed, and the run screen offered no `Start` at all. The e2e suite found it in the
  first ten seconds, which is the argument for the suite being the definition of done
  rather than a formality. The hook moved above the return.
- **A `null` default is what kept this round from rewriting nine blocks.** Both new
  `PlanBlock` fields mean "ask my owner", so nothing is copied into a block, no
  stored plan changes shape, and the first change in the editor is what gives a
  block an answer of its own.
- **The editor's alarm fallback was a literal until a test read it.** `block.alarmEnabled
  ?? true` looked harmless and was wrong the moment the plan's own switch was on: the
  switch would have shown *off* for a plan whose alarm rings. It takes the plan's value
  now, and `tests/e2e/plans.spec.ts` asserts the name says which answer it is showing.
- **The gate:** `./scripts/meditaur check:full` — 47 unit files / **378 tests**, both
  live databases, the production build, and the e2e suite. The suite grew to **82
tests** with five guards for this round; its last two runs were **81 passed with one
  retry** (`database.spec.ts`'s drag test, on a machine that was also running the
  suite's own build — the known loaded-machine class, green on the retry) and a clean
  79 before the new tests landed. No migration was needed: a plan and the grid's view
  are Dexie-and-`sessionStorage` only, so `./scripts/meditaur cloud` has nothing new
  to push and the 31 migrations on the hosted project stay as they are.

---

| Round 17, item 13 | **The plan's own `Display` is no longer editable.** The panel moved onto each meditation, so `Plan.display` is now only the answer a block that has never been asked inherits — the same shape `UserPreferences.alarmEnabled` has for a new plan. **Round 18 narrowed this**: a block whose Display has been changed can hand itself back with `Use the plan's Display`, which is the same action the `Alarm` section carries. Nothing in the UI writes the plan's own display, though, so a reader who wants one Display for the whole circuit still has to change each block. | Owner's call: leave it as the default a block inherits, or give the plan screen a panel again that writes the default every block without its own copy still takes. |
| Round 17, items 11–12 | **The Database's filter matches a row's *key* and nothing else.** "Add filter functionality to all the tabs in the database based on the key" was read literally: a record's name, a sentence's text, a Karuna row's pair. A cell's value is not searched, and two words are one string rather than two terms. | Owner's call, once the store has grown past its seeded size. Widening it is a change to `DatabaseTable`'s three row sources and nothing else. |
| Round 17, item 2 | **A stage's length is editable in the meditation's editor and on the run screen before Start, and nowhere once it is running.** That is the ask (*"once the session starts, these can become read-only"*), and it is also the one place round 5's *"a block whose length can be set before and during a run"* is now narrower than it was. | Owner's confirmation. A reader who wants more time mid-session stops, edits, and starts again. |

## 2026-09-21 — round 18: the plan card and its Display, rebuilt (commit `7842050`)

The owner's eighteenth round was two sentences, and the first one was a question put
back before anything was built: *"the display section in the card is absolutely
shabby. Can you bring it up to the spec."* "The card" could have meant the card in the
plan strip or the editor it opens, and the answer widened the ask rather than
narrowing it: *"it is the card itself, along with what it opens, there should be more
beautiful way to represent that information. Smaller buttons, more well-placed and
easy to operate. The details section shouldn't be that collapsed hedious thing it is
today."*

| # | The ask | What happened |
| --- | --- | --- |
| 1 | *"the display section in the card is absolutely shabby … bring it up to the spec"* — answered: *"it is the card itself, along with what it opens … The details section shouldn't be that collapsed hedious thing it is today."* | **Done** (`7842050`). The Display is an `EditorSection` like every other one — always open, and the app's last `<details>` is gone — and its body is a grid: a band per table, then a row per column with the column's name and two switches under the `Shown` and `Pin` headings that name them. The card is the handle, one caption line, and a `sm` row on its foot (`Edit`, the armed `Remove`); everything else on it is the press that opens the editor. |

Round notes:

- **A disclosure hides more than its content: it hid a defect in the tests.** The old
  panel drew `Meditation` and `Symbol` as group headings *while* the editor drew them
  as its section headings, and no guard ever noticed — a closed `<details>`'s children
  are out of the accessibility tree, so `getByRole("heading", {name})` found one of
  each. Opening the Display up made the two collide and the suite failed on it in the
  first run. The guard names a level now, and the two are allowed to share a word: one
  is the editor's section, the other is the table a column belongs to.
- **The words the cells drop are the words a screen reader hears.** A row is a name
  and two switches, and repeating `Shown`/`Hidden` and `Pin`/`Pinned` beside every
  column was the same sentence twice. So the cells are `labelHidden` and carry
  `<group> <column> shown|pinned` — the group is in the label because two tables each
  have a `Name` column and a switch's accessible name has to be unique.
- **A caption, not a picker.** The card's line was built with the sound in it first,
  and looking at it in a browser showed `9m · All symbols · Solfeggio Third-Eye 852/8`
  cut off mid-name — round 17's exact complaint about the old card. It names only what
  fits the fixed 234px: length, stages, symbol. The sound is one press away.
- **The press needed a target that a keyboard can reach.** The card's press-anywhere
  action is an `absolute inset-0` button painted under the handle and the action row,
  both `relative`; a click handler on the container would have given the card no
  labelled default action at all, which is why `CatalogCard` is built the same way.
- The gate: `./scripts/meditaur check:full` — 50 unit files / **391 tests**, the hosted
  live suite (13 passed, 2 local-only skips) and the local one (13 passed, 2 skipped),
  the production build, and the e2e suite at **83 passed, 0 flaky** in 2.5 minutes. CI,
  `deploy` and the `e2e` workflow are green on `7842050`.

---

| Round 18, item 1 | **The card's one line is length · stages · symbol, and nothing else.** The sound is not on it, and neither is the alarm. A card is a fixed 234px and its only line has to survive a preset called `Solfeggio Third-Eye 852/8` without truncating, which is what round 17 objected to. | Owner's call, if the sound belongs there anyway — the line is one function (`blockSummary`) and the width is the only constraint. |

## 2026-09-21 — round 19: the session's clock and chrome, and the two editors (commits `1de1724`, `6ed08dd`, `23d1aeb`)

The owner's nineteenth round was two messages: five fixes to the session screen and
three to the plan screen and the editor a card opens. Four questions went back before
anything was built — what "make them horizontal" should change, how much control over
stages the carousel gives, what to call the session's three latches, and whether the
seconds wheel wraps everywhere — and the answers are in
[DECISIONS.md](./DECISIONS.md).

| # | The ask | What happened |
| --- | --- | --- |
| 1 | *"the timers' seconds should wrap around, after 59, it should again become 0, minute wheel stays the same"* | **Done** (`1de1724`). A wrapping column draws one value beyond each end of its range, so from `59` the next row down is `0` and above `0` sits `59`; the seam is why its canonical offset is one row further down than a plain wheel's. It carries nothing, a typed `90` in a column of sixty lands on `30`, and the minutes column is untouched. Every seconds wheel in the app wraps. Unit-tested in `tests/unit/web/time-wheel.test.ts`, plus an e2e case in `plans.spec.ts`. |
| 2 | *"make them horizontal so that they can stay in the top part of the screen"* — answered: the point is the card's **height**, and the wheels stay as they are | **Done** (`6ed08dd`). The mark, the stage's name, its own `↺` and the wheels are one line; the captions are off inside the strip. A card is now its wheel window plus padding — measured by the new e2e guard at under 140px, against ~190px before. |
| 3 | *"the restart button for whole meditation restart is for the complete meditation, so it stays on the bottom"* | **Done** (`6ed08dd`). The strip's `↺ Restart` is gone; the whole meditation's restart is the fourth transport square in the footer, drawn whenever `engine.seek` can act and hidden while the alarm holds. |
| 4 | *"all the instructions that you have coded at the bottom are taking up more space than I can offer, only retain Esc and Space"* | **Done** (`6ed08dd`). `runHints` is those two; the arrow keys still step a stage and a meditation, they are simply not advertised. A guard counts the two caps. |
| 5 | *"the alarm, auto-scroll, auto-advance buttons need to be of the same size, smaller, give them smaller names"* | **Done** (`6ed08dd`): `sm` latches named `Alarm`, `Scroll`, `Advance`, in one `gap-2` row rather than three stretching cells. |
| 6 | *"make pause-skip-stop buttons all of same size, no text only symbols … restart should be just the circular arrow besides these buttons"* | **Done** (`6ed08dd`): `Button` gained `iconOnly` (square, unpadded, 64px at `xl`), and all four are that square. The guard measures all four boxes and asserts one shape. |
| 7 | *"The edit page has long bars with a single button each, it is very shabby — clean it up"* + the stages-as-carousel, `Add stage`, and "alarm doesn't need to be this big bar"; *"The detail display is fine"* | **Done** (`23d1aeb`). The stages are a carousel of cards (drag to reorder, armed `Remove`, one stage minimum), `Add stage` sits at the end of that strip and asks which kind, the `FieldButton`s are 44px rows with Sound's two side by side, and the Alarm switch sits on its section's heading line with its name still saying which answer it shows. Meditation/Symbol/Display untouched. |
| 7 (first sentence) | *"Plan screen now allows cards to be clicked on. After clicking - it opens the edit page."* | **Already true** (`7842050`, round 18): the card's press-anywhere target opens that meditation's editor. Nothing to build. |
| 8 | *"settings on the plan page don't need big bars for single settings, make them compact and better usable"* | **Done** (`23d1aeb`). The five stacked bars are one bordered strip shaped like the plan tools above them: `Stepper size="sm"` and four `sm` latches. |

Round notes:

- **A `className` cannot override a size class.** The transport squares needed a shape
  `Button` did not have, and the first attempt was to pass `px-0 w-[64px]` through
  `className`: both classes are the same utility, so which one wins is decided by the
  order Tailwind emits them, not by the order they are written. `iconOnly` puts the
  strings in the component, and they are pinned in `ui-package-classes.ts` with the
  rest.
- **The wheel's own test named the wrong row and the code was right.** 59 rests at row
  60 of a 62-row column, so the seam is row 61 — the trailing `0` — and the first
  assertion wrote `60 * 36`. Two red tests, corrected in the test, not in the geometry.
- **Nothing about the wrap is visible in the band.** The column normalises onto the
  canonical row at rest (the same write that makes it land on a digit), and the digits
  at both positions are identical, so the only thing that can differ for a frame is one
  faded neighbour row.
- The gate: `./scripts/meditaur check` at the tip — typecheck and lint clean, and the
  unit suite green apart from one test the other session had landed uncommitted in the
  shared tree (`tests/unit/architecture/sync-marks.test.ts`, with its own migration).
  `tests/e2e/run.spec.ts` 16 passed / 0 flaky and `tests/e2e/plans.spec.ts` 18 passed /
  0 flaky, both against a freshly built image.

---

## 2026-09-22 — the account's flags, the panel, and a hand-run reset (commit `07b3c67`)

The owner came with two things: the feature flags first asked for in round 16 —
per account, and set from an admin panel — and a decision that settles the reset
question this log has carried since the accounts round. Both were answered before
anything was built, and the plan is [ACCOUNT_FLAGS_PLAN.md](./ACCOUNT_FLAGS_PLAN.md),
behind the register's `P0 · 23`, `P0 · 35` and `P1 · 36`.

| # | The ask | What happened |
| --- | --- | --- |
| 1 | *"I had asked that some feature flags be created that could be enabled for account management and an admin panel as well."* | **Queued, and unparked** — `P0 · 23` ([DECISIONS.md](./DECISIONS.md) §11). The flags become per account and the panel their only writer, and the answer to "where they live" was delegated: a new `account_flags` row with a self-select policy and **no** self-write policy, written through a service-role Edge Function. That is the reason round 16 parked this inverted — a preference would have had no writer. |
| 2 | The flag set: *"a regular usui-reiki feature flag which enables hon-sha-ze-sho-nen, sei-hei-ki and cho-ku-rei, then a usui-master ff which enables the dai-kyo-mo and a karuna-reiki feature flag which enables the gnosa, iawa, shanti, kriya, halu and zonar … chakras should also be on their own FF (default enabled everywhere), binaural beats as their own FF (also enabled by default), auto-scroll should be its own feature flag etc."* | **Queued** — eight flags, every default true, so a device with no cloud or no row behaves as today. The three reiki names are the `ReikiSystem` values the domain already has, so the flags add no second vocabulary, and `ENABLED_REIKI_SYSTEMS` retires — which is what finally gives `DECISIONS.md` §4's Karuna gate a caller. |
| 3 | *"Account management is off … the app should feel like a demo, no account references are active, data is not stored in our database, only the default plan/start section is enabled"* — put back as a question, because it is a different gate | **Answered, and not taken.** The owner chose the narrower reading: `account_management` is the account surfaces (sign-in, sign-up, the account half of the Account screen), and the app is otherwise complete and local-first. No demo tier, and no second flag. |
| 4 | *"I have decided that the password reset is going to be manual, so that no mailer integration is going to be required (at least for the beta)"* — and, asked what the app should say: *"One sentence on the sign-in screen"* | **Queued** — `P1 · 36`. The four documents that assert a mailer is needed are corrected in the same pass, HISTORY.md's crosswalk closes the retired label, and item 6 keeps only the address change. |
| 5 | *"I want the feature flags to be enabled per account … For every account that I create, The page should have these feature flags, i'll enable the ones that I deem fit for the user"*, and who may administer: *"An `admin` marker in the database"*, *"The panel can create accounts"*, *"The panel can reset a password"* | **Answered** — an `is_admin` column set once by a documented statement, the panel behind it, and `create-account` and `set-password` as its first actions. The env-allowlist option was offered and not taken. |
| 6 | A flag's effect, asked as a choice: hide the surfaces and keep the data, or refuse to run what is hidden | **Answered** — hide the surfaces, keep every stored row, and a plan made while a feature was on still runs. Flags are product gates, not security boundaries; the table's policies and the function's admin check are the only real ones. |

Round notes:

- **A register row landed before the document it points at.** The other session's
  `f0c87c7` swept the new rows into its own commit while this plan was being written,
  so `main` briefly linked a file that did not exist and the docs-link guard was red
  on that commit. `07b3c67` landed the file. On a shared tree a row and the document
  behind it belong in the same commit.
- **The plan's order of work is subpoints, not a phase family.** Round 15's and round
  16's `P1`–`P8` labels are exactly what the identifier guard bans now, so the plan
  says `23a` … `23h` and `35a` … `35g`.
- **The new document is scanned by the guard.** `tests/unit/architecture/item-ids.test.ts`
  reads a plan document while it is live, so this one cannot invent identifiers of
  its own; `./scripts/meditaur check` is green with it in the list (57 files, 435 tests).
- **One thing about `binaural` is still open**, and sits in the plan's own "to
  confirm" list: with the flag off, are the tones silent, or is a stored plan still
  audible?

---

## Still open from the reviews

Named here so a later round does not have to remember them. Nothing here is on a
phase's critical path; the `H1`–`H6` work this round opened is tracked in
[ROADMAP.md](./ROADMAP.md), and the rows below are the parts of it that need the
owner rather than an agent.

| From | Item | Where it goes |
| --- | --- | --- |
| Round 16, item 10 | **The admin panel, the flags' real home, and what `usui_reiki` / `reiki_master` gate.** Both are `true` today by the owner's answer — *"it should default to true until the admin-panel is ready"* — so the enabled set is a domain constant and a preference with no writer was deliberately not added. The four new symbols also came with empty Description and Usage, which the owner said they would fill in the Database. | The owner's, entirely: the panel is *"more on that later"*, and it decides whether the flags are owner-scoped or account-scoped. Plan §6 and §14. **UNPARKED 2026-09-22** — answered: per account, with the panel as the only writer (`P0 · 23`, `P0 · 35`; [DECISIONS.md](./DECISIONS.md) §11, [ACCOUNT_FLAGS_PLAN.md](./ACCOUNT_FLAGS_PLAN.md)). The Karuna gate this row names is the plan's `35c`, and the four symbols' empty Description and Usage stay the owner's to fill in the Database. |
| Round 16, item 10 | **Karuna's selector, as built, is the general rule**: every live meditation with at least one symbol-carrying row, so Protection (whose seeded Zonar sentence is one) has a table instead of no home. The owner's words were *"chakra … with points-scoped as well"*. | Owner's confirmation. Narrowing it to chakras and points would leave Protection's sentence visible only in the Affirmations tab. Plan §13.5. |
| Round 16, item 9 | **A symbol with no meditation is a heading no selector can name.** Those sentences draw under `No meditation` at the foot of Karuna's stack, and the heading is deliberately not an option (it has no id, and `null` already means "no filter"). | Owner's call: if they want that heading selectable, it needs an id of its own rather than a shared `null`. Plan §13.6. |
| Round 3, library item 1 | **A table view for the card-only tabs.** The `Table` switch is hidden on them, because there is no table to switch to. | Deferred by the owner's answer ("make it visible only on the tabs that support the table view"). The Database build narrowed the list: `Fields` and `Views` are gone, so the card-only tabs are now `Audio files`, `Presets`, `Plans` and `History`. Each would need fixed columns plus a `CatalogDataTable` row list. |
| Round 3, library item 4 | **Delete on the `History` cards.** No delete for a history entry anywhere in the app. | **Declined 2026-09-18:** *"History delete has no value to me. I don't want the history to be deleted."* History stays read-only: the log is the record of what was actually run, and nothing in the app may prune it. |
| Round 3, library item 4 | **Delete on the `Plans` cards.** Flagged when the card actions landed; not asked for. Deleting a plan lives in the planner (it refuses to remove the last one). | Owner's call — the `Plans` half of the row above, still unanswered. |
| This round, item 5 — now **`H2`** | **Password reset.** Sign-up exists and there is still no "I forgot my password" anywhere in the app. With confirm-email off there is also no verified address to send a link to, and the built-in mailer only reaches project team addresses — so the first reader who forgets is stuck until the owner resets them by hand in the dashboard. | **CLOSED 2026-09-22 — answered by the owner: manual, no mailer.** The sign-in screen carries one sentence and the owner sets a new password from the panel (`P1 · 36`, [DECISIONS.md](./DECISIONS.md) §11). No SMTP is allowlisted and no request/update routes are needed; what is left of the question is the address change, `P5 · 6`. |
| Round 8, item 1 | **The intention editor's `Associated with` still uses the full `md` tiles.** It is the same shape as `Kind` — a fixed few choices inside a form section — so it now looks unlike the one the owner asked to shrink. | **Answered by the Database build (2026-09-18):** there is no intention editor any more. A line is written inside an entry row, and what it is attached to *is* the row — its chakra and symbol chips. `AssociatedWith.tsx` is deleted, so the inconsistency went with it. |
| Round 8, item 3 | **The row a drag starts from keeps its press shrink.** Pressing the handle scales it to 95% for a moment (`active:scale-95`, the app's press feedback for every control). The owner was offered this, the live preview, and the settle, and chose only the settle. | Owner's call. Removing it would make the drag even quieter, but it is the one press state the rest of the app shares. Round 9 measured what is left of it: releasing the press moves the handle's own top edge by one pixel, the only movement a release test tolerates. |
| Accounts round, item 5 | **Read the hosted project's auth settings before the beta opens** — `mailer_autoconfirm`, `site_url`, `uri_allow_list`, `password_min_length`. Two reads of the same four values disagree (see the round's last note). | **CLOSED 2026-09-21 — read, and item 6 was right** (`P1 · 7` before it closed). The full set, not just the four: `mailer_autoconfirm: true`, `site_url` the Vercel address, the allow list carrying production, preview and localhost, `password_min_length: 8`, `disable_signup: false`, `jwt_exp: 3600`, email the **only** enabled provider, anonymous sign-ins, phone, CAPTCHA and passkeys all `false`. The values are in [ARCHITECTURE.md](./ARCHITECTURE.md#accounts), with the command that read them. **`H2`'s gate is unchanged** — the reset flow sends its own mail, so it still needs an allowlisted SMTP. **Superseded 2026-09-22:** the reset is by hand, so no SMTP is allowlisted (`P1 · 36`) |
| Round 11, `H1.3` | **The lock screen is still unverified, and now for a known reason.** No media controls appeared on the owner's Galaxy S26 Ultra in either run. Nothing in the app plays through an `<audio>` element, so the platform had no playback state to read and the effect never set one. It sets one now. | Owner's action: one more device run. The e2e stub proves the app makes the claim, not that Android listens and draws the controls. |
| Round 11, observed | **A finished session says "No block yet."** Not asked about — quoted by the owner as something seen, and left alone because it is true (there is no current block) and it was not this round's business. | Owner's call. If it reads as "not started", the completed state wants its own line rather than a placeholder's. |
| This round, `H5.1` | **What "everything you have on me" means.** The export is per-workspace and leaves out `userPreferences` (the only data that ever reaches a server) and snapshots. **Session history is no longer on this list** — `b9acd7d` put it in the export (`catalog-backup.ts`, `schemaVersion` 5). | Owner's call: make the export device-wide, and say whether preferences and snapshots belong in it. |
| This round, `H5.2` | **How the account is actually closed in the cloud.** The RPC half is straightforward, but deleting the `auth.users` row needs the service-role key, which by design never reaches the browser — so it needs an Edge Function: a new deploy surface, a new [DEPENDENCIES.md](./DEPENDENCIES.md) row, and an integrity-test allowance. | **ANSWERED 2026-09-17 (round 12): "delete it from everywhere and serve the app to the user again as if they have never been seen before."** The `auth.users` row goes, so an RPC alone cannot finish it and the deploy surface is part of the job. Still owed before any UI copy: whether the account deletion also runs the `H5.2a` device wipe. | **CLOSED 2026-09-21 — both halves landed** (`P1 · 5`, commit `e6ed084`). The Edge Function is `supabase/functions/close-account/` (its own deploy step in `scripts/cloud.sh`), and the answer to the wipe question is **yes**: closing erases this device too and the reader lands back first-run. See [DECISIONS.md](./DECISIONS.md) §6 and [HISTORY.md](./HISTORY.md) |
| This round, `H6.1` | **Vibration alarm — REMOVED 2026-09-17 (round 12).** "No need for vibration, skip it completely, remove it from the roadmap if it is still there." | Closed. Not to be built. Kept on record only because it was never the one-liner the review described: a new `UserPreferences` field means the domain type, a Dexie version, a SQL migration, the adapter's column list and a Settings row, all in lockstep. |
| 2026-09-18, the Database round | **A shared column order becomes a contention point** the moment this is a genuinely multi-person workspace. The owner's decision is that column order belongs to the table and only the *plan's* display setting is personal. | Not urgent where accounts currently are; revisit it with workspace sharing. Plan §17.3. |
| 2026-09-18, the Database round | **The plan's Display panel could show, not tell.** A live mini-preview beside the show/hide/pin list would make "what will I see in the session" visible rather than imagined. | Owner's call. **Not built, as the plan allowed**: the panel shipped as the grouped show/hide/pin list of §9, and the pin's session meaning — the fact sits in the box's sticky band with the name — is drawn in `Runner.tsx`. Plan §17.4. |
| 2026-09-18, the Database round | **Nothing filters, searches or bulk-acts as the store grows.** The Entries table and the Archive hold unbounded rows and were specified without either. | Expected fast-follow once the seeded 35 entries and 73 lines have grown a good deal past their starting size. Plan §17.6. |
| 2026-09-18, the merge round | **The `database-tab` branch is now redundant.** A squash merge does not mark a branch merged, so it will never appear in `git branch --merged main`, and it still points at `23734b3` while `main` is at `afd48d6`. | Owner's call: delete it. Nothing reads it — the public review mirror is built from `main`'s `git archive HEAD`, and the plan it implements is in the tree. |
| Owner's round 14 | **The record page still holds what the grid does not.** A chakra's `Description`, its custom fields and its duration live behind the row's `Open`. The rule that decided this is "a model field gets a built-in column, a custom field is a custom column" — and a custom field definition cannot simply be handed to the grid as a column, because a definition and a model field are indistinguishable by label. | Owner's call. Promoting one to a column needs a column *per field* rather than per definition, which is a real question about the grid rather than a piece of work. Until it is answered, the page is where a chakra's own fields live. |
| Owner's round 15, session item 1 | **The chakra's columns have to be visible on the session page.** Quoted: *"I still need the information about the chakra (its columns) be displayed on this sessions page, but there is no place for it, the current screen is already crowded. (I want you to do this, so record it somewhere so that you can get to it after we address the below overhaul problem)"* | **Closed 2026-09-19 — it landed in phase 8** of the round-15 work ([HISTORY.md](./HISTORY.md)), which is where the row said it would go. The overhaul made the room: `MeditationPanel` heads itself with the meditation over its type and draws the meditation's own Display columns (`meditationFacts`), and the symbol's columns are in the panel beside it, which is `SymbolPanel`'s `facts` + `entryFacts`. `tests/e2e/plans.spec.ts` reads them off the live screen and asserts they follow the plan's Display, so the promise is guarded rather than remembered. |
| This round, item 3 | **Three items from the suite audit are waiting on the owner.** (a) Serve e2e a production build instead of `next dev`: `check:full` already builds moments earlier, the duration override is a `sessionStorage` key that survives a production build, and it would remove both the warmup and the per-test dev boot — but it changes what the suite exercises, because the CSP is deliberately production-only today *because* e2e runs dev, and `ServiceWorkerSync` would start registering. (b) Shard the e2e job in CI, and stop `deploy.yml` re-running the `check` + `test:integration` that `ci.yml` has just run on another runner: more runners, half the wall clock, one red job per root cause instead of two. (c) Fold the cheap layout assertions together — three `plans.spec.ts` tests each boot `/plan` to measure the toolbar's geometry, and one test with three assertions keeps every guard, minus two app boots. | Owner's call, 2026-09-18: *"you should go ahead with 1-8 while I decide on 9-11."* |
