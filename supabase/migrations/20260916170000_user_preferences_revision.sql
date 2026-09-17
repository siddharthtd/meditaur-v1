-- Preferences are versioned like plans are: `UserPreferences.revision` in the
-- domain, the same field in Dexie, and this column here. A save carries the
-- revision it read, and a write carrying a stale one is refused instead of
-- overwriting whatever another client stored in the meantime — the 2026-09-15
-- review's M11 (the blind overwrite), and ROADMAP Phase 2.
--
-- Existing rows start at 0, exactly like a stored plan does.
alter table public.user_preferences
  add column if not exists revision int not null default 0;
