-- The block's two per-meditation answers: item 3's slice 2.
--
-- The owner's round 17 moved two settings off the plan and onto each meditation —
-- *"Whatever is meditation specific — symbols, ambient, alarm, binaural, stages of
-- meditation etc, all should be updatable for that particular meditation … by
-- clicking on the card"* — and the domain has carried `PlanBlock.alarmEnabled` and
-- `PlanBlock.display` since. Dexie stores them because it keeps a plan's blocks as
-- one JSON column. **This table did not**, and the mappers that sync needs are what
-- made that visible: a pair that reads and writes a block row for row cannot carry a
-- field the row has nowhere to put. Without these two columns, sync would have
-- dropped both answers silently — one plan opened on two devices would show one
-- meditation ringing and the other silent.
--
-- Both are nullable with **no default and no backfill**, and that is the domain's
-- own rule rather than a shortcut: `null` means *"whatever the plan says"*, so a
-- block that has never been asked the question is exactly what a null stores. A
-- default of `false` would silently turn every alarm off on the first pull, and
-- `true` would turn them all on.
--
-- Additive and re-runnable, like every migration here. Nothing writes them yet: the
-- adapter is slice 2's next piece and the protocol is slice 3.
--
-- `plan_blocks` is deliberately outside slice 1's delete marks — a block is not a
-- catalogue row and has no revision of its own; it travels on its plan's
-- (`20260921140000_sync_delete_marks.sql`).

alter table public.plan_blocks
  add column if not exists alarm_enabled boolean;

alter table public.plan_blocks
  add column if not exists display jsonb;
