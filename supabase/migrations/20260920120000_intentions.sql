-- The sentences are one table (the owner's round 16, §2.1).
--
-- An affirmation and an intention were two tables with a rule between them: a block
-- read every affirmation, and a line belonged to an entry. They are one now — a
-- sentence, optionally written about a pair — and an affirmation is exactly the
-- sentence that is written about nothing yet.
--
-- So the rows **move and keep their ids**. That is the whole reason this is an
-- insert-and-drop rather than a re-creation: a `field_values` row hangs on
-- `entity_id`, and the Affirmations table's columns were stored against the very row
-- that is moving, so keeping the id keeps every column with it. The new `entry_id`
-- is null on every moved row, because that is what an affirmation was.
--
-- `intentions.entry_id` therefore becomes nullable, and `20260918120000_entries.sql`
-- is the migration this one undoes the strict half of: it had to delete the lines
-- that pointed at nothing, because a line with no entry had no box to be shown in.
-- The Affirmations table is that box now, so the store can hold one — which is also
-- why `saveLine` accepts an `entryId` of null.
--
-- One thing does **not** move: `field_defs.scope` keeps `'affirmation'`. A column
-- added to the Affirmations table is a column of that table, and the pool is named
-- after the table the reader sees rather than after the entity that happens to be
-- stored under it. Renaming the scope would be a rewrite of every stored definition
-- for no reader-visible gain, and `tests/unit/architecture/schema-unions.test.ts`
-- guards the union either way.

alter table public.intentions alter column entry_id drop not null;

insert into public.intentions (id, workspace_id, entry_id, sort_order, text, archived_at, revision, updated_at)
select id, workspace_id, null, sort_order, text, archived_at, revision, updated_at
from public.affirmations
on conflict (id) do nothing;

drop policy if exists affirmations_member on public.affirmations;
drop table if exists public.affirmations;
