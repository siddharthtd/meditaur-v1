drop policy if exists symbols_member on public.symbols;
drop policy if exists affirmations_member on public.affirmations;

alter table public.focus_points
  add column if not exists default_duration_ms int not null default 120000;

alter table public.symbols
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.symbols s
set workspace_id = fp.workspace_id
from public.focus_points fp
where fp.id = s.focus_point_id
  and s.workspace_id is null;

alter table public.symbols alter column workspace_id set not null;

create table if not exists public.focus_symbol_bindings (
  focus_point_id uuid not null references public.focus_points(id) on delete restrict,
  symbol_id uuid not null references public.symbols(id) on delete restrict,
  sort_order int not null default 0,
  primary key (focus_point_id, symbol_id)
);

insert into public.focus_symbol_bindings (focus_point_id, symbol_id, sort_order)
select focus_point_id, id, coalesce(sort_order, 0)
from public.symbols
where focus_point_id is not null
on conflict do nothing;

alter table public.affirmations
  add column if not exists focus_point_id uuid references public.focus_points(id) on delete restrict;

update public.affirmations a
set focus_point_id = s.focus_point_id
from public.symbols s
where s.id = a.symbol_id
  and a.focus_point_id is null;

alter table public.affirmations alter column focus_point_id set not null;
alter table public.affirmations alter column symbol_id drop not null;

alter table public.symbols drop column if exists sort_order;
alter table public.symbols drop column if exists focus_point_id;

alter table public.plan_blocks
  add column if not exists symbol_scope text not null default 'rotate';

alter table public.plan_blocks
  drop constraint if exists plan_blocks_symbol_scope_check;
alter table public.plan_blocks
  add constraint plan_blocks_symbol_scope_check
  check (symbol_scope in ('rotate', 'all'));

alter table public.focus_symbol_bindings enable row level security;

create policy symbols_member on public.symbols
  for all using (public.is_workspace_member(workspace_id));

create policy bindings_member on public.focus_symbol_bindings
  for all using (
    public.is_workspace_member(
      (select fp.workspace_id from public.focus_points fp where fp.id = focus_point_id)
    )
  );

create policy affirmations_member on public.affirmations
  for all using (
    public.is_workspace_member(
      (select fp.workspace_id from public.focus_points fp where fp.id = focus_point_id)
    )
  );
