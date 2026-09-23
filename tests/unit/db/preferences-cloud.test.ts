import { describe, expect, it } from "vitest";
import { PREFERENCES_ERRORS, stampedPreferences } from "@meditaur/application";
import { AppError, type UserPreferences } from "@meditaur/domain";
import {
  createSupabasePreferencesPort,
  type SupabaseDataLike,
} from "../../../packages/db/src/supabase.ts";
import { makePrefs } from "../../fixtures/library.ts";

/**
 * The `user_preferences` row as Postgres holds it. The column names are the
 * contract, so a fake that spoke the domain's field names would prove nothing
 * about the mapping.
 */
function row(prefs: UserPreferences): Record<string, unknown> {
  return {
    user_id: prefs.userId,
    stop_binaural_on_alarm: prefs.stopBinauralOnAlarm,
    auto_advance: prefs.autoAdvance,
    master_volume: prefs.masterVolume,
    alarm_volume: prefs.alarmVolume,
    tts_enabled: prefs.ttsEnabled,
    text_size: prefs.textSize,
    last_plan_id: prefs.lastPlanId,
    revision: prefs.revision,
    updated_at: new Date(prefs.updatedAt).toISOString(),
  };
}

/**
 * A fake `user_preferences` table: one row per user, a revision, and a request
 * log so the test can prove the predicate the adapter sent — which is the whole
 * point of the remote compare-and-swap.
 */
function fakeTable(input: { rows?: UserPreferences[]; failWith?: string } = {}) {
  const rows = new Map<string, Record<string, unknown>>();
  for (const prefs of input.rows ?? []) rows.set(prefs.userId, row(prefs));
  const calls: string[] = [];
  const guard = () => {
    if (input.failWith) throw new Error(input.failWith);
  };

  const client: SupabaseDataLike = {
    async select(table, column, value, columns) {
      calls.push(`select ${table} ${columns} where ${column}=${value}`);
      guard();
      const stored = rows.get(value);
      if (!stored || column !== "user_id") return [];
      return [stored];
    },
    async updateWhere(table, values, where) {
      calls.push(
        `update ${table} where ${Object.entries(where)
          .map(([column, value]) => `${column}=${value}`)
          .join(" and ")}`,
      );
      guard();
      const stored = rows.get(String(where.user_id));
      // The predicate, as PostgREST would apply it: nothing matches when the
      // stored revision is not the one the caller read.
      if (!stored || stored.revision !== where.revision) return [];
      const next = { ...stored, ...values };
      rows.set(String(where.user_id), next);
      return [next];
    },
    // The pull's two reads. `user_preferences` is read by user id, so this table
    // has neither a range nor an `in` of its own; they are here because the
    // interface the sync adapter widens requires them (P2 · 3). Logged rather
    // than silent, so a future caller of them shows up in `calls`.
    async selectRange() {
      calls.push("selectRange");
      return [];
    },
    async selectIn() {
      calls.push("selectIn");
      return [];
    },
    async insert(table, values) {
      calls.push(`insert ${table}`);
      guard();
      rows.set(String(values.user_id), { ...values });
      return [values];
    },
  };

  return { rows, calls, port: createSupabasePreferencesPort({ client }) };
}

describe("supabase preferences port", () => {
  it("reads the row for the given user", async () => {
    const { port } = fakeTable({ rows: [makePrefs({ revision: 3, textSize: "xl" })] });
    expect(await port.get("u1")).toMatchObject({ userId: "u1", revision: 3, textSize: "xl" });
    expect(await port.get("someone-else")).toBeNull();
  });

  it("writes with the revision it read in the predicate, in one statement", async () => {
    const { rows, calls, port } = fakeTable({ rows: [makePrefs({ revision: 2 })] });
    const stored = await port.save(stampedPreferences(makePrefs({ revision: 2, textSize: "xl" }), 99));
    expect(stored).toMatchObject({ revision: 3, textSize: "xl", updatedAt: 99 });

    // One request, and the revision it read is part of what it asked for — that
    // is what makes the swap atomic rather than a read followed by a write.
    expect(calls).toEqual(["update user_preferences where user_id=u1 and revision=2"]);
    expect(rows.get("u1")).toMatchObject({ revision: 3, text_size: "xl" });
  });

  it("refuses a write the store has moved past, and writes nothing", async () => {
    const { rows, port } = fakeTable({ rows: [makePrefs({ revision: 5, textSize: "lg" })] });
    // The caller still holds revision 2.
    expect(await port.save(makePrefs({ revision: 2, textSize: "xl" }))).toBeNull();
    expect(rows.get("u1")).toMatchObject({ revision: 5, text_size: "lg" });
  });

  it("inserts the first row an account ever writes", async () => {
    const { rows, calls, port } = fakeTable();
    const first = stampedPreferences(makePrefs({ userId: "u9" }), 1_000);
    expect(await port.save(first)).toMatchObject({ revision: 1 });
    expect(rows.get("u9")).toMatchObject({ revision: 1, updated_at: new Date(1_000).toISOString() });
    expect(calls).toEqual([
      "update user_preferences where user_id=u9 and revision=0",
      "select user_preferences revision where user_id=u9",
      "insert user_preferences",
    ]);
  });

  it("surfaces a refused request as an error rather than a false success", async () => {
    const { port } = fakeTable({ failWith: "JWT expired" });
    await expect(port.get("u1")).rejects.toThrow("JWT expired");
    await expect(port.save(makePrefs())).rejects.toBeInstanceOf(AppError);
  });

  it("keeps the conflict message the application turns into", () => {
    // Two places name the conflict: the store says nothing was written, the
    // application says why a reader sees that as words.
    expect(PREFERENCES_ERRORS.conflict).toBe("Settings were changed in another tab");
  });
});
