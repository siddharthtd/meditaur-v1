-- Stages (the owner's round 15, P4).
--
-- A meditation type gains the **template** its blocks are built from, a meditation
-- gains an optional copy of it, and a block runs as many timers as its stages say.
-- The owner's decisions this file carries out: §12.7-12.12 — one timer per stage on
-- the card and before Start, intentions 2:00 / symbols 1:00 / focus 6:00 for a
-- chakra and a point, Protection 3:00 / 1:30 / 6:41, Thanks Giving one 3:00
-- affirmations stage and silent, binaural off for intentions and affirmations.
--
-- Additive and re-runnable: every column is `add column if not exists`, every
-- backfill is guarded by the empty value it replaces, and the one drop is of a
-- column the domain no longer has.
--
-- A stage's `kind` is a union **inside** jsonb, so no check constraint can name it
-- the way `schema-unions.test.ts` names a column's. The domain's `StageKind` is the
-- only reader of it, and `parsePlanBlocks` refuses anything else, which is where a
-- repair would go if one were ever needed.

-- 1. A type's stage template.
alter table public.meditation_types
  add column if not exists stages jsonb not null default '[]'::jsonb;

-- The four seeded types, by id — `seededStages` in the domain is the same table.
-- Written out rather than derived, because a migration is a record of what the app
-- said on the day it ran.
update public.meditation_types
set stages = '[{"key":"intentions","label":"Intentions","kind":"intentions","durationMs":120000,"binaural":false,"autoScroll":true},
               {"key":"symbols","label":"Symbols","kind":"symbols","durationMs":60000,"binaural":true,"autoScroll":false},
               {"key":"focus","label":"Focus","kind":"focus","durationMs":360000,"binaural":true,"autoScroll":false}]'::jsonb
where id in (
  '01900000-0000-7000-8000-0000000000c0',
  '01900000-0000-7000-8000-0000000000c1'
)
  and stages = '[]'::jsonb;

update public.meditation_types
set stages = '[{"key":"affirmation","label":"Affirmation","kind":"affirmations","durationMs":180000,"binaural":false,"autoScroll":true},
               {"key":"symbols","label":"Symbols","kind":"symbols","durationMs":90000,"binaural":true,"autoScroll":false},
               {"key":"affirmations","label":"Affirmations","kind":"affirmations","durationMs":401000,"binaural":false,"autoScroll":true}]'::jsonb
where id = '01900000-0000-7000-8000-0000000000c2'
  and stages = '[]'::jsonb;

update public.meditation_types
set stages = '[{"key":"affirmations","label":"Affirmations","kind":"affirmations","durationMs":180000,"binaural":false,"autoScroll":true}]'::jsonb
where id = '01900000-0000-7000-8000-0000000000c3'
  and stages = '[]'::jsonb;

-- 2. A meditation's own copy of its type's template, or null for "follow my type".
alter table public.meditations
  add column if not exists stages jsonb;

-- Every row that exists now follows the type template the section above just wrote,
-- so it is given its own copy of it: §12.8 asks for a chakra to be tuneable one row
-- at a time, and a later edit of the *type* must not move a meditation that already
-- had its timers seeded.
update public.meditations m
set stages = t.stages
from public.meditation_types t
where m.type_id = t.id
  and m.stages is null
  and t.stages <> '[]'::jsonb;

-- 3. A block's stages, and the end of its single `duration_ms`.
alter table public.plan_blocks
  add column if not exists stages jsonb not null default '[]'::jsonb;

-- A stored block keeps its timing: it becomes **one** stage of the length it
-- carried, not a template re-materialised behind the reader's back. A cool-off block
-- is that same single silent timer, which is how `parsePlanBlocks` reads one too —
-- P5 deletes both the kind and these rows.
update public.plan_blocks
set stages = jsonb_build_array(
  jsonb_build_object(
    'key', case when type = 'cooloff' then 'cool-off' else 'focus' end,
    'label', case when type = 'cooloff' then 'Cool-off' else 'Focus' end,
    'kind', 'focus',
    'durationMs', duration_ms,
    'binaural', type <> 'cooloff',
    'autoScroll', false
  )
)
where stages = '[]'::jsonb;

alter table public.plan_blocks
  drop column if exists duration_ms;
