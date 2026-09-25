-- The reader's colour scheme (`P2 · 46`).
--
-- One `text` column on `user_preferences`, holding the **name** of one of the eight
-- schemes the app offers — `warm`, `midnight`, `forest`, `copper`, `plum`, `paper`, `sea`,
-- `sakura`. The domain's field is `UserPreferences.theme` and its vocabulary is
-- `packages/domain/src/themes.ts`; the hexes each name paints are the app's
-- (`apps/web/src/lib/themes.ts` and the token blocks in `apps/web/src/app/globals.css`), so
-- a scheme can be tuned without rewriting anybody's row.
--
-- `not null default 'warm'` is right where the plan card's two nullable answers were not:
-- a preference is a **value the app always has**, so a row that predates the column is a
-- reader using the app's own scheme rather than a reader who has never been asked. `warm`
-- is the scheme the app has always painted, which makes the default a no-op.
--
-- The check is the union guard `tests/unit/architecture/schema-unions.test.ts` reads out of
-- `models.ts`: adding a ninth scheme means a new migration re-stating this constraint
-- (additive and re-runnable, `drop constraint if exists` first), never an edit to this one.
--
-- Dexie needs no version: `normalizePreferences` fills the field in on the way out of the
-- local store, the same reading `textSize` and `revision` get.

alter table public.user_preferences
  add column if not exists theme text not null default 'warm';

alter table public.user_preferences drop constraint if exists user_preferences_theme_check;

alter table public.user_preferences
  add constraint user_preferences_theme_check check (
    theme in ('warm', 'midnight', 'forest', 'copper', 'plum', 'paper', 'sea', 'sakura')
  );
