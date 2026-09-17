import { describe, expect, it } from "vitest";
import { FakeClock, type AuthSession } from "@meditaur/domain";
import {
  createSupabaseAuthPort,
  type SupabaseAuthLike,
} from "../../../packages/db/src/supabase.ts";

type RawSession = { user: { id: string }; expires_at: number | null };

// The port is exercised against a fake client so the mapping (session shape,
// epoch-ms deadline, error surfacing) is covered in the unit gate. The real SDK
// client only has to satisfy the same structural type, which
// `createSupabaseAuthClient` checks at compile time.
function harness() {
  const clock = new FakeClock();
  let current: RawSession | null = null;
  const client: SupabaseAuthLike = {
    async signInWithPassword({ email, password }) {
      if (password !== "secret") {
        return {
          data: { user: null, session: null },
          error: { message: "Invalid login credentials" },
        };
      }
      current = {
        user: { id: `user-${email}` },
        expires_at: Math.floor(clock.nowMs() / 1000) + 60,
      };
      return { data: { user: current.user, session: current }, error: null };
    },
    async signUp({ email, password }) {
      if (password === "taken") {
        return { data: { user: null, session: null }, error: { message: "User already registered" } };
      }
      const user = { id: `signup-${email}` };
      if (password === "confirm") {
        // Supabase's confirmation-on shape: a user, and deliberately no session.
        return { data: { user, session: null }, error: null };
      }
      current = { user, expires_at: Math.floor(clock.nowMs() / 1000) + 60 };
      return { data: { user, session: current }, error: null };
    },
    async signOut() {
      current = null;
      return { error: null };
    },
    async getSession() {
      return { data: { session: current }, error: null };
    },
  };
  return { clock, port: createSupabaseAuthPort({ client, clock }) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("supabase auth port", () => {
  it("reports no session before sign-in", async () => {
    const { port } = harness();
    expect(port.isConfigured()).toBe(true);
    expect(await port.getSession()).toBeNull();
  });

  it("maps a sign-in to a session with a millisecond deadline", async () => {
    const { port } = harness();
    const session = await port.signIn("a@example.test", "secret");
    expect(session.userId).toBe("user-a@example.test");
    expect(session.expiresAt).toBe(60_000);
    expect((await port.getSession())?.userId).toBe(session.userId);
  });

  it("surfaces the provider error on a failed sign-in", async () => {
    const { port } = harness();
    await expect(port.signIn("a@example.test", "wrong")).rejects.toMatchObject({
      code: "auth.signInFailed",
      message: "Invalid login credentials",
    });
    expect(await port.getSession()).toBeNull();
  });

  it("drops the session at the deadline and tells subscribers", async () => {
    const { port, clock } = harness();
    const seen: Array<AuthSession | null> = [];
    port.onSessionChange((session) => seen.push(session));
    await port.signIn("a@example.test", "secret");
    expect(seen).toHaveLength(1);

    clock.advance(60_000);
    await flush();
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeNull();
    expect(await port.getSession()).toBeNull();
  });

  it("signs a new account in when the project does not ask for confirmation", async () => {
    const { port } = harness();
    expect(await port.signUp("new@example.test", "secret")).toEqual({
      status: "signedIn",
      session: { userId: "signup-new@example.test", expiresAt: 60_000 },
    });
    expect((await port.getSession())?.userId).toBe("signup-new@example.test");
  });

  it("reports confirmation instead of a session when the provider returns none", async () => {
    const { port } = harness();
    const seen: Array<AuthSession | null> = [];
    port.onSessionChange((session) => seen.push(session));

    expect(await port.signUp("new@example.test", "confirm")).toEqual({
      status: "confirmationRequired",
    });
    // A user row with no session is not a signed-in state: the port must not
    // invent one, and subscribers must not be told anything changed.
    expect(await port.getSession()).toBeNull();
    expect(seen).toEqual([]);
  });

  it("surfaces the provider error when a sign-up is refused", async () => {
    const { port } = harness();
    await expect(port.signUp("new@example.test", "taken")).rejects.toMatchObject({
      code: "auth.signUpFailed",
      message: "User already registered",
    });
    expect(await port.getSession()).toBeNull();
  });

  it("signs out, clears the session, and unsubscribes", async () => {
    const { port } = harness();
    const seen: Array<AuthSession | null> = [];
    const stop = port.onSessionChange((session) => seen.push(session));
    await port.signIn("a@example.test", "secret");
    await port.signOut();
    expect(seen.map((row) => row?.userId ?? null)).toEqual(["user-a@example.test", null]);
    expect(await port.getSession()).toBeNull();

    stop();
    await port.signIn("a@example.test", "secret");
    expect(seen).toHaveLength(2);
  });
});
