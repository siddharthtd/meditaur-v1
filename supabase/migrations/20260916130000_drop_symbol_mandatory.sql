-- Nothing in the product is "mandatory".
--
-- `symbols.is_mandatory` was added by the requirements-v2 migration as a picker
-- label: it sorted a symbol to the top of a picker and highlighted it, and it
-- never bound a symbol to a focus point. The owner removed the idea on
-- 2026-09-16, so the column goes too — Postgres stops describing a field the
-- domain model (`packages/domain/src/models.ts`), Dexie's v9 and the library UI
-- no longer have.

alter table public.symbols drop column if exists is_mandatory;
