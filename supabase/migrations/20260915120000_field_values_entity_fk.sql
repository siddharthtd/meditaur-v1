-- Architectural review C2. The Requirements v2 rename (`symbol_id` -> `entity_id`)
-- left `field_values.entity_id` bound to `symbols(id)` by the original foreign
-- key. `field_values.entity_id` is polymorphic — the owning `field_defs.entity_type`
-- decides whether it points at a symbol or a focus point — so it cannot carry a
-- single-column foreign key. A focus point's custom field values were therefore
-- rejected by Postgres even though the domain allows them.
--
-- Referential integrity stays in the application, which refuses to delete a
-- symbol or focus point while it still has field values (`assertSymbolDeletable`
-- and `assertFocusDeletable` in packages/application/src/catalog-writes.ts), so
-- dropping the constraint does not allow dangling rows to be created by the app.
--
-- The constraint keeps its original name across a column rename, but it is dropped
-- by definition rather than by name so this migration cannot silently no-op if the
-- auto-generated name ever differs.

do $$
declare
  fk_name text;
begin
  for fk_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'field_values'
      and con.contype = 'f'
      and con.confrelid = 'public.symbols'::regclass
  loop
    execute format('alter table public.field_values drop constraint %I', fk_name);
  end loop;
end
$$;
