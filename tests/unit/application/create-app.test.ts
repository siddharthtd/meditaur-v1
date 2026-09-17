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
  makeIntentions,
  makeBinding,
  makeBlock,
  makeFieldDef,
  makeFocus,
  makeLibrary,
  makePlan,
  makePrefs,
  makePreset,
  makeSymbol,
  makeTableView,
} from "../../fixtures/library.ts";
import { appFromMemory, memoryPorts } from "./memory-ports.ts";

const library = makeLibrary({
  focusPoints: [makeFocus("fp1", "Root")],
  symbols: [makeSymbol("s1", "Lam")],
  bindings: [makeBinding("fp1", "s1", 0)],
  intentions: makeIntentions("fp1", "s1", ["A1"]),
});

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

describe("createMeditaurApp", () => {
  it("compiles a plan through ports and stores the snapshot", async () => {
    const plan = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
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
    const off = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
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
    const plan = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
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
    const session = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: library.presets,
      prefs: makePrefs({ lastPlanId: "plan1" }),
    });
    const snapshot = await api.startSessionFromFocus("u1", "ws1", "fp1");
    expect(snapshot.blocks).toHaveLength(1);
    expect(snapshot.blocks[0]?.symbolName).toBeNull();
    expect(snapshot.blocks[0]?.symbolGroups[0]?.name).toBe("Lam");
    expect(snapshot.blocks[0]?.intentions).toEqual(["A1"]);
    expect(snapshot.planId).toBe("01900000-0000-7000-8000-000000000060");
    expect((await api.getPreferences("u1"))?.lastPlanId).toBe("plan1");
    expect((await api.getPlan("ws1", "plan1"))?.blocks[0]?.symbolId).toBe("s1");
  });

  it("lists library data from the same ports REST or gRPC would call", async () => {
    const plan = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    const view = await api.getLibrary("ws1");
    expect(view.plans).toEqual([{ id: "plan1", name: "Session" }]);
    expect(view.focusPoints[0].name).toBe("Root");
    expect(view.presets[0].id).toBe("preset1");
    expect(view.tableViews[0].name).toBe("Symbols");
    expect(view.fieldDefs).toEqual([]);
    expect(view.fieldValues).toEqual([]);
  });

  it("exports names, plans, and media blobs as JSON", async () => {
    const session = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
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
    expect(backup.focusPoints[0]?.name).toBe("Root");
    expect(backup.presets[0]?.id).toBe("preset1");
    expect(backup.blobs).toEqual({});
    expect(JSON.stringify(backup)).not.toMatch(/"bytes"/);
    expect(backup).not.toHaveProperty("logs");
  });

  it("restores names and plans by id into the current workspace", async () => {
    const session = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })], {
      revision: 4,
    });
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library: {
        ...library,
        focusPoints: [makeFocus("fp1", "Root"), makeFocus("fp-keep", "Keep me")],
        mediaAssets: [
          {
            ...NEW_ROW_VERSION,
            id: "media1",
            workspaceId: "ws1",
            kind: "ambient",
            name: "Rain",
            storagePath: "media1",
            durationMs: 1000,
          },
        ],
      },
      presets: library.presets,
      prefs: null,
    });
    const backup = await api.exportCatalog("ws1");
    backup.workspaceId = "other";
    backup.focusPoints = backup.focusPoints
      .filter((fp) => fp.id === "fp1")
      .map((fp) => ({ ...fp, workspaceId: "other", name: "Restored root" }));
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
      },
    ];
    await api.importCatalog("ws1", backup);
    const view = await api.getLibrary("ws1");
    expect(view.focusPoints.map((fp) => ({ id: fp.id, name: fp.name, workspaceId: fp.workspaceId }))).toEqual(
      [
        { id: "fp1", name: "Restored root", workspaceId: "ws1" },
        { id: "fp-keep", name: "Keep me", workspaceId: "ws1" },
      ],
    );
    expect(view.plans).toEqual([{ id: "plan1", name: "Restored session" }]);
    expect((await api.getPlan("ws1", "plan1"))?.revision).toBe(0);
    expect(view.mediaAssets.map((asset) => asset.id)).toEqual(["media1", "media-from-file"]);
  });

  it("round-trips media bytes through catalog JSON", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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

  it("rejects a catalog file that is newer than schema version 3", async () => {
    const session = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library,
      presets: library.presets,
      prefs: null,
    });
    await expect(api.importCatalog("ws1", null)).rejects.toThrow(CATALOG_BACKUP_ERRORS.invalid);
    await expect(api.importCatalog("ws1", { schemaVersion: 5 })).rejects.toThrow(
      CATALOG_BACKUP_ERRORS.version,
    );
  });

  it("opens the remembered plan and falls back when that id is gone", async () => {
    const session = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
    const evening = makePlan([makeBlock("b2", 0, "focus", { symbolId: "s1" })], {
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
    // Phase 2's lastPlanId guard, stated as its own rule: the preference says
    // which plan the reader was last on, it does not overrule what this device
    // has. With preferences read through the cloud that id now routinely arrives
    // from another device — a real plan, and not one that is here.
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [
        makePlan([makeBlock("b1", 0, "cooloff")]),
        // A real plan id, in a workspace this device is not looking at.
        makePlan([makeBlock("b1", 0, "cooloff")], { id: "plan2", workspaceId: "ws2" }),
      ],
      library,
      presets: library.presets,
      prefs: makePrefs({ lastPlanId: "from-another-device" }),
    });

    expect((await api.getActivePlan("u1", "ws1"))?.id).toBe("plan1");
    expect((await api.getPreferences("u1"))?.lastPlanId).toBe("plan1");
  });

  it("creates a starter session, remembers it, and will not delete the last plan", async () => {
    const session = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
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
    expect(created.blocks.map((b) => b.type)).toEqual(["focus", "cooloff"]);
    expect((await api.getPreferences("u1"))?.lastPlanId).toBe(created.id);
    const remaining = await api.deletePlan("u1", "ws1", created.id);
    expect(remaining.id).toBe("plan1");
    expect(await api.getPlan("ws1", created.id)).toBeNull();
    expect((await api.getPreferences("u1"))?.lastPlanId).toBe("plan1");
  });

  it("creates a starter session using the first focus default preset", async () => {
    const session = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [session],
      library: {
        ...library,
        focusPoints: [{ ...library.focusPoints[0], defaultBinauralPresetId: "preset2" }],
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
        makeBlock("b1", 0, "focus", { symbolId: "s1" }),
        makeBlock("b2", 1, "cooloff", { binauralPresetId: null, tableViewId: null }),
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
      type: "focus",
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
    const session = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
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
    const plan = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    await expect(api.saveFocusPoint(makeFocus("fp2", "   "))).rejects.toThrow(
      CATALOG_ERRORS.nameRequired,
    );
    const saved = await api.saveFocusPoint(makeFocus("fp2", "  Solar  "));
    expect(saved.name).toBe("Solar");
    expect((await api.getLibrary("ws1")).focusPoints.map((fp) => fp.name)).toContain("Solar");
    const symbol = await api.saveSymbol(makeSymbol("s2", "  Sun  "));
    expect(symbol.name).toBe("Sun");
    await api.saveBinding(makeBinding("fp2", "s2", 0));
    const intention = await api.saveIntention({
      ...NEW_ROW_VERSION,
      id: "a2",
      workspaceId: "ws1",
      focusPointId: "fp2",
      symbolId: "s2",
      sortOrder: 0,
      text: "  I am  ",
    });
    expect(intention.text).toBe("I am");
    await expect(api.saveSymbol(makeSymbol("s3", "  "))).rejects.toThrow(
      CATALOG_ERRORS.nameRequired,
    );
    await expect(
      api.saveIntention({
        ...NEW_ROW_VERSION,
        id: "a-new",
        workspaceId: "ws1",
        focusPointId: "fp1",
        symbolId: "s1",
        sortOrder: 1,
        text: "  ",
      }),
    ).rejects.toThrow(CATALOG_ERRORS.textRequired);
  });

  it("cascades a focus point delete through its symbols, lines, values and plans", async () => {
    const plan = makePlan([
      makeBlock("b1", 0, "focus", { symbolId: "s1" }),
      makeBlock("b2", 1, "focus", { focusPointId: "fp2", symbolId: "s1" }),
    ]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });

    // What the reader is told before the second press.
    const impact = await api.getDeletionImpact("ws1", "focus", "fp1");
    expect(impact).toContain("1 block from 1 plan");
    expect(impact).toContain("1 intention");
    expect(impact).toContain("1 symbol attachment");

    await api.deleteFocusPoint("ws1", "fp1");
    const after = await api.getLibrary("ws1");
    expect(after.focusPoints.map((fp) => fp.id)).toEqual([]);
    expect(after.bindings).toEqual([]);
    expect(after.intentions).toEqual([]);

    const saved = await api.getPlan("ws1", plan.id);
    expect(saved?.blocks.map((b) => b.id)).toEqual(["b2"]);
    expect(saved?.blocks[0]!.sortOrder).toBe(0);
    // The revision moved, so an editor still holding the old copy is refused by
    // the CAS in savePlan rather than writing the deleted block back.
    expect(saved?.revision).toBe(plan.revision + 1);
    await expect(api.savePlan(plan)).rejects.toMatchObject({ code: "plan.conflict" });
  });

  it("cascades a symbol delete and hands its blocks back to the focus point", async () => {
    const plan = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });

    const impact = await api.getDeletionImpact("ws1", "symbol", "s1");
    expect(impact).toContain("1 intention");
    expect(impact).toContain("1 place");

    await api.deleteSymbol("ws1", "s1");
    const after = await api.getLibrary("ws1");
    expect(after.symbols).toEqual([]);
    expect(after.bindings).toEqual([]);
    expect(after.intentions).toEqual([]);

    const saved = await api.getPlan("ws1", plan.id);
    expect(saved?.blocks).toHaveLength(1);
    expect(saved?.blocks[0]!.symbolId).toBeNull();
    expect(saved?.blocks[0]!.symbolScope).toBe("rotate");
  });

  it("deletes an attachment with the lines written about that pair", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })])],
      library,
      presets: library.presets,
      prefs: null,
    });
    expect((await api.getLibrary("ws1")).intentions).toHaveLength(1);
    await api.deleteBinding("ws1", "fp1", "s1");
    const after = await api.getLibrary("ws1");
    expect(after.bindings).toEqual([]);
    expect(after.intentions).toEqual([]);
  });


  it("saves presets, lists them, and clears what used a deleted one", async () => {
    const extra = makePreset({ id: "preset2", name: "Delta" });
    const plan = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
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

  it("clears a focus point's default sound when its preset goes", async () => {
    const extra = makePreset({ id: "preset2", name: "Delta" });
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, "cooloff", { binauralPresetId: null })])],
      library: { ...library, presets: [makePreset(), extra] },
      presets: [makePreset(), extra],
      prefs: null,
    });
    await api.deletePreset("ws1", "preset1");
    expect((await api.getLibrary("ws1")).focusPoints[0]!.defaultBinauralPresetId).toBeNull();
  });

  it("saves table views, lists them, and clears a deleted view from its blocks", async () => {
    const extra = makeTableView({ id: "view2", name: "Usage" });
    const plan = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library: { ...library, tableViews: [makeTableView(), extra] },
      presets: library.presets,
      prefs: null,
    });
    const saved = await api.saveTableView(makeTableView({ id: "view2", name: "  Usage  " }));
    expect(saved.name).toBe("Usage");
    expect((await api.getLibrary("ws1")).tableViews.map((v) => v.name)).toEqual(["Symbols", "Usage"]);
    await expect(api.saveTableView(makeTableView({ name: "  " }))).rejects.toThrow(
      CATALOG_ERRORS.nameRequired,
    );
    await expect(api.saveTableView(makeTableView({ columnKeys: [] }))).rejects.toThrow(
      CATALOG_ERRORS.columnsRequired,
    );
    await api.deleteTableView("ws1", "view1");
    const afterView = await api.getPlan("ws1", plan.id);
    expect(afterView?.blocks).toHaveLength(1);
    expect(afterView?.blocks[0]!.tableViewId).toBeNull();
    // A plan needs somewhere to show its table, so the last view stays.
    await expect(api.deleteTableView("ws1", "view2")).rejects.toThrow(
      CATALOG_ERRORS.keepOneTableView,
    );
  });

  it("saves field defs and values, and takes both away with the field", async () => {
    const plan = makePlan([makeBlock("b1", 0, "cooloff", { tableViewId: null })]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library,
      presets: library.presets,
      prefs: null,
    });
    const saved = await api.saveFieldDef(
      makeFieldDef({ key: "", label: "  Vedic mantra  ", description: "  What I chant  " }),
    );
    // The reader names the field; the key it is stored under is derived from
    // that heading, and the description is the reader's own words.
    expect(saved).toMatchObject({
      key: "vedic-mantra",
      label: "Vedic mantra",
      description: "What I chant",
    });
    expect((await api.getLibrary("ws1")).fieldDefs.map((d) => d.key)).toEqual(["vedic-mantra"]);
    // A heading that collides with a built-in column, or with another field in
    // the same pool, gets a numbered suffix rather than a refusal: the reader
    // has no way to see the collision coming.
    expect(
      await api.saveFieldDef(makeFieldDef({ id: "fd-name", key: "", label: "Name" })),
    ).toMatchObject({ key: "name-2" });
    expect(await api.saveFieldDef(makeFieldDef({ id: "fd2", key: "", label: "Seed" }))).toMatchObject(
      { key: "seed" },
    );
    // A field that already has a key keeps it: a table view that lists the
    // column goes on listing it. (The editor sends the key the field already
    // has, because it never asks the reader for one.)
    const renamed = await api.saveFieldDef(
      makeFieldDef({ id: "fd2", key: "seed", label: "Renamed heading" }),
    );
    expect(renamed).toMatchObject({ key: "seed", label: "Renamed heading" });
    // A key that is a built-in column is still refused — the guard that catches
    // a hand-edited backup, now that the form cannot produce one.
    await expect(
      api.saveFieldDef(makeFieldDef({ id: "fd1", key: "name", label: "Mantra" })),
    ).rejects.toThrow(CATALOG_ERRORS.keyReserved);
    await expect(api.saveFieldDef(makeFieldDef({ key: "", label: "  " }))).rejects.toThrow(
      CATALOG_ERRORS.nameRequired,
    );
    const value = await api.saveFieldValue({
      ...NEW_ROW_VERSION,
      entityId: "s1",
      fieldDefId: "fd1",
      text: "  lam  ",
    });
    expect(value.text).toBe("lam");
    expect((await api.getLibrary("ws1")).fieldValues).toEqual([value]);
    await api.saveFieldValue({
      ...NEW_ROW_VERSION,
      entityId: "s1",
      fieldDefId: "fd1",
      text: "  ",
    });
    expect((await api.getLibrary("ws1")).fieldValues).toEqual([]);

    // A value the reader typed, and a table view that lists the column, both go
    // with the field rather than blocking it.
    await api.saveFieldValue({ ...NEW_ROW_VERSION, entityId: "s1", fieldDefId: "fd1", text: "x" });
    await api.saveTableView(makeTableView({ columnKeys: ["name", "vedic-mantra"] }));
    expect(await api.getDeletionImpact("ws1", "field", "fd1")).toContain("1 field value");
    await api.deleteFieldDef("ws1", "fd1");
    const after = await api.getLibrary("ws1");
    expect(after.fieldDefs.map((d) => d.id)).toEqual(["fd-name", "fd2"]);
    expect(after.fieldValues).toEqual([]);
    expect(after.tableViews[0]!.columnKeys).toEqual(["name"]);
  });

  it("deletes unused catalog items, including the last focus point", async () => {
    const plan = makePlan([makeBlock("b1", 0, "cooloff")]);
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [plan],
      library: {
        ...library,
        focusPoints: [makeFocus("fp1", "Root")],
        symbols: [],
        bindings: [],
        intentions: [],
      },
      presets: library.presets,
      prefs: null,
    });
    await api.saveIntention({
      ...NEW_ROW_VERSION,
      id: "a-temp",
      workspaceId: "ws1",
      focusPointId: "fp1",
      symbolId: null,
      sortOrder: 0,
      text: "Hold",
    });
    await api.deleteIntention("a-temp");
    expect((await api.getLibrary("ws1")).intentions).toEqual([]);
    await api.deleteFocusPoint("ws1", "fp1");
    expect((await api.getLibrary("ws1")).focusPoints).toEqual([]);
  });

  it("saves audio files and refuses delete while a plan block uses them", async () => {
    const unused = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
      plans: [makePlan([makeBlock("b1", 0, "focus", { ambientAssetId: "rain1" })])],
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

  it("deletes a plan inside one unit of work", async () => {
    const base = memoryPorts({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [
        makePlan([makeBlock("b1", 0, "cooloff")]),
        { ...makePlan([makeBlock("b2", 0, "cooloff")]), id: "plan2" },
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
        makePlan([makeBlock("b1", 0, "cooloff")]),
        { ...makePlan([makeBlock("b2", 0, "cooloff")]), id: "plan2" },
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
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
    const plan = makePlan([makeBlock("b1", 0, "cooloff")]);
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
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
    const first = await api.savePlan(makePlan([makeBlock("b1", 0, "cooloff")]));
    expect(first.revision).toBe(1);
    const renamed = await api.savePlan({ ...first, name: "Renamed" });
    expect(renamed.revision).toBe(2);
    expect((await api.getPlan("ws1", "plan1"))?.name).toBe("Renamed");
    await expect(api.savePlan(makePlan([makeBlock("b1", 0, "cooloff")]))).rejects.toThrow(
      PLAN_ERRORS.conflict,
    );
  });

  it("refuses a settings write that another writer has moved past", async () => {
    // Phase 2 / review M11. `savePreferences` used to store whatever the caller
    // held, so the last writer won and the earlier change vanished.
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
    // M5: what a later per-row push compares. The revision is a fact about the
    // row, stamped where every catalogue write passes, not in each editor.
    const clock = new FakeClock();
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
      library,
      presets: library.presets,
      prefs: null,
      clock,
    });
    const first = await api.saveFocusPoint(library.focusPoints[0]);
    expect(first.revision).toBe(1);
    expect(first.updatedAt).toBe(0);

    clock.advance(5_000);
    const renamed = await api.saveFocusPoint({ ...first, name: "Renamed" });
    expect(renamed.revision).toBe(2);
    expect(renamed.updatedAt).toBe(5_000);
    expect((await api.getLibrary("ws1")).focusPoints[0].revision).toBe(2);
  });

  it("gives a duplicated preset its own history", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
        makePlan([makeBlock("b1", 0, "cooloff")]),
        makePlan([makeBlock("b1", 0, "cooloff")], { id: "plan2", name: "Second" }),
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
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
    const plan = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
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

  it("prunes old snapshots and caps history to a recent page", async () => {
    const clock = new FakeClock();
    const plan = makePlan([makeBlock("b1", 0, "cooloff")]);
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
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
    const session = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
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
    const session = makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]);
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

  it("keeps the field pools separate and guards focus-point custom fields", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
      library: { ...library, fieldDefs: [], fieldValues: [] },
      presets: library.presets,
      prefs: null,
      nextId: ids(),
    });
    await api.saveFieldDef(makeFieldDef({ id: "fd-sym", entityType: "symbol", key: "seed" }));
    await api.saveFieldDef(
      makeFieldDef({ id: "fd-focus", entityType: "focusPoint", key: "seed", label: "Seed" }),
    );
    // The same heading in the other pool is a different field, and gets the same
    // derived key: the pools are separate, so nothing collides.
    expect(
      await api.saveFieldDef(
        makeFieldDef({ id: "fd-focus-2", entityType: "focusPoint", key: "", label: "Seed" }),
      ),
    ).toMatchObject({ key: "seed-2" });
    const value = await api.saveFieldValue({
      entityId: "fp1",
      fieldDefId: "fd-focus",
      text: "  root  ",
      revision: 0,
      updatedAt: 0,
    });
    // The write stamps the row's first revision; the text is what it was asked
    // to store, trimmed.
    expect(value).toMatchObject({ entityId: "fp1", fieldDefId: "fd-focus", text: "root" });
    expect(value.revision).toBe(1);
    expect((await api.getLibrary("ws1")).fieldValues).toEqual([value]);
    // The value and the attachment go with the focus point rather than holding
    // it hostage.
    expect(await api.getDeletionImpact("ws1", "focus", "fp1")).toContain("1 field value");
    await api.deleteFocusPoint("ws1", "fp1");
    expect((await api.getLibrary("ws1")).fieldValues).toEqual([]);
  });

  it("saves free-floating and symbol-only intentions", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
      library: { ...library, intentions: [] },
      presets: library.presets,
      prefs: null,
      nextId: ids(),
    });
    const free = await api.saveIntention({
      ...NEW_ROW_VERSION,
      id: "i-free",
      workspaceId: "ws1",
      focusPointId: null,
      symbolId: null,
      sortOrder: 0,
      text: "  Breathe  ",
    });
    expect(free).toMatchObject({ focusPointId: null, symbolId: null, text: "Breathe" });
    const symbolOnly = await api.saveIntention({
      ...NEW_ROW_VERSION,
      id: "i-sym",
      workspaceId: "ws1",
      focusPointId: null,
      symbolId: "s1",
      sortOrder: 1,
      text: "Lam line",
    });
    expect(symbolOnly.symbolId).toBe("s1");
    for (const [id, text] of [
      ["i-a", "A"],
      ["i-b", "B"],
    ] as const) {
      await api.saveIntention({
        ...NEW_ROW_VERSION,
        id,
        workspaceId: "ws1",
        focusPointId: "fp1",
        symbolId: "s1",
        sortOrder: 0,
        text,
      });
    }
    expect((await api.getLibrary("ws1")).intentions).toHaveLength(4);
    await expect(
      api.saveIntention({
        ...NEW_ROW_VERSION,
        id: "i-c",
        workspaceId: "ws1",
        focusPointId: "fp1",
        symbolId: "s3",
        sortOrder: 2,
        text: "C",
      }),
    ).rejects.toThrow(CATALOG_ERRORS.intentionNeedsBinding);
  });

  it("stores images with image caps and refuses delete while referenced", async () => {
    const api = appFromMemory({
      context: { userId: "u1", workspaceId: "ws1" },
      plans: [makePlan([makeBlock("b1", 0, "cooloff")])],
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
    await api.saveFocusPoint(makeFocus("fp1", "Root", { representationAssetId: image.id }));
    await api.deleteMediaAsset("ws1", image.id);
    // The picture goes; the focus point it was on stays.
    expect((await api.getLibrary("ws1")).focusPoints[0]!.representationAssetId).toBeNull();
    expect((await api.getLibrary("ws1")).mediaAssets).toEqual([]);
  });
});
