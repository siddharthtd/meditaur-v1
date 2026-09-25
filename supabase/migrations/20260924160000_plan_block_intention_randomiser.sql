-- The plan card's randomiser (the owner's round 24, `P2 · 45`).
--
-- One nullable `jsonb` on `plan_blocks`, holding `{ on, own: { on, count }, symbols: { on,
-- count } }` — how many of the meditation's own intentions a session draws, and how many
-- it draws under each symbol. The domain's field is `PlanBlock.intentionRandomiser` and its
-- reader is `normalizeIntentionRandomiser` (`packages/domain/src/plan-blocks.ts`).
--
-- Nullable with **no default and no backfill**, on the rule
-- `20260923120000_plan_block_answers.sql` set for the block's other two per-meditation
-- answers: `null` is a value here — *"this block reads every line"* — so a block that has
-- never been asked is exactly what a null stores. A default of `{ on: false, ... }` would
-- say the reader had been asked and had turned it off, and a default of anything else would
-- thin lists nobody asked to thin.
--
-- Additive and re-runnable, like every migration here, and nothing else moves: the counts
-- are read at compile time and written into the session's own snapshot, so no catalogue
-- row and no plan row is touched by a draw.
--
-- Dexie needs no version for this: it keeps a plan's blocks as one `blocksJson` column, so
-- the field travels with the row it is already in. The cloud is where a column had to be
-- added, because a row-per-block table has nowhere to put a field it has no column for.

alter table public.plan_blocks
  add column if not exists intention_randomiser jsonb;
