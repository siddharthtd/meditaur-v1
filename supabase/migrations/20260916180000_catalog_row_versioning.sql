-- M5: the catalogue rows carry a revision and the time this device last wrote
-- them, so a later sync can compare per row instead of replacing a table
-- wholesale. `plans` has had both since the baseline and `user_preferences` since
-- 20260916170000; these are the rest of the rows sync proper will push.
--
-- Deliberately out, and not an oversight: `focus_symbol_bindings` is a link row
-- that is written and removed rather than edited, and `session_logs` and
-- `session_snapshots` are append-only — a revision on any of them would say
-- nothing. `workspace_members` is membership, not content.
alter table public.focus_points
  add column if not exists revision int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.symbols
  add column if not exists revision int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.intentions
  add column if not exists revision int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.field_defs
  add column if not exists revision int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.field_values
  add column if not exists revision int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.table_views
  add column if not exists revision int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.binaural_presets
  add column if not exists revision int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.media_assets
  add column if not exists revision int not null default 0,
  add column if not exists updated_at timestamptz not null default now();
