import { type Plan } from "@meditaur/domain";
import { buildDefaultWorkspace, DEFAULT_PLAN_ID } from "./default-workspace.ts";
import { db } from "./schema.ts";

export const LOCAL_USER = "01900000-0000-7000-8000-000000000001";
export const LOCAL_WS = "01900000-0000-7000-8000-000000000002";
const LEGACY_USER = "local-dev";
const LEGACY_WS = "ws-local";

let seedInFlight: Promise<{ userId: string; workspaceId: string }> | null = null;

export function ensureSeed(): Promise<{ userId: string; workspaceId: string }> {
  if (!seedInFlight) {
    seedInFlight = seedWorkspace().catch((err) => {
      seedInFlight = null;
      throw err;
    });
  }
  return seedInFlight;
}

async function seedWorkspace(): Promise<{ userId: string; workspaceId: string }> {
  const legacy = await db.workspaces.get(LEGACY_WS);
  if (legacy) {
    return { userId: LEGACY_USER, workspaceId: legacy.id };
  }
  const existing = await db.workspaces.get(LOCAL_WS);
  if (existing) {
    return { userId: LOCAL_USER, workspaceId: LOCAL_WS };
  }
  const catalog = buildDefaultWorkspace(LOCAL_WS);
  const plan: Plan = catalog.plan;
  await db.transaction(
    "rw",
    [
      db.workspaces,
      db.members,
      db.preferences,
      db.focusPoints,
      db.symbols,
      db.focusSymbolBindings,
      db.intentions,
      db.tableViews,
      db.presets,
      db.plans,
    ],
    async () => {
      await db.workspaces.add({ id: LOCAL_WS, type: "personal", name: "Personal" });
      await db.members.add({ workspaceId: LOCAL_WS, userId: LOCAL_USER, role: "owner" });
      await db.preferences.add({
        userId: LOCAL_USER,
        stopBinauralOnAlarm: true,
        autoAdvance: true,
        masterVolume: 0.7,
        alarmVolume: 0.6,
        ttsEnabled: false,
        textSize: "lg",
        lastPlanId: DEFAULT_PLAN_ID,
        revision: 0,
        updatedAt: Date.now(),
      });
      await db.focusPoints.bulkAdd(catalog.focusPoints);
      await db.symbols.bulkAdd(catalog.symbols);
      await db.focusSymbolBindings.bulkAdd(catalog.bindings);
      await db.intentions.bulkAdd(catalog.intentions);
      await db.tableViews.bulkAdd(catalog.tableViews);
      await db.presets.bulkAdd(catalog.presets);
      await db.plans.add({
        ...plan,
        blocksJson: JSON.stringify(plan.blocks),
        updatedAt: Date.now(),
      });
    },
  );
  return { userId: LOCAL_USER, workspaceId: LOCAL_WS };
}
