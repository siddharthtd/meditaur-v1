-- The block's table is gone.
--
-- A block used to name a table view, which is what decided the columns a session
-- showed. The plan's `display` decides that now, and the session screen is derived
-- from the chakra and the symbols a block runs (§9, §10) — so a block that named a
-- view would be naming something nothing reads.
--
-- The column goes first: dropping `table_views` while `plan_blocks` still
-- referenced it would fail, and clearing the reference is what the plan's own
-- display replaces.
alter table public.plan_blocks drop column if exists table_view_id;

drop policy if exists table_views_member on public.table_views;
drop table if exists public.table_views;
