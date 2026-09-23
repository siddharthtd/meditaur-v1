import type {
  FieldDef,
  FieldScope,
  PlanDisplay,
  PlanDisplayArea,
  PlanDisplayColumn,
} from "./models.ts";

/**
 * The plan's Display panel, in one pure place.
 *
 * The Database holds no display settings (§12.12): a column is a fact about the
 * store, and which of those facts are useful *while meditating* belongs to the
 * session — so they live on the plan, and these functions are the only thing that
 * decides what a stored display means. They are pure so that the panel, the
 * compiler and the tests all agree without sharing a component.
 */

/**
 * Which table a scope's column belongs to, in the display's words.
 *
 * `affirmation` is deliberately **absent**: a session's Display picks the facts
 * shown beside a meditation and its symbol, and an affirmation is neither — its own
 * words are the whole of what a Thanks Giving stage shows. A column added to the
 * Affirmations table is therefore offered by no Display group, and the panel does
 * not grow a group with nothing in it.
 */
export const AREA_OF_SCOPE: Partial<Record<FieldScope, PlanDisplayArea>> = {
  meditation: "meditation",
  symbol: "symbol",
  entry: "entry",
};

/**
 * The columns a table has without the reader adding any.
 *
 * Only the ones the session screen does not already show: a symbol's name and a
 * chakra's name are the box's heading and the screen's header, so listing them
 * again as facts would be noise the reader has to switch off. Everything a reader
 * can add is a `FieldDef`; the two lists together are what the panel offers.
 */
export const BUILTIN_AREA_COLUMNS: Record<
  PlanDisplayArea,
  readonly { key: string; label: string }[]
> = {
  meditation: [
    { key: "name", label: "Name" },
    { key: "location", label: "Location" },
  ],
  symbol: [
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "usage", label: "Usage" },
  ],
  entry: [],
};

/**
 * What a plan shows in a session until the reader says otherwise.
 *
 * The symbol's description and usage were the columns the old default table view
 * showed, so a session keeps showing them and the reader narrows from there.
 *
 * **The meditation's `Location` is shown too**, since the owner's round 17:
 * *"Chakra details are no-where to be seen on the entire page, we had decided to
 * show both the chakra details and the symbol details."* It was hidden by this
 * default and by nothing else — `factsFor` emits a fact per *shown* column, so the
 * chakra's panel compiled to an empty list and `sessionRegions` then did the right
 * thing with it and did not draw the region at all. The panel was never missing; it
 * had nothing to say. A chakra's `Governs` and `Element` are the reader's own
 * columns and stay theirs to switch on, which is what §9's Display panel is for.
 */
export const DEFAULT_PLAN_DISPLAY: PlanDisplay = {
  columns: [
    { key: "location", area: "meditation", shown: true, pinned: false },
    { key: "description", area: "symbol", shown: true, pinned: false },
    { key: "usage", area: "symbol", shown: true, pinned: false },
  ],
};

/**
 * The default this file answered with before round 17 — `Location` hidden.
 *
 * Kept for exactly one purpose, and it is not to be handed to a new plan: a plan
 * that still carries **this** display is a plan nobody has opened the Display panel
 * on, so it is still the app's own default and the app may hand it the new one
 * (`packages/db/src/schema.ts`, v25). A plan whose display is anything else is the
 * reader's, and no repair touches it.
 */
const PREVIOUS_DEFAULT_PLAN_DISPLAY: PlanDisplay = {
  columns: [
    { key: "location", area: "meditation", shown: false, pinned: false },
    { key: "description", area: "symbol", shown: true, pinned: false },
    { key: "usage", area: "symbol", shown: true, pinned: false },
  ],
};

function sameColumns(a: PlanDisplayColumn[], b: PlanDisplayColumn[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (row, index) =>
        row.key === b[index]!.key &&
        row.area === b[index]!.area &&
        row.shown === b[index]!.shown &&
        row.pinned === b[index]!.pinned,
    )
  );
}

/**
 * Whether a stored display is the app's own default rather than the reader's.
 *
 * The question a repair has to ask before it may change anything: a display the
 * reader has never touched is the app's to update, and one they have arranged is
 * not. Both the current and the previous default answer `true`, so a plan the
 * reader has left alone is never stranded on a default the app has outgrown.
 */
export function isAppDefaultDisplay(display: PlanDisplay): boolean {
  return (
    sameColumns(display.columns, DEFAULT_PLAN_DISPLAY.columns) ||
    sameColumns(display.columns, PREVIOUS_DEFAULT_PLAN_DISPLAY.columns)
  );
}

/**
 * The area a stored row means, or `null` when this build cannot read it.
 *
 * `chakra` was this area's word until the owner's round 15 (2026-09-19); a plan written
 * before then still carries it in `plans.display`, and a session that read it as
 * unreadable would quietly lose the reader's chosen columns. The retired word is
 * mapped here, at the one place a stored display is read, and nowhere else — so
 * no reader of `PlanDisplayArea` has to know it ever existed.
 */
function isArea(value: unknown): value is PlanDisplayArea {
  return value === "meditation" || value === "symbol" || value === "entry";
}

function areaOf(value: unknown): PlanDisplayArea | null {
  if (value === "chakra") return "meditation";
  return isArea(value) ? value : null;
}

/**
 * What a stored display means, whoever wrote it.
 *
 * A plan stored before the column existed carries no display at all, and one
 * written by an older build may carry rows this build cannot read. Neither is a
 * broken plan: a missing display is the default, and a row that is not a column
 * this build understands is dropped rather than rendered as a blank fact.
 */
export function normalizePlanDisplay(raw: unknown): PlanDisplay {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { columns: [...DEFAULT_PLAN_DISPLAY.columns] };
  }
  const rows = (raw as { columns?: unknown }).columns;
  if (rows === undefined) {
    return { columns: [...DEFAULT_PLAN_DISPLAY.columns] };
  }
  if (!Array.isArray(rows)) return { columns: [] };
  const columns: PlanDisplayColumn[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    if (typeof item.key !== "string" || !item.key) continue;
    const area = areaOf(item.area);
    if (!area) continue;
    columns.push({
      key: item.key,
      area,
      shown: item.shown !== false,
      pinned: item.pinned === true,
    });
  }
  return { columns };
}

/** Every column the panel can offer: the table's builtins, then the reader's. */
export function availableDisplayColumns(
  defs: Pick<FieldDef, "key" | "label" | "scope" | "sortOrder">[],
): { key: string; label: string; area: PlanDisplayArea }[] {
  const areas: PlanDisplayArea[] = ["meditation", "symbol", "entry"];
  const out: { key: string; label: string; area: PlanDisplayArea }[] = [];
  for (const area of areas) {
    for (const column of BUILTIN_AREA_COLUMNS[area]) {
      out.push({ key: column.key, label: column.label, area });
    }
    for (const def of [...defs].sort((a, b) => a.sortOrder - b.sortOrder)) {
      if (AREA_OF_SCOPE[def.scope] !== area) continue;
      out.push({ key: def.key, label: def.label, area });
    }
  }
  return out;
}

/**
 * Turn one column on or off, or pin it.
 *
 * **Pinning a hidden column shows it** (§12.28): "pinned but invisible" is a
 * state the reader cannot see and did not ask for, so the pin carries the show
 * with it. A column that is not listed yet is appended, which is where a column
 * the reader has just added to the Database appears the moment it is switched on.
 */
export function setDisplayColumn(
  display: PlanDisplay,
  column: { key: string; area: PlanDisplayArea },
  patch: { shown?: boolean; pinned?: boolean },
): PlanDisplay {
  const index = display.columns.findIndex(
    (row) => row.key === column.key && row.area === column.area,
  );
  const current: PlanDisplayColumn =
    index >= 0
      ? display.columns[index]!
      : { key: column.key, area: column.area, shown: false, pinned: false };
  const next: PlanDisplayColumn = {
    ...current,
    ...(patch.shown === undefined ? {} : { shown: patch.shown }),
    ...(patch.pinned === undefined ? {} : { pinned: patch.pinned }),
  };
  if (patch.pinned === true) next.shown = true;
  if (patch.shown === false) next.pinned = false;
  const columns = [...display.columns];
  if (index >= 0) columns[index] = next;
  else columns.push(next);
  return { columns };
}
