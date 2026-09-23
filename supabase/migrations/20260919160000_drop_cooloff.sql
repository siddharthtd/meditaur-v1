-- Cool-off is gone (the owner's round 15, P5).
--
-- The owner's §12.13: *"Cool-off is dropped from every plan, seeded or stored."* A
-- block was either a meditation or a silent timer between two of them; with stages in
-- (P4) each meditation ends on its own last stage, so the filler has nothing left to
-- do. `PlanBlock.type` is deleted in the domain, `"cooloff"` is refused by
-- `parsePlanBlocks`, and the seeded plan no longer carries one.
--
-- A stored plan loses its cool-off blocks rather than gaining an empty one, which is
-- what the delete below does. A plan that was nothing *but* cool-off ends with no
-- blocks, and compile says so out loud (`compile.empty`) instead of running a session
-- of silence.
--
-- Order matters: the rows go before the column, because the check constraint that
-- names the values is inline on that column and dropping it with its rows already
-- gone is the only sequence that cannot fail.

delete from public.plan_blocks where type = 'cooloff';

alter table public.plan_blocks
  drop column if exists type;
