-- A meditation type is a row.
--
-- The owner's round 15: Chakra, Point, Protection and Thanks Giving are types of
-- meditation, "and more could be added later". A union in code cannot grow without
-- a release, so the type is a catalogue row instead — and every surface that used
-- to switch on `kind` (a library tab, a Database table, a group in a plan's tiles,
-- the pool a custom column belongs to) is generated from these rows.
--
-- Additive and re-runnable, like its siblings. What it cannot do without help is
-- *seed* a workspace that has no focus points: this project seeds the local
-- catalogue in `packages/db` (Dexie) and pushes rows as the reader writes them, so
-- the four rows are created here only for a workspace that already holds meditations
-- the old `kind` has to be translated for.

create table if not exists public.meditation_types (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  -- Where the type sits in the library's tab strip and in every picker.
  sort_order int not null default 0,
  archived_at timestamptz,
  revision int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists meditation_types_workspace_sort
  on public.meditation_types (workspace_id, sort_order);

alter table public.meditation_types enable row level security;

create policy meditation_types_member on public.meditation_types
  for all using (public.is_workspace_member(workspace_id));

-- The four seeded types, one row per workspace that has meditations to translate.
-- The ids are the constants `packages/domain/src/meditation-types.ts` exports, so
-- the row the app pushes later *is* this row rather than a second copy of it.
insert into public.meditation_types (id, workspace_id, name, sort_order)
select seeded.id, w.id, seeded.name, seeded.sort_order
from public.workspaces w
cross join (
  values
    ('01900000-0000-7000-8000-0000000000c0'::uuid, 'Chakra', 0),
    ('01900000-0000-7000-8000-0000000000c1'::uuid, 'Point', 1),
    ('01900000-0000-7000-8000-0000000000c2'::uuid, 'Protection', 2),
    ('01900000-0000-7000-8000-0000000000c3'::uuid, 'Thanks Giving', 3)
) as seeded (id, name, sort_order)
where exists (
  select 1 from public.focus_points fp where fp.workspace_id = w.id
)
on conflict (id) do nothing;

alter table public.focus_points
  add column if not exists type_id uuid references public.meditation_types(id) on delete set null;

-- `chakra` and `point` are their own type; `custom` was only ever the seeded
-- Protection, so that is the Protection type. Anything else a reader had marked
-- custom was a meditation that is not a chakra: it lands on Point, because a
-- migration is not the place to throw a reader's row away.
update public.focus_points
set type_id = case
  when kind = 'chakra' then '01900000-0000-7000-8000-0000000000c0'::uuid
  when kind = 'custom' and name = 'Protection' then '01900000-0000-7000-8000-0000000000c2'::uuid
  else '01900000-0000-7000-8000-0000000000c1'::uuid
end
where type_id is null;

-- Deliberately **nullable**, and `on delete set null`, unlike the local store where
-- a meditation always names a type. The cloud receives rows one at a time as the
-- reader writes them, so a meditation can arrive before the type row it names; the
-- alternative is a save that fails on a reference the reader cannot see. The
-- strict half of this rule lives where the catalogue lives — `packages/domain` — and
-- the app never writes a meditation without a type.

-- The old word and the check that pinned it to three values. `body` became `point`
-- in `20260915000000_requirements_v2.sql`; nothing else ever wrote this column.
alter table public.focus_points drop constraint if exists focus_points_kind_check;
alter table public.focus_points drop column if exists kind;

-- A column belongs to one type, or to every type (null). `Governs` and `Element`
-- are facts about a chakra and are the only seeded columns: every column a reader
-- adds stays shared until a screen offers to narrow it.
alter table public.field_defs
  add column if not exists type_id uuid references public.meditation_types(id) on delete set null;

update public.field_defs
set type_id = '01900000-0000-7000-8000-0000000000c0'::uuid
where type_id is null and key in ('governs', 'element');
