import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveSupabaseTarget } from "../fixtures/supabase-target.ts";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");
const sql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
  .join("\n");

// Which Supabase this run talks to is explicit rather than whatever happens to be
// in `.env` — see tests/fixtures/supabase-target.ts. `SUPABASE_TARGET=local` fails
// here rather than skipping when the stack is not answering.
const target = resolveSupabaseTarget(process.env);
const supabaseUrl = target?.url ?? "";
const anonKey = target?.anonKey ?? "";
const serviceKey = target?.serviceKey ?? "";
const live = Boolean(target);

async function request(
  path: string,
  init: {
    method?: string;
    key: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {
    apikey: init.key,
    Authorization: `Bearer ${init.token ?? init.key}`,
    ...init.headers,
  };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${supabaseUrl}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: response.status, json };
}

const PASSWORD = "Test-pass-1!";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function createUser(email: string): Promise<string> {
  const created = await request("/auth/v1/admin/users", {
    method: "POST",
    key: serviceKey,
    body: { email, password: PASSWORD, email_confirm: true },
  });
  expect(created.status, JSON.stringify(created.json)).toBeLessThan(300);
  const id = (created.json as { id?: string }).id;
  expect(id).toMatch(UUID_PATTERN);
  if (!id) throw new Error(`Supabase did not return a user id: ${JSON.stringify(created.json)}`);
  return id;
}

async function signIn(email: string): Promise<string> {
  const token = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    key: anonKey,
    body: { email, password: PASSWORD },
  });
  expect(token.status, JSON.stringify(token.json)).toBeLessThan(300);
  const access = (token.json as { access_token?: string }).access_token;
  expect(access).toBeTruthy();
  return access as string;
}

async function deleteUser(id: string): Promise<void> {
  await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", key: serviceKey });
}

describe(`rls (${target?.name ?? "no target configured"})`, () => {
  it("gives every RLS table a policy and uses a SECURITY DEFINER membership helper", () => {
    const enabled = [...sql.matchAll(/alter table public\.([a-z_]+) enable row level security/g)].map(
      (match) => match[1],
    );
    expect(enabled.length).toBeGreaterThan(0);
    for (const table of enabled) {
      expect(sql, table).toMatch(new RegExp(`create policy \\w+ on public\\.${table}\\b`));
    }
    expect(sql).toMatch(/function public\.is_workspace_member\([\s\S]*security definer/i);
    expect(sql).toMatch(/on delete restrict/);
  });

  it("bootstraps workspaces through an owner-creating RPC and keeps roles owner-only", () => {
    expect(sql).toMatch(/create or replace function public\.create_workspace\(/);
    expect(sql).toMatch(/insert into public\.workspace_members[\s\S]*'owner'/);
    expect(sql).toMatch(/create or replace function public\.is_workspace_owner\(/);
    expect(sql).toMatch(/drop policy if exists members_self on public\.workspace_members/);
    expect(sql).toMatch(
      /create policy members_insert on public\.workspace_members[\s\S]*?is_workspace_owner/,
    );
    expect(sql).toMatch(
      /create policy members_update on public\.workspace_members[\s\S]*?is_workspace_owner/,
    );
  });

  it.skipIf(!live)("denies user B rows that belong to user A's workspace", async () => {
    const stamp = crypto.randomUUID();
    const emailA = `rls-a-${stamp}@example.test`;
    const emailB = `rls-b-${stamp}@example.test`;
    const workspaceA = crypto.randomUUID();
    const workspaceB = crypto.randomUUID();
    const focusA = crypto.randomUUID();
    const userIds: string[] = [];

    try {
      const idA = await createUser(emailA);
      const idB = await createUser(emailB);
      userIds.push(idA, idB);

      const seed = await request("/rest/v1/workspaces", {
        method: "POST",
        key: serviceKey,
        body: [
          { id: workspaceA, type: "personal", name: "A session" },
          { id: workspaceB, type: "personal", name: "B session" },
        ],
        headers: { Prefer: "return=minimal" },
      });
      expect(seed.status, JSON.stringify(seed.json)).toBeLessThan(300);

      const members = await request("/rest/v1/workspace_members", {
        method: "POST",
        key: serviceKey,
        body: [
          { workspace_id: workspaceA, user_id: idA, role: "owner" },
          { workspace_id: workspaceB, user_id: idB, role: "owner" },
        ],
        headers: { Prefer: "return=minimal" },
      });
      expect(members.status, JSON.stringify(members.json)).toBeLessThan(300);

      const focus = await request("/rest/v1/focus_points", {
        method: "POST",
        key: serviceKey,
        body: {
          id: focusA,
          workspace_id: workspaceA,
          name: "Secret root",
          kind: "custom",
          location_text: "",
        },
        headers: { Prefer: "return=minimal" },
      });
      expect(focus.status, JSON.stringify(focus.json)).toBeLessThan(300);

      const jwtA = await signIn(emailA);
      const jwtB = await signIn(emailB);

      const asA = await request("/rest/v1/focus_points?select=id,name", {
        key: anonKey,
        token: jwtA,
      });
      expect(asA.status).toBe(200);
      expect(asA.json).toEqual([{ id: focusA, name: "Secret root" }]);

      const asB = await request("/rest/v1/focus_points?select=id,name", {
        key: anonKey,
        token: jwtB,
      });
      expect(asB.status).toBe(200);
      expect(asB.json).toEqual([]);

      const steal = await request("/rest/v1/focus_points", {
        method: "POST",
        key: anonKey,
        token: jwtB,
        body: {
          id: crypto.randomUUID(),
          workspace_id: workspaceA,
          name: "Stolen",
          kind: "custom",
          location_text: "",
        },
        headers: { Prefer: "return=minimal" },
      });
      expect(steal.status).toBeGreaterThanOrEqual(400);
    } finally {
      await request(`/rest/v1/focus_points?id=eq.${focusA}`, {
        method: "DELETE",
        key: serviceKey,
        headers: { Prefer: "return=minimal" },
      });
      await request(
        `/rest/v1/workspace_members?workspace_id=in.(${workspaceA},${workspaceB})`,
        {
          method: "DELETE",
          key: serviceKey,
          headers: { Prefer: "return=minimal" },
        },
      );
      await request(`/rest/v1/workspaces?id=in.(${workspaceA},${workspaceB})`, {
        method: "DELETE",
        key: serviceKey,
        headers: { Prefer: "return=minimal" },
      });
      for (const id of userIds) {
        await deleteUser(id);
      }
    }
  });

  it.skipIf(!live)("lets a user create their first workspace and denies role escalation", async () => {
    const stamp = crypto.randomUUID();
    const emailA = `onboard-a-${stamp}@example.test`;
    const emailB = `onboard-b-${stamp}@example.test`;
    const workspaceA = crypto.randomUUID();
    const userIds: string[] = [];

    try {
      const idA = await createUser(emailA);
      const idB = await createUser(emailB);
      userIds.push(idA, idB);
      const jwtA = await signIn(emailA);
      const jwtB = await signIn(emailB);

      // The plain `workspaces_member` policy cannot allow this: the workspace has
      // no member row yet. The SECURITY DEFINER RPC creates both atomically.
      const created = await request("/rest/v1/rpc/create_workspace", {
        method: "POST",
        key: anonKey,
        token: jwtA,
        body: { ws_id: workspaceA, ws_name: "Onboarding", ws_type: "personal" },
      });
      expect(created.status, JSON.stringify(created.json)).toBeLessThan(300);

      const aSees = await request("/rest/v1/workspaces?select=id", {
        key: anonKey,
        token: jwtA,
      });
      expect(aSees.status).toBe(200);
      expect(aSees.json).toEqual([{ id: workspaceA }]);

      // B is not a member, so the workspace stays invisible.
      const bSees = await request("/rest/v1/workspaces?select=id", {
        key: anonKey,
        token: jwtB,
      });
      expect(bSees.status).toBe(200);
      expect(bSees.json).toEqual([]);

      const invited = await request("/rest/v1/workspace_members", {
        method: "POST",
        key: serviceKey,
        body: { workspace_id: workspaceA, user_id: idB, role: "editor" },
        headers: { Prefer: "return=minimal" },
      });
      expect(invited.status, JSON.stringify(invited.json)).toBeLessThan(300);

      // RLS turns this into a no-op rather than an error, so assert the role.
      await request(`/rest/v1/workspace_members?workspace_id=eq.${workspaceA}&user_id=eq.${idB}`, {
        method: "PATCH",
        key: anonKey,
        token: jwtB,
        body: { role: "owner" },
        headers: { Prefer: "return=minimal" },
      });

      const roles = await request(
        `/rest/v1/workspace_members?workspace_id=eq.${workspaceA}&select=user_id,role`,
        { key: serviceKey },
      );
      expect(roles.status).toBe(200);
      expect(roles.json).toEqual(
        expect.arrayContaining([
          { user_id: idA, role: "owner" },
          { user_id: idB, role: "editor" },
        ]),
      );
    } finally {
      await request(`/rest/v1/workspace_members?workspace_id=eq.${workspaceA}`, {
        method: "DELETE",
        key: serviceKey,
        headers: { Prefer: "return=minimal" },
      });
      await request(`/rest/v1/workspaces?id=eq.${workspaceA}`, {
        method: "DELETE",
        key: serviceKey,
        headers: { Prefer: "return=minimal" },
      });
      for (const id of userIds) {
        await deleteUser(id);
      }
    }
  });
});
