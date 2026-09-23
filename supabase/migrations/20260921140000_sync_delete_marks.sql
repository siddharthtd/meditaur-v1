-- The delete mark, and the read a pull makes: item 3's first slice.
--
-- Sync settles two devices by revision and never asks the reader (docs/DECISIONS.md
-- §7), so a delete cannot travel as an *absence*: a row that simply vanished on one
-- device would look new to the other and come back with the next pull. It travels as
-- a row with a later revision and this mark on it — null means live, a timestamp
-- means gone. That is deliberately not `archived_at` sitting beside it: archiving is
-- the reader's one undo and the Archive page draws those rows, while a tombstone is
-- final and invisible.
--
-- The second half is the index, and it is the read a pull makes: "this workspace's
-- rows that moved since my watermark". So `(workspace_id, updated_at desc)` — and it
-- is deliberately **not** partial on the mark, because a pull needs the tombstones
-- too. `field_values` is the one exception: it is scoped by the entity it belongs to
-- (`entity_id`, a chakra, a symbol or an entry) and carries no `workspace_id` at
-- all, so its index is the timestamp alone.
--
-- Additive and re-runnable, like every migration here. **Nothing writes the mark
-- yet** — the protocol that does is slice 3 — and every row that exists is live by
-- definition, so the column starts null with no backfill owed.
--
-- The names below are the ones the *latest* migration left, not the ones `init.sql`
-- created: `focus_points` has been `meditations` since the owner's round 15
-- (`20260919140000_rename_meditations.sql`). An applied migration is never edited, so
-- the old name lives on in the earlier files and only the local stack's replay of
-- them in order can catch a file that used it — which is what happened to this
-- migration's first draft.

alter table public.meditations
  add column if not exists deleted_at timestamptz;
alter table public.symbols
  add column if not exists deleted_at timestamptz;
alter table public.intentions
  add column if not exists deleted_at timestamptz;
alter table public.field_defs
  add column if not exists deleted_at timestamptz;
alter table public.field_options
  add column if not exists deleted_at timestamptz;
alter table public.field_values
  add column if not exists deleted_at timestamptz;
alter table public.binaural_presets
  add column if not exists deleted_at timestamptz;
alter table public.media_assets
  add column if not exists deleted_at timestamptz;
alter table public.entries
  add column if not exists deleted_at timestamptz;
alter table public.meditation_types
  add column if not exists deleted_at timestamptz;

create index if not exists meditations_workspace_updated
  on public.meditations (workspace_id, updated_at desc);
create index if not exists symbols_workspace_updated
  on public.symbols (workspace_id, updated_at desc);
create index if not exists intentions_workspace_updated
  on public.intentions (workspace_id, updated_at desc);
create index if not exists field_defs_workspace_updated
  on public.field_defs (workspace_id, updated_at desc);
create index if not exists field_options_workspace_updated
  on public.field_options (workspace_id, updated_at desc);
create index if not exists binaural_presets_workspace_updated
  on public.binaural_presets (workspace_id, updated_at desc);
create index if not exists media_assets_workspace_updated
  on public.media_assets (workspace_id, updated_at desc);
create index if not exists entries_workspace_updated
  on public.entries (workspace_id, updated_at desc);
create index if not exists meditation_types_workspace_updated
  on public.meditation_types (workspace_id, updated_at desc);

-- No `workspace_id` on this one, so no workspace to lead with.
create index if not exists field_values_updated_at
  on public.field_values (updated_at desc);
