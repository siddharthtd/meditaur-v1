-- The plan's and the block's delete marks: item 3's slice 2, the plan repository.
--
-- Slice 1 left these two tables out on purpose — *"deliberately not on `plans`
-- either, which are versioned by `revision`"* — and that was right about how a plan
-- is **settled** and wrong about how a delete **travels**. `docs/ARCHITECTURE.md`
-- says so in as many words: "A plan carries no such mark yet: it is versioned by
-- `revision` alone, so its tombstone is the plan repository's decision in the slice
-- that adds its cloud adapter." This is that decision, taken here.
--
-- What forced it is the product, not the protocol. `deletePlan` exists and only the
-- last plan refuses, so a plan really is deleted; last-write-wins cannot tell a row
-- that was deleted from one that was never seen, so without a mark the other device
-- reads the missing row as **new** and pulls it back. The same is true one level
-- down: a block the reader removed from a plan is a row that has to go, and
-- `plan_blocks` carries no revision or `updated_at` to travel on because a block
-- rides on its plan's (`20260923120000_plan_block_answers.sql`).
--
-- `null` means live, and there is **no backfill**: every row that exists is live by
-- definition. The marks do not change how a plan is settled — the higher `revision`
-- is still the row, and `Plan.revision`'s compare-and-swap is still what catches a
-- second tab on this device (`docs/DECISIONS.md` §7). A mark only says a row is gone,
-- which is the one thing a revision cannot say on its own.
--
-- No index joins slice 1's: a pull does not read these two by watermark. A workspace
-- holds a handful of plans, so it reads them whole and compares revisions locally —
-- which is what "settled by revision" means in practice — and a plan's blocks are
-- read by `plan_id`. An index nothing queries would be the dead structure the id
-- scheme's own rules warn about.
--
-- Additive and re-runnable, like every migration here. Nothing writes either mark
-- yet: the plan adapter is the next commit.

alter table public.plans
  add column if not exists deleted_at timestamptz;

alter table public.plan_blocks
  add column if not exists deleted_at timestamptz;
