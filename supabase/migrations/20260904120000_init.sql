-- Canonical schema. Must match packages/domain models + Dexie adapters.
-- Catalog deletes are RESTRICT (app also refuses). Workspace teardown may CASCADE.

create table if not exists public.workspaces (
  id uuid primary key,
  type text not null check (type in ('personal', 'org')),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (workspace_id, user_id)
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text
);

create table if not exists public.binaural_presets (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  left_tones jsonb not null default '[]',
  right_tones jsonb not null default '[]',
  fade_in_ms int not null default 40,
  fade_out_ms int not null default 40,
  eq_left jsonb not null,
  eq_right jsonb not null
);

create table if not exists public.focus_points (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  kind text not null,
  location_text text not null default '',
  default_binaural_preset_id uuid references public.binaural_presets(id) on delete restrict
);

create table if not exists public.symbols (
  id uuid primary key,
  focus_point_id uuid not null references public.focus_points(id) on delete restrict,
  name text not null,
  description text not null default '',
  usage text not null default '',
  sort_order int not null default 0
);

create table if not exists public.affirmations (
  id uuid primary key,
  symbol_id uuid not null references public.symbols(id) on delete restrict,
  sort_order int not null default 0,
  text text not null
);

create table if not exists public.field_defs (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null,
  label text not null,
  sort_order int not null default 0
);

create table if not exists public.field_values (
  symbol_id uuid not null references public.symbols(id) on delete restrict,
  field_def_id uuid not null references public.field_defs(id) on delete restrict,
  text text not null default '',
  primary key (symbol_id, field_def_id)
);

create table if not exists public.table_views (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  column_keys jsonb not null default '[]',
  symbol_filter text not null
);

create table if not exists public.media_assets (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('ambient', 'alarm')),
  name text not null,
  storage_path text not null,
  duration_ms int not null default 0
);

create table if not exists public.plans (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  cycle_count int not null default 1,
  cycle_until_stopped boolean not null default false,
  auto_advance boolean not null default true,
  stop_binaural_on_alarm boolean not null default true,
  revision int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_blocks (
  id uuid primary key,
  plan_id uuid not null references public.plans(id) on delete cascade,
  sort_order int not null,
  type text not null check (type in ('focus', 'cooloff')),
  duration_ms int not null,
  focus_point_id uuid references public.focus_points(id) on delete restrict,
  symbol_id uuid references public.symbols(id) on delete restrict,
  binaural_preset_id uuid references public.binaural_presets(id) on delete restrict,
  table_view_id uuid references public.table_views(id) on delete restrict,
  ambient_asset_id uuid references public.media_assets(id) on delete restrict,
  alarm_asset_id uuid references public.media_assets(id) on delete restrict
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stop_binaural_on_alarm boolean not null default true,
  auto_advance boolean not null default true,
  master_gain real not null default 0.7,
  alarm_volume real not null default 0.6,
  tts_enabled boolean not null default false,
  text_size text not null default 'lg',
  last_plan_id uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.session_snapshots (
  instance_id uuid primary key,
  plan_id uuid not null references public.plans(id) on delete restrict,
  compiled_at timestamptz not null,
  schema_version int not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.session_logs (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  completed_at timestamptz not null,
  block_count int not null,
  total_duration_ms int not null
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.profiles enable row level security;
alter table public.focus_points enable row level security;
alter table public.symbols enable row level security;
alter table public.affirmations enable row level security;
alter table public.field_defs enable row level security;
alter table public.field_values enable row level security;
alter table public.table_views enable row level security;
alter table public.binaural_presets enable row level security;
alter table public.media_assets enable row level security;
alter table public.plans enable row level security;
alter table public.plan_blocks enable row level security;
alter table public.user_preferences enable row level security;
alter table public.session_snapshots enable row level security;
alter table public.session_logs enable row level security;

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create policy workspaces_member on public.workspaces
  for all using (public.is_workspace_member(id));

create policy members_self on public.workspace_members
  for all using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

create policy profiles_self on public.profiles
  for all using (user_id = auth.uid());

create policy prefs_self on public.user_preferences
  for all using (user_id = auth.uid());

create policy focus_member on public.focus_points
  for all using (public.is_workspace_member(workspace_id));

create policy symbols_member on public.symbols
  for all using (
    public.is_workspace_member(
      (select fp.workspace_id from public.focus_points fp where fp.id = focus_point_id)
    )
  );

create policy affirmations_member on public.affirmations
  for all using (
    public.is_workspace_member(
      (
        select fp.workspace_id
        from public.symbols s
        join public.focus_points fp on fp.id = s.focus_point_id
        where s.id = symbol_id
      )
    )
  );

create policy field_defs_member on public.field_defs
  for all using (public.is_workspace_member(workspace_id));

create policy field_values_member on public.field_values
  for all using (
    public.is_workspace_member(
      (select fd.workspace_id from public.field_defs fd where fd.id = field_def_id)
    )
  );

create policy table_views_member on public.table_views
  for all using (public.is_workspace_member(workspace_id));

create policy presets_member on public.binaural_presets
  for all using (public.is_workspace_member(workspace_id));

create policy media_member on public.media_assets
  for all using (public.is_workspace_member(workspace_id));

create policy plans_member on public.plans
  for all using (public.is_workspace_member(workspace_id));

create policy plan_blocks_member on public.plan_blocks
  for all using (
    public.is_workspace_member(
      (select p.workspace_id from public.plans p where p.id = plan_id)
    )
  );

create policy snapshots_member on public.session_snapshots
  for all using (
    public.is_workspace_member(
      (select p.workspace_id from public.plans p where p.id = plan_id)
    )
  );

create policy logs_member on public.session_logs
  for all using (public.is_workspace_member(workspace_id));
