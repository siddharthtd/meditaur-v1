-- Every catalogue row keeps its order and can step aside.
--
-- The three record tables gain the same pair of columns the entries table has:
-- `sort_order`, because the Database's grid is the order and the reader drags rows
-- into it, and `archived_at`, because archiving is the one undo this product has.
--
-- The backfill is deterministic — a row's place is derived from its own name and
-- id, not from the order the planner happened to read the table in — so two runs
-- of this migration over the same rows agree, and so does a device that seeded
-- itself from the same catalog.

alter table public.focus_points
  add column if not exists sort_order int not null default 0,
  add column if not exists archived_at timestamptz;
alter table public.symbols
  add column if not exists sort_order int not null default 0,
  add column if not exists archived_at timestamptz;
alter table public.binaural_presets
  add column if not exists sort_order int not null default 0,
  add column if not exists archived_at timestamptz;

update public.focus_points fp
set sort_order = ranked.position
from (
  select id, row_number() over (partition by workspace_id order by name, id) - 1 as position
  from public.focus_points
) ranked
where ranked.id = fp.id;

update public.symbols s
set sort_order = ranked.position
from (
  select id, row_number() over (partition by workspace_id order by name, id) - 1 as position
  from public.symbols
) ranked
where ranked.id = s.id;

update public.binaural_presets p
set sort_order = ranked.position
from (
  select id, row_number() over (partition by workspace_id order by name, id) - 1 as position
  from public.binaural_presets
) ranked
where ranked.id = p.id;

create index if not exists focus_points_workspace_sort
  on public.focus_points (workspace_id, sort_order);
create index if not exists symbols_workspace_sort
  on public.symbols (workspace_id, sort_order);
create index if not exists binaural_presets_workspace_sort
  on public.binaural_presets (workspace_id, sort_order);
