-- The reading scale gains a Small step, and moves up by one.
--
-- `sm` is new at the bottom, and `md` becomes the column's default: 18px is what
-- the app was designed against and what `lg` used to paint, so the out-of-the-box
-- size is unchanged while the labels above it gain room. Stored values do not
-- move — a device left on `lg` simply reads one step larger, which is the scale
-- change the owner asked for.
--
-- Three other halves have to agree with this file: the union in
-- `packages/domain/src/models.ts`, the `html[data-text-size=…]` rules in
-- `apps/web/src/app/globals.css`, and the tile list in
-- `apps/web/src/features/settings/Settings.tsx`.
-- `tests/unit/architecture/schema-unions.test.ts` fails the moment they drift.

alter table public.user_preferences
  drop constraint if exists user_preferences_text_size_check;
alter table public.user_preferences
  add constraint user_preferences_text_size_check
  check (text_size in ('sm', 'md', 'lg', 'xl'));

alter table public.user_preferences
  alter column text_size set default 'md';
