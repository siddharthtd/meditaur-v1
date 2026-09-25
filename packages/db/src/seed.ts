import { DEFAULT_ALARM_ENABLED, DEFAULT_THEME } from "@meditaur/domain";
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

/**
 * Forget the in-flight seed.
 *
 * `ensureSeed` caches its promise for the life of the page, which is what every
 * caller wants except one: wiping the device deletes the rows that promise is
 * about. Without this, the next `bootstrap()` is handed the workspace id of a
 * database that no longer exists — no error, just an app that reads nothing and
 * never re-seeds.
 */
export function resetSeed(): void {
  seedInFlight = null;
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
  await db.transaction(
    "rw",
    [
      db.workspaces,
      db.members,
      db.preferences,
      db.meditationTypes,
      db.meditations,
      db.symbols,
      db.entries,
      db.intentions,
      db.fieldDefs,
      db.fieldOptions,
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
        alarmEnabled: DEFAULT_ALARM_ENABLED,
        masterVolume: 0.7,
        alarmVolume: 0.6,
        ttsEnabled: false,
        textSize: "md",
        theme: DEFAULT_THEME,
        lastPlanId: DEFAULT_PLAN_ID,
        revision: 0,
        updatedAt: Date.now(),
      });
      await db.meditationTypes.bulkAdd(catalog.meditationTypes);
      await db.meditations.bulkAdd(catalog.meditations);
      await db.symbols.bulkAdd(catalog.symbols);
      await db.entries.bulkAdd(catalog.entries);
      await db.intentions.bulkAdd(catalog.intentions);
      await db.fieldDefs.bulkAdd(catalog.fieldDefs);
      await db.fieldOptions.bulkAdd(catalog.fieldOptions);
      await db.presets.bulkAdd(catalog.presets);
      // Both seeded plans: the chakra circuit, then the points circuit (round 22).
      for (const plan of catalog.plans) {
        await db.plans.add({
          ...plan,
          blocksJson: JSON.stringify(plan.blocks),
          displayJson: JSON.stringify(plan.display),
          updatedAt: Date.now(),
        });
      }
    },
  );
  return { userId: LOCAL_USER, workspaceId: LOCAL_WS };
}
