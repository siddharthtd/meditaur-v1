-- The Entries table: one row per chakra, per symbol, or per chakra x symbol pair.
--
-- Two things become one. `focus_symbol_bindings` held a pair, and a bare
-- `intentions` row held a line about a chakra or a symbol with its own
-- `focus_point_id` / `symbol_id` — so "the intentions of this pairing" had no row
-- to hang on, and a chakra's own lines were a differently-shaped thing from a
-- pair's. An entry *is* the association, and it holds the lines written about it.
-- That is what makes the Database's Entries table, an Intentions cell and the
-- plan's per-pair boxes the same object seen three ways.
--
-- The backfill is deliberately additive and re-runnable: bindings first (they
-- carry the order the reader set), then every distinct pair an intention names,
-- then the lines are repointed. `on conflict do nothing` is what keeps a pair that
-- appears in both from being inserted twice.

create table if not exists public.entries (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  focus_point_id uuid references public.focus_points(id) on delete cascade,
  symbol_id uuid references public.symbols(id) on delete cascade,
  sort_order int not null default 0,
  archived_at timestamptz,
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  -- A stored row points at something. A row that points at nothing is a draft the
  -- reader has not finished filling in, and it is never written: Save's orphan
  -- sweep archives a stored row that lost its last reference, and drops an
  -- unfinished one that was never stored.
  constraint entries_reference_check
    check (focus_point_id is not null or symbol_id is not null)
);

-- One row per pair, archived or not. The pair is the row's identity, so a second
-- row for the same pair would be a duplicate the reader cannot tell from the
-- first — and it would make Restore ambiguous. `coalesce` gives a null side a
-- value to compare, which is what lets a unique index span two nullable columns.
create unique index if not exists entries_pair_unique
  on public.entries (
    workspace_id,
    coalesce(focus_point_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(symbol_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists entries_workspace_sort
  on public.entries (workspace_id, sort_order);

alter table public.entries enable row level security;

create policy entries_member on public.entries
  for all using (public.is_workspace_member(workspace_id));

insert into public.entries (id, workspace_id, focus_point_id, symbol_id, sort_order)
select
  gen_random_uuid(),
  fp.workspace_id,
  b.focus_point_id,
  b.symbol_id,
  coalesce(b.sort_order, 0)
from public.focus_symbol_bindings b
join public.focus_points fp on fp.id = b.focus_point_id
on conflict do nothing;

insert into public.entries (id, workspace_id, focus_point_id, symbol_id, sort_order)
select
  gen_random_uuid(),
  i.workspace_id,
  i.focus_point_id,
  i.symbol_id,
  min(i.sort_order)
from public.intentions i
where i.focus_point_id is not null or i.symbol_id is not null
group by i.workspace_id, i.focus_point_id, i.symbol_id
on conflict do nothing;

alter table public.intentions
  add column if not exists entry_id uuid references public.entries(id) on delete cascade;

update public.intentions i
set entry_id = e.id
from public.entries e
where i.entry_id is null
  and e.workspace_id = i.workspace_id
  and e.focus_point_id is not distinct from i.focus_point_id
  and e.symbol_id is not distinct from i.symbol_id;

-- A line that pointed at nothing has no entry to belong to and no box to be shown
-- in. It cannot survive the change, and the application no longer creates one.
delete from public.intentions where entry_id is null;

alter table public.intentions alter column entry_id set not null;
alter table public.intentions drop column if exists focus_point_id;
alter table public.intentions drop column if exists symbol_id;

drop policy if exists bindings_member on public.focus_symbol_bindings;
drop table if exists public.focus_symbol_bindings;
