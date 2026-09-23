-- Affirmations (the owner's round 15, P6).
--
-- The owner's §12.10: a Thanks Giving session shows "affirmations from its own
-- table", one after another, and the type is silent. So the sentences are a table
-- of their own rather than a field on a meditation — the same sentences serve every
-- meditation that wants them, and the Database gets a table the reader can edit.
--
-- An ordinary catalogue row: archived, versioned, ordered, `(workspace_id,
-- sort_order)`, RLS as its siblings. What it does *not* yet have is anything of its
-- own beyond its text — no picture, no sound, no reference — which is why the table
-- below is as small as it is.
--
-- One more thing moves: `field_defs.scope` gains `'affirmation'`, because a column
-- added to the Affirmations table is a column of that table. The domain's
-- `FieldScope` is the union this check mirrors, and
-- `tests/unit/architecture/schema-unions.test.ts` fails if the two ever drift.

create table if not exists public.affirmations (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  text text not null default '',
  sort_order int not null default 0,
  archived_at timestamptz,
  revision int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists affirmations_workspace_sort
  on public.affirmations (workspace_id, sort_order);

alter table public.affirmations enable row level security;

create policy affirmations_member on public.affirmations
  for all using (public.is_workspace_member(workspace_id));

-- The scope check, widened by one member. Dropped and re-added rather than altered,
-- because an unnamed check cannot be changed in place; the name is the one the
-- rename migration gave it.
alter table public.field_defs drop constraint if exists field_defs_scope_check;
alter table public.field_defs
  add constraint field_defs_scope_check
  check (scope in ('entry', 'meditation', 'symbol', 'affirmation'));
