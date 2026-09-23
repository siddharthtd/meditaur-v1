import { describe, expect, it } from "vitest";
import type { AppEvent } from "@meditaur/domain";
import { createSupabaseEventsPort, type SupabaseDataLike } from "../../../packages/db/src/supabase.ts";

/**
 * The `events` row as Postgres holds it.
 *
 * Column names are the contract, so the fake speaks them: a fake that stored
 * the domain's field names would prove nothing about the mapping. `received_at`
 * is deliberately absent from the write — the column default is the server's own
 * clock, which is a better answer than the client's.
 */
describe("the supabase events port", () => {
  it("writes the event as an events row", async () => {
    const written: Array<Record<string, unknown>> = [];
    const client: SupabaseDataLike = {
      select: async () => [],
      // The pull's two reads. The events port only ever writes, so what a range
      // or an `in` would return is not this test's business — the sync adapter
      // is their caller (P2 · 3).
      selectRange: async () => [],
      selectIn: async () => [],
      updateWhere: async () => [],
      insert: async (table, values) => {
        expect(table).toBe("events");
        written.push(values);
        return [];
      },
    };
    const event: AppEvent = {
      id: "e1",
      workspaceId: "ws1",
      userId: "u1",
      eventType: "client_error",
      payload: { message: "boom", stack: null, route: "/plan" },
      occurredAt: 1_700_000_000_000,
    };

    await createSupabaseEventsPort({ client }).append(event);

    expect(written).toEqual([
      {
        id: "e1",
        workspace_id: "ws1",
        user_id: "u1",
        event_type: "client_error",
        payload: { message: "boom", stack: null, route: "/plan" },
        occurred_at: new Date(1_700_000_000_000).toISOString(),
      },
    ]);
  });
});
