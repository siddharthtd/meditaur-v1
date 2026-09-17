-- The domain's unions, enforced in Postgres too.
--
-- The 2026-09-15 review (section 4) found `user_preferences.text_size` and
-- `table_views.symbol_filter` unconstrained: the domain types are unions and
-- Dexie stores whatever it is handed, so Postgres was the only layer that would
-- accept a value no code can produce. `focus_points.kind`, `field_defs.entity_type`
-- and `media_assets.kind` already carry a check from the requirements-v2
-- migration; these are the two that were missed.
--
-- Each list mirrors a union in `packages/domain/src/models.ts` exactly --
-- `UserPreferences["textSize"]` (`md | lg | xl`) and `SymbolFilter`
-- (`block | focusPoint | all`). Change all three together;
-- `tests/unit/architecture/schema-unions.test.ts` fails if you do not.

alter table public.user_preferences
  drop constraint if exists user_preferences_text_size_check;
alter table public.user_preferences
  add constraint user_preferences_text_size_check
  check (text_size in ('md', 'lg', 'xl'));

alter table public.table_views
  drop constraint if exists table_views_symbol_filter_check;
alter table public.table_views
  add constraint table_views_symbol_filter_check
  check (symbol_filter in ('block', 'focusPoint', 'all'));
