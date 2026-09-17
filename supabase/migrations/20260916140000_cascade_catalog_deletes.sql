-- Deleting is a cascade, not a refusal.
--
-- The owner's rule (2026-09-16): removing something from the library removes it
-- from everything that used it, rather than sending the reader off to unpick
-- twelve references by hand. This migration is the schema half of that; the
-- behaviour lives in `packages/application/src/create-app.ts`, and the two must
-- agree.
--
-- What each delete does, and which rule says so:
--   focus point   -> cascade: its attachments, its intentions, the plan blocks
--                    that were about it
--   symbol        -> cascade: its attachments and intentions; a block that named
--                    it is *set null* and goes back to "rotate next"
--   field def     -> cascade: the values typed into it
--   preset, table view, media asset -> set null everywhere they were referenced;
--                    the thing that referenced them stays
--
-- The two refusals the application keeps — the last preset, the last table view —
-- are product rules, not usage rules, so they are not expressible here.

alter table public.focus_symbol_bindings
  drop constraint if exists focus_symbol_bindings_focus_point_id_fkey,
  drop constraint if exists focus_symbol_bindings_symbol_id_fkey;
alter table public.focus_symbol_bindings
  add constraint focus_symbol_bindings_focus_point_id_fkey
    foreign key (focus_point_id) references public.focus_points(id) on delete cascade,
  add constraint focus_symbol_bindings_symbol_id_fkey
    foreign key (symbol_id) references public.symbols(id) on delete cascade;

alter table public.intentions
  drop constraint if exists intentions_focus_point_id_fkey,
  drop constraint if exists intentions_symbol_id_fkey;
alter table public.intentions
  add constraint intentions_focus_point_id_fkey
    foreign key (focus_point_id) references public.focus_points(id) on delete cascade,
  add constraint intentions_symbol_id_fkey
    foreign key (symbol_id) references public.symbols(id) on delete cascade;

alter table public.field_values
  drop constraint if exists field_values_field_def_id_fkey;
alter table public.field_values
  add constraint field_values_field_def_id_fkey
    foreign key (field_def_id) references public.field_defs(id) on delete cascade;

alter table public.plan_blocks
  drop constraint if exists plan_blocks_focus_point_id_fkey,
  drop constraint if exists plan_blocks_symbol_id_fkey,
  drop constraint if exists plan_blocks_binaural_preset_id_fkey,
  drop constraint if exists plan_blocks_table_view_id_fkey,
  drop constraint if exists plan_blocks_ambient_asset_id_fkey,
  drop constraint if exists plan_blocks_alarm_asset_id_fkey;
alter table public.plan_blocks
  add constraint plan_blocks_focus_point_id_fkey
    foreign key (focus_point_id) references public.focus_points(id) on delete cascade,
  add constraint plan_blocks_symbol_id_fkey
    foreign key (symbol_id) references public.symbols(id) on delete set null,
  add constraint plan_blocks_binaural_preset_id_fkey
    foreign key (binaural_preset_id) references public.binaural_presets(id) on delete set null,
  add constraint plan_blocks_table_view_id_fkey
    foreign key (table_view_id) references public.table_views(id) on delete set null,
  add constraint plan_blocks_ambient_asset_id_fkey
    foreign key (ambient_asset_id) references public.media_assets(id) on delete set null,
  add constraint plan_blocks_alarm_asset_id_fkey
    foreign key (alarm_asset_id) references public.media_assets(id) on delete set null;

alter table public.focus_points
  drop constraint if exists focus_points_default_binaural_preset_id_fkey;
alter table public.focus_points
  add constraint focus_points_default_binaural_preset_id_fkey
    foreign key (default_binaural_preset_id) references public.binaural_presets(id)
    on delete set null;
