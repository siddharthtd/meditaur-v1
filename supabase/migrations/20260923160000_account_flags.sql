-- The account's feature flags, and the marker that says who may set them.
--
-- `P0 · 23` slice 23b; the owner's answers are `DECISIONS.md` §11 and the detail is
-- `docs/ACCOUNT_FLAGS_PLAN.md`. What it adds is one row per account — the flags a
-- surface reads, and `is_admin`, which is not a flag but the marker that decides who
-- may write flags at all. They live together because they are written together and by
-- the same hand: the owner's, through the `admin` function.
--
-- **One row, keyed by identity.** `user_id` is the primary key, so "this account's
-- flags" is a single row rather than a list to reconcile, and `on delete cascade` is
-- what makes closing an account take its flags with it (round 12's D1: deleted from
-- everywhere).
--
-- **`flags` is sparse, and every absent key means the app's default** —
-- `packages/domain/src/feature-flags.ts`. That is what lets a flag be added to the
-- union without rewriting every stored account, and it is why an account with no row at
-- all is not a special case: it is an account with everything on, which is the state
-- every account starts in. No trigger creates one, deliberately — a row that exists
-- only to say "nothing" is a row that can go missing.
--
-- Values are booleans, and a value that is not is read as the default by
-- `normalizeFeatureFlags` rather than refused here. That is a deliberate split: a check
-- cannot look inside a `jsonb` without a subquery, and a hand-edited row should show the
-- app's answer rather than throwing at sign-in.
--
-- **The check is the key list, and it is its own statement so widening it is a one-line
-- change.** `tests/unit/architecture/feature-flags.test.ts` reads the names out of this
-- file and the union out of the domain and fails when the two differ — the same lockstep
-- `schema-unions.test.ts` keeps for `text_size`, which is what stops a flag existing in
-- code and being silently unwritable in the database. The `-` operator drops a key;
-- every key removed leaves `{}`, so the list below is exactly the flags this build
-- knows.
--
-- **RLS is self-select only, and there is no self-write policy at all.** That asymmetry
-- is the whole design rather than an omission: the browser must read its own row — the
-- flags gate the app — and no account may edit its own, because a flag is the owner's
-- decision about that account rather than a preference. The writer is the service role
-- inside the `admin` function (slice 23e), which bypasses RLS by design, so the only way
-- a flag changes is through a function that first proves the caller is an admin.
--
-- `is_admin` is set once, by hand, with a statement recorded in `docs/ARCHITECTURE.md`
-- — not by a script, because agent and owner tooling never lives in `scripts/`.

create table if not exists public.account_flags (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- The marker, not a flag: it decides who may reach the panel at all.
  is_admin boolean not null default false,
  flags jsonb not null default '{}'::jsonb,
  -- Written by the function on every change. There is no trigger: nothing else writes
  -- this table, so a trigger would be a second thing that has to stay true.
  updated_at timestamptz not null default now()
);

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
    = '{}'::jsonb
  );

alter table public.account_flags enable row level security;

drop policy if exists account_flags_self_select on public.account_flags;

create policy account_flags_self_select on public.account_flags
  for select using (user_id = auth.uid());
