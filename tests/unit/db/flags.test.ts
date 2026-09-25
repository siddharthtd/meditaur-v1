import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEATURE_FLAGS,
  flagIsOn,
  type AccountFlags,
  type AuthPort,
} from "@meditaur/domain";
import { createCachedFlags } from "../../../packages/db/src/flags-cache.ts";
import { createLocalFlagsPort } from "../../../packages/db/src/flags-local.ts";
import { createSupabaseFlagsPort } from "../../../packages/db/src/supabase.ts";
import type { LocalAccountFlags } from "../../../packages/db/src/ports.ts";
import { fakeSupabaseData } from "../../fixtures/supabase-data.ts";

/**
 * The flags' three readers (`P0 · 23`, slice 23c): the cloud row, the mirror, and the
 * absence of both.
 *
 * The properties worth holding are the ones a screen would never notice going wrong:
 * **a read that fails falls back to what the cloud last said, not to the defaults** —
 * otherwise every tunnel turns a hidden surface back on — and **the admin marker fails
 * closed**, because it is the one value here that grants access rather than hiding it.
 */
const USER = "u1";

function fakeAuth(userId: string | null): AuthPort {
  return {
    isConfigured: () => userId !== null,
    async getSession() {
      return userId ? { userId, expiresAt: null } : null;
    },
    async signIn() {
      throw new Error("not used");
    },
    async signUp() {
      throw new Error("not used");
    },
    async signOut() {},
    onSessionChange: () => () => {},
  };
}

/** The mirror, which is a read plus the one unconditional write the cache makes. */
function fakeMirror(initial: AccountFlags | null = null) {
  let row = initial;
  const writes: AccountFlags[] = [];
  const mirror: LocalAccountFlags = {
    async read() {
      return row ?? { flags: DEFAULT_FEATURE_FLAGS, isAdmin: false };
    },
    async writeCopy(_userId, next) {
      writes.push(next);
      row = next;
    },
  };
  return { mirror, writes, current: () => row };
}

describe("the account's flags, from the cloud", () => {
  it("reads the account's own row, and resolves a sparse one", async () => {
    const cloud = fakeSupabaseData({
      account_flags: [{ user_id: USER, is_admin: true, flags: { chakras: false } }],
    });
    const port = createSupabaseFlagsPort({ client: cloud.client });

    const read = await port.read(USER);
    expect(read.isAdmin).toBe(true);
    expect(read.flags.chakras).toBe(false);
    // Every other flag is present and on: the row is sparse, the answer is not.
    expect(flagIsOn(read.flags, "binaural")).toBe(true);
  });

  it("answers an untouched account with the defaults and no admin", async () => {
    // No row at all is the ordinary state of a new account, not an error.
    const cloud = fakeSupabaseData({ account_flags: [] });
    const read = await createSupabaseFlagsPort({ client: cloud.client }).read(USER);
    expect(read).toEqual({ flags: DEFAULT_FEATURE_FLAGS, isAdmin: false });
  });

  it("fails closed on the admin marker and open on a junk flag value", async () => {
    // Two different directions on purpose. A flag value this build cannot read is the
    // app's default — hiding a surface over a hand-edited row would be a worse failure
    // than showing one. `is_admin` is the opposite: anything but `true` is false, because
    // a marker that failed open would hand the panel to whoever the read went wrong for.
    const cloud = fakeSupabaseData({
      account_flags: [
        {
          user_id: USER,
          is_admin: "true",
          flags: { chakras: "off", karuna_reiki: false, symbol_systems: false },
        },
      ],
    });
    const read = await createSupabaseFlagsPort({ client: cloud.client }).read(USER);
    expect(read.isAdmin, "a string is not an admin").toBe(false);
    expect(read.flags.chakras, "a value that is not a boolean is the default").toBe(true);
    expect(read.flags.karuna_reiki).toBe(false);
    expect(Object.keys(read.flags).sort()).toEqual(Object.keys(DEFAULT_FEATURE_FLAGS).sort());
  });
});

describe("the flags where there is no cloud", () => {
  it("answers the defaults and says it cannot be configured", async () => {
    const port = createLocalFlagsPort();
    expect(port.isConfigured()).toBe(false);
    expect(await port.read(USER)).toEqual({ flags: DEFAULT_FEATURE_FLAGS, isAdmin: false });
  });
});

describe("the flags' mirror", () => {
  it("mirrors what the cloud answered, and reads through to it first", async () => {
    const cloud = fakeSupabaseData({
      account_flags: [{ user_id: USER, is_admin: false, flags: { binaural: false } }],
    });
    const mirror = fakeMirror();
    const port = createCachedFlags({
      auth: fakeAuth(USER),
      cloud: createSupabaseFlagsPort({ client: cloud.client }),
      local: mirror.mirror,
    });

    const read = await port.read(USER);
    expect(flagIsOn(read.flags, "binaural")).toBe(false);
    expect(mirror.writes, "the accepted read is what gets mirrored").toHaveLength(1);
    expect(flagIsOn(mirror.current()!.flags, "binaural")).toBe(false);
  });

  it("serves the last accepted answer when the cloud cannot be reached", async () => {
    // The property this whole file exists for. A reader whose flags are off, offline,
    // must not be handed the app with everything on — so the fallback is the mirror, not
    // the defaults, and only a mirror that was never written answers the defaults.
    const broken = {
      isConfigured: () => true,
      async read(): Promise<AccountFlags> {
        throw new Error("offline");
      },
    };
    const mirror = fakeMirror({ flags: { ...DEFAULT_FEATURE_FLAGS, chakras: false }, isAdmin: false });
    const port = createCachedFlags({
      auth: fakeAuth(USER),
      cloud: broken,
      local: mirror.mirror,
    });

    expect(flagIsOn((await port.read(USER)).flags, "chakras"), "still off").toBe(false);
    expect(mirror.writes, "a failed read mirrors nothing").toEqual([]);

    const never = createCachedFlags({
      auth: fakeAuth(USER),
      cloud: broken,
      local: fakeMirror().mirror,
    });
    expect(await never.read(USER), "a device that never read gets the defaults").toEqual({
      flags: DEFAULT_FEATURE_FLAGS,
      isAdmin: false,
    });
  });

  it("does not consult the cloud for an account the session is not", async () => {
    // The rule `createCachedPreferences` keeps: a signed-out device, or a read for another
    // identity, is answered locally — the cloud is only asked about the reader the session
    // names, because RLS would return nothing for anyone else anyway.
    const cloud = fakeSupabaseData({
      account_flags: [{ user_id: USER, is_admin: true, flags: { chakras: false } }],
    });
    const mirror = fakeMirror();
    const port = createCachedFlags({
      auth: fakeAuth(null),
      cloud: createSupabaseFlagsPort({ client: cloud.client }),
      local: mirror.mirror,
    });

    const read = await port.read(USER);
    expect(read, "signed out: the defaults, and nobody is an admin").toEqual({
      flags: DEFAULT_FEATURE_FLAGS,
      isAdmin: false,
    });
    expect(mirror.writes).toEqual([]);
  });
});
