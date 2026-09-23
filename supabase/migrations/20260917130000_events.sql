-- The events table, and the one row type written to it today: `client_error`.
--
-- Review R4.2 (docs/HARDENING_REVIEW.md) asked for first-party client-error
-- capture, and its shape was to fold that into Phase 3's event-sourced plan
-- rather than stand up a second mechanism beside it: one table, one write path,
-- `event_type` naming what happened. The owner's decision on 2026-09-17 picked
-- exactly that shape, and this adds the table with the first event type rather
-- than the whole of Phase 3.
--
-- RLS is the same shape as every other workspace-scoped table. An error row is
-- not the reader's material — a message, a stack and a path — but it is theirs,
-- so a member reads and writes only their own workspace's rows.
--
-- This row is the one place in the product where something about a session
-- leaves the browser that the reader did not type. It is deliberately narrow:
-- no query string, no fragment, no catalog content, and the payload is capped in
-- the application (`packages/application/src/events.ts`) before it gets here.

create table if not exists public.events (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Nullable: a device-only build has no account, and its errors are written to
  -- Dexie instead. `on delete cascade` is what makes closing an account remove
  -- the reader's error rows as well — D1, round 12: deleted from everywhere.
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  -- When the row landed, which only the server knows. The client's clock is
  -- `occurred_at`; the two disagreeing is itself a useful signal.
  received_at timestamptz not null default now(),
  constraint events_type_known check (event_type in ('client_error'))
);

alter table public.events enable row level security;

create policy events_member on public.events
  for all using (public.is_workspace_member(workspace_id));

-- The read this table exists for: what happened in a workspace, newest first.
create index if not exists events_workspace_occurred_at
  on public.events (workspace_id, occurred_at desc);
