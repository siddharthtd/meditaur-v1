import {
  incomingWins,
  pullWatermarkAfter,
  pushedWatermark,
  rowsPast,
  type Clock,
  type FieldValue,
  type SyncOutcome,
  type SyncStatePort,
  type SyncWatermark,
} from "@meditaur/domain";
import {
  entryFromRow,
  entryRow,
  intentionFromRow,
  intentionRow,
  symbolFromRow,
  symbolRow,
} from "./catalogue-rows.ts";
import { fieldDefFromRow, fieldDefRow } from "./field-def-row.ts";
import {
  fieldOptionFromRow,
  fieldOptionRow,
  fieldValueFromRow,
  fieldValueRow,
} from "./field-rows.ts";
import { mediaAssetFromRow, mediaAssetRow } from "./media-asset-row.ts";
import { meditationFromRow, meditationRow } from "./meditation-row.ts";
import { meditationTypeFromRow, meditationTypeRow } from "./meditation-type-row.ts";
import { planFromRow, planRowForStore } from "./plan-mapper.ts";
import { planBlockRows, planFromCloud, planRow } from "./plan-rows.ts";
import { presetFromRow, presetRow } from "./preset-row.ts";
import { markRowDeleted } from "./row-mark.ts";
import { timeFromRow } from "./row-time.ts";
import type { StoreRows, SyncLocalStore, SyncStore } from "./sync-local.ts";
import type { SupabaseDataLike } from "./supabase.ts";

/**
 * The push: the rows this device changed, sent to the cloud (`P2 · 3`, slice 3).
 *
 * Push first, then pull — the order the register fixes — and one table at a time,
 * because the mark that says where the push got to is per table (`DECISIONS.md` §12,
 * and the owner's own words: *"I would rather not have a per-row flag, that would be
 * too much. but per-table seems okay"*).
 *
 * Four decisions are worth reading before changing anything here.
 *
 * **A row is sent whole, and an upsert is unconditional.** Sync settles two devices by
 * revision with no conflict screen (`DECISIONS.md` §7), and a row carries everything the
 * comparison needs, so there is nothing for the push to check before it writes. Convergence comes
 * from two other rules rather than from this one: `rowsPast` sends the rows sitting
 * *exactly on* the watermark, so a row this device wrote is re-sent on the next run
 * even when it has not changed since — which is what carries a higher revision past a
 * device that pushed a lower one last — and the pull keeps the higher revision on the
 * way in.
 *
 * **A delete is one of those rows.** A tombstone is a row with the mark on it, so it
 * travels through the same `upsert` as any other change: the mappers write `deleted_at`
 * on the way out, which is why nothing here needs a delete call.
 *
 * **The mark may only move to the last row actually written**, and not at all for an
 * empty batch. That is the half of §12 that keeps a row edited *during* a push from
 * being missed: the mark stops at what was sent, so the newer copy is still past it.
 *
 * **The cloud is reached through the seam, not through a repository.** `upsert` and the
 * mapper pairs are all this needs, and going through `CatalogRepository` would not
 * work even if it were shorter: that port has no preset *write* at all (`PresetRepository`
 * has no cloud implementation) and no `listFieldDefs`, and both are catalogue tables with
 * marks and pull indexes. The seam was widened for exactly this — `selectRange`'s doc
 * says a pull reads forward from a per-table watermark — and the pull below uses it the
 * same way.
 */
export type PushReport = {
  /** How many rows this run wrote, across every table. */
  sent: number;
};

/** One table's identity: the watermark's key, the store it lives in, the table it goes to. */
type Table = {
  name: string;
  store: SyncStore;
  table: string;
};

/**
 * The ten catalogue tables, in the order the protocol walks them.
 *
 * Types, meditations and symbols come before the rows that reference them, so a reader
 * of the cloud's tables sees a coherent snapshot more often than not — nothing depends
 * on it (every reader derives visibility from the rows it has), but an order costs
 * nothing and the alternative is arbitrary.
 */
const TABLES: readonly Table[] = [
  { name: "meditationTypes", store: "meditationTypes", table: "meditation_types" },
  { name: "meditations", store: "focusPoints", table: "meditations" },
  { name: "symbols", store: "symbols", table: "symbols" },
  { name: "entries", store: "entries", table: "entries" },
  { name: "intentions", store: "intentions", table: "intentions" },
  { name: "fieldDefs", store: "fieldDefs", table: "field_defs" },
  { name: "fieldOptions", store: "fieldOptions", table: "field_options" },
  { name: "fieldValues", store: "fieldValuesByEntity", table: "field_values" },
  { name: "mediaAssets", store: "mediaAssets", table: "media_assets" },
  { name: "presets", store: "presets", table: "binaural_presets" },
];

/** The tables in the order they are walked, for a caller that wants to say so. */
export const SYNC_TABLES: readonly string[] = TABLES.map((entry) => entry.name);

/**
 * Where a table's push and pull got to. A device that has never synced has no mark at all.
 *
 * The defaults are not the same number, and that is the point: the **push** is inclusive
 * (`rowsPast` sends the row sitting on the mark), so zero means "send everything"; the
 * **pull** is exclusive (the range read asks for what is *past* the mark), so zero would
 * mean "skip every row stamped at the epoch" — which is every seeded row, because the seed
 * writes `updatedAt: 0`. One millisecond before it is the honest starting point.
 */
async function watermarkFor(state: SyncStatePort, table: string): Promise<SyncWatermark> {
  return (await state.get(table)) ?? { table, pushedAt: 0, pulledAt: -1 };
}

/** One table's push: the rows past its mark, sent whole, then the mark moved. */
async function pushTable<S extends SyncStore>(input: {
  name: string;
  store: S;
  table: string;
  toRow: (row: StoreRows[S]) => Record<string, unknown>;
  rows: StoreRows[S][];
  cloud: SupabaseDataLike;
  state: SyncStatePort;
}): Promise<number> {
  const mark = await watermarkFor(input.state, input.name);
  const due = rowsPast(input.rows, mark.pushedAt);
  for (const row of due) {
    await input.cloud.upsert(input.table, input.toRow(row));
  }
  if (due.length > 0) {
    await input.state.save({ ...mark, pushedAt: pushedWatermark(mark.pushedAt, due) });
  }
  return due.length;
}

export async function pushCatalogue(input: {
  local: SyncLocalStore;
  cloud: SupabaseDataLike;
  state: SyncStatePort;
  workspaceId: string;
}): Promise<PushReport> {
  const { local, cloud, state, workspaceId } = input;

  const [meditationTypes, meditations, symbols, entries, intentions, fieldDefs, fieldOptions, mediaAssets, presets] =
    await Promise.all([
      local.rows("meditationTypes", workspaceId),
      local.rows("focusPoints", workspaceId),
      local.rows("symbols", workspaceId),
      local.rows("entries", workspaceId),
      local.rows("intentions", workspaceId),
      local.rows("fieldDefs", workspaceId),
      local.rows("fieldOptions", workspaceId),
      local.rows("mediaAssets", workspaceId),
      local.rows("presets", workspaceId),
    ]);

  // A value hangs off an entity with no workspace of its own, so the values are read by
  // the entities that hold them — every entity, **marked ones included**, because a
  // deleted meditation's values carry the mark with it and this list is their only way
  // out of the device.
  const fieldValues = await local.rowsForEntities([
    ...symbols.map((row) => row.id),
    ...meditations.map((row) => row.id),
    ...entries.map((row) => row.id),
  ]);

  let sent = 0;
  sent += await pushTable({
    name: "meditationTypes",
    store: "meditationTypes",
    table: "meditation_types",
    toRow: meditationTypeRow,
    rows: meditationTypes,
    cloud,
    state,
  });
  sent += await pushTable({
    name: "meditations",
    store: "focusPoints",
    table: "meditations",
    toRow: meditationRow,
    rows: meditations,
    cloud,
    state,
  });
  sent += await pushTable({
    name: "symbols",
    store: "symbols",
    table: "symbols",
    toRow: symbolRow,
    rows: symbols,
    cloud,
    state,
  });
  sent += await pushTable({
    name: "entries",
    store: "entries",
    table: "entries",
    toRow: entryRow,
    rows: entries,
    cloud,
    state,
  });
  sent += await pushTable({
    name: "intentions",
    store: "intentions",
    table: "intentions",
    toRow: intentionRow,
    rows: intentions,
    cloud,
    state,
  });
  sent += await pushTable({
    name: "fieldDefs",
    store: "fieldDefs",
    table: "field_defs",
    toRow: fieldDefRow,
    rows: fieldDefs,
    cloud,
    state,
  });
  sent += await pushTable({
    name: "fieldOptions",
    store: "fieldOptions",
    table: "field_options",
    toRow: fieldOptionRow,
    rows: fieldOptions,
    cloud,
    state,
  });
  sent += await pushTable({
    name: "fieldValues",
    store: "fieldValuesByEntity",
    table: "field_values",
    toRow: fieldValueRow,
    rows: fieldValues,
    cloud,
    state,
  });
  sent += await pushTable({
    name: "mediaAssets",
    store: "mediaAssets",
    table: "media_assets",
    toRow: mediaAssetRow,
    rows: mediaAssets,
    cloud,
    state,
  });
  sent += await pushTable({
    name: "presets",
    store: "presets",
    table: "binaural_presets",
    toRow: presetRow,
    rows: presets,
    cloud,
    state,
  });

  return { sent };
}

/**
 * The pull: the cloud's rows this device has not read yet (`P2 · 3`, slice 3).
 *
 * The mirror of `pushCatalogue`, and its three hard parts are all about *stopping*.
 *
 * **The read is exclusive and the batch is bounded**, so a batch that stops inside a group
 * of rows sharing one timestamp would leave the rest of that group behind a mark that had
 * already passed them — for ever, because the next read asks about a later window. That is
 * not a corner case here: one cascade writes a row and its lines at one instant, and every
 * seeded row carries `updatedAt: 0`, so the *first* pull of a catalogue is one huge group
 * at the epoch. So each batch **finishes the group at its newest timestamp** with one
 * equality read, which costs a request per batch and closes the hole. The tie cases the
 * pure rules own are in `sync-rules.ts`; this is the shape they need from a store.
 *
 * **A merge is per row and by revision** (`incomingWins`,
 * `DECISIONS.md` §7): the incoming copy wins when its revision is higher, a copy the
 * device has never held wins by definition, and a tie loses — which is what makes a
 * second look at the same rows write nothing. The comparison
 * is against the device's rows *including the marked ones*, so a stale live copy cannot
 * resurrect a delete.
 *
 * **The mark it leaves behind is one millisecond behind the newest row it read**
 * (`pullWatermarkAfter`), so the next run looks at that row's own group again. A row
 * written *at* that same instant while the pull was running is therefore read next time,
 * which a mark sitting exactly on it would have hidden.
 *
 * `field_values` is the exception, and deliberately: it hangs off an entity and has no
 * workspace and no `id` to tie-break on, so it is pulled the way it is pushed — by the
 * entities this device holds — with no window at all. That is also why the walk below ends
 * with it: the entities have to have arrived first.
 */
export type PullReport = {
  /** How many cloud rows the batches returned, seen before the merge. */
  received: number;
  /** How many of those this device actually wrote. */
  written: number;
};

/** How many rows one pull asks for at a time. */
export const SYNC_PULL_LIMIT = 500;

/**
 * The stores whose rows are identified by an `id`, which is every catalogue table but
 * `field_values` — it is keyed by the pair it hangs off, and pulled by entity instead.
 */
type IdStore = Exclude<SyncStore, "fieldValuesByEntity">;

/** An instant as the cloud stores it: the mappers write `updated_at` as an ISO string. */
function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

/** A value's identity, which is the pair it hangs off rather than an id of its own. */
function valueKey(value: Pick<FieldValue, "entityId" | "fieldDefId">): string {
  return `${value.entityId}|${value.fieldDefId}`;
}

/** One workspace-scoped table's pull: batches forward, each boundary group finished. */
async function pullTable<S extends IdStore>(input: {
  name: string;
  store: S;
  table: string;
  fromRow: (row: Record<string, unknown>) => StoreRows[S];
  local: SyncLocalStore;
  cloud: SupabaseDataLike;
  state: SyncStatePort;
  workspaceId: string;
  limit: number;
}): Promise<PullReport> {
  const mark = await watermarkFor(input.state, input.name);

  // The device's own rows, **marks included**, keyed by id: the comparison is against the
  // row's revision and a marked row has one.
  const held = new Map<string, StoreRows[S]>();
  for (const row of await input.local.rows(input.store, input.workspaceId)) held.set(row.id, row);

  const merge = async (rows: StoreRows[S][]): Promise<number> => {
    let written = 0;
    for (const row of rows) {
      if (!incomingWins(row, held.get(row.id) ?? null)) continue;
      await input.local.put(input.store, row);
      held.set(row.id, row);
      written += 1;
    }
    return written;
  };

  let at = mark.pulledAt;
  let received = 0;
  let written = 0;
  let newest = at;
  for (;;) {
    const batch = await input.cloud.selectRange(input.table, "updated_at", isoAt(at), "*", input.limit);
    if (batch.length === 0) break;
    const rows = batch.map(input.fromRow);
    received += rows.length;
    written += await merge(rows);
    newest = Math.max(...rows.map((row) => row.updatedAt));

    // A **full** batch is the only kind that can have stopped inside a group: a short one
    // returned every row past the window, and every row of the group at `newest` is one of
    // them. So the equality read happens where it is needed and nowhere else.
    if (batch.length === input.limit) {
      const group = (await input.cloud.select(input.table, "updated_at", isoAt(newest), "*")).map(
        input.fromRow,
      );
      received += group.length;
      written += await merge(group);
    }

    at = newest;
    await input.state.save({ ...mark, pulledAt: at });
    if (batch.length < input.limit) break;
  }

  // And the mark it leaves is one millisecond behind that last group, so a row written at
  // the same instant while this ran is read next time rather than never.
  if (newest > mark.pulledAt) {
    await input.state.save({
      ...mark,
      pulledAt: pullWatermarkAfter(mark.pulledAt, [{ updatedAt: newest }]),
    });
  }
  return { received, written };
}

/** The one table that is pulled by its entities instead of by a window. */
async function pullFieldValues(input: {
  local: SyncLocalStore;
  cloud: SupabaseDataLike;
  workspaceId: string;
}): Promise<PullReport> {
  const [symbols, meditations, entries] = await Promise.all([
    input.local.rows("symbols", input.workspaceId),
    input.local.rows("focusPoints", input.workspaceId),
    input.local.rows("entries", input.workspaceId),
  ]);
  const entityIds = [
    ...symbols.map((row) => row.id),
    ...meditations.map((row) => row.id),
    ...entries.map((row) => row.id),
  ];
  if (entityIds.length === 0) return { received: 0, written: 0 };

  const held = new Map<string, FieldValue>();
  for (const value of await input.local.rowsForEntities(entityIds)) held.set(valueKey(value), value);

  const rows = (await input.cloud.selectIn("field_values", "entity_id", entityIds, "*")).map(
    fieldValueFromRow,
  );
  let written = 0;
  for (const value of rows) {
    if (!incomingWins(value, held.get(valueKey(value)) ?? null)) continue;
    await input.local.put("fieldValuesByEntity", value);
    held.set(valueKey(value), value);
    written += 1;
  }
  return { received: rows.length, written };
}

export async function pullCatalogue(input: {
  local: SyncLocalStore;
  cloud: SupabaseDataLike;
  state: SyncStatePort;
  workspaceId: string;
  limit?: number;
}): Promise<PullReport> {
  const { local, cloud, state, workspaceId } = input;
  const limit = input.limit ?? SYNC_PULL_LIMIT;
  const totals: PullReport = { received: 0, written: 0 };
  const add = (report: PullReport): void => {
    totals.received += report.received;
    totals.written += report.written;
  };

  const shared = { local, cloud, state, workspaceId, limit };
  add(
    await pullTable({
      ...shared,
      name: "meditationTypes",
      store: "meditationTypes",
      table: "meditation_types",
      fromRow: meditationTypeFromRow,
    }),
  );
  add(
    await pullTable({
      ...shared,
      name: "meditations",
      store: "focusPoints",
      table: "meditations",
      fromRow: meditationFromRow,
    }),
  );
  add(
    await pullTable({
      ...shared,
      name: "symbols",
      store: "symbols",
      table: "symbols",
      fromRow: symbolFromRow,
    }),
  );
  add(
    await pullTable({
      ...shared,
      name: "entries",
      store: "entries",
      table: "entries",
      fromRow: entryFromRow,
    }),
  );
  add(
    await pullTable({
      ...shared,
      name: "intentions",
      store: "intentions",
      table: "intentions",
      fromRow: intentionFromRow,
    }),
  );
  add(
    await pullTable({
      ...shared,
      name: "fieldDefs",
      store: "fieldDefs",
      table: "field_defs",
      fromRow: fieldDefFromRow,
    }),
  );
  add(
    await pullTable({
      ...shared,
      name: "fieldOptions",
      store: "fieldOptions",
      table: "field_options",
      fromRow: fieldOptionFromRow,
    }),
  );
  add(
    await pullTable({
      ...shared,
      name: "mediaAssets",
      store: "mediaAssets",
      table: "media_assets",
      fromRow: mediaAssetFromRow,
    }),
  );
  add(
    await pullTable({
      ...shared,
      name: "presets",
      store: "presets",
      table: "binaural_presets",
      fromRow: presetFromRow,
    }),
  );
  add(await pullFieldValues({ local, cloud, workspaceId }));

  return totals;
}

/** The two tables a plan lives in, at both ends: `plans` and its block rows. */
const PLANS = "plans";
const BLOCKS = "plan_blocks";

/**
 * The plan pair's push: one revision comparison, and the blocks that travel with a plan.
 *
 * Plans are the pair that takes **no watermark**, and the reason is in the schema rather
 * than in this file: `plans.updated_at` is the column's own default (`not null default
 * now()`) and the app never writes it, so it does not move when a plan changes, and
 * `plan_blocks` has no timestamp at all — a block rides on its plan's revision. So the
 * push asks what the cloud already holds and writes the plans whose revision is ahead,
 * which is what `20260923140000_plan_delete_marks.sql` means by a workspace's handful of
 * plans being read whole.
 *
 * The blocks are the other half of the shape: they travel *with* their plan rather than on
 * a revision of their own, so a save writes the ones the plan holds and **marks the ones
 * it no longer holds**. Without that, a block the reader removed would stay live in the
 * cloud and come back on the next pull — the same rule the cloud port's own `save` keeps.
 */
export async function pushPlans(input: {
  local: SyncLocalStore;
  cloud: SupabaseDataLike;
  workspaceId: string;
  clock: Clock;
}): Promise<PushReport> {
  const mine = await input.local.rows("plans", input.workspaceId);
  const known = new Map(
    (await input.cloud.select(PLANS, "workspace_id", input.workspaceId, "id, revision")).map(
      (row) => [String(row.id), (row.revision as number | undefined) ?? 0],
    ),
  );

  let sent = 0;
  for (const row of mine) {
    const revision = known.get(row.id);
    if (revision !== undefined && !incomingWins({ revision: row.revision }, { revision })) continue;

    const plan = planFromRow(row);
    const gone = row.deletedAt ?? null;
    // A plan that left this device travels as a tombstone: the row, with the mark on it.
    // `planRow` writes a live row, so the mark is written over it here — a delete is a
    // write in this protocol, never a removal.
    await input.cloud.upsert(PLANS, {
      ...planRow(plan),
      ...(gone === null ? {} : { deleted_at: new Date(gone).toISOString() }),
    });
    let writes = 1;

    const blocks = gone === null ? planBlockRows(plan) : [];
    for (const block of blocks) {
      await input.cloud.upsert(BLOCKS, block);
      writes += 1;
    }

    // What the plan no longer holds — every live block of it, when the plan itself is
    // gone — is marked rather than left behind.
    const held = new Set(blocks.map((block) => String(block.id)));
    for (const stored of await input.cloud.select(BLOCKS, "plan_id", plan.id, "*")) {
      if (stored.deleted_at != null) continue;
      if (held.has(String(stored.id))) continue;
      await markRowDeleted({
        client: input.cloud,
        clock: input.clock,
        table: BLOCKS,
        row: stored,
        // A block has neither a revision nor a timestamp of its own; its plan's is what
        // travels (`row-mark.ts`).
        columns: { updatedAt: false, revision: false },
      });
      writes += 1;
    }
    sent += writes;
  }
  return { sent };
}

/**
 * The plan pair's pull: settled by revision, read whole.
 *
 * The mirror of `pushPlans`, and the only place a *pull* moves a mark: a cloud plan that is
 * marked is written locally **as the mark**, because a mark is what makes the delete stick
 * on a device that still holds the plan — and `savePlan` would clear it, since a save is
 * the product writing a row the reader has open. A mark for a plan this device never held
 * is nothing to hide, so it is skipped rather than invented.
 */
export async function pullPlans(input: {
  local: SyncLocalStore;
  cloud: SupabaseDataLike;
  workspaceId: string;
}): Promise<PullReport> {
  const rows = await input.cloud.select(PLANS, "workspace_id", input.workspaceId, "*");
  const held = new Map(
    (await input.local.rows("plans", input.workspaceId)).map((row) => [row.id, row]),
  );

  let written = 0;
  for (const row of rows) {
    const local = held.get(String(row.id));
    const revision = (row.revision as number | undefined) ?? 0;
    if (!incomingWins({ revision }, local ?? null)) continue;

    if (row.deleted_at != null) {
      if (!local) continue;
      await input.local.put("plans", {
        ...local,
        revision,
        deletedAt: timeFromRow(row.deleted_at),
      });
    } else {
      const blocks = await input.cloud.select(BLOCKS, "plan_id", String(row.id), "*");
      await input.local.put("plans", planRowForStore(planFromCloud(row, blocks)));
    }
    written += 1;
  }
  return { received: rows.length, written };
}

/**
 * One sync run: the whole protocol, in the register's order.
 *
 * Push first, then pull — and that order is not only the register's: it is what makes a
 * change this device just made win the race it was made in, because it reaches the cloud
 * before the pull compares revisions, so the pull cannot hand the device its own older copy
 * back.
 *
 * The catalogue goes first and the plans last, because the plans' push reads what the cloud
 * holds and their pull writes what it says: a plan can name a meditation or a symbol, and
 * having those settled first means the plan is never written against a catalogue the device
 * has not caught up with.
 *
 * The app reaches this through `SyncPort` (`sync-port.ts`), which is the seam that decides
 * *whether* this build can sync at all; nothing else calls it directly.
 */
export async function syncOnce(input: {
  local: SyncLocalStore;
  cloud: SupabaseDataLike;
  state: SyncStatePort;
  workspaceId: string;
  clock: Clock;
  limit?: number;
}): Promise<SyncOutcome> {
  const { local, cloud, state, workspaceId, clock, limit } = input;

  const sentRows = await pushCatalogue({ local, cloud, state, workspaceId });
  const sentPlans = await pushPlans({ local, cloud, workspaceId, clock });
  const pulledRows = await pullCatalogue({ local, cloud, state, workspaceId, limit });
  const pulledPlans = await pullPlans({ local, cloud, workspaceId });

  return {
    sent: sentRows.sent + sentPlans.sent,
    received: pulledRows.received + pulledPlans.received,
    written: pulledRows.written + pulledPlans.written,
  };
}
