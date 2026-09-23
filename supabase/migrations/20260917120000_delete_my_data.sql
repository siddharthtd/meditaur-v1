-- H5.2 of the external hardening review. There was no way for a reader to remove
-- what is stored about them, and meditation history with chakra, symbol and
-- intention tracking is health-adjacent data by any reasonable reading.
--
-- Two things this function deliberately is NOT.
--
--  1. It is **not** `security definer`, unlike `create_workspace`. That one
--     needed definer rights because a workspace has to exist before its
--     membership row can, so no policy could ever allow the insert. There is no
--     such ordering problem here, so this runs with the caller's own privileges
--     and every statement is filtered by the same RLS the app runs under. The
--     function cannot reach another account's rows even if it tried — which is
--     the property worth having in the one function whose whole job is deleting
--     things.
--  2. It does **not**, and cannot, delete the `auth.users` row. That needs the
--     service-role key, which by design never reaches the browser. Closing the
--     account itself is a separate step; this removes the data, and the two are
--     named differently so nobody has to guess which one just happened.
--
-- The "sole member" test is explicit rather than left to RLS. A workspace the
-- caller merely *belongs* to has to survive, and the `workspaces_member` policy
-- is coarse enough (`for all using (is_workspace_member(id))`) that a plain
-- delete would take the whole workspace and its catalogue with it.
--
-- Ownership is read from `workspace_members.role`, not from a new
-- `workspaces.owner_id`. The role is already the source of truth for who owns a
-- workspace; a second column saying the same thing is a second thing to keep
-- true, and `is_workspace_owner()` already reads the first.
--
-- Idempotent on purpose: calling it twice deletes nothing the second time and
-- returns 0, rather than throwing at somebody who is already erased.

create or replace function public.delete_my_data()
returns integer
language plpgsql
set search_path = public
as $$
declare
  removed integer;
begin
  if auth.uid() is null then
    raise exception 'delete_my_data requires an authenticated user';
  end if;

  -- Sole-member workspaces first, and by workspace rather than by membership:
  -- deleting one cascades its catalog, plans, table views, media rows, snapshots
  -- and session logs (20260916140000_cascade_catalog_deletes.sql and the
  -- session_gc migration before it). The membership row goes with it.
  with sole as (
    select workspace_id
    from public.workspace_members
    group by workspace_id
    having count(*) = 1 and bool_and(user_id = auth.uid())
  )
  delete from public.workspaces w
  where w.id in (select workspace_id from sole);
  get diagnostics removed = row_count;

  -- Settings, which are the only other thing that ever left the device.
  delete from public.user_preferences where user_id = auth.uid();

  -- And any membership left over in a workspace that was shared and therefore
  -- kept. Revoking it is what makes the account stop being a member of anything.
  delete from public.workspace_members where user_id = auth.uid();

  -- Deliberately not touched: `profiles`. It has no reader and no writer, and is
  -- already on the roadmap's deferral list for removal; a delete here would be
  -- the only thing in the codebase keeping it alive.
  return removed;
end;
$$;

grant execute on function public.delete_my_data() to authenticated;
