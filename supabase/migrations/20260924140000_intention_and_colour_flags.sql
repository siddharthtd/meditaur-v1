-- Three more flags for one account (`P2 · 44`), and the randomiser and the colours they
-- gate (`P2 · 45`, `P2 · 46`, `P2 · 47`).
--
-- The check on `account_flags.flags` is a **whitelist**, not a list of suggestions: the
-- `-` operator drops a key and every key removed leaves `{}`, so a name missing here is a
-- name the admin function refuses (`unknown_flag`) — a flag that exists in the app and
-- cannot be written. The owner's round 24 added three features, so the list grows by
-- three: the plan card's randomiser, the eight colour schemes, and a session drawn in the
-- meditation's own colour.
--
-- **The constraint is replaced, not appended.** `drop constraint if exists` then a fresh
-- statement of the whole list is what makes this re-runnable on a database that already
-- ran `20260923160000_account_flags.sql`; the earlier file is never edited, because a
-- database that has already run it will not run the edited version. That is also why
-- `tests/unit/architecture/feature-flags.test.ts` reads the **newest** statement of the
-- check as the contract rather than every migration that mentions the table.
--
-- Nothing else changes: the table still grants a self-select and no write at all, and
-- `is_admin` is still the marker rather than a flag.

alter table public.account_flags drop constraint if exists account_flags_known_keys;

alter table public.account_flags
  add constraint account_flags_known_keys check (
    flags
      - 'account_management'
      - 'admin_panel'
      - 'karuna_reiki'
      - 'usui_reiki'
      - 'reiki_master'
      - 'chakras'
      - 'binaural'
      - 'auto_scroll'
      - 'intention_randomiser'
      - 'colour_scheme'
      - 'chakra_immersion'
    = '{}'::jsonb
  );
