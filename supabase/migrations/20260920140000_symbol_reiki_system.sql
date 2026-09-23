-- A symbol belongs to a reiki system, and four rows join the catalogue (the owner's
-- round 16, §2.5 and §6).
--
-- A **new file**, because a migration is a record of what was run rather than a
-- document to edit: the column, the four rows and the order they read in all have to
-- arrive as steps of their own, and `20260919120000_meditation_types.sql` and its
-- siblings are already applied.
--
-- The four rows are created for a workspace that already holds symbols — the same
-- rule `20260919120000_meditation_types.sql` follows for the seeded types, because
-- this project seeds its catalogue in `packages/db` (Dexie) and pushes rows as the
-- reader writes them: a workspace with no symbols of its own has nothing to add to.
-- Their ids are the slots the seed mints (`nid()`), so the row a device pushes later
-- **is** this row rather than a second copy of it, and `on conflict` keeps whichever
-- arrived first.
--
-- `reiki_system` stays **nullable**, deliberately. A symbol the reader adds names no
-- system, and the flag is the admin's say over the catalogue the app ships: a row
-- that names no system is in no system that could be turned off, so it is never
-- hidden (`isSymbolSystemEnabled` in `packages/domain/src/reiki-systems.ts`).

alter table public.symbols add column if not exists reiki_system text;

-- Not a guess: until this round the app shipped one system, so Karuna Reiki is what
-- every symbol that exists already was — the seeded eight, and a reader's own rows
-- with them.
update public.symbols set reiki_system = 'karuna_reiki' where reiki_system is null;

alter table public.symbols drop constraint if exists symbols_reiki_system_check;
alter table public.symbols
  add constraint symbols_reiki_system_check
  check (reiki_system in ('karuna_reiki', 'usui_reiki', 'reiki_master'));

-- The four rows, with the text left **empty**: the owner said they will fill the
-- Description and the Usage in from the Database, so a placeholder would only be
-- something to delete. The last one is spelled the way the owner spelled it — it is
-- the Usui Master symbol, usually written "Dai Ko Myo".
--
-- A name the workspace already holds is not added to, the way
-- `symbolsWithReikiSystems` reads it in `packages/db`: a name is the only handle on a
-- row that already exists, and a reader who typed `Cho Ku Rei` in before this row
-- existed keeps their own description rather than gaining a second row beside it.
insert into public.symbols (id, workspace_id, name, description, usage, reiki_system)
select seeded.id, w.id, seeded.name, '', '', seeded.reiki_system
from public.workspaces w
cross join (
  values
    ('01900000-0000-7000-8000-000000000038'::uuid, 'Hon Sha Ze Sho Nen', 'usui_reiki'),
    ('01900000-0000-7000-8000-000000000039'::uuid, 'Sei Hei Ki', 'usui_reiki'),
    ('01900000-0000-7000-8000-00000000003a'::uuid, 'Cho Ku Rei', 'usui_reiki'),
    ('01900000-0000-7000-8000-00000000003b'::uuid, 'Dai Kyo Mo', 'reiki_master')
) as seeded (id, name, reiki_system)
where exists (select 1 from public.symbols s where s.workspace_id = w.id)
  and not exists (
    select 1
    from public.symbols s
    where s.workspace_id = w.id and lower(trim(s.name)) = lower(trim(seeded.name))
  )
on conflict (id) do nothing;

-- The catalogue's own order, which is `SYMBOL_ORDER` in
-- `packages/db/src/catalog-order.ts` written out: the seven the app shipped, then the
-- four new rows, and then every name no list carries — `Rama`, and whatever the
-- reader added — in the order it already had. Written out because a migration cannot
-- import TypeScript, and the *reason* it is here at all is the four rows: without it
-- they would carry `sort_order` 0 and read above `Harth`.
with ranked as (
  select
    s.id,
    row_number() over (
      partition by s.workspace_id
      order by
        case lower(trim(s.name))
          when 'harth' then 0
          when 'gnosa' then 1
          when 'knosa' then 1
          when 'halu' then 2
          when 'iava' then 3
          when 'iawa' then 3
          when 'shanti' then 4
          when 'kriya' then 5
          when 'zonar' then 6
          when 'hon sha ze sho nen' then 7
          when 'sei hei ki' then 8
          when 'cho ku rei' then 9
          when 'dai kyo mo' then 10
          else 11
        end,
        s.sort_order,
        s.id
    ) - 1 as place
  from public.symbols s
)
update public.symbols s
set sort_order = ranked.place
from ranked
where ranked.id = s.id and s.sort_order is distinct from ranked.place;
