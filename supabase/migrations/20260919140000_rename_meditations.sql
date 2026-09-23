-- The owner's round 15, P3: `focus_points` is `meditations`, and the field that
-- names one is `meditation_id`.
--
-- Additive and re-runnable, like its siblings, and written so that a database
-- which already ran it does nothing at all. Three things are worth knowing about
-- *why* this file is short:
--
-- 1. **A rename is transparent to everything Postgres parsed.** Policies, foreign
--    keys, check constraints and views are stored as trees with relation OIDs, so
--    renaming the table and the columns does not break the policies in
--    `20260904120000_init.sql` or the constraints added by the migrations after it.
--    Only text Postgres re-parses at execution time — a PL/pgSQL function body —
--    would break, and no function in this repository names either the table or the
--    column (`is_workspace_member` queries `members`; `delete_my_data` walks the
--    catalogue by its own ids).
-- 2. **The old names survive in the earlier migrations**, deliberately: those files
--    are the history of how the schema was built, and the rule here is that an
--    applied migration is never edited.
-- 3. **The names of the objects move too.** A renamed table keeps its index,
--    policy and constraint *names*, so they are renamed explicitly from
--    `pg_catalog` rather than listed by hand — the list would go stale the moment
--    another migration adds one.
--
-- The two stored unions move as data as well as as a constraint: `field_defs.scope`
-- and `field_defs.ref_kind` held `'focusPoint'`, and the domain now calls that
-- member `'meditation'`. A meditation's custom columns are named in
-- `field_values` by id, so nothing there needs touching.

-- The table. Guarded, so a second run is a no-op.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'focus_points'
  ) then
    alter table public.focus_points rename to meditations;
  end if;
end
$$;

-- Every column called `focus_point_id`, on whichever table still has one:
-- `intentions`, `plan_blocks`, `entries`. Asked of the catalogue rather than
-- named, so a table this file has never heard of is not left behind.
do $$
declare
  row record;
begin
  for row in
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'focus_point_id'
  loop
    execute format(
      'alter table public.%I rename column focus_point_id to meditation_id',
      row.table_name
    );
  end loop;
end
$$;

-- The objects those renames left with the old word in their names — the table's
-- indexes (`focus_points_workspace_sort`, `focus_points_pkey`), its policy
-- (`focus_member`), its foreign keys, and the three `*_focus_point_id_*`
-- constraints and indexes on the tables above.
do $$
declare
  row record;
  renamed text;
begin
  for row in
    select c.relname as old
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'i'
      and (c.relname like '%focus_points%' or c.relname like '%focus_point_id%')
  loop
    renamed := replace(replace(row.old, 'focus_points', 'meditations'), 'focus_point_id', 'meditation_id');
    execute format('alter index public.%I rename to %I', row.old, renamed);
  end loop;

  for row in
    select conname as old, conrelid::regclass::text as tbl
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and (conname like '%focus_points%' or conname like '%focus_point_id%')
  loop
    renamed := replace(replace(row.old, 'focus_points', 'meditations'), 'focus_point_id', 'meditation_id');
    execute format('alter table %s rename constraint %I to %I', row.tbl, row.old, renamed);
  end loop;

  for row in
    select p.polname as old, p.polrelid::regclass::text as tbl
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relnamespace = 'public'::regnamespace
      and p.polname like '%focus%'
  loop
    renamed := replace(replace(row.old, 'focus_points', 'meditations'), 'focus', 'meditation');
    execute format('alter policy %I on %s rename to %I', row.old, row.tbl, renamed);
  end loop;
end
$$;

-- The stored values, before the constraint that will refuse them.
update public.field_defs set scope = 'meditation' where scope = 'focusPoint';
update public.field_defs set ref_kind = 'meditation' where ref_kind = 'focusPoint';

alter table public.field_defs drop constraint if exists field_defs_scope_check;
alter table public.field_defs
  add constraint field_defs_scope_check check (scope in ('entry', 'meditation', 'symbol'));

alter table public.field_defs drop constraint if exists field_defs_ref_kind_check;
alter table public.field_defs
  add constraint field_defs_ref_kind_check
  check (ref_kind is null or ref_kind in ('meditation', 'symbol', 'preset'));

-- A plan's Display named the area `chakra` until this round. `normalizePlanDisplay`
-- maps it on read and is the one place that knows the old word, so the stored JSON
-- is deliberately *not* rewritten here: rows in `plans.display` are read by one
-- function that already understands both, and a data migration would have to guess
-- at the shape of a payload the domain owns.
