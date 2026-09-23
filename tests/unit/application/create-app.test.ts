import { describe, expect, it } from "vitest";
import {
  AUTH_ERRORS,
  CATALOG_BACKUP_ERRORS,
  CATALOG_BACKUP_SCHEMA_VERSION,
  CATALOG_ERRORS,
  createMeditaurApp,
  IMAGE_MAX_BYTES,
  MEDIA_ERRORS,
  MEDIA_MAX_BYTES,
  PLAN_ERRORS,
  PREFERENCES_ERRORS,
  PRESET_ERRORS,
} from "@meditaur/application";
import {
  FakeClock,
  SESSION_LOG_LIST_LIMIT,
  SNAPSHOT_KEEP_PER_PLAN,
  SNAPSHOT_SCHEMA_VERSION,
  type AuthSession,
  type SignUpOutcome,
} from "@meditaur/domain";
import {
  NEW_ROW_VERSION,
  makeBlock,
  makeEntries,
  makeEntry,
  makeFieldDef,
  makeIntention,
  makeMeditation,
  makeLibrary,
  makePlan,
  makePrefs,
  makePreset,
  makeSymbol,
  stageFixture,
} from "../../fixtures/library.ts";
import { appFromMemory, memoryPorts } from "./memory-ports.ts";

const library = makeLibrary({
  meditations: [makeMeditation("fp1", "Root")],
  symbols: [makeSymbol("s1", "Lam")],
  ...makeEntries([{ meditationId: "fp1", symbolId: "s1", texts: ["A1"] }]),
});

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

describe("createMeditaurApp", () => {
  it("compiles a plan through ports and stores the snapshot", async () => {
    const plan = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    const snapshot = await api.compileAndStoreSession(plan, "u1");
    expect(snapshot.instanceId).toBe("snap-1");
    expect(snapshot.blocks[0].symbolName).toBe("Lam");
    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(await api.getSnapshot("ws1", "snap-1")).toEqual(snapshot);
  });

  it("takes stop-binaural from the reader's preference", async () => {
    // The owner's round 5: the planner's switch for this is gone, because a
    // plan-level copy meant the Settings switch did nothing to an existing plan.
    // Compile is where the preference is read, so that is what is pinned here.
    const off = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [off],
      library,
      presets: library.presets,
      prefs: makePrefs({ stopBinauralOnAlarm: false }),
    });
    expect((await api.compileAndStoreSession(off, "u1")).stopBinauralOnAlarm).toBe(false);

    const on = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [off],
      library,
      presets: library.presets,
      prefs: makePrefs({ stopBinauralOnAlarm: true }),
    });
    expect((await on.compileAndStoreSession(off, "u1")).stopBinauralOnAlarm).toBe(true);
  });

  it("compiles a session from a stored plan id", async () => {
    const plan = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    const snapshot = await api.compileSession("u1", "ws1", "plan1");
    expect(snapshot.planId).toBe("plan1");
    expect(snapshot.blocks[0].symbolName).toBe("Lam");
    await expect(api.compileSession("u1", "ws1", "missing")).rejects.toMatchObject({
      code: "plan.missing",
      message: PLAN_ERRORS.missing,
    });
  });

  it("compiles a one-block all-symbols session without changing lastPlanId", async () => {
    const session = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: library.presets,
      prefs: makePrefs({ lastPlanId: "plan1" }),
    });
    const snapshot = await api.startSessionFromMeditation("u1", "ws1", "fp1");
    expect(snapshot.blocks).toHaveLength(1);
    expect(snapshot.blocks[0]?.symbolName).toBeNull();
    expect(snapshot.blocks[0]?.symbolGroups[0]?.name).toBe("Lam");
    expect(snapshot.blocks[0]?.intentions).toEqual(["A1"]);
    expect(snapshot.planId).toBe("01900000-0000-7000-8000-000000000060");
    expect((await api.getPreferences("u1"))?.lastPlanId).toBe("plan1");
    expect((await api.getPlan("ws1", "plan1"))?.blocks[0]?.symbolId).toBe("s1");
  });

  it("lists library data from the same ports REST or gRPC would call", async () => {
    const plan = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    const view = await api.getLibrary("ws1");
    expect(view.plans).toEqual([{ id: "plan1", name: "Session" }]);
    expect(view.meditations[0].name).toBe("Root");
    expect(view.presets[0].id).toBe("preset1");
    // The Database's own rows, archived ones included: the reader's live view and
    // the Archive read the same list, and the visibility rule is what separates
    // them.
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0]).toMatchObject({ meditationId: "fp1", symbolId: "s1" });
    expect(view.fieldDefs).toEqual([]);
    expect(view.fieldOptions).toEqual([]);
    expect(view.fieldValues).toEqual([]);
  });

  it("exports names, plans, and media blobs as JSON", async () => {
    const session = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const clock = new FakeClock();
    clock.advance(42);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: library.presets,
      prefs: null,
      clock,
    });
    const backup = await api.exportCatalog("ws1");
    expect(backup.schemaVersion).toBe(CATALOG_BACKUP_SCHEMA_VERSION);
    expect(backup.exportedAt).toBe(42);
    expect(backup.workspaceId).toBe("ws1");
    expect(backup.plans).toEqual([session]);
    expect(backup.plans[0]?.blocks[0]?.id).toBe("b1");
    expect(backup.meditations[0]?.name).toBe("Root");
    expect(backup.presets[0]?.id).toBe("preset1");
    expect(backup.blobs).toEqual({});
    expect(JSON.stringify(backup)).not.toMatch(/"bytes"/);
    // History travels with the catalog now; this fixture has recorded none.
    expect(backup.logs).toEqual([]);
  });

  it("round-trips session history through the catalog JSON", async () => {
    const session = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const source = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: library.presets,
      prefs: null,
      clock: new FakeClock(),
    });
    await source.recordSessionCompletion({
      workspaceId: "ws1",
      planId: session.id,
      blockCount: 2,
      totalDurationMs: 1_000,
    });
    const backup = await source.exportCatalog("ws1");
    expect(backup.logs).toHaveLength(1);
    expect(backup.logs[0]?.planId).toBe(session.id);

    // A second device, or the same one after its storage was cleared. The file
    // goes through JSON because that is what a backup actually is.
    const target = appFromMemory({
      context: { userId: "u1", workspaceId: "ws2" },
      plans: [],
      library,
      presets: library.presets,
      prefs: null,
      clock: new FakeClock(),
    });
    const raw = JSON.parse(JSON.stringify(backup)) as unknown;
    await target.importCatalog("ws2", raw);
    const restored = (await target.getLibrary("ws2")).logs;
    expect(restored).toHaveLength(1);
    expect(restored[0]?.planId).toBe(session.id);
    expect(restored[0]?.workspaceId).toBe("ws2");
    expect(restored[0]?.totalDurationMs).toBe(1_000);

    // Restoring the same file again merges rather than colliding: a log is
    // written by id, not appended.
    await target.importCatalog("ws2", raw);
    expect((await target.getLibrary("ws2")).logs).toHaveLength(1);
  });

  it("erases the device's store without signing anybody out", async () => {
    // The account and the device are separate erasures, and the one thing this
    // must never do is quietly sign the reader out. A recording auth port is how
    // that is checked rather than assumed.
    const calls: string[] = [];
    const session = { userId: "u1", expiresAt: null };
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, { symbolId: "s1" })])],
      library,
      presets: library.presets,
      prefs: null,
      auth: {
        isConfigured: () => true,
        getSession: async () => session,
        signIn: async () => session,
        signUp: async () => ({ status: "confirmationRequired" }),
        signOut: async () => {
          calls.push("signOut");
        },
        onSessionChange: () => () => {},
      },
      maintenance: {
        wipeLocalData: async () => {
          calls.push("wipe");
        },
      },
    });
    await api.wipeLocalData();
    expect(calls).toEqual(["wipe"]);
    expect(await api.getAuthSession()).toEqual(session);
  });

  it("closes the account through its own port, and refuses where none can be closed", async () => {
    // The port owns the server call — half of the job happens behind a
    // service-role key that never reaches the browser — and the app owns the order
    // around it, which the two cases below are about. What is checked here is the
    // seam: the call really reaches the port, and a build wired to the refusing
    // adapter says so with a code a screen can branch on instead of pretending to
    // have done it.
    const calls: string[] = [];
    const closable = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [],
      library,
      presets: library.presets,
      prefs: null,
      account: {
        isConfigured: () => true,
        closeAccount: async () => {
          calls.push("close");
        },
      },
    });
    expect(closable.accountIsConfigured()).toBe(true);
    await closable.closeAccount();
    expect(calls).toEqual(["close"]);

    const unrelated = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [],
      library,
      presets: library.presets,
      prefs: null,
    });
    expect(unrelated.accountIsConfigured()).toBe(false);
    await expect(unrelated.closeAccount()).rejects.toMatchObject({
      code: "account.notConfigured",
    });
  });

  it("closes the account in order: the server, then the session, then the device", async () => {
    // The order is the whole of it. A wipe before the server agreed would leave an
    // emptied device and a live account, which is the one outcome a reader would
    // call a bug rather than a clean close.
    const calls: string[] = [];
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [],
      library,
      presets: library.presets,
      prefs: null,
      account: {
        isConfigured: () => true,
        closeAccount: async () => {
          calls.push("close");
        },
      },
      auth: {
        isConfigured: () => true,
        getSession: async () => ({ userId: "u1", expiresAt: null }),
        signIn: async () => ({ userId: "u1", expiresAt: null }),
        signUp: async () => ({
          status: "signedIn" as const,
          session: { userId: "u1", expiresAt: null },
        }),
        signOut: async () => {
          calls.push("signOut");
        },
        onSessionChange: () => () => {},
      },
      maintenance: {
        wipeLocalData: async () => {
          calls.push("wipe");
        },
      },
    });

    await api.closeAccount();
    expect(calls).toEqual(["close", "signOut", "wipe"]);
  });

  it("erases the device even when the sign-out fails, and wipes nothing when the close does", async () => {
    const calls: string[] = [];
    const auth = (signOut: () => Promise<void>) => ({
      isConfigured: () => true,
      getSession: async () => ({ userId: "u1", expiresAt: null }),
      signIn: async () => ({ userId: "u1", expiresAt: null }),
      signUp: async () => ({
        status: "signedIn" as const,
        session: { userId: "u1", expiresAt: null },
      }),
      signOut,
      onSessionChange: () => () => {},
    });
    const account = (closeAccount: () => Promise<void>) => ({
      isConfigured: () => true,
      closeAccount,
    });
    const maintenance = {
      wipeLocalData: async () => {
        calls.push("wipe");
      },
    };

    // The account row is already gone by the time this runs, so the provider
    // rejecting the sign-out is the expected outcome — and the wipe must still
    // happen, because that is the reader's answer to what closing means.
    const deadSession = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [],
      library,
      presets: library.presets,
      prefs: null,
      account: account(async () => {
        calls.push("close");
      }),
      auth: auth(async () => {
        calls.push("signOut");
        throw new Error("the user no longer exists");
      }),
      maintenance,
    });
    await deadSession.closeAccount();
    expect(calls).toEqual(["close", "signOut", "wipe"]);

    // And the other direction: a close the server refused changes nothing at all.
    calls.length = 0;
    const refused = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [],
      library,
      presets: library.presets,
      prefs: null,
      account: account(async () => {
        throw new Error("purge_failed");
      }),
      auth: auth(async () => {
        calls.push("signOut");
      }),
      maintenance,
    });
    await expect(refused.closeAccount()).rejects.toThrow("purge_failed");
    expect(calls).toEqual([]);
  });

  it("restores names and plans by id into the current workspace", async () => {
    const session = makePlan([makeBlock("b1", 0, { symbolId: "s1" })], {
      revision: 4,
    });
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library: {
        ...library,
        meditations: [makeMeditation("fp1", "Root"), makeMeditation("fp-keep", "Keep me")],
        mediaAssets: [
          {
            ...NEW_ROW_VERSION,
            id: "media1",
            workspaceId: "ws1",
            kind: "ambient",
            name: "Rain",
            storagePath: "media1",
            durationMs: 1000,
            sortOrder: 0,
          },
        ],
      },
      presets: library.presets,
      prefs: null,
    });
    const backup = await api.exportCatalog("ws1");
    backup.workspaceId = "other";
    backup.meditations = backup.meditations
      .filter((fp) => fp.id === "fp1")
      .map((fp) => ({ ...fp, workspaceId: "other", name: "Restored root" }));
    // A row from the file names the *file's* workspace, and a restore binds it to
    // this one — the same rewrite every other table gets. A sentence from the file
    // that names no pair arrives as an **orphan**, which is what `entryId: null`
    // reads as (§2.1).
    backup.intentions = [
      ...backup.intentions,
      {
        ...NEW_ROW_VERSION,
        id: "i-from-file",
        workspaceId: "other",
        entryId: null,
        text: "I am calm",
        sortOrder: 0,
        archivedAt: null,
      },
    ];
    backup.plans = backup.plans.map((plan) => ({
      ...plan,
      workspaceId: "other",
      name: "Restored session",
      revision: 0,
    }));
    backup.mediaAssets = [
      {
        ...NEW_ROW_VERSION,
        id: "media-from-file",
        workspaceId: "other",
        kind: "alarm",
        name: "Bell",
        storagePath: "media-from-file",
        durationMs: 500,
        // The file's own array is the order it comes back in, so the imported row
        // lands after the one the device already held.
        sortOrder: 1,
      },
    ];
    await api.importCatalog("ws1", backup);
    const view = await api.getLibrary("ws1");
    // Sorted by id here because this test is about the restore, not the reader's
    // order — which the seed gives both rows the same value of.
    expect(
      view.meditations
        .map((fp) => ({ id: fp.id, name: fp.name, workspaceId: fp.workspaceId }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      [
        { id: "fp-keep", name: "Keep me", workspaceId: "ws1" },
        { id: "fp1", name: "Restored root", workspaceId: "ws1" },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(view.plans).toEqual([{ id: "plan1", name: "Restored session" }]);
    expect((await api.getPlan("ws1", "plan1"))?.revision).toBe(0);
    // The orphan sorts first — `entryId ?? ""` is the order the Affirmations table
    // reads — and it sits beside the line the file also carried, which kept its row.
    // The rewrite is the write's own (`stamped`), so only the row's identity, its
    // pair and its sentence are pinned here.
    expect(view.intentions).toMatchObject([
      { id: "i-from-file", workspaceId: "ws1", entryId: null, text: "I am calm" },
      { id: "e-fp1-s1-a0", workspaceId: "ws1", entryId: "e-fp1-s1", text: "A1" },
    ]);
    expect(view.mediaAssets.map((asset) => asset.id)).toEqual(["media1", "media-from-file"]);
  });

  it("round-trips media bytes through catalog JSON", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
      nextId: ids(),
    });
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    const saved = await api.saveMediaAsset({
      workspaceId: "ws1",
      kind: "ambient",
      name: "Rain",
      bytes,
      mimeType: "audio/wav",
      durationMs: 1000,
    });
    const backup = await api.exportCatalog("ws1");
    expect(backup.blobs[saved.id]?.mimeType).toBe("audio/wav");
    expect(backup.blobs[saved.id]?.data.length).toBeGreaterThan(0);
    await api.deleteMediaAsset("ws1", saved.id);
    expect(await api.getMediaBytes(saved.id)).toBeNull();
    await api.importCatalog("ws1", backup);
    const restored = await api.getMediaBytes(saved.id);
    expect(restored).not.toBeNull();
    expect([...new Uint8Array(restored!)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("restores a catalog inside one unit of work", async () => {
    const ports = memoryPorts({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
    });
    let inTransaction = false;
    let savedInside = false;
    const api = createMeditaurApp({
      ...ports,
      runInTransaction: async (work) => {
        inTransaction = true;
        try {
          return await work();
        } finally {
          inTransaction = false;
        }
      },
      presets: {
        ...ports.presets,
        save: async (preset) => {
          savedInside = inTransaction;
          await ports.presets.save(preset);
        },
      },
    });
    const backup = await api.exportCatalog("ws1");
    backup.presets = backup.presets.map((preset) => ({ ...preset, name: "Restored theta" }));
    await api.importCatalog("ws1", backup);
    expect(savedInside).toBe(true);
    expect((await api.getLibrary("ws1")).presets[0]?.name).toBe("Restored theta");
  });

  it("rejects a catalog file that is newer than the current schema", async () => {
    const session = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: library.presets,
      prefs: null,
    });
    await expect(api.importCatalog("ws1", null)).rejects.toThrow(CATALOG_BACKUP_ERRORS.invalid);
    // One past the current version, read from the constant: a literal here
    // would stop meaning "a newer file" the moment the schema is bumped.
    await expect(
      api.importCatalog("ws1", { schemaVersion: CATALOG_BACKUP_SCHEMA_VERSION + 1 }),
    ).rejects.toThrow(CATALOG_BACKUP_ERRORS.version);
  });

  it("opens the remembered plan and falls back when that id is gone", async () => {
    const session = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const evening = makePlan([makeBlock("b2", 0, { symbolId: "s1" })], {
      id: "plan2",
      name: "Evening",
    });
    const remembered = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session, evening],
      library,
      presets: library.presets,
      prefs: makePrefs({ lastPlanId: "plan2" }),
    });
    expect((await remembered.getActivePlan("u1", "ws1"))?.name).toBe("Evening");

    const missing = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: library.presets,
      prefs: makePrefs({ lastPlanId: "plan2" }),
    });
    expect((await missing.getActivePlan("u1", "ws1"))?.id).toBe("plan1");
    expect((await missing.getPreferences("u1"))?.lastPlanId).toBe("plan1");
  });

  it("never makes a remembered plan the active one when this device lacks it", async () => {
    // The `lastPlanId` guard, stated as its own rule: the preference says
    // which plan the reader was last on, it does not overrule what this device
    // has. With preferences read through the cloud that id now routinely arrives
    // from another device — a real plan, and not one that is here.
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [
        makePlan([makeBlock("b1", 0)]),
        // A real plan id, in a workspace this device is not looking at.
        makePlan([makeBlock("b1", 0)], { id: "plan2", workspaceId: "ws2" }),
      ],
      library,
      presets: library.presets,
      prefs: makePrefs({ lastPlanId: "from-another-device" }),
    });

    expect((await api.getActivePlan("u1", "ws1"))?.id).toBe("plan1");
    expect((await api.getPreferences("u1"))?.lastPlanId).toBe("plan1");
  });

  it("creates a starter session, remembers it, and will not delete the last plan", async () => {
    const session = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: library.presets,
      prefs: makePrefs(),
      nextId: ids(),
    });
    await expect(api.deletePlan("u1", "ws1", "plan1")).rejects.toThrow(
      PLAN_ERRORS.keepOne,
    );
    const created = await api.createPlan("u1", "ws1");
    expect(created.name).toBe("New session");
    // One block, and it is a meditation: the owner's round 15 deleted cool-off, so a
    // new plan no longer opens with a silent timer after it.
    expect(created.blocks).toHaveLength(1);
    expect(created.blocks[0]?.meditationId).toBeTruthy();
    expect((await api.getPreferences("u1"))?.lastPlanId).toBe(created.id);
    const remaining = await api.deletePlan("u1", "ws1", created.id);
    expect(remaining.id).toBe("plan1");
    expect(await api.getPlan("ws1", created.id)).toBeNull();
    expect((await api.getPreferences("u1"))?.lastPlanId).toBe("plan1");
  });

  it("creates a starter session using the first focus default preset", async () => {
    const session = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library: {
        ...library,
        meditations: [{ ...library.meditations[0], defaultBinauralPresetId: "preset2" }],
        presets: [makePreset(), makePreset({ id: "preset2", name: "Alpha" })],
      },
      presets: [makePreset(), makePreset({ id: "preset2", name: "Alpha" })],
      prefs: makePrefs(),
      nextId: ids(),
    });
    const created = await api.createPlan("u1", "ws1");
    expect(created.blocks[0]?.binauralPresetId).toBe("preset2");
  });

  it("duplicates a plan with new ids and does not share blocks", async () => {
    const session = makePlan(
      [
        makeBlock("b1", 0, { symbolId: "s1" }),
        makeBlock("b2", 1, { binauralPresetId: null }),
      ],
      { name: "Evening", revision: 4 },
    );
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: library.presets,
      prefs: makePrefs(),
      nextId: ids(),
    });
    const copy = await api.duplicatePlan("u1", "ws1", "plan1");
    expect(copy.id).toBe("id-1");
    expect(copy.name).toBe("Evening copy");
    expect(copy.revision).toBe(0);
    expect(copy.blocks.map((b) => b.id)).toEqual(["id-2", "id-3"]);
    expect(copy.blocks[0]).toMatchObject({
      symbolId: "s1",
      binauralPresetId: "preset1",
    });
    const original = await api.getPlan("ws1", "plan1");
    expect(original?.revision).toBe(4);
    expect(original?.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect((await api.getPreferences("u1"))?.lastPlanId).toBe(copy.id);
    const second = await api.duplicatePlan("u1", "ws1", "plan1");
    expect(second.name).toBe("Evening copy 2");
    await expect(api.duplicatePlan("u1", "ws1", "gone")).rejects.toThrow(PLAN_ERRORS.missing);
  });

  it("duplicates a preset onto a new id without sharing tones", async () => {
    const session = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: [makePreset()],
      prefs: makePrefs(),
      nextId: ids(),
    });
    const copy = await api.duplicatePreset("ws1", "preset1");
    expect(copy.id).toBe("id-1");
    expect(copy.name).toBe("Theta copy");
    copy.leftTones[0].hz = 999;
    const original = (await api.getLibrary("ws1")).presets.find((p) => p.id === "preset1");
    expect(original?.leftTones[0].hz).not.toBe(999);
    expect((await api.getLibrary("ws1")).presets.map((p) => p.id).sort()).toEqual([
      "id-1",
      "preset1",
    ]);
    const second = await api.duplicatePreset("ws1", "preset1");
    expect(second.name).toBe("Theta copy 2");
    await expect(api.duplicatePreset("ws1", "gone")).rejects.toThrow(PRESET_ERRORS.missing);
  });

  it("saves catalog items and refuses empty names", async () => {
    const plan = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    await expect(api.saveMeditation(makeMeditation("fp2", "   "))).rejects.toThrow(
      CATALOG_ERRORS.nameRequired,
    );
    const saved = await api.saveMeditation(makeMeditation("fp2", "  Solar  "));
    expect(saved.name).toBe("Solar");
    expect((await api.getLibrary("ws1")).meditations.map((fp) => fp.name)).toContain("Solar");
    const symbol = await api.saveSymbol(makeSymbol("s2", "  Sun  "));
    expect(symbol.name).toBe("Sun");
    const entry = await api.saveEntry(
      makeEntry("fp2", "s2", 0, { id: "e2", ...NEW_ROW_VERSION }),
    );
    expect(entry.id).toBe("e2");
    const line = await api.saveLine({
      ...NEW_ROW_VERSION,
      id: "a2",
      workspaceId: "ws1",
      entryId: "e2",
      sortOrder: 0,
      text: "  I am  ",
      archivedAt: null,
    });
    expect(line.text).toBe("I am");
    await expect(api.saveSymbol(makeSymbol("s3", "  "))).rejects.toThrow(
      CATALOG_ERRORS.nameRequired,
    );
    await expect(
      api.saveLine({
        ...NEW_ROW_VERSION,
        id: "a-new",
        workspaceId: "ws1",
        entryId: "e2",
        sortOrder: 1,
        text: "  ",
        archivedAt: null,
      }),
    ).rejects.toThrow(CATALOG_ERRORS.textRequired);
    // A line needs a row to live in: its row is what says which chakra and which
    // symbol it was written about.
    await expect(
      api.saveLine({
        ...NEW_ROW_VERSION,
        id: "a-lost",
        workspaceId: "ws1",
        entryId: "gone",
        sortOrder: 0,
        text: "I am",
        archivedAt: null,
      }),
    ).rejects.toThrow(CATALOG_ERRORS.entryMissing);
  });

  it("cascades a meditation delete through its symbols, lines, values and plans", async () => {
    const plan = makePlan([
      makeBlock("b1", 0, { symbolId: "s1" }),
      makeBlock("b2", 1, { meditationId: "fp2", symbolId: "s1" }),
    ]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });

    // What the reader is told before the second press.
    const impact = await api.getDeletionImpact("ws1", "meditation", "fp1");
    expect(impact).toContain("Root");
    expect(impact).toContain("1 row and 1 intention");
    expect(impact).toContain("its place in 1 plan");
    // Archiving the same chakra is the same count under a different verb, and it
    // says out loud that nothing is destroyed.
    const archived = await api.getDeletionImpact("ws1", "meditation", "fp1", "archive");
    expect(archived).toContain("Archives Root");
    expect(archived).toContain("nothing is deleted and Restore puts all of it back");

    await api.deleteMeditation("ws1", "fp1");
    const after = await api.getLibrary("ws1");
    expect(after.meditations.map((fp) => fp.id)).toEqual([]);
    // The rows that connected it go, and so do their lines: a line belongs to its
    // row, and a row whose chakra is gone would be a connection to nothing.
    expect(after.entries.filter((row) => row.meditationId === "fp1")).toEqual([]);
    expect(after.intentions).toEqual([]);

    const saved = await api.getPlan("ws1", plan.id);
    expect(saved?.blocks.map((b) => b.id)).toEqual(["b2"]);
    expect(saved?.blocks[0]!.sortOrder).toBe(0);
    // The revision moved, so an editor still holding the old copy is refused by
    // the CAS in savePlan rather than writing the deleted block back.
    expect(saved?.revision).toBe(plan.revision + 1);
    await expect(api.savePlan(plan)).rejects.toMatchObject({ code: "plan.conflict" });
  });

  it("cascades a symbol delete and hands its blocks back to the meditation", async () => {
    const plan = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });

    const impact = await api.getDeletionImpact("ws1", "symbol", "s1");
    expect(impact).toContain("1 row and 1 intention");
    // A block that named the symbol keeps its place and walks the next one, so it
    // is cleared rather than removed — and the sentence says which.
    expect(impact).toContain("1 block goes back to the next symbol");

    await api.deleteSymbol("ws1", "s1");
    const after = await api.getLibrary("ws1");
    expect(after.symbols).toEqual([]);
    expect(after.entries).toEqual([]);
    expect(after.intentions).toEqual([]);

    const saved = await api.getPlan("ws1", plan.id);
    expect(saved?.blocks).toHaveLength(1);
    expect(saved?.blocks[0]!.symbolId).toBeNull();
    expect(saved?.blocks[0]!.symbolScope).toBe("rotate");
  });

  it("removes a row and the lines written inside it", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, { symbolId: "s1" })])],
      library,
      presets: library.presets,
      prefs: null,
    });
    expect((await api.getLibrary("ws1")).intentions).toHaveLength(1);
    const impact = await api.getDeletionImpact("ws1", "entry", "e-fp1-s1");
    expect(impact).toBe("Removes this row and 1 line.");
    await api.deleteEntry("ws1", "e-fp1-s1");
    const after = await api.getLibrary("ws1");
    expect(after.entries).toEqual([]);
    expect(after.intentions).toEqual([]);
  });


  it("keeps a sentence, orphan or written about a row, and says what removing one takes", async () => {
    // The owner's round 16, §2.1: an affirmation and an intention are one table, so
    // every one of these verbs is the line's — `saveLine`, `deleteLine`,
    // `archiveLine` — and both shapes of sentence are covered here: the one written
    // about a row, and the orphan written about nothing yet.
    const { entries, intentions } = makeEntries([
      { meditationId: "fp1", symbolId: "s1", texts: ["I am grounded"] },
    ]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, { symbolId: "s1" })])],
      library: makeLibrary({ entries, intentions: [...intentions, makeIntention("or1", "I am calm")] }),
      presets: library.presets,
      prefs: null,
    });
    // The sentence is trimmed on the way in (`requireText`), and a blank one is
    // refused rather than stored as an empty row. `entryId: null` is the orphan,
    // which is the one write the merge newly allowed: a row to hang on used to be
    // required.
    const saved = await api.saveLine(makeIntention("or2", "  I am here  ", { sortOrder: 1 }));
    expect(saved.text).toBe("I am here");
    expect(saved.entryId).toBeNull();
    expect((await api.getLibrary("ws1")).intentions.map((row) => row.text)).toEqual([
      "I am calm",
      "I am here",
      "I am grounded",
    ]);
    await expect(api.saveLine(makeIntention("or3", "   "))).rejects.toThrow(
      CATALOG_ERRORS.textRequired,
    );
    // A sentence that names a row still has to name one that exists, so the check
    // the orphan is exempt from has not gone.
    await expect(api.saveLine(makeIntention("or4", "I am", { entryId: "gone" }))).rejects.toThrow(
      CATALOG_ERRORS.entryMissing,
    );

    // The sentence's deletion sentence does not depend on what it is written about:
    // a sentence is a line, and the line's own words are what the control says.
    expect(await api.getDeletionImpact("ws1", "line", "or1")).toBe("Removes this line.");
    await api.deleteLine("ws1", "or1");
    expect((await api.getLibrary("ws1")).intentions.map((row) => row.id)).toEqual([
      "or2",
      "e-fp1-s1-a0",
    ]);
    // A sentence in the Affirmations table may have columns of its own, and then the
    // count rides the sentence the way it rides a record's: the value hangs on the
    // line's id, so the delete takes it and the control says what it takes. This is
    // the half of the old affirmation's impact that survives the merge.
    await api.saveLine(makeIntention("or5", "I keep a note"));
    await api.saveFieldDef(makeFieldDef({ id: "fd-note", scope: "affirmation", key: "note" }));
    await api.saveFieldValue({
      entityId: "or5",
      fieldDefId: "fd-note",
      text: "keep",
      revision: 0,
      updatedAt: 0,
    });
    expect(await api.getDeletionImpact("ws1", "line", "or5")).toBe(
      "Removes this line with 1 field value.",
    );
    await api.deleteLine("ws1", "or5");
    expect((await api.getLibrary("ws1")).fieldValues.map((row) => row.entityId)).not.toContain(
      "or5",
    );
    // The same verb inside a row: the sentence goes and the row it was written
    // about stays, because the row is the association and not the sentence.
    await api.deleteLine("ws1", "e-fp1-s1-a0");
    const after = await api.getLibrary("ws1");
    expect(after.intentions.map((row) => row.id)).toEqual(["or2"]);
    expect(after.entries.map((row) => row.id)).toEqual(["e-fp1-s1"]);

    // Archiving steps it aside and Restore puts it back — the same pair of verbs
    // every other row has, and the Archive can list it because the library still
    // carries the sentence.
    await api.archiveLine("ws1", "or2");
    expect((await api.getLibrary("ws1")).intentions[0]?.archivedAt).not.toBeNull();
    expect(await api.getDeletionImpact("ws1", "line", "or2", "archive")).toBe(
      "Archives this line.",
    );
    await api.restoreLine("ws1", "or2");
    expect((await api.getLibrary("ws1")).intentions[0]?.archivedAt).toBeNull();
  });

  it("writes a stage's length and its switches back to the snapshot and the plan", async () => {
    // §4.2 and §12.19: what the run screen sets before Start is what the *next*
    // session starts from, so the write goes to the stored snapshot the screen
    // re-reads and to the plan block the next compile reads. Both halves matter —
    // a snapshot alone would forget it on the next session, a plan alone would
    // forget it on a reload.
    const stage = stageFixture(120_000, {
      key: "intentions",
      kind: "intentions",
      binaural: false,
      autoScroll: true,
    });
    const plan = makePlan([makeBlock("b1", 0, { symbolId: "s1", stages: [stage] })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    const snapshot = await api.compileAndStoreSession(plan, "u1");

    await api.saveSessionStageDuration("ws1", snapshot.instanceId, 0, 0, 90_000);
    await api.saveSessionStageFlag("ws1", snapshot.instanceId, 0, 0, "binaural", true);

    const stored = await api.getSnapshot("ws1", snapshot.instanceId);
    expect(stored?.blocks[0]?.stages[0]).toMatchObject({
      durationMs: 90_000,
      binaural: true,
      autoScroll: true,
    });
    // The block's own total moves with the length, and only with the length: a
    // switch is not a length.
    expect(stored?.blocks[0]?.durationMs).toBe(90_000);

    const kept = await api.getPlan("ws1", plan.id);
    expect(kept?.blocks[0]?.stages[0]).toMatchObject({
      durationMs: 90_000,
      binaural: true,
      autoScroll: true,
    });

    // A stage the plan does not have — a stored snapshot of a plan that has since
    // changed — is a no-op rather than an invented block.
    await api.saveSessionStageFlag("ws1", snapshot.instanceId, 4, 0, "binaural", false);
    expect((await api.getSnapshot("ws1", snapshot.instanceId))?.blocks).toHaveLength(1);
  });

  it("saves presets, lists them, and clears what used a deleted one", async () => {
    const extra = makePreset({ id: "preset2", name: "Delta" });
    const plan = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library: { ...library, presets: [makePreset(), extra] },
      presets: [makePreset(), extra],
      prefs: null,
    });
    const saved = await api.savePreset(makePreset({ id: "preset2", name: "  Deep  " }));
    expect(saved.name).toBe("Deep");
    expect((await api.getLibrary("ws1")).presets.map((p) => p.name)).toEqual(["Theta", "Deep"]);
    await expect(api.savePreset(makePreset({ name: "  " }))).rejects.toThrow(
      CATALOG_ERRORS.nameRequired,
    );
    // The block that played it loses its sound; the plan stays.
    expect(await api.getDeletionImpact("ws1", "preset", "preset1")).toContain("cleared");
    await api.deletePreset("ws1", "preset1");
    expect((await api.getLibrary("ws1")).presets.map((p) => p.id)).toEqual(["preset2"]);
    const afterPreset = await api.getPlan("ws1", plan.id);
    expect(afterPreset?.blocks[0]!.binauralPresetId).toBeNull();
    // The last preset is the one refusal left: with none there is nothing left
    // to assign a block.
    await expect(api.deletePreset("ws1", "preset2")).rejects.toThrow(
      CATALOG_ERRORS.keepOnePreset,
    );
  });

  it("clears a meditation's default sound when its preset goes", async () => {
    const extra = makePreset({ id: "preset2", name: "Delta" });
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, { binauralPresetId: null })])],
      library: { ...library, presets: [makePreset(), extra] },
      presets: [makePreset(), extra],
      prefs: null,
    });
    await api.deletePreset("ws1", "preset1");
    expect((await api.getLibrary("ws1")).meditations[0]!.defaultBinauralPresetId).toBeNull();
  });

  it("answers a preset's delete with the rows the cascade rewrote", async () => {
    // `P2 · 4`: a delete cannot be patched from a returned row, because the
    // cascade rewrites rows the deleted id does not name — the meditations whose
    // default sound it was, and the plan blocks that played it. This is what the
    // write answers instead.
    const plan = makePlan([makeBlock("b1", 0, { binauralPresetId: "preset1" })]);
    const extra = makePreset({ id: "preset2", name: "Delta" });
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library: {
        ...library,
        meditations: [makeMeditation("fp1", "Root", { defaultBinauralPresetId: "preset1" })],
        presets: [makePreset(), extra],
      },
      presets: [makePreset(), extra],
      prefs: null,
    });

    const changes = await api.deletePreset("ws1", "preset1");
    expect(changes.removed.presets).toEqual(["preset1"]);
    expect(changes.updated.meditations.map((row) => row.id)).toEqual(["fp1"]);
    expect(changes.updated.meditations[0]!.defaultBinauralPresetId).toBeNull();
    expect(changes.updated.plans.map((row) => row.id)).toEqual(["plan1"]);
    expect(changes.updated.plans[0]!.blocks[0]!.binauralPresetId).toBeNull();
    // A row the cascade did not touch is absent, or a screen would rewrite it
    // from a copy that has since moved.
    expect(changes.removed.mediaAssets).toEqual([]);
    expect(changes.updated.symbols).toEqual([]);

    // The answer is what a refetch would have said, row for row.
    expect(changes.updated.meditations).toEqual((await api.getLibrary("ws1")).meditations);
    expect(changes.updated.plans[0]).toEqual(await api.getPlan("ws1", "plan1"));
  });

  it("answers a symbol's delete with the rows and the lines that went with it", async () => {
    // The preset's answer, with one more thing it has to say: an entry that named
    // the symbol is a connection to something gone, and the lines inside it belong
    // to the row — `deleteEntry` is what enforces that locally, and `on delete
    // cascade` says it on the server. So the ids of both are part of the answer,
    // because a screen holding the Entries and Lines tables has to drop them.
    const plan = makePlan([makeBlock("b1", 0, { symbolId: "s1", symbolScope: "all" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    const entryIds = library.entries.map((row) => row.id);
    const lineIds = library.intentions.map((row) => row.id);

    const changes = await api.deleteSymbol("ws1", "s1");

    expect(changes.removed.symbols).toEqual(["s1"]);
    expect(changes.removed.entries).toEqual(entryIds);
    expect(changes.removed.intentions).toEqual(lineIds);
    expect(changes.removed.presets).toEqual([]);
    // The block keeps its place and goes back to walking the symbols its
    // meditation still has, which is the second thing the answer has to carry.
    expect(changes.updated.plans.map((row) => row.id)).toEqual(["plan1"]);
    expect(changes.updated.plans[0]!.blocks[0]!.symbolId).toBeNull();
    expect(changes.updated.plans[0]!.blocks[0]!.symbolScope).toBe("rotate");
    // The meditation survives its symbol: it was the connection that went.
    expect(changes.updated.meditations).toEqual([]);

    // The answer is what a refetch would have said, row for row.
    expect(changes.updated.plans[0]).toEqual(await api.getPlan("ws1", "plan1"));
    const back = await api.getLibrary("ws1");
    expect(back.symbols).toEqual([]);
    expect(back.entries).toEqual([]);
    expect(back.intentions).toEqual([]);
  });

  it("answers a meditation's delete with the rows, the lines and the blocks it took", async () => {
    // The symbol's answer, with the rows this cascade takes instead of rewrites:
    // a removed meditation is gone from the plans as well, so there is no row left
    // to replace by id — the plan is what the screen has to be handed back.
    const plan = makePlan([makeBlock("b1", 0, { meditationId: "fp1", symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    const entryIds = library.entries.map((row) => row.id);
    const lineIds = library.intentions.map((row) => row.id);

    const changes = await api.deleteMeditation("ws1", "fp1");

    expect(changes.removed.meditations).toEqual(["fp1"]);
    expect(changes.removed.entries).toEqual(entryIds);
    expect(changes.removed.intentions).toEqual(lineIds);
    // The symbol was not part of this cascade: the connection went, not the row.
    expect(changes.removed.symbols).toEqual([]);
    expect(changes.updated.plans.map((row) => row.id)).toEqual(["plan1"]);
    expect(changes.updated.plans[0]!.blocks).toEqual([]);

    // The answer is what a refetch would have said, row for row.
    expect(changes.updated.plans[0]).toEqual(await api.getPlan("ws1", "plan1"));
    const back = await api.getLibrary("ws1");
    expect(back.meditations).toEqual([]);
    expect(back.entries).toEqual([]);
    expect(back.intentions).toEqual([]);
  });

  it("answers a type's delete with every meditation that named it", async () => {
    // The type is read from the fixture rather than spelled out, because what the
    // test is about is that the answer covers *every* row the delete took — the
    // type, the meditations, and the lines inside their entries.
    const typeId = library.meditations[0]!.typeId;
    const plan = makePlan([makeBlock("b1", 0, { meditationId: "fp1", symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });

    const changes = await api.deleteMeditationType("ws1", typeId);

    expect(changes.removed.meditationTypes).toEqual([typeId]);
    expect(changes.removed.meditations).toEqual(["fp1"]);
    expect(changes.removed.entries).toEqual(library.entries.map((row) => row.id));
    expect(changes.removed.intentions).toEqual(library.intentions.map((row) => row.id));
    expect(changes.updated.plans[0]!.blocks).toEqual([]);
    expect(changes.updated.plans[0]).toEqual(await api.getPlan("ws1", "plan1"));
  });

  it("archives a row without touching what it holds, and brings it back whole", async () => {
    const plan = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    await api.archiveEntry("ws1", "e-fp1-s1");
    const hidden = await api.getLibrary("ws1");
    expect(hidden.entries[0]?.archivedAt).not.toBeNull();
    // Nothing else moved: the line is still there, with its own place, because
    // archiving hides a row rather than dismantling it (§3.1).
    expect(hidden.intentions).toHaveLength(1);
    expect(hidden.intentions[0]).toMatchObject({ entryId: "e-fp1-s1", text: "A1" });

    await api.restoreEntry("ws1", "e-fp1-s1");
    const back = await api.getLibrary("ws1");
    expect(back.entries[0]).toMatchObject({ archivedAt: null, sortOrder: 0 });
    const snapshot = await api.compileSession("u1", "ws1", "plan1");
    expect(snapshot.blocks[0].symbolGroups[0]?.intentions).toEqual(["A1"]);
  });

  it("steps a meditation's blocks aside while it is archived, and reveals them again", async () => {
    const plan = makePlan([
      makeBlock("b1", 0, { meditationId: "fp1", symbolId: "s1" }),
      // A second meditation, because the test's point is that *one* meditation's
      // blocks step aside while the plan keeps them (the owner's rule, 2026-09-18)
      // and a second block is what is still left to compile. It used to be a
      // cool-off block, which had no meditation to archive.
      makeBlock("b2", 1, { meditationId: "fp2", symbolId: "s2", binauralPresetId: null }),
    ]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library: {
        ...library,
        meditations: [...library.meditations, makeMeditation("fp2", "Heart")],
        symbols: [...library.symbols, makeSymbol("s2", "Earth")],
      },
      presets: library.presets,
      prefs: null,
    });
    await api.archiveRecord("ws1", "meditation", "fp1");
    // The block is still in the plan: it is not shown and not compiled, and the
    // plan was not edited to achieve either.
    const stored = await api.getPlan("ws1", "plan1");
    expect(stored?.blocks).toHaveLength(2);
    expect(stored?.revision).toBe(0);
    const snapshot = await api.compileSession("u1", "ws1", "plan1");
    expect(snapshot.blocks.map((block) => block.blockId)).toEqual(["b2"]);

    await api.restoreRecord("ws1", "meditation", "fp1");
    const revealed = await api.compileSession("u1", "ws1", "plan1");
    expect(revealed.blocks.map((block) => block.blockId)).toEqual(["b1", "b2"]);
    expect(revealed.blocks[0].symbolGroups[0]?.intentions).toEqual(["A1"]);
  });

  it("refuses to compile a plan whose every block is archived out", async () => {
    const plan = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    await api.archiveRecord("ws1", "meditation", "fp1");
    await expect(api.compileSession("u1", "ws1", "plan1")).rejects.toThrow(
      "Every block in this plan is archived",
    );
  });

  it("reorders rows, and the lines inside one row", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library: makeLibrary({
        ...makeEntries([
          { meditationId: "fp1", symbolId: "s1", texts: ["A", "B", "C"] },
          { meditationId: "fp1", symbolId: "s2", texts: [] },
        ]),
      }),
      presets: library.presets,
      prefs: null,
    });
    await api.reorderEntries("ws1", ["e-fp1-s2", "e-fp1-s1"]);
    expect((await api.getLibrary("ws1")).entries.map((row) => row.id)).toEqual([
      "e-fp1-s2",
      "e-fp1-s1",
    ]);
    await api.reorderLines("ws1", "e-fp1-s1", ["e-fp1-s1-a2", "e-fp1-s1-a0", "e-fp1-s1-a1"]);
    const lines = (await api.getLibrary("ws1")).intentions
      .filter((row) => row.entryId === "e-fp1-s1")
      .map((row) => row.text);
    expect(lines).toEqual(["C", "A", "B"]);
  });

  it("sweeps a row the reader emptied, names it, and caps the report at five", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
    });
    const report = await api.sweepOrphanedEntries("ws1", ["e-fp1-s1"]);
    expect(report).toEqual({ swept: [{ id: "e-fp1-s1", label: "Root × Lam" }], total: 1 });
    const after = await api.getLibrary("ws1");
    expect(after.entries[0]?.archivedAt).not.toBeNull();
    // The lines are untouched: the row stepped aside, it was not dismantled.
    expect(after.intentions).toHaveLength(1);
    // Running it again is a no-op: a row that is already archived is not news.
    expect(await api.sweepOrphanedEntries("ws1", ["e-fp1-s1"])).toEqual({
      swept: [],
      total: 0,
    });

    const many = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library: makeLibrary({
        meditations: [makeMeditation("fp1", "Root")],
        symbols: [
          makeSymbol("s1", "Lam"),
          makeSymbol("s2", "Earth"),
          makeSymbol("s3", "Yam"),
          makeSymbol("s4", "Ram"),
          makeSymbol("s5", "Hum"),
          makeSymbol("s6", "Om"),
        ],
        ...makeEntries([
          { meditationId: "fp1", symbolId: "s1" },
          { meditationId: "fp1", symbolId: "s2" },
          { meditationId: "fp1", symbolId: "s3" },
          { meditationId: "fp1", symbolId: "s4" },
          { meditationId: "fp1", symbolId: "s5" },
          { meditationId: "fp1", symbolId: "s6" },
        ]),
      }),
      presets: library.presets,
      prefs: null,
    });
    const sweptMany = await many.sweepOrphanedEntries("ws1", [
      "e-fp1-s1",
      "e-fp1-s2",
      "e-fp1-s3",
      "e-fp1-s4",
      "e-fp1-s5",
      "e-fp1-s6",
    ]);
    expect(sweptMany.total).toBe(6);
    expect(sweptMany.swept).toHaveLength(5);
    expect(sweptMany.swept[0]?.label).toBe("Root × Lam");
  });

  it("refuses a row that points at nothing, and a second row for one pair", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
    });
    await expect(
      api.saveEntry(makeEntry(null, null, 0, { id: "e-empty" })),
    ).rejects.toThrow(CATALOG_ERRORS.entryNeedsRef);
    await expect(
      api.saveEntry(makeEntry("fp1", "s1", 1, { id: "e-dup" })),
    ).rejects.toThrow(CATALOG_ERRORS.entryExists);
  });

  it("names a column, keeps its key, and refuses to remove one that holds values", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
    });
    const saved = await api.saveFieldDef(
      makeFieldDef({ key: "", label: "  Vedic mantra  ", description: "  What I chant  " }),
    );
    // The reader names the column; the key it is stored under is derived from that
    // heading, and the description is the reader's own words.
    expect(saved).toMatchObject({
      key: "vedic-mantra",
      label: "Vedic mantra",
      description: "What I chant",
      scope: "symbol",
      cellType: "text",
    });
    // A heading that collides with a built-in column, or with another column of
    // the same table, gets a numbered suffix rather than a refusal: the reader has
    // no way to see the collision coming.
    expect(
      await api.saveFieldDef(makeFieldDef({ id: "fd-name", key: "", label: "Name" })),
    ).toMatchObject({ key: "name-2" });
    expect(
      await api.saveFieldDef(makeFieldDef({ id: "fd2", key: "", label: "Seed" })),
    ).toMatchObject({ key: "seed" });
    // A column that already exists keeps its key: it is what a stored value hangs
    // off and what a plan's display names, so a rename must not move either.
    const renamed = await api.saveFieldDef(
      makeFieldDef({ id: "fd2", key: "seed", label: "Renamed heading" }),
    );
    expect(renamed).toMatchObject({ key: "seed", label: "Renamed heading" });
    await expect(
      api.saveFieldDef(makeFieldDef({ id: "fd-reserved", key: "name", label: "Mantra" })),
    ).rejects.toThrow(CATALOG_ERRORS.keyReserved);
    await expect(api.saveFieldDef(makeFieldDef({ key: "", label: "  " }))).rejects.toThrow(
      CATALOG_ERRORS.nameRequired,
    );

    // A column's type is fixed once a cell holds something, so no stored value is
    // ever reinterpreted as another shape (§4).
    const typed = await api.saveFieldDef(
      makeFieldDef({ id: "fd-type", key: "", label: "Element", cellType: "select" }),
    );
    const option = await api.saveFieldOption({
      ...NEW_ROW_VERSION,
      id: "opt1",
      workspaceId: "ws1",
      fieldDefId: typed.id,
      label: "  Earth  ",
      sortOrder: 0,
    });
    expect(option.label).toBe("Earth");
    const chosen = await api.saveFieldValue({
      ...NEW_ROW_VERSION,
      entityId: "s1",
      fieldDefId: typed.id,
      text: option.id,
    });
    await expect(api.saveFieldDef({ ...typed, cellType: "number" })).rejects.toThrow(
      CATALOG_ERRORS.fieldTypeLocked,
    );
    await expect(api.deleteFieldOption("ws1", "opt1")).rejects.toThrow(
      CATALOG_ERRORS.optionInUse,
    );
    expect(await api.getDeletionImpact("ws1", "field", typed.id)).toContain("1 value");
    await expect(api.deleteFieldDef("ws1", typed.id)).rejects.toThrow(
      CATALOG_ERRORS.fieldHoldsValues,
    );

    // Empty the cells and the column goes, options included: nothing points at it
    // any more, so there is nothing left to protect.
    await api.saveFieldValue({ ...chosen, text: "  " });
    await api.deleteFieldDef("ws1", typed.id);
    const after = await api.getLibrary("ws1");
    expect(after.fieldDefs.map((d) => d.id)).not.toContain(typed.id);
    expect(after.fieldOptions).toEqual([]);

    const value = await api.saveFieldValue({
      ...NEW_ROW_VERSION,
      entityId: "s1",
      fieldDefId: "fd2",
      text: "  lam  ",
    });
    expect(value.text).toBe("lam");
    await api.saveFieldValue({
      ...NEW_ROW_VERSION,
      entityId: "s1",
      fieldDefId: "fd2",
      text: "  ",
    });
    expect((await api.getLibrary("ws1")).fieldValues).toEqual([]);
  });

  it("deletes unused catalog items, including the last meditation", async () => {
    const plan = makePlan([makeBlock("b1", 0)]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library: {
        ...library,
        meditations: [makeMeditation("fp1", "Root")],
        symbols: [],
        ...makeEntries([{ meditationId: "fp1", symbolId: null, texts: ["Hold"] }]),
      },
      presets: library.presets,
      prefs: null,
    });
    await api.deleteLine("ws1", "e-fp1-none-a0");
    expect((await api.getLibrary("ws1")).intentions).toEqual([]);
    await api.deleteMeditation("ws1", "fp1");
    const after = await api.getLibrary("ws1");
    expect(after.meditations).toEqual([]);
    // The row that named it went with it.
    expect(after.entries).toEqual([]);
  });

  it("saves audio files and refuses delete while a plan block uses them", async () => {
    const unused = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
      nextId: ids(),
    });
    await expect(
      unused.saveMediaAsset({
        workspaceId: "ws1",
        kind: "ambient",
        name: "Rain",
        bytes: new ArrayBuffer(0),
        mimeType: "audio/wav",
        durationMs: 1000,
      }),
    ).rejects.toThrow(MEDIA_ERRORS.emptyFile);
    const saved = await unused.saveMediaAsset({
      workspaceId: "ws1",
      kind: "ambient",
      name: "  Rain  ",
      bytes: new ArrayBuffer(8),
      mimeType: "audio/wav",
      durationMs: 1500,
    });
    expect(saved.name).toBe("Rain");
    expect(saved.storagePath).toBe(saved.id);
    expect((await unused.getLibrary("ws1")).mediaAssets.map((a) => a.name)).toContain("Rain");
    await unused.deleteMediaAsset("ws1", saved.id);
    expect((await unused.getLibrary("ws1")).mediaAssets).toEqual([]);

    const inPlan = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, { ambientAssetId: "rain1" })])],
      library: {
        ...library,
        mediaAssets: [
          {
            ...NEW_ROW_VERSION,
            id: "rain1",
            workspaceId: "ws1",
            kind: "ambient",
            name: "Rain",
            storagePath: "rain1",
            durationMs: 1000,
            sortOrder: 0,
          },
        ],
      },
      presets: library.presets,
      prefs: null,
    });
    await inPlan.deleteMediaAsset("ws1", "rain1");
    // The block keeps its place and stops playing the file.
    const afterMedia = await inPlan.getPlan("ws1", "plan1");
    expect(afterMedia?.blocks[0]!.ambientAssetId).toBeNull();
  });

  it("answers a file's delete with every row that pointed at it", async () => {
    // Three kinds of row can name an asset, and only one of them is the id the
    // reader pressed. The change-set is how the screen hears about the rest.
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [
        makePlan([
          makeBlock("b1", 0, { ambientAssetId: "rain1", alarmAssetId: "bell1" }),
          makeBlock("b2", 1),
        ]),
      ],
      library: {
        ...library,
        meditations: [makeMeditation("fp1", "Root", { representationAssetId: "rain1" })],
        symbols: [makeSymbol("s1", "Lam", { imageAssetId: "rain1" })],
        mediaAssets: [
          {
            ...NEW_ROW_VERSION,
            id: "rain1",
            workspaceId: "ws1",
            kind: "ambient",
            name: "Rain",
            storagePath: "rain1",
            durationMs: 1000,
            sortOrder: 0,
          },
          {
            ...NEW_ROW_VERSION,
            id: "bell1",
            workspaceId: "ws1",
            kind: "alarm",
            name: "Bell",
            storagePath: "bell1",
            durationMs: 1000,
            sortOrder: 1,
          },
        ],
      },
      presets: library.presets,
      prefs: null,
    });

    const changes = await api.deleteMediaAsset("ws1", "rain1");
    expect(changes.removed.mediaAssets).toEqual(["rain1"]);
    expect(changes.updated.meditations.map((row) => row.id)).toEqual(["fp1"]);
    expect(changes.updated.meditations[0]!.representationAssetId).toBeNull();
    expect(changes.updated.symbols.map((row) => row.id)).toEqual(["s1"]);
    expect(changes.updated.symbols[0]!.imageAssetId).toBeNull();
    expect(changes.updated.plans.map((row) => row.id)).toEqual(["plan1"]);
    const block = changes.updated.plans[0]!.blocks[0]!;
    expect(block.ambientAssetId).toBeNull();
    // Only the deleted file is cleared: the alarm names another one and stays.
    expect(block.alarmAssetId).toBe("bell1");
    // The other block was never touched, so the plan it belongs to is still one
    // row in the answer, with both blocks.
    expect(changes.updated.plans[0]!.blocks.map((row) => row.id)).toEqual(["b1", "b2"]);
    expect(changes.removed.presets).toEqual([]);

    expect(changes.updated.meditations).toEqual((await api.getLibrary("ws1")).meditations);
    expect(changes.updated.symbols).toEqual((await api.getLibrary("ws1")).symbols);
    expect(changes.updated.plans[0]).toEqual(await api.getPlan("ws1", "plan1"));
    expect((await api.getLibrary("ws1")).mediaAssets.map((row) => row.id)).toEqual(["bell1"]);
  });

  it("puts a new audio file after the last one, and lists them in that order", async () => {
    // The owner's answer of 2026-09-21: the order is what lets a screen insert an
    // upload where it belongs instead of re-reading the catalogue (`P2 · 4`).
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
      nextId: ids(),
    });
    const upload = (name: string) =>
      api.saveMediaAsset({
        workspaceId: "ws1",
        kind: "ambient",
        name,
        bytes: new ArrayBuffer(8),
        mimeType: "audio/wav",
        durationMs: 1000,
      });

    const first = await upload("Zebra");
    const second = await upload("Apple");
    // The order is the uploads', not the alphabet's: the list is the app's order,
    // and a later reorder moves it rather than the names deciding.
    expect([first.sortOrder, second.sortOrder]).toEqual([0, 1]);
    expect((await api.getLibrary("ws1")).mediaAssets.map((row) => row.name)).toEqual([
      "Zebra",
      "Apple",
    ]);

    // A delete leaves the rest of the order alone, and the next upload still goes
    // last — so two rows can never claim one place.
    await api.deleteMediaAsset("ws1", first.id);
    const third = await upload("Bell");
    expect(third.sortOrder).toBe(2);
    expect((await api.getLibrary("ws1")).mediaAssets.map((row) => row.name)).toEqual([
      "Apple",
      "Bell",
    ]);
  });

  it("deletes a plan inside one unit of work", async () => {
    const base = memoryPorts({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [
        makePlan([makeBlock("b1", 0)]),
        { ...makePlan([makeBlock("b2", 0)]), id: "plan2" },
      ],
      library,
      presets: library.presets,
      prefs: null,
    });
    let inTransaction = false;
    let deletedInside = false;
    const api = createMeditaurApp({
      ...base,
      runInTransaction: async (work) => {
        inTransaction = true;
        try {
          return await work();
        } finally {
          inTransaction = false;
        }
      },
      plans: {
        ...base.plans,
        async delete(planId) {
          if (inTransaction) deletedInside = true;
          await base.plans.delete(planId);
        },
      },
    });
    await api.deletePlan("u1", "ws1", "plan1");
    expect(deletedInside).toBe(true);
    expect(await api.getPlan("ws1", "plan2")).not.toBeNull();
  });

  it("loads every plan in one batch instead of one read per plan", async () => {
    const base = memoryPorts({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [
        makePlan([makeBlock("b1", 0)]),
        { ...makePlan([makeBlock("b2", 0)]), id: "plan2" },
      ],
      library,
      presets: library.presets,
      prefs: null,
    });
    const api = createMeditaurApp({
      ...base,
      plans: {
        ...base.plans,
        async getById() {
          throw new Error("plans must be read with getMany");
        },
      },
    });
    const backup = await api.exportCatalog("ws1");
    expect(backup.plans.map((plan) => plan.id).sort()).toEqual(["plan1", "plan2"]);
  });

  it("serves the library without a second presets read", async () => {
    const base = memoryPorts({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
    });
    const api = createMeditaurApp({
      ...base,
      presets: {
        ...base.presets,
        async list() {
          throw new Error("getLibrary must reuse the compile library's presets");
        },
      },
    });
    const view = await api.getLibrary("ws1");
    expect(view.presets.length).toBe(library.presets.length);
  });

  it("does not read a plan or snapshot from another workspace", async () => {
    const plan = makePlan([makeBlock("b1", 0)]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    const snapshot = await api.compileAndStoreSession(plan, "u1");
    expect(await api.getPlan("other", "plan1")).toBeNull();
    expect(await api.getSnapshot("other", snapshot.instanceId)).toBeNull();
    expect(await api.openPlan("u1", "other", "plan1")).toBeNull();
    await expect(api.compileSession("u1", "other", "plan1")).rejects.toThrow(PLAN_ERRORS.missing);
    await expect(api.duplicatePlan("u1", "other", "plan1")).rejects.toThrow(
      PLAN_ERRORS.missing,
    );
    expect(await api.getPlan("ws1", "plan1")).not.toBeNull();
    expect(await api.getSnapshot("ws1", snapshot.instanceId)).not.toBeNull();
  });

  it("validates sign-in input before it reaches the auth port", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
    });
    expect(api.authIsConfigured()).toBe(false);
    expect(await api.getAuthSession()).toBeNull();
    await expect(api.signIn("   ", "secret")).rejects.toThrow(AUTH_ERRORS.emailRequired);
    await expect(api.signIn("a@example.test", "")).rejects.toThrow(
      AUTH_ERRORS.passwordRequired,
    );
    await expect(api.signIn("a@example.test", "secret")).rejects.toMatchObject({
      code: "auth.notConfigured",
    });
  });

  it("passes the auth session and its changes through the app", async () => {
    let session: AuthSession | null = null;
    const listeners = new Set<(value: AuthSession | null) => void>();
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
      auth: {
        isConfigured: () => true,
        getSession: async () => session,
        async signIn(email) {
          session = { userId: email, expiresAt: 60_000 };
          for (const listener of listeners) listener(session);
          return session;
        },
        async signUp() {
          throw new Error("sign-up is not part of this test");
        },
        async signOut() {
          session = null;
          for (const listener of listeners) listener(null);
        },
        onSessionChange(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      },
    });
    const seen: Array<string | null> = [];
    const stop = api.onAuthSessionChange((next) => seen.push(next?.userId ?? null));
    const signedIn = await api.signIn(" u@example.test ", "secret");
    expect(signedIn.userId).toBe("u@example.test");
    expect((await api.getAuthSession())?.userId).toBe("u@example.test");
    await api.signOut();
    expect(await api.getAuthSession()).toBeNull();
    expect(seen).toEqual(["u@example.test", null]);
    stop();
    expect(listeners.size).toBe(0);
  });

  it("adopts the local workspace after a successful sign-in", async () => {
    let session: AuthSession | null = null;
    const adopted: string[] = [];
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
      auth: {
        isConfigured: () => true,
        getSession: async () => session,
        async signIn(email) {
          session = { userId: `user-${email}`, expiresAt: null };
          return session;
        },
        async signUp() {
          throw new Error("sign-up is not part of this test");
        },
        async signOut() {
          session = null;
        },
        onSessionChange: () => () => {},
      },
      workspaces: {
        async adopt(userId) {
          adopted.push(userId);
          return { userId, workspaceId: "ws1" };
        },
      },
    });

    expect(await api.bootstrap()).toEqual({ userId: "u1", workspaceId: "ws1" });

    await api.signIn("a@example.test", "secret");
    expect(adopted).toEqual(["user-a@example.test"]);
    expect(await api.bootstrap()).toEqual({
      userId: "user-a@example.test",
      workspaceId: "ws1",
    });

    await api.signOut();
    expect(await api.bootstrap()).toEqual({ userId: "u1", workspaceId: "ws1" });
  });

  it("validates sign-up input before it reaches the auth port", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
    });
    await expect(api.signUp("   ", "secret")).rejects.toThrow(AUTH_ERRORS.emailRequired);
    await expect(api.signUp("a@example.test", "")).rejects.toThrow(
      AUTH_ERRORS.passwordRequired,
    );
    await expect(api.signUp("a@example.test", "secret")).rejects.toMatchObject({
      code: "auth.notConfigured",
    });
  });

  it("adopts on a sign-up that signs in, and waits for the session when it does not", async () => {
    const seen: string[] = [];
    const adopted: string[] = [];
    let outcome: SignUpOutcome = { status: "confirmationRequired" };
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
      auth: {
        isConfigured: () => true,
        getSession: async () => null,
        async signIn() {
          throw new Error("sign-in is not part of this test");
        },
        async signUp(email) {
          seen.push(email);
          return outcome;
        },
        async signOut() {},
        onSessionChange: () => () => {},
      },
      workspaces: {
        async adopt(userId) {
          adopted.push(userId);
          return { userId, workspaceId: "ws1" };
        },
      },
    });

    // Confirmation pending: the address is still validated and trimmed, but there
    // is no session yet, so nothing is claimed on this device.
    expect(await api.signUp(" New@Example.test ", "secret")).toEqual({
      status: "confirmationRequired",
    });
    expect(seen).toEqual(["New@Example.test"]);
    expect(adopted).toEqual([]);

    outcome = { status: "signedIn", session: { userId: "user-new", expiresAt: null } };
    expect(await api.signUp("new@example.test", "secret")).toEqual(outcome);
    expect(adopted).toEqual(["user-new"]);
  });

  it("rejects unsupported audio types and stale plan revisions", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
      nextId: ids(),
    });
    await expect(
      api.saveMediaAsset({
        workspaceId: "ws1",
        kind: "alarm",
        name: "Clip",
        bytes: new ArrayBuffer(8),
        mimeType: "video/mp4",
        durationMs: 1000,
      }),
    ).rejects.toThrow(MEDIA_ERRORS.badType);
    await expect(
      api.saveMediaAsset({
        workspaceId: "ws1",
        kind: "alarm",
        name: "Clip",
        bytes: new ArrayBuffer(8),
        mimeType: "audio/*",
        durationMs: 1000,
      }),
    ).rejects.toThrow(MEDIA_ERRORS.badType);
    await expect(
      api.saveMediaAsset({
        workspaceId: "ws1",
        kind: "alarm",
        name: "Clip",
        bytes: new ArrayBuffer(MEDIA_MAX_BYTES + 1),
        mimeType: "audio/wav",
        durationMs: 1000,
      }),
    ).rejects.toThrow(MEDIA_ERRORS.tooLarge);
    const first = await api.savePlan(makePlan([makeBlock("b1", 0)]));
    expect(first.revision).toBe(1);
    const renamed = await api.savePlan({ ...first, name: "Renamed" });
    expect(renamed.revision).toBe(2);
    expect((await api.getPlan("ws1", "plan1"))?.name).toBe("Renamed");
    await expect(api.savePlan(makePlan([makeBlock("b1", 0)]))).rejects.toThrow(
      PLAN_ERRORS.conflict,
    );
  });

  it("refuses a settings write that another writer has moved past", async () => {
    // The review's preference finding (2026-09-15). `savePreferences` used to store whatever the caller
    // held, so the last writer won and the earlier change vanished.
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: makePrefs({ textSize: "lg" }),
    });
    const read = await api.getPreferences("u1");
    expect(read?.revision).toBe(0);

    const saved = await api.savePreferences({ ...read!, textSize: "xl" });
    expect(saved.revision).toBe(1);
    expect((await api.getPreferences("u1"))?.textSize).toBe("xl");

    // A second writer still holding the row it read is refused, and the stored
    // row keeps the first writer's change.
    await expect(api.savePreferences({ ...read!, ttsEnabled: true })).rejects.toThrow(
      PREFERENCES_ERRORS.conflict,
    );
    const after = await api.getPreferences("u1");
    expect(after?.textSize).toBe("xl");
    expect(after?.ttsEnabled).toBe(false);
    expect(after?.revision).toBe(1);
  });

  it("moves a catalogue row's revision on every write", async () => {
    // The catalogue's revision, what a later per-row push compares. The revision is a fact about the
    // row, stamped where every catalogue write passes, not in each editor.
    const clock = new FakeClock();
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
      clock,
    });
    const first = await api.saveMeditation(library.meditations[0]);
    expect(first.revision).toBe(1);
    expect(first.updatedAt).toBe(0);

    clock.advance(5_000);
    const renamed = await api.saveMeditation({ ...first, name: "Renamed" });
    expect(renamed.revision).toBe(2);
    expect(renamed.updatedAt).toBe(5_000);
    expect((await api.getLibrary("ws1")).meditations[0].revision).toBe(2);
  });

  it("gives a duplicated preset its own history", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
    });
    const saved = await api.savePreset({ ...library.presets[0], revision: 6 });
    expect(saved.revision).toBe(7);

    const copy = await api.duplicatePreset("ws1", saved.id);
    // A copy is a new row: it carries the name and the tones, not the source's
    // revision count.
    expect(copy.name).toBe("Theta copy");
    expect(copy.revision).toBe(1);
  });

  it("rebases the plan bookkeeping write on the stored preferences", async () => {
    // Opening a plan writes `lastPlanId`. That write must not carry a stale
    // revision just because the reader changed a setting first — it rebases on
    // the stored row instead, so it cannot fail the check the reader cannot act on.
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [
        makePlan([makeBlock("b1", 0)]),
        makePlan([makeBlock("b1", 0)], { id: "plan2", name: "Second" }),
      ],
      library,
      presets: library.presets,
      prefs: makePrefs({ lastPlanId: "plan1" }),
    });
    const read = await api.getPreferences("u1");
    await api.savePreferences({ ...read!, masterVolume: 0.5 });

    await api.openPlan("u1", "ws1", "plan2");
    const after = await api.getPreferences("u1");
    expect(after?.lastPlanId).toBe("plan2");
    expect(after?.masterVolume).toBe(0.5);
    expect(after?.revision).toBe(2);
  });

  it("stores media bytes on BlobStore, not on the catalog row", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
      nextId: ids(),
    });
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const saved = await api.saveMediaAsset({
      workspaceId: "ws1",
      kind: "ambient",
      name: "Rain",
      bytes,
      mimeType: "audio/wav",
      durationMs: 1000,
    });
    expect(saved).not.toHaveProperty("bytes");
    expect(saved.storagePath).toBe(saved.id);
    expect(saved.storagePath).not.toMatch(/^dexie:/);
    const stored = await api.getMediaBytes(saved.id);
    expect(stored).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(stored as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
    await api.deleteMediaAsset("ws1", saved.id);
    expect(await api.getMediaBytes(saved.id)).toBeNull();
  });

  it("passes the plan into compile so adapters can load only referenced rows", async () => {
    const plan = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const ports = memoryPorts({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    const seen: Array<{ workspaceId: string; planId: string | undefined }> = [];
    const inner = ports.catalog.loadCompileLibrary.bind(ports.catalog);
    ports.catalog.loadCompileLibrary = async (workspaceId, requested) => {
      seen.push({ workspaceId, planId: requested?.id });
      return inner(workspaceId, requested);
    };
    const api = createMeditaurApp(ports);
    await api.getLibrary("ws1");
    await api.compileAndStoreSession(plan, "u1");
    expect(seen).toEqual([
      { workspaceId: "ws1", planId: undefined },
      { workspaceId: "ws1", planId: "plan1" },
    ]);
  });

  it("reads the plan list alone, in the order the catalogue view carries it", async () => {
    const first = makePlan([makeBlock("b1", 0)]);
    const second = makePlan([makeBlock("b2", 0)], { id: "plan2", name: "Evening" });
    const ports = memoryPorts({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [first, second],
      library,
      presets: library.presets,
      prefs: null,
    });
    let catalogueLoads = 0;
    const inner = ports.catalog.loadCompileLibrary.bind(ports.catalog);
    ports.catalog.loadCompileLibrary = async (workspaceId, requested) => {
      catalogueLoads += 1;
      return inner(workspaceId, requested);
    };
    const api = createMeditaurApp(ports);

    const viaCatalogue = (await api.getLibrary("ws1")).plans;
    expect(catalogueLoads).toBe(1);
    expect(viaCatalogue.map((row) => row.id)).toEqual(["plan1", "plan2"]);

    // What the planner asks for after creating, duplicating or removing a plan:
    // the same list, from the same summaries, in the same order — two fields of
    // one table, and not a second read of the catalogue (`P2 · 4`).
    expect(await api.listPlans("ws1")).toEqual(viaCatalogue);
    expect(catalogueLoads, "the plan list is not the whole catalogue").toBe(1);
  });

  it("prunes old snapshots and caps history to a recent page", async () => {
    const clock = new FakeClock();
    const plan = makePlan([makeBlock("b1", 0)]);
    const ports = memoryPorts({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
      nextId: ids(),
      clock,
    });
    const api = createMeditaurApp(ports);
    const instanceIds: string[] = [];
    for (let i = 0; i < SNAPSHOT_KEEP_PER_PLAN + 1; i += 1) {
      clock.advance(1);
      instanceIds.push((await api.compileAndStoreSession(plan, "u1")).instanceId);
    }
    expect(await api.getSnapshot("ws1", instanceIds[0])).toBeNull();
    expect(await api.getSnapshot("ws1", instanceIds[instanceIds.length - 1])).not.toBeNull();

    for (let i = 0; i < SESSION_LOG_LIST_LIMIT + 3; i += 1) {
      await api.recordSessionLog({
        id: `log-${i}`,
        workspaceId: "ws1",
        planId: "plan1",
        completedAt: i,
        blockCount: 1,
        totalDurationMs: 1,
      });
    }
    const logs = (await api.getLibrary("ws1")).logs;
    expect(logs).toHaveLength(SESSION_LOG_LIST_LIMIT);
    expect(logs[0].id).toBe(`log-${SESSION_LOG_LIST_LIMIT + 2}`);
    expect(await ports.logs.listRecent("ws1", 1000)).toHaveLength(SESSION_LOG_LIST_LIMIT);
  });

  it("stamps a completed session with the clock and nextId", async () => {
    const clock = new FakeClock();
    clock.advance(50);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
      nextId: ids(),
      clock,
    });
    await api.recordSessionCompletion({
      workspaceId: "ws1",
      planId: "plan1",
      blockCount: 2,
      totalDurationMs: 4000,
    });
    expect((await api.getLibrary("ws1")).logs).toEqual([
      {
        id: "id-1",
        workspaceId: "ws1",
        planId: "plan1",
        completedAt: 50,
        blockCount: 2,
        totalDurationMs: 4000,
      },
    ]);
  });

  it("counts sessions from this local week in the recent log page", async () => {
    const now = new Date(2026, 8, 9, 15, 0, 0, 0).getTime();
    const clock = new FakeClock();
    clock.advance(now);
    const session = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: library.presets,
      prefs: null,
      clock,
    });
    await api.recordSessionLog({
      id: "old",
      workspaceId: "ws1",
      planId: "plan1",
      completedAt: new Date(2026, 8, 6, 23, 59, 0, 0).getTime(),
      blockCount: 1,
      totalDurationMs: 1000,
    });
    await api.recordSessionLog({
      id: "this-week",
      workspaceId: "ws1",
      planId: "plan1",
      completedAt: new Date(2026, 8, 7, 8, 0, 0, 0).getTime(),
      blockCount: 1,
      totalDurationMs: 1000,
    });
    expect((await api.getLibrary("ws1")).sessionsThisWeek).toBe(1);
  });

  it("deletes snapshots and logs when a plan is removed", async () => {
    const session = makePlan([makeBlock("b1", 0, { symbolId: "s1" })]);
    const clock = new FakeClock();
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: library.presets,
      prefs: makePrefs(),
      nextId: ids(),
      clock,
    });
    const extra = await api.createPlan("u1", "ws1");
    const snapshot = await api.compileAndStoreSession(extra, "u1");
    await api.recordSessionLog({
      id: "log-gone",
      workspaceId: "ws1",
      planId: extra.id,
      completedAt: 9,
      blockCount: 2,
      totalDurationMs: 4000,
    });
    await api.deletePlan("u1", "ws1", extra.id);
    expect(await api.getPlan("ws1", extra.id)).toBeNull();
    expect(await api.getSnapshot("ws1", snapshot.instanceId)).toBeNull();
    expect((await api.getLibrary("ws1")).logs.map((row) => row.id)).not.toContain("log-gone");
  });

  it("keeps the column pools separate, and takes a chakra's values with it", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library: { ...library, fieldDefs: [], fieldValues: [] },
      presets: library.presets,
      prefs: null,
      nextId: ids(),
    });
    await api.saveFieldDef(makeFieldDef({ id: "fd-sym", scope: "symbol", key: "seed" }));
    await api.saveFieldDef(
      makeFieldDef({ id: "fd-focus", scope: "meditation", key: "seed", label: "Seed" }),
    );
    // The same heading in the other table is a different column, and gets the same
    // derived key: the three tables have separate pools, so nothing collides.
    expect(
      await api.saveFieldDef(
        makeFieldDef({ id: "fd-focus-2", scope: "meditation", key: "", label: "Seed" }),
      ),
    ).toMatchObject({ key: "seed-2" });
    const value = await api.saveFieldValue({
      entityId: "fp1",
      fieldDefId: "fd-focus",
      text: "  root  ",
      revision: 0,
      updatedAt: 0,
    });
    // The write stamps the row's first revision; the text is what it was asked to
    // store, trimmed.
    expect(value).toMatchObject({ entityId: "fp1", fieldDefId: "fd-focus", text: "root" });
    expect(value.revision).toBe(1);
    expect((await api.getLibrary("ws1")).fieldValues).toEqual([value]);
    // The value goes with the chakra rather than holding it hostage.
    expect(await api.getDeletionImpact("ws1", "meditation", "fp1")).toContain("1 field value");
    await api.deleteMeditation("ws1", "fp1");
    expect((await api.getLibrary("ws1")).fieldValues).toEqual([]);
  });

  it("keeps a row that names only a symbol, and refuses one that names nothing", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library: { ...library, entries: [], intentions: [] },
      presets: library.presets,
      prefs: null,
      nextId: ids(),
    });
    // A symbol on its own is a complete row: it is what a cool-off block names
    // when it is not about a chakra.
    const symbolOnly = await api.saveEntry(makeEntry(null, "s1", 0, { id: "e-sym" }));
    expect(symbolOnly).toMatchObject({ symbolId: "s1", meditationId: null });
    const line = await api.saveLine({
      ...NEW_ROW_VERSION,
      id: "i-1",
      workspaceId: "ws1",
      entryId: "e-sym",
      sortOrder: 0,
      text: "  Lam line  ",
      archivedAt: null,
    });
    expect(line.text).toBe("Lam line");
    expect((await api.getLibrary("ws1")).intentions).toHaveLength(1);
    // A row that points at nothing is a draft, not a row: Save's sweep is what
    // deals with one the reader emptied, and the store refuses a new one.
    await expect(
      api.saveEntry(makeEntry(null, null, 1, { id: "e-none" })),
    ).rejects.toThrow(CATALOG_ERRORS.entryNeedsRef);
  });

  it("stores images with image caps and refuses delete while referenced", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0)])],
      library,
      presets: library.presets,
      prefs: null,
      nextId: ids(),
    });
    const image = await api.saveMediaAsset({
      workspaceId: "ws1",
      kind: "image",
      name: "  Glyph  ",
      bytes: new ArrayBuffer(16),
      mimeType: "image/png",
      durationMs: 5000,
    });
    expect(image).toMatchObject({ name: "Glyph", kind: "image", durationMs: 0 });
    await expect(
      api.saveMediaAsset({
        workspaceId: "ws1",
        kind: "image",
        name: "Too big",
        bytes: new ArrayBuffer(IMAGE_MAX_BYTES + 1),
        mimeType: "image/png",
        durationMs: 0,
      }),
    ).rejects.toThrow(MEDIA_ERRORS.tooLarge);
    await expect(
      api.saveMediaAsset({
        workspaceId: "ws1",
        kind: "image",
        name: "Clip",
        bytes: new ArrayBuffer(16),
        mimeType: "audio/wav",
        durationMs: 0,
      }),
    ).rejects.toThrow(MEDIA_ERRORS.badType);
    await api.saveMeditation(makeMeditation("fp1", "Root", { representationAssetId: image.id }));
    await api.deleteMediaAsset("ws1", image.id);
    // The picture goes; the meditation it was on stays.
    expect((await api.getLibrary("ws1")).meditations[0]!.representationAssetId).toBeNull();
    expect((await api.getLibrary("ws1")).mediaAssets).toEqual([]);
  });
});
