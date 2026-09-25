-- A block's points: the owner's round 22.
--
-- The owner asked for a **points circuit**: a block that clubs several points into one
-- pass, sharing its stages, its timers and its intentions reading — *"Each point block can
-- have multiple points in it (no limit on the number of points). All the points in that
-- block will share the same intentions, symbol and focus stages and timers."* The domain's
-- `PlanBlock` carries `meditationIds` since that change. Dexie keeps a plan's blocks as one
-- JSON column, so only this table needed somewhere to put the list — and it needed one at
-- all for the reason `20260923120000_plan_block_answers.sql` gives: the sync pair reads and
-- writes a block row for row, so a field the row has nowhere to put is a field sync drops
-- silently.
--
-- `meditation_id` **stays** and keeps its meaning: the block's **lead** — the meditation
-- whose stages, sound, Display facts and Focus picture the block reads, which is what
-- `compilePlan` calls `focus`. A row written by an older build has only that column, and
-- `planFromCloud` reads it as the one-element list it always was, so nothing stored has to
-- move and no reader loses a block.
--
-- Additive and re-runnable, like every migration here: `add column if not exists`, and the
-- backfill is guarded by the empty value it replaces. Nothing writes `meditation_id` here,
-- so a row that already has a lead keeps it.

alter table public.plan_blocks
  add column if not exists meditation_ids jsonb not null default '[]'::jsonb;

-- Every row that exists now names exactly one meditation, and that one is the list. A row
-- that names none (a placeholder written by an older build) stays empty, which is the state
-- `compilePlan` refuses out loud rather than running silence.
update public.plan_blocks
set meditation_ids = jsonb_build_array(meditation_id)
where meditation_ids = '[]'::jsonb
  and meditation_id is not null;
