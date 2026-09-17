-- Requirements v2: focus kind point, chakra fields, intentions, field pools, images, binaural toggles

alter table public.focus_points
  add column if not exists description text,
  add column if not exists governs text,
  add column if not exists colour text,
  add column if not exists element text,
  add column if not exists representation_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists representation_description text,
  add column if not exists binaural_enabled boolean not null default true;

update public.focus_points set kind = 'point' where kind = 'body';

alter table public.focus_points drop constraint if exists focus_points_kind_check;
alter table public.focus_points
  add constraint focus_points_kind_check check (kind in ('chakra', 'point', 'custom'));

alter table public.symbols
  add column if not exists is_mandatory boolean not null default false,
  add column if not exists image_asset_id uuid references public.media_assets(id) on delete set null;

alter table public.plans
  add column if not exists binaural_enabled boolean not null default true;

alter table public.media_assets drop constraint if exists media_assets_kind_check;
alter table public.media_assets
  add constraint media_assets_kind_check check (kind in ('ambient', 'alarm', 'image'));

alter table public.field_defs
  add column if not exists entity_type text not null default 'symbol';

alter table public.field_defs drop constraint if exists field_defs_entity_type_check;
alter table public.field_defs
  add constraint field_defs_entity_type_check check (entity_type in ('symbol', 'focusPoint'));

alter table public.field_values rename column symbol_id to entity_id;

create table if not exists public.intentions (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  focus_point_id uuid references public.focus_points(id) on delete restrict,
  symbol_id uuid references public.symbols(id) on delete restrict,
  sort_order int not null default 0,
  text text not null
);

insert into public.intentions (id, workspace_id, focus_point_id, symbol_id, sort_order, text)
select
  a.id,
  fp.workspace_id,
  a.focus_point_id,
  a.symbol_id,
  a.sort_order,
  a.text
from public.affirmations a
join public.focus_points fp on fp.id = a.focus_point_id
on conflict do nothing;

drop policy if exists affirmations_member on public.affirmations;
drop table if exists public.affirmations;

alter table public.intentions enable row level security;

create policy intentions_member on public.intentions
  for all using (public.is_workspace_member(workspace_id));

update public.table_views
set column_keys = (
  select coalesce(jsonb_agg(
    case when elem #>> '{}' = 'affirmations' then '"intentions"'::jsonb else elem end
  ), '[]'::jsonb)
  from jsonb_array_elements(column_keys) as elem
)
where column_keys @> '["affirmations"]'::jsonb;
