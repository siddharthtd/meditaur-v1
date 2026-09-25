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

  it.skipIf(!live)("lets an account read its own flags and write none of them", async () => {
    // `P0 · 23` slice 23g. The policy in one sentence is an asymmetry: the browser **must**
    // read its own row, because the flags decide what a screen draws, and must not write
    // one, because a flag is the owner's decision about an account rather than a preference
    // (`docs/ARCHITECTURE.md`, `DECISIONS.md` §11). `admin-flags.test.ts` proves it against
    // the hosted project through the function; this is the same policy where the row is
    // written with the service key instead — which is the half a function cannot test,
    // because the function is precisely what is bypassed.
    const stamp = crypto.randomUUID();
    const email = `rls-flags-${stamp}@example.test`;
    const otherEmail = `rls-flags-other-${stamp}@example.test`;
    const userId = await createUser(email);
    const otherId = await createUser(otherEmail);

    try {
      const seeded = await request("/rest/v1/account_flags", {
        method: "POST",
        key: serviceKey,
        body: [{ user_id: userId, flags: { chakras: false } }],
        headers: { Prefer: "return=minimal" },
      });
      expect(seeded.status, JSON.stringify(seeded.json)).toBeLessThan(300);

      const token = await signIn(email);
      const own = await request("/rest/v1/account_flags?select=flags", { key: anonKey, token });
      expect(own.status, JSON.stringify(own.json)).toBeLessThan(300);
      expect(
        (own.json as { flags: Record<string, boolean> }[])[0]?.flags.chakras,
        "the reader reads the row the app gates its surfaces on",
      ).toBe(false);

      // And cannot write it, however they ask. Asserted by reading the value back rather
      // than by the status: an update that matches no row is a quiet success.
      await request(`/rest/v1/account_flags?user_id=eq.${userId}`, {
        method: "PATCH",
        key: anonKey,
        token,
        body: { flags: { chakras: true } },
      });
      const after = await request("/rest/v1/account_flags?select=flags", { key: anonKey, token });
      expect(
        (after.json as { flags: Record<string, boolean> }[])[0]?.flags.chakras,
        "an account cannot edit its own flags",
      ).toBe(false);

      // Self-select rather than any-signed-in-select: the other account has no row of its
      // own here, so a policy of `using (true)` would hand it the one above and this is
      // what would notice.
      const other = await request("/rest/v1/account_flags?select=flags", {
        key: anonKey,
        token: await signIn(otherEmail),
      });
      expect(
        (other.json as unknown[]).length,
        "another account's row is not visible",
      ).toBe(0);
    } finally {
      await deleteUser(userId);
      await deleteUser(otherId);
    }
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

      const focus = await request("/rest/v1/meditations", {
        method: "POST",
        key: serviceKey,
        body: {
          id: focusA,
          workspace_id: workspaceA,
          name: "Secret root",
          type_id: null,
          location_text: "",
        },
        headers: { Prefer: "return=minimal" },
      });
      expect(focus.status, JSON.stringify(focus.json)).toBeLessThan(300);

      const jwtA = await signIn(emailA);
      const jwtB = await signIn(emailB);

      const asA = await request("/rest/v1/meditations?select=id,name", {
        key: anonKey,
        token: jwtA,
      });
      expect(asA.status).toBe(200);
      expect(asA.json).toEqual([{ id: focusA, name: "Secret root" }]);

      const asB = await request("/rest/v1/meditations?select=id,name", {
        key: anonKey,
        token: jwtB,
      });
      expect(asB.status).toBe(200);
      expect(asB.json).toEqual([]);

      const steal = await request("/rest/v1/meditations", {
        method: "POST",
        key: anonKey,
        token: jwtB,
        body: {
          id: crypto.randomUUID(),
          workspace_id: workspaceA,
          name: "Stolen",
          type_id: null,
          location_text: "",
        },
        headers: { Prefer: "return=minimal" },
      });
      expect(steal.status).toBeGreaterThanOrEqual(400);
    } finally {
      await request(`/rest/v1/meditations?id=eq.${focusA}`, {
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

  it.skipIf(!live)("keeps the Entries table and a column's options inside their workspace", async () => {
    // §13 of the Database plan names these two tables specifically: `entries` and
    // `field_options` are the ones the tab added, and the RLS policies that guard
    // them are per-workspace like every other synced row.
    const stamp = crypto.randomUUID();
    const emailA = `entries-a-${stamp}@example.test`;
    const emailB = `entries-b-${stamp}@example.test`;
    const workspaceA = crypto.randomUUID();
    const workspaceB = crypto.randomUUID();
    const focusA = crypto.randomUUID();
    const symbolA = crypto.randomUUID();
    const entryA = crypto.randomUUID();
    const fieldDefA = crypto.randomUUID();
    const optionA = crypto.randomUUID();
    const userIds: string[] = [];

    try {
      const idA = await createUser(emailA);
      const idB = await createUser(emailB);
      userIds.push(idA, idB);

      const seed = await request("/rest/v1/workspaces", {
        method: "POST",
        key: serviceKey,
        body: [
          { id: workspaceA, type: "personal", name: "Entries A" },
          { id: workspaceB, type: "personal", name: "Entries B" },
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

      // One chakra, one symbol, and the row that pairs them — written as the
      // member, so the policies are what lets these through.
      const jwtA = await signIn(emailA);
      const jwtB = await signIn(emailB);
      const records = await request("/rest/v1/meditations", {
        method: "POST",
        key: anonKey,
        token: jwtA,
        body: [
          {
            id: focusA,
            workspace_id: workspaceA,
            name: "Root",
            type_id: null,
            location_text: "",
          },
        ],
        headers: { Prefer: "return=minimal" },
      });
      expect(records.status, JSON.stringify(records.json)).toBeLessThan(300);
      const symbol = await request("/rest/v1/symbols", {
        method: "POST",
        key: anonKey,
        token: jwtA,
        body: {
          id: symbolA,
          workspace_id: workspaceA,
          name: "Lam",
          description: "",
          usage: "",
        },
        headers: { Prefer: "return=minimal" },
      });
      expect(symbol.status, JSON.stringify(symbol.json)).toBeLessThan(300);

      const entry = await request("/rest/v1/entries", {
        method: "POST",
        key: anonKey,
        token: jwtA,
        body: {
          id: entryA,
          workspace_id: workspaceA,
          meditation_id: focusA,
          symbol_id: symbolA,
          sort_order: 0,
        },
        headers: { Prefer: "return=minimal" },
      });
      expect(entry.status, JSON.stringify(entry.json)).toBeLessThan(300);

      const def = await request("/rest/v1/field_defs", {
        method: "POST",
        key: anonKey,
        token: jwtA,
        body: {
          id: fieldDefA,
          workspace_id: workspaceA,
          scope: "symbol",
          cell_type: "select",
          key: "element",
          label: "Element",
          description: "",
          sort_order: 0,
        },
        headers: { Prefer: "return=minimal" },
      });
      expect(def.status, JSON.stringify(def.json)).toBeLessThan(300);

      const option = await request("/rest/v1/field_options", {
        method: "POST",
        key: anonKey,
        token: jwtA,
        body: {
          id: optionA,
          workspace_id: workspaceA,
          field_def_id: fieldDefA,
          label: "Earth",
          sort_order: 0,
        },
        headers: { Prefer: "return=minimal" },
      });
      expect(option.status, JSON.stringify(option.json)).toBeLessThan(300);

      const asA = await request("/rest/v1/entries?select=id,meditation_id,symbol_id", {
        key: anonKey,
        token: jwtA,
      });
      expect(asA.status).toBe(200);
      expect(asA.json).toEqual([
        { id: entryA, meditation_id: focusA, symbol_id: symbolA },
      ]);
      const optionsAsA = await request("/rest/v1/field_options?select=id,label", {
        key: anonKey,
        token: jwtA,
      });
      expect(optionsAsA.status).toBe(200);
      expect(optionsAsA.json).toEqual([{ id: optionA, label: "Earth" }]);

      // The other reader sees neither, and cannot write into A's workspace.
      const asB = await request("/rest/v1/entries?select=id", {
        key: anonKey,
        token: jwtB,
      });
      expect(asB.status).toBe(200);
      expect(asB.json).toEqual([]);
      const optionsAsB = await request("/rest/v1/field_options?select=id", {
        key: anonKey,
        token: jwtB,
      });
      expect(optionsAsB.status).toBe(200);
      expect(optionsAsB.json).toEqual([]);
      const steal = await request("/rest/v1/entries", {
        method: "POST",
        key: anonKey,
        token: jwtB,
        body: {
          id: crypto.randomUUID(),
          workspace_id: workspaceA,
          meditation_id: focusA,
          sort_order: 1,
        },
        headers: { Prefer: "return=minimal" },
      });
      expect(steal.status, JSON.stringify(steal.json)).toBeGreaterThanOrEqual(400);

      // …and a row that points at nothing is refused by the table itself.
      const orphan = await request("/rest/v1/entries", {
        method: "POST",
        key: anonKey,
        token: jwtA,
        body: { id: crypto.randomUUID(), workspace_id: workspaceA, sort_order: 2 },
        headers: { Prefer: "return=minimal" },
      });
      expect(orphan.status, JSON.stringify(orphan.json)).toBeGreaterThanOrEqual(400);
    } finally {
      await request(`/rest/v1/entries?id=eq.${entryA}`, { method: "DELETE", key: serviceKey });
      await request(`/rest/v1/field_options?id=eq.${optionA}`, {
        method: "DELETE",
        key: serviceKey,
      });
      await request(`/rest/v1/field_defs?id=eq.${fieldDefA}`, { method: "DELETE", key: serviceKey });
      await request(`/rest/v1/symbols?id=eq.${symbolA}`, { method: "DELETE", key: serviceKey });
      await request(`/rest/v1/meditations?id=eq.${focusA}`, { method: "DELETE", key: serviceKey });
      await request(`/rest/v1/workspace_members?workspace_id=in.(${workspaceA},${workspaceB})`, {
        method: "DELETE",
        key: serviceKey,
      });
      await request(`/rest/v1/workspaces?id=in.(${workspaceA},${workspaceB})`, {
        method: "DELETE",
        key: serviceKey,
      });
      for (const id of userIds) {
        await deleteUser(id);
      }
    }
  });

  it.skipIf(!live)("deletes a user's own data, keeps what they shared, and touches nobody else", async () => {
    const stamp = crypto.randomUUID();
    const emailSolo = `del-solo-${stamp}@example.test`;
    const emailOther = `del-other-${stamp}@example.test`;
    const solo = crypto.randomUUID();
    const shared = crypto.randomUUID();
    const other = crypto.randomUUID();
    const userIds: string[] = [];

    try {
      const soloId = await createUser(emailSolo);
      const otherId = await createUser(emailOther);
      userIds.push(soloId, otherId);
      const soloJwt = await signIn(emailSolo);
      const otherJwt = await signIn(emailOther);

      // One workspace of their own, one they share, and one belonging to
      // somebody else that nothing here is allowed to reach.
      for (const [ws, name, type, jwt] of [
        [solo, "Solo", "personal", soloJwt],
        [shared, "Shared", "org", soloJwt],
        [other, "Other", "personal", otherJwt],
      ] as const) {
        const created = await request("/rest/v1/rpc/create_workspace", {
          method: "POST",
          key: anonKey,
          token: jwt,
          body: { ws_id: ws, ws_name: name, ws_type: type },
        });
        expect(created.status, JSON.stringify(created.json)).toBeLessThan(300);
      }
      const invited = await request("/rest/v1/workspace_members", {
        method: "POST",
        key: serviceKey,
        body: { workspace_id: shared, user_id: otherId, role: "editor" },
        headers: { Prefer: "return=minimal" },
      });
      expect(invited.status, JSON.stringify(invited.json)).toBeLessThan(300);

      const wiped = await request("/rest/v1/rpc/delete_my_data", {
        method: "POST",
        key: anonKey,
        token: soloJwt,
        body: {},
      });
      expect(wiped.status, JSON.stringify(wiped.json)).toBeLessThan(300);
      // Exactly one: the shared workspace is not theirs to delete.
      expect(wiped.json).toBe(1);

      const gone = await request(`/rest/v1/workspaces?id=eq.${solo}&select=id`, {
        key: serviceKey,
      });
      expect(gone.json).toEqual([]);
      const soloMembership = await request(
        `/rest/v1/workspace_members?workspace_id=eq.${solo}&select=user_id`,
        { key: serviceKey },
      );
      expect(soloMembership.json).toEqual([]);

      // The shared workspace survives with its other member; the caller's
      // membership of it does not.
      const kept = await request(
        `/rest/v1/workspaces?id=in.(${shared},${other})&select=id`,
        { key: serviceKey },
      );
      expect((kept.json as { id: string }[]).map((row) => row.id).sort()).toEqual(
        [shared, other].sort(),
      );
      const sharedMembers = await request(
        `/rest/v1/workspace_members?workspace_id=eq.${shared}&select=user_id`,
        { key: serviceKey },
      );
      expect(sharedMembers.json).toEqual([{ user_id: otherId }]);

      // Running it again is a clean no-op, not an error at somebody who is
      // already erased.
      const again = await request("/rest/v1/rpc/delete_my_data", {
        method: "POST",
        key: anonKey,
        token: soloJwt,
        body: {},
      });
      expect(again.status, JSON.stringify(again.json)).toBeLessThan(300);
      expect(again.json).toBe(0);
    } finally {
      await request(`/rest/v1/workspace_members?workspace_id=in.(${solo},${shared},${other})`, {
        method: "DELETE",
        key: serviceKey,
        headers: { Prefer: "return=minimal" },
      });
      await request(`/rest/v1/workspaces?id=in.(${solo},${shared},${other})`, {
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
