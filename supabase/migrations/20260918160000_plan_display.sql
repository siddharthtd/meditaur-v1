-- What a session shows, stored on the plan.
--
-- The Database holds no display settings (§12.12): a column is a fact about the
-- store, and which of those facts are useful *while meditating* is a property of
-- the session — so the choice lives on the plan, beside the blocks it describes.
--
-- `{}` rather than a populated default: an existing plan keeps the app's own
-- default (the symbol's description and usage, the columns the old default table
-- view showed), and the reader narrows from there. A stored default here would be
-- a second, older copy of a decision the app already makes.
alter table public.plans
  add column if not exists display jsonb not null default '{}'::jsonb;
