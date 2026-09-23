-- A column has a type, and the table it belongs to.
--
-- `entity_type` said which *table* a column belonged to (`symbol` or
-- `focusPoint`); the Database adds a third (`entry` — the pair), so the column is
-- renamed to `scope` and gains the third value. Beside it come the two facts the
-- grid needs to draw and edit a cell: `cell_type` (which control edits it, and how
-- its text is read) and `ref_kind` (what a `reference` cell points at).
--
-- A `select` column's options are rows of their own, in `field_options`: a cell
-- stores the option's id, so renaming an option keeps every cell that chose it.
-- Options are not archived — a cell that chose one is exactly the reason it cannot
-- be removed (§4), and an option nothing chose is simply deleted.

alter table public.field_defs
  add column if not exists scope text not null default 'symbol',
  add column if not exists cell_type text not null default 'text',
  add column if not exists ref_kind text,
  add column if not exists archived_at timestamptz;

update public.field_defs set scope = entity_type where entity_type in ('symbol', 'focusPoint');

alter table public.field_defs drop constraint if exists field_defs_scope_check;
alter table public.field_defs
  add constraint field_defs_scope_check check (scope in ('entry', 'focusPoint', 'symbol'));

alter table public.field_defs drop constraint if exists field_defs_cell_type_check;
alter table public.field_defs
  add constraint field_defs_cell_type_check
  check (cell_type in ('text', 'longText', 'number', 'duration', 'date', 'image', 'reference', 'select'));

-- Nullable, because seven of the eight cell types point at nothing.
alter table public.field_defs drop constraint if exists field_defs_ref_kind_check;
alter table public.field_defs
  add constraint field_defs_ref_kind_check
  check (ref_kind is null or ref_kind in ('focusPoint', 'symbol', 'preset'));

alter table public.field_defs drop constraint if exists field_defs_entity_type_check;
alter table public.field_defs drop column if exists entity_type;

create table if not exists public.field_options (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Cascade: removing a column removes its options. The application refuses to
  -- remove a column that holds a value, so this only ever fires for one that does
  -- not, and it fires for every option at once rather than one delete per option.
  field_def_id uuid not null references public.field_defs(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  revision int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists field_options_field_sort
  on public.field_options (field_def_id, sort_order);

alter table public.field_options enable row level security;

create policy field_options_member on public.field_options
  for all using (public.is_workspace_member(workspace_id));
