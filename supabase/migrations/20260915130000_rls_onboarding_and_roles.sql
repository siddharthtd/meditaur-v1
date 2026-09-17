-- Architectural review C3. Two holes in the init policies:
--
--  1. `workspaces_member` is `for all using (is_workspace_member(id))`, with no
--     `with check`. A brand-new workspace has no member row yet, so the predicate
--     is false and nobody can insert their first workspace. The membership row
--     cannot exist first either, because it references the workspace.
--  2. `members_self` is
--     `for all using (user_id = auth.uid() or is_workspace_member(workspace_id))`.
--     Any member can therefore read, insert, update, or delete ANY membership row
--     in the workspace — including promoting themselves to `owner`.
--
-- Fix: a SECURITY DEFINER function that creates the workspace and the owner
-- membership atomically, an owner check, and command-specific membership
-- policies. `workspaces_member` stays as-is: direct workspace inserts remain
-- disallowed, so onboarding must go through `create_workspace`.
--
-- Known limitation (deliberate): nothing stops the last owner from demoting or
-- removing themselves, which can leave a workspace without an owner. That needs a
-- membership trigger and is tracked separately.

create or replace function public.is_workspace_owner(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

create or replace function public.create_workspace(
  ws_id uuid,
  ws_name text,
  ws_type text default 'personal'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'create_workspace requires an authenticated user';
  end if;
  if ws_type not in ('personal', 'org') then
    raise exception 'unsupported workspace type %', ws_type;
  end if;
  insert into public.workspaces (id, type, name) values (ws_id, ws_type, ws_name);
  insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_id, auth.uid(), 'owner');
  return ws_id;
end;
$$;

drop policy if exists members_self on public.workspace_members;

create policy members_select on public.workspace_members
  for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

create policy members_insert on public.workspace_members
  for insert with check (public.is_workspace_owner(workspace_id));

create policy members_update on public.workspace_members
  for update using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

create policy members_delete on public.workspace_members
  for delete using (public.is_workspace_owner(workspace_id) or user_id = auth.uid());

grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.create_workspace(uuid, text, text) to authenticated;
