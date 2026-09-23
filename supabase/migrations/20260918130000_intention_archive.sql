-- A line can step aside on its own.
--
-- Archiving is the reader's safety net (§14.2): a line archived from the Entries
-- table keeps its row and its position, so Restore puts it back exactly where it
-- was rather than at the foot of the list. `entry_id` already indexes the lines of
-- a row; this adds the order they are read in.
alter table public.intentions
  add column if not exists archived_at timestamptz;

create index if not exists intentions_entry_sort
  on public.intentions (entry_id, sort_order);
