-- A sentence may belong to a pool of its own (the owner's round 26).
--
-- The owner: *"The affirmations for thanks-giving and protection are different (completely
-- disjoint) and these are going to be mutually exclusive as well. If you can find a way to store
-- these affirmations separately than the other two, you can reuse the affirmations kind instead
-- of creating a new one."* The Declaration stage is that: an **affirmations** stage pointed at a
-- pool the app reads **by tag** rather than by association, because a declaration is written
-- about whatever the session is running rather than about a row.
--
-- A **new file**, because a migration is a record of what was run rather than a document to edit,
-- and `20260918120000_entries.sql` is already applied.
--
-- Nullable on purpose, and `null` is the ordinary case: a sentence with no tag is read the way
-- every sentence has always been read — by the column of intentions it sits in, and by an
-- affirmations stage when it hangs off the meditation that stage runs. The three values are the
-- pools the owner named.

alter table public.intentions add column if not exists tag text;

alter table public.intentions drop constraint if exists intentions_tag_check;
alter table public.intentions
  add constraint intentions_tag_check
  check (tag is null or tag in ('protection', 'thanks_giving', 'declaration'));

-- The rows themselves are not written here. The seeded catalogue lives in `packages/db` (Dexie)
-- and reaches a device through the seed and through the repairs beside it, then travels to the
-- cloud the way every other row does — the same reason `20260920140000_symbol_reiki_system.sql`
-- writes its four symbols only for a workspace that already holds symbols, and the reason it
-- names the seed's own slots when it does.
