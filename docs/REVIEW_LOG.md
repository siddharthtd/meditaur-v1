# Meditaur — the owner's review log

**Status:** living. Newest round at the bottom. Last entry: 2026-09-17.

## What this is

A record of what the owner asked for while reviewing the app, what was decided,
and where it landed. [ROADMAP.md](./ROADMAP.md) says what is *next*;
[ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md) is the code review. This is the
third thing: the owner's own words, kept so a request cannot be quietly dropped,
half-done, or re-litigated later.

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

## Still open from the reviews

Named here so a later round does not have to remember them. Nothing in this list
is in the ROADMAP's critical path.

| From | Item | Where it goes |
| --- | --- | --- |
| Round 3, library item 1 | **A table view for the six card-only tabs** (`Fields`, `Audio files`, `Presets`, `Views`, `Plans`, `History`). The `Table` switch is hidden on them, because there is no table to switch to. | Deferred by the owner's answer ("make it visible only on the tabs that support the table view"). Each would need fixed columns plus a `CatalogDataTable` row list; the column *filter* stays for the two sections that have custom fields. |
| Round 3, library item 4 | **Delete on the `Plans` and `History` cards.** Flagged when the card actions landed; not asked for. Deleting a plan lives in the planner (it refuses to remove the last one), and there is no delete for a history entry anywhere in the app. | Owner's call. |
| This round, item 5 | **Password reset.** Sign-up exists and there is still no "I forgot my password" anywhere in the app. With confirm-email off there is also no verified address to send a link to, and the built-in mailer only reaches project team addresses — so the first reader who forgets is stuck until the owner resets them by hand in the dashboard. | Owner's call, and it needs SMTP: allowlist it in [DEPENDENCIES.md](./DEPENDENCIES.md) first, then two routes (request, update). Supabase sends the mail; the app only needs the screens and the redirect URL, which is already in the allow list. |
| Round 8, item 1 | **The intention editor's `Associated with` still uses the full `md` tiles.** It is the same shape as `Kind` — a fixed few choices inside a form section — so it now looks unlike the one the owner asked to shrink. | One word (`size="sm"`) in `AssociatedWith.tsx`. Left alone because the owner asked about `Kind`; queued rather than quietly changed. |
| Round 8, item 3 | **The row a drag starts from keeps its press shrink.** Pressing the handle scales it to 95% for a moment (`active:scale-95`, the app's press feedback for every control). The owner was offered this, the live preview, and the settle, and chose only the settle. | Owner's call. Removing it would make the drag even quieter, but it is the one press state the rest of the app shares. Round 9 measured what is left of it: releasing the press moves the handle's own top edge by one pixel, the only movement a release test tolerates. |
| Accounts round, item 5 | **Read the hosted project's auth settings before the beta opens** — `mailer_autoconfirm`, `site_url`, `uri_allow_list`, `password_min_length`. Two reads of the same four values disagree (see the round's last note). | One Management API read with the CLI's token. The rule either way: with confirm-email **on** and the built-in mailer, no outside reader can sign in. Fix by turning it off or by allowlisting SMTP, which is the order the owner already queued. |
