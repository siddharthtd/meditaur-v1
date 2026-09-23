"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { EditorChrome } from "@/features/library/EditorChrome";
import { EditorSection } from "@/features/library/EditorSection";
import { formatDurationMs } from "@/features/library/library-model";
import { useArmedFlag, useArmedId } from "@/lib/armed";
import { errorText } from "@/lib/error-text";
import { startSession, startSessionFromMeditation } from "@/runtime";
import {
  ALL_PICK_ID,
  NONE_PICK_ID,
  applyBlockPick,
  type BlockPickKind,
  type LibraryView,
} from "@meditaur/application";
import {
  STAGE_KIND_DEFAULT_MS,
  STAGE_KIND_LABELS,
  STAGE_KINDS,
  availableDisplayColumns,
  autoScrollForKind,
  createId,
  defaultStage,
  fail,
  setDisplayColumn,
  stagesForMeditation,
  type FieldDef,
  type Plan,
  type PlanBlock,
  type PlanBlockStage,
  type PlanDisplay,
  type PlanDisplayArea,
  type StageKind,
} from "@meditaur/domain";
import {
  Button,
  EYEBROW_CLASS,
  LatchButton,
  PickerPage,
  Stepper,
  accentForMeditation,
  accentStyle,
  type PickerItem,
} from "@meditaur/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DurationSteppers } from "../DurationSteppers";
import { meditationTileGroups } from "./plan-groups";

type Overlay =
  /**
   * The picker, opened from a meditation's editor — `from` is which one, so the
   * picker's `Back` returns there rather than dropping the reader out on the circuit
   * with their edit half-made.
   */
  | { type: "block"; blockId: string; kind: BlockPickKind; from: string }
  /** **Add meditation block**: the same picker, with no card to point at yet. */
  | { type: "new"; kind: BlockPickKind }
  /** One meditation's own settings (the owner's round 17, item 13). */
  | { type: "blockEditor"; blockId: string }
  /** **Add stage**: which kind to append to that meditation's own list. */
  | { type: "stageKind"; blockId: string }
  | { type: "plans" };

// The tiles are grouped by type, with only a chakra's and a point's keeping a
// heading of their own: the rest are folded into one group, so a type the reader
// adds later needs nothing registered for it (the owner's round 16, §8). The rule
// and its order live in `plan-groups.ts`, because they are arithmetic over the type
// rows rather than anything about this screen.

function nameOf(
  id: string | null,
  items: { id: string; name: string }[],
  empty: string,
): string {
  if (!id) return empty;
  return items.find((item) => item.id === id)?.name ?? empty;
}

function symbolPickLabel(block: PlanBlock, library: LibraryView): string {
  if (!block.symbolId && block.symbolScope === "all") return "All symbols";
  return nameOf(block.symbolId, library.symbols, "Rotate next");
}

function MeditationTiles({
  meditations,
  types,
  onPick,
}: {
  meditations: LibraryView["meditations"];
  types: LibraryView["meditationTypes"];
  onPick: (meditationId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {meditationTileGroups(meditations, types).map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <h2 className="text-xl text-text">{group.heading}</h2>
          <div className="flex flex-wrap gap-2">
            {group.meditations.map((fp) => (
              <Button
                key={fp.id}
                accent={accentForMeditation(fp)}
                onClick={() => onPick(fp.id)}
              >
                {fp.name}
              </Button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * One pickable field: its name in small caps over its value.
 *
 * The owner's round 19 called the old shape out with the stage rows it sat beside:
 * *"The edit page has long bars with a single button each, it is very shabby"*. So the
 * bar is a **row** now — the name on the left, what it is set to on the right, 44px
 * tall — and the whole `Focus: Heart Chakra` line stays the accessible name, so a
 * screen reader still hears which field it is.
 */
function FieldButton({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${value}`}
      onClick={onClick}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-surface-raised px-3 transition active:scale-95 active:opacity-80"
    >
      <span className={`${EYEBROW_CLASS} shrink-0 text-xs`}>{label}</span>
      <span className="min-w-0 truncate text-base text-text">{value}</span>
    </button>
  );
}

/**
 * The symbols a block of this meditation can be given, in the order the reader
 * arranged them.
 *
 * What a chakra *has* is a row of the Entries table — the pair names both sides, so
 * the rows are what says which symbols belong to this meditation — and this is that
 * rule in one place. It is asked twice: to fill the Symbol picker, and to decide
 * whether the Symbol control is **drawn at all** (the owner's round 17, item 8:
 * *"the Thanksgiving card has a symbol entry, even though there are no symbols in
 * there, there shouldn't be"*).
 */
function symbolsForMeditation(library: LibraryView, meditationId: string | null) {
  if (!meditationId) return [];
  const bound = new Set(
    library.entries
      .filter((row) => row.archivedAt == null && row.meditationId === meditationId)
      .map((row) => row.symbolId)
      .filter((id): id is string => Boolean(id)),
  );
  return library.symbols.filter((row) => bound.has(row.id));
}

/** The meditation's type name, for a card's or an editor's second line. */
function typeNameOf(library: LibraryView, meditationId: string | null): string | undefined {
  const meditation = library.meditations.find((row) => row.id === meditationId);
  return library.meditationTypes.find((row) => row.id === meditation?.typeId)?.name;
}

/**
 * What a card says about the block under its name: how long it runs, how many
 * stages that is, and which symbol it walks.
 *
 * One muted line and nothing else, because the card is the way in and everything
 * it names is edited one press away — a card that printed its settings as controls
 * is exactly what the owner's round 17 removed. These are the three facts that fit
 * the card's fixed width without truncating; the sound's name does not (a preset is
 * called "Solfeggio Third-Eye 852/8"), and a truncated line is the one thing the
 * owner's round 17 said about the old card.
 */
function blockSummary(block: PlanBlock, library: LibraryView): string {
  const length = block.stages.reduce((total, stage) => total + stage.durationMs, 0);
  const parts = [
    formatDurationMs(length),
    `${block.stages.length} stage${block.stages.length === 1 ? "" : "s"}`,
  ];
  if (symbolsForMeditation(library, block.meditationId).length > 0) {
    parts.push(symbolPickLabel(block, library));
  }
  return parts.join(" · ");
}

/**
 * One card in the circuit, and the way into everything about that meditation.
 *
 * The owner's round 17: *"that card-view is become too cluttered, it doesn't even
 * visibly show the chakra name clearly, it is all truncated, so it is not at all
 * usable … the information it shows is read-only, so that is also useless."* It had
 * grown five picker fields and a timer row per stage, and the meditation's name —
 * the one thing a card is *for* — was squeezed to the width left over.
 *
 * So the card is a handle again: the meditation over its type, `Remove`, and one
 * press that opens that meditation's editor. Everything the card used to show as
 * read-only text is editable in there, which is what the ask was — *"If something
 * needs to be updated for the meditation, that needs to be done by selecting a
 * one-meditation block and then updating there."*
 *
 * The owner's round 18, on the same card: *"it is the card itself, along with what
 * it opens, there should be more beautiful way to represent that information.
 * Smaller buttons, more well-placed and easy to operate."* So the title-line
 * `Remove` and the full-width `Edit` band are gone: the card answers a press
 * everywhere, its two controls sit together in a `sm` row at its foot, and the one
 * line under the name says what the block runs. What it does *not* do is grow its
 * settings back — that line is text, and the card is the way in.
 */
function SortableBlock({
  block,
  library,
  armed,
  onOpen,
  onRemove,
}: {
  block: PlanBlock;
  library: LibraryView;
  /** True while this card's Remove is waiting for its confirm press. */
  armed: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const meditation = library.meditations.find((row) => row.id === block.meditationId);
  const typeName = typeNameOf(library, block.meditationId);
  const name = meditation?.name ?? "Choose";
  // The meditation's own tint, on the one word that says what kind of thing this
  // is. A card whose meditation has a colour of its own carries it here too
  // (`accentStyle` paints a hex; a token tints the class).
  const accent = accentForMeditation(meditation ?? { name: "Choose" });
  return (
    <div
      ref={setNodeRef}
      style={{
        // Blocks reorder left to right, so the y half of the drag is dropped:
        // a card being moved stays inside the strip instead of riding up over
        // the controls above it.
        transform: transform ? CSS.Translate.toString({ ...transform, y: 0 }) : undefined,
        transition,
      }}
      className={`relative flex w-52 min-w-52 shrink-0 flex-col gap-2 rounded-2xl border border-line bg-surface px-3 py-3 ${
        isDragging ? "z-10" : ""
      }`}
    >
      {/* The card answers a press everywhere the handle and the action row do not
          (UI_DESIGN §1.12), and that press is the whole ask: everything about
          **this** meditation is set in its editor. It is a real button rather than
          a click handler on the container, so the card has one labelled,
          keyboard-reachable default action. */}
      <button
        type="button"
        aria-label={`Open ${name}`}
        onClick={onOpen}
        className="absolute inset-0 rounded-2xl transition active:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      {/* The handle says what the card *is* — the meditation's name, with its type
          when it has one — and not how to move it: the owner's round 5 removed
          "· drag" from every card. It is the drag handle for a screen reader
          through its `aria-label`, and it gives the name the card's full width,
          which is what round 17 asked for. */}
      <button
        type="button"
        aria-label={`Drag ${name} block`}
        className="relative flex min-h-11 min-w-0 touch-none flex-col items-start justify-center gap-0.5 rounded-xl px-1 py-1 text-left transition active:scale-95 active:opacity-80"
        {...attributes}
        {...listeners}
      >
        <span className="max-w-full truncate text-lg text-text">{name}</span>
        {typeName ? (
          <span
            style={accentStyle(accent) ?? undefined}
            className={`${EYEBROW_CLASS} max-w-full truncate text-xs`}
          >
            {typeName}
          </span>
        ) : null}
      </button>
      {/* What the block runs. Nothing here is a control and nothing here is
          read-only *text pretending to be one*: the line is the card's content, and
          the card is the way in. */}
      <p className="truncate text-sm text-muted">{blockSummary(block, library)}</p>
      {/* The card's own actions, at its foot — the app's shape for a card's actions
          and the app's placement for `Remove` (`UI_DESIGN` §1.4). Both are `sm`:
          the card is 234px wide and its controls are read as one quiet row, not as
          the two page-level buttons this card used to carry. */}
      <div className="relative flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" aria-label={`Edit ${name}`} onClick={onOpen}>
          Edit
        </Button>
        <Button
          size="sm"
          tier="destructive"
          armed={armed}
          aria-label={armed ? `Remove ${name}?` : `Remove ${name}`}
          onClick={onRemove}
        >
          {armed ? "Remove?" : "Remove"}
        </Button>
      </div>
    </div>
  );
}

function pickerItems(
  kind: BlockPickKind,
  block: PlanBlock,
  library: LibraryView,
): { title: string; items: PickerItem[] } {
  if (kind === "meditation") {
    // **Every** live meditation, whichever type it belongs to, with the type beside
    // the name (§5, §12.16): one Add, and a type the reader adds later appears in it
    // with nothing to register.
    return {
      title: "Meditation",
      items: library.meditations
        .filter((row) => row.archivedAt == null)
        .map((fp) => ({
          id: fp.id,
          label: fp.name,
          hint:
            library.meditationTypes.find((type) => type.id === fp.typeId)?.name ??
            fp.locationText,
        })),
    };
  }
  if (kind === "symbol") {
    return {
      title: "Symbol",
      items: [
        { id: NONE_PICK_ID, label: "Rotate next", hint: "Walk this meditation's symbols" },
        { id: ALL_PICK_ID, label: "All symbols", hint: "Whole sheet for this focus" },
        ...symbolsForMeditation(library, block.meditationId).map((s) => ({
          id: s.id,
          label: s.name,
          hint: s.usage,
        })),
      ],
    };
  }
  if (kind === "preset") {
    return {
      title: "Binaural",
      items: [
        { id: NONE_PICK_ID, label: "None" },
        ...library.presets.map((p) => ({
          id: p.id,
          label: p.name,
          hint: `L${p.leftTones.length} / R${p.rightTones.length}`,
        })),
      ],
    };
  }
  if (kind === "ambient") {
    return {
      title: "Ambient",
      items: [
        { id: NONE_PICK_ID, label: "None" },
        ...library.mediaAssets
          .filter((a) => a.kind === "ambient")
          .map((a) => ({ id: a.id, label: a.name })),
      ],
    };
  }
  if (kind === "alarm") {
    return {
      title: "Alarm",
      items: [
        { id: NONE_PICK_ID, label: "Beep" },
        ...library.mediaAssets
          .filter((a) => a.kind === "alarm")
          .map((a) => ({ id: a.id, label: a.name })),
      ],
    };
  }
  // Unreachable for a typed caller — the pick kinds are a closed set — and a
  // failure rather than a silent no-op for any other: a pick that changes nothing
  // is worse than one that says so.
  return fail("catalog.pickUnknown", "That choice is not one a block can make");
}

/** The three groups a column can belong to, in the order they are drawn. */
const DISPLAY_AREAS: { area: PlanDisplayArea; label: string }[] = [
  { area: "meditation", label: "Meditation" },
  { area: "symbol", label: "Symbol" },
  { area: "entry", label: "Entries" },
];

/**
 * The Display: which of the Database's columns a session shows, grouped by the
 * table they belong to — the meditation's own facts, the symbol's, and the pair's.
 * Nothing has to be registered for a column to appear here; a column the reader
 * adds in the Database is offered the moment it exists, because both lists come
 * from the same `FieldDef`s.
 *
 * **It is a grid, and its two switches are named once at the top.** Every row used
 * to repeat `Shown`/`Hidden` and `Pin`/`Pinned` beside its column, which is the same
 * sentence twice per row — the words read as buttons rather than as state, and the
 * rows wrapped raggedly at any width (the owner's round 18: *"smaller buttons, more
 * well-placed and easy to operate"*). A row is now a name and two switches sitting
 * under the headings that name them, exactly as the Database's own grid draws a
 * switch under its column's heading — and the words the cells drop are not lost: a
 * screen reader hears `Symbol Description shown` — more than the bare word `Shown`
 * ever said, and it names the group, because two tables both have a `Name` column
 * and a switch's name must be unique.
 *
 * A column cannot be pinned while hidden: pinning it shows it, and hiding it drops
 * the pin, so the reader never has an invisible pin they cannot see. The rule lives
 * in `setDisplayColumn`, not here — this panel only asks for it.
 */
function DisplayPanel({
  display,
  defs,
  onChange,
}: {
  display: PlanDisplay;
  defs: FieldDef[];
  onChange: (
    column: { key: string; area: PlanDisplayArea },
    patch: { shown?: boolean; pinned?: boolean },
  ) => void;
}) {
  const columns = useMemo(() => availableDisplayColumns(defs), [defs]);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {/* The two switch columns, named once. `w-16` is the `sm` switch's own width
          (a 40px track inside 12px of padding either side), so a heading sits over
          the control it names rather than beside it. */}
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="min-w-0 flex-1" />
        <span className={`${EYEBROW_CLASS} w-16 text-center text-xs`}>Shown</span>
        <span className={`${EYEBROW_CLASS} w-16 text-center text-xs`}>Pin</span>
      </div>
      {DISPLAY_AREAS.map((group) => {
        const rows = columns.filter((column) => column.area === group.area);
        if (rows.length === 0) return null;
        return (
          <section key={group.area}>
            {/* A band rather than a section heading: this is a group inside one
                section of the editor, and three `text-xl` headings for three
                groups of switches would outrank the section they belong to. */}
            <h3 className={`${EYEBROW_CLASS} border-t border-line/50 bg-surface-raised px-4 py-1.5 text-xs`}>
              {group.label}
            </h3>
            {rows.map((column) => {
              const row = display.columns.find(
                (item) => item.key === column.key && item.area === column.area,
              );
              return (
                <div
                  key={`${column.area}:${column.key}`}
                  className="flex items-center gap-3 border-t border-line/50 px-4 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-lg text-text">
                    {column.label}
                  </span>
                  <span className="flex w-16 justify-center">
                    <LatchButton
                      size="sm"
                      labelHidden
                      label={`${group.label} ${column.label} shown`}
                      pressed={row?.shown === true}
                      onChange={(shown) => onChange(column, { shown })}
                    />
                  </span>
                  <span className="flex w-16 justify-center">
                    <LatchButton
                      size="sm"
                      labelHidden
                      label={`${group.label} ${column.label} pinned`}
                      pressed={row?.pinned === true}
                      onChange={(pinned) => onChange(column, { pinned })}
                    />
                  </span>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/**
 * One meditation's own settings — the owner's round 17, item 13.
 *
 * *"We need to update this entirely. Whatever is meditation specific — symbols,
 * ambient, alarm, binaural, stages of meditation etc, all should be updatable for
 * that particular meditation (specific to a plan, default is whatever is default) by
 * clicking on the card. The display menu at the bottom should be per-meditation block
 * as well."*
 *
 * So this is the card, opened: every field the plan holds for **this** meditation,
 * plus the Display panel that used to sit at the foot of the plan screen. It is the
 * app's editor shape (`EditorChrome` + `EditorSection`), the same one the library's
 * meditation and symbol editors use, because the owner asked for one editor shape
 * across the app (their round 6, §1.12) and a fourth would be the thing that rule
 * exists to prevent.
 *
 * There is no Save: the plan autosaves, exactly as the rest of the plan screen does,
 * so leaving is not a decision about the reader's work.
 */
/**
 * One stage, in the meditation's own editor.
 *
 * The owner's round 19, item 7: *"stages should be a carousel like the circuit
 * meditation, with ability to add stages inside. each stage will be its own card with
 * timer, binaural toggle, auto-scroll toggle."* So a stage is a card in the shape a
 * meditation's card has in the circuit: a handle that drags (its label over its kind),
 * the stage's own timer, and the switches that belong to it.
 *
 * Removing one is the armed press every destructive control in the app carries, and
 * the caller offers it only while there is more than one stage: `blockStages` falls
 * back to the meditation's template the moment a block's own list is empty, so an
 * emptied list would quietly grow back the stages the reader had just taken away.
 */
function SortableStage({
  stage,
  armed,
  removable,
  onDuration,
  onFlag,
  onRemove,
}: {
  stage: PlanBlockStage;
  /** True while this card's Remove is waiting for its confirm press. */
  armed: boolean;
  /** False for a block's only stage, which is then not offered for removal. */
  removable: boolean;
  onDuration: (durationMs: number) => void;
  onFlag: (flag: { binaural?: boolean; autoScroll?: boolean }) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.key,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        // Stages reorder left to right, so the y half of the drag is dropped — the
        // same rule the circuit's own cards follow.
        transform: transform ? CSS.Translate.toString({ ...transform, y: 0 }) : undefined,
        transition,
      }}
      className={`relative flex w-56 min-w-56 shrink-0 flex-col gap-2 rounded-2xl border border-line bg-surface px-3 py-3 ${
        isDragging ? "z-10" : ""
      }`}
    >
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          aria-label={`Drag ${stage.label} stage`}
          className="flex min-h-11 min-w-0 flex-1 touch-none flex-col items-start justify-center gap-0.5 rounded-xl px-1 py-1 text-left transition active:scale-95 active:opacity-80"
          {...attributes}
          {...listeners}
        >
          <span className="max-w-full truncate text-lg text-text">{stage.label}</span>
          <span className={`${EYEBROW_CLASS} max-w-full truncate text-xs`}>
            {STAGE_KIND_LABELS[stage.kind]}
          </span>
        </button>
        {removable ? (
          <Button
            size="sm"
            tier="destructive"
            armed={armed}
            aria-label={armed ? `Remove ${stage.label}?` : `Remove ${stage.label}`}
            onClick={onRemove}
          >
            {armed ? "Remove?" : "Remove"}
          </Button>
        ) : null}
      </div>
      <DurationSteppers durationMs={stage.durationMs} onChange={onDuration} size="sm" />
      <div className="flex flex-wrap items-center gap-2">
        <LatchButton
          size="sm"
          label="Binaural"
          pressed={stage.binaural}
          onChange={(binaural) => onFlag({ binaural })}
        />
        {/* Only the kinds that scroll carry the switch: `autoScrollForKind` is the one
            sentence for that, shared with the template and the run screen. */}
        {autoScrollForKind(stage.kind) ? (
          <LatchButton
            size="sm"
            label="Auto-scroll"
            pressed={stage.autoScroll}
            onChange={(autoScroll) => onFlag({ autoScroll })}
          />
        ) : null}
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  library,
  planDisplay,
  planAlarmEnabled,
  onBack,
  onPatch,
  onPick,
  onDisplay,
  onAddStage,
}: {
  block: PlanBlock;
  library: LibraryView;
  /** The plan's Display, which this block inherits until it is given its own. */
  planDisplay: PlanDisplay;
  /** The plan's `Alarm`, which this block inherits until it is given its own. */
  planAlarmEnabled: boolean;
  onBack: () => void;
  onPatch: (patch: Partial<PlanBlock>) => void;
  onPick: (kind: BlockPickKind) => void;
  onDisplay: (
    column: { key: string; area: PlanDisplayArea },
    patch: { shown?: boolean; pinned?: boolean },
  ) => void;
  /** Ask which kind of stage to append (the owner's round 19, item 7). */
  onAddStage: () => void;
}): React.ReactNode {
  // One armed stage at a time, with its own timer: two stages armed at once would be
  // two presses away from removing two different rows.
  const [armedStage, setArmedStage] = useArmedId();
  const stageSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const onStageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = block.stages.findIndex((row) => row.key === active.id);
    const to = block.stages.findIndex((row) => row.key === over.id);
    if (from < 0 || to < 0) return;
    onPatch({ stages: arrayMove(block.stages, from, to) });
  };
  const removeStage = (key: string) => {
    if (armedStage !== key) {
      setArmedStage(key);
      return;
    }
    setArmedStage(null);
    onPatch({ stages: block.stages.filter((row) => row.key !== key) });
  };
  const meditation = library.meditations.find((row) => row.id === block.meditationId);
  const name = meditation?.name ?? "Choose a meditation";
  const typeName = typeNameOf(library, block.meditationId);
  const symbols = symbolsForMeditation(library, block.meditationId);
  // What the session will actually show: the block's own Display once it has one,
  // and the plan's until then — the same order of precedence the compiler reads.
  const display = block.display ?? planDisplay;
  // A block that says nothing takes the plan's answer, which is why the switch has
  // to show *which* answer it is showing — and why the fallback is the plan's
  // value and not a literal: a plan whose alarm is on shows an on switch here.
  const alarmFromPlan = block.alarmEnabled === null;
  const alarmOn = block.alarmEnabled ?? planAlarmEnabled;

  return (
    <EditorChrome
      title={name}
      error={null}
      onBack={onBack}
      actions={
        <Button tier="primary" size="lg" onClick={onBack}>
          Done
        </Button>
      }
    >
      <EditorSection
        title="Meditation"
        action={
          <Button size="sm" onClick={() => onPick("meditation")}>
            Change
          </Button>
        }
      >
        <p className="text-lg text-text">
          {name}
          {typeName ? <span className="text-muted"> · {typeName}</span> : null}
        </p>
        <p className="text-sm text-muted">
          Which meditation this block runs. The stages below are this block&apos;s own
          and do not move when the meditation does.
        </p>
      </EditorSection>

      {/* The stages as a carousel of their own cards, one drag sideways to reorder and
          an `Add stage` at the end of the strip — the plan's own recipe one level down
          (the owner's round 19, item 7). */}
      <EditorSection title="Stages">
        <DndContext
          sensors={stageSensors}
          collisionDetection={closestCenter}
          onDragEnd={onStageDragEnd}
        >
          <SortableContext
            items={block.stages.map((row) => row.key)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2">
              {block.stages.map((stage, index) => (
                <SortableStage
                  key={stage.key}
                  stage={stage}
                  armed={armedStage === stage.key}
                  removable={block.stages.length > 1}
                  onDuration={(ms) =>
                    onPatch({
                      stages: block.stages.map((row, at) =>
                        at === index ? { ...row, durationMs: ms } : row,
                      ),
                    })
                  }
                  onFlag={(flag) =>
                    onPatch({
                      stages: block.stages.map((row, at) =>
                        at === index ? { ...row, ...flag } : row,
                      ),
                    })
                  }
                  onRemove={() => removeStage(stage.key)}
                />
              ))}
              {/* The invitation sits **inside** the strip, which is what "with ability
                  to add stages inside" asks for: it is the last thing in the row of
                  stages, and pressing it asks which kind — the picker every other
                  `which one?` in the app uses. */}
              <button
                type="button"
                aria-label="Add stage"
                title="Add a stage to this meditation"
                onClick={onAddStage}
                className="flex min-h-32 w-40 min-w-40 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-muted transition-colors hover:border-accent/60 hover:text-text active:scale-95"
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  +
                </span>
                <span className={`${EYEBROW_CLASS} text-xs`}>Add stage</span>
              </button>
            </div>
          </SortableContext>
        </DndContext>
      </EditorSection>

      {/* The owner's item 8: a meditation with no symbols gets no Symbol control,
          because there is nothing for it to choose. The sentence stays so the
          absence reads as a fact about the meditation rather than a missing box. */}
      <EditorSection
        title="Symbol"
        action={
          symbols.length > 0 ? (
            <Button size="sm" onClick={() => onPick("symbol")}>
              Change
            </Button>
          ) : undefined
        }
      >
        <p className="text-lg text-text">
          {symbols.length > 0 ? symbolPickLabel(block, library) : "None"}
        </p>
        <p className="text-sm text-muted">
          {symbols.length > 0
            ? `${name} has ${symbols.length} symbol${symbols.length === 1 ? "" : "s"} to walk, or show all of them at once.`
            : `${name} has no symbols, so there is nothing to choose. Add a row for it in the Karuna table to give it one.`}
        </p>
      </EditorSection>

      <EditorSection title="Sound">
        {/* Two compact rows side by side rather than two full-width bars (the owner's
            round 19, item 7: *"long bars with a single button each, it is very
            shabby"*). */}
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldButton
            label="Binaural"
            value={nameOf(block.binauralPresetId, library.presets, "None")}
            onClick={() => onPick("preset")}
          />
          <FieldButton
            label="Ambient"
            value={nameOf(block.ambientAssetId, library.mediaAssets, "None")}
            onClick={() => onPick("ambient")}
          />
        </div>
      </EditorSection>

      {/* The switch lives on the section's heading line instead of in a bar of its own
          — *"alarm doesn't need to be this big bar with a single toggle, it feels
          icky"* (the owner's round 19, item 7). Its **name still says which answer it
          is showing**, which is round 17's rule: a switch that shows the plan's answer
          has to say that it does. */}
      <EditorSection
        title="Alarm"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <LatchButton
              size="sm"
              label={alarmFromPlan ? "Alarm (the plan's answer)" : "Alarm (this meditation)"}
              pressed={alarmOn}
              onChange={(alarmEnabled) => onPatch({ alarmEnabled })}
            />
            {alarmFromPlan ? null : (
              <Button size="sm" onClick={() => onPatch({ alarmEnabled: null })}>
                Use the plan&apos;s answer
              </Button>
            )}
          </div>
        }
      >
        <FieldButton
          label="Alarm sound"
          value={nameOf(block.alarmAssetId, library.mediaAssets, "Beep")}
          onClick={() => onPick("alarm")}
        />
      </EditorSection>

      {/* The Display, moved off the foot of the plan screen and onto the meditation
          that reads it (the owner's round 17, item 13). The first change gives this
          block its own copy; until then it shows the plan's, which is what a block
          that has never been asked shows — and the action on the heading line is the
          way back, the same shape the `Alarm` section above uses for the same
          question.

          It is an `EditorSection` like every other section here. The panel used to
          bring its own `<details>` disclosure and be drawn without a heading, which
          put five switches behind one press and made the Display the one section of
          this editor that was a different kind of thing (the owner's round 18:
          *"the details section shouldn't be that collapsed hideous thing it is
          today"*). */}
      <EditorSection
        title="Display"
        action={
          block.display ? (
            <Button size="sm" onClick={() => onPatch({ display: null })}>
              Use the plan&apos;s Display
            </Button>
          ) : undefined
        }
      >
        <p className="text-sm text-muted">
          {block.display
            ? "What this meditation shows while it runs. A pinned column stays at the top of its panel while the rest scrolls under it."
            : "Showing the plan's Display. Changing a switch gives this meditation its own; the meditations beside it keep the plan's."}
        </p>
        <DisplayPanel display={display} defs={library.fieldDefs} onChange={onDisplay} />
      </EditorSection>
    </EditorChrome>
  );
}

export function Planner() {
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [library, setLibrary] = useState<LibraryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [deleteArmed, setDeleteArmed] = useArmedFlag();
  const [armedBlockId, setArmedBlockId] = useArmedId();
  const [dirty, setDirty] = useState(false);
  const {
    ready: sessionReady,
    userId: sessionUserId,
    workspaceId: sessionWorkspaceId,
  } = useSession();
  const planRef = useRef<Plan | null>(null);
  const editGen = useRef(0);
  const persistChain = useRef(Promise.resolve());
  const dirtyRef = useRef(false);
  planRef.current = plan;
  dirtyRef.current = dirty;

  /**
   * Re-read the plan list alone, after a plan is created, duplicated or removed,
   * and patch it into the library the screen is already holding.
   *
   * The list is two fields of one small table, and it arrives through the same
   * `listSummaries` the full load uses, so the switcher's order is the order a
   * refetch would have given — while the catalogue's nine scans stay where they
   * are (`P2 · 4`). The mount effect above is now the only catalogue load on this
   * screen, and a plan operation that does not move the list needs no refresh at
   * all, which is why `switchPlan` has none.
   */
  const refreshPlans = useCallback(async (ws: string) => {
    const plans = await app.listPlans(ws);
    setLibrary((current) => (current ? { ...current, plans } : current));
  }, []);

  useEffect(() => {
    if (!sessionReady || !sessionUserId || !sessionWorkspaceId) return;
    setUserId(sessionUserId);
    setWorkspaceId(sessionWorkspaceId);
    void (async () => {
      try {
        const [active, lib] = await Promise.all([
          app.getActivePlan(sessionUserId, sessionWorkspaceId),
          app.getLibrary(sessionWorkspaceId),
        ]);
        setPlan(active);
        setLibrary(lib);
        setDirty(false);
      } catch (err) {
        setError(errorText(err, "Could not load the plan"));
      }
    })();
  }, [sessionReady, sessionUserId, sessionWorkspaceId]);

  const update = useCallback((patch: Partial<Plan> | ((current: Plan) => Plan)) => {
    setPlan((current) => {
      if (!current) return current;
      return typeof patch === "function" ? patch(current) : { ...current, ...patch };
    });
    editGen.current += 1;
    setDirty(true);
  }, []);

  const persist = useCallback(async (): Promise<Plan | null> => {
    let result: Plan | null = null;
    persistChain.current = persistChain.current.then(async () => {
      for (let i = 0; i < 5; i += 1) {
        const current = planRef.current;
        if (!current) return;
        const gen = editGen.current;
        const saved = await app.savePlan(current);
        const latest = planRef.current;
        if (editGen.current !== gen) {
          if (latest && latest.id === saved.id) {
            const rebased = { ...latest, revision: saved.revision };
            planRef.current = rebased;
            setPlan(rebased);
          }
          continue;
        }
        planRef.current = saved;
        setPlan(saved);
        setDirty(false);
        result = saved;
        return;
      }
      result = planRef.current;
    });
    try {
      await persistChain.current;
    } catch (err) {
      persistChain.current = Promise.resolve();
      throw err;
    }
    return result ?? planRef.current;
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const handle = window.setTimeout(() => {
      void persist().catch((err: unknown) => {
        setError(errorText(err, "Could not save plan"));
      });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [dirty, plan, persist]);

  useEffect(() => {
    return () => {
      void persistChain.current.then(() => {
        const current = planRef.current;
        if (!dirtyRef.current || !current) return;
        return app.savePlan(current);
      });
    };
  }, []);

  const onDragEnd = (event: DragEndEvent) => {
    if (!plan || !event.over || event.active.id === event.over.id) return;
    const ids = plan.blocks.map((b) => b.id);
    const oldIndex = ids.indexOf(String(event.active.id));
    const newIndex = ids.indexOf(String(event.over.id));
    const blocks = arrayMove(plan.blocks, oldIndex, newIndex).map((b, i) => ({
      ...b,
      sortOrder: i,
    }));
    update({ blocks });
  };

  /**
   * Append a card for a meditation the reader chose.
   *
   * The owner's round 15 replaced `Add focus` and `Add cool-off` with **one** Add
   * that opens a text-filtered picker over every live meditation of every live type
   * (§12.16, §5). Picking a row appends a card built from that meditation's stage
   * template, so the card has its timers before the reader touches anything else.
   */
  const addMeditationBlock = (meditationId: string) => {
    if (!library) return;
    update((current) => {
      const meditationRow = library.meditations.find((fp) => fp.id === meditationId);
      const next: PlanBlock = {
        id: createId(),
        sortOrder: current.blocks.length,
        stages: meditationRow
          ? stagesForMeditation(meditationRow, library.meditationTypes)
          : [
              {
                key: "focus",
                label: "Focus",
                kind: "focus",
                durationMs: 60_000,
                binaural: true,
                autoScroll: false,
              },
            ],
        meditationId,
        symbolId: null,
        symbolScope: "rotate",
        binauralPresetId: meditationRow?.defaultBinauralPresetId ?? library.presets[0]?.id ?? null,
        ambientAssetId: null,
        alarmAssetId: null,
        // Both take the plan's answer until the reader opens this meditation's
        // editor and says otherwise (the owner's round 17, item 13).
        alarmEnabled: null,
        display: null,
      };
      return { ...current, blocks: [...current.blocks, next] };
    });
  };

  const save = async () => {
    if (!plan) return;
    try {
      await persist();
    } catch (err) {
      setError(errorText(err, "Could not save plan"));
    }
  };

  const createPlan = async () => {
    if (!userId || !workspaceId) return;
    setError(null);
    setDeleteArmed(false);
    try {
      if (plan) await persist();
      const created = await app.createPlan(userId, workspaceId);
      setPlan(created);
      setDirty(false);
      await refreshPlans(workspaceId);
    } catch (err) {
      setError(errorText(err, "Could not create plan"));
    }
  };

  const duplicatePlan = async () => {
    if (!userId || !plan) return;
    setError(null);
    setDeleteArmed(false);
    try {
      const saved = await persist();
      if (!saved) return;
      const copy = await app.duplicatePlan(userId, saved.workspaceId, saved.id);
      setPlan(copy);
      setDirty(false);
      await refreshPlans(saved.workspaceId);
    } catch (err) {
      setError(errorText(err, "Could not duplicate plan"));
    }
  };

  const switchPlan = async (planId: string) => {
    if (!userId || !workspaceId) return;
    setError(null);
    setDeleteArmed(false);
    try {
      if (plan) await persist();
      const opened = await app.openPlan(userId, workspaceId, planId);
      if (opened) {
        setPlan(opened);
        setDirty(false);
      }
      setOverlay(null);
      // Nothing to refresh: opening a plan does not change the list of them.
    } catch (err) {
      setError(errorText(err, "Could not open plan"));
    }
  };

  const removePlan = async () => {
    if (!userId || !workspaceId || !plan) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setError(null);
    try {
      const remaining = await app.deletePlan(userId, workspaceId, plan.id);
      setPlan(remaining);
      setDirty(false);
      setDeleteArmed(false);
      await refreshPlans(workspaceId);
    } catch (err) {
      setDeleteArmed(false);
      setError(errorText(err, "Could not delete plan"));
    }
  };

  /**
   * Removing a block is the same two-press arm as every other destructive
   * control: the first press fills the button, the second takes the block out.
   */
  const removeBlock = (blockId: string) => {
    if (armedBlockId !== blockId) {
      setArmedBlockId(blockId);
      return;
    }
    setArmedBlockId(null);
    update((current) => ({
      ...current,
      blocks: current.blocks
        .filter((b) => b.id !== blockId)
        .map((b, index) => ({ ...b, sortOrder: index })),
    }));
  };

  const load = async () => {
    if (!plan || !workspaceId || !userId) return;
    setError(null);
    try {
      const saved = await persist();
      if (!saved) return;
      const instanceId = await startSession(userId, workspaceId, saved.id);
      router.push(`/run/${instanceId}`);
    } catch (err) {
      setError(errorText(err, "Could not start the session"));
    }
  };

  const startFromMeditation = async (meditationId: string) => {
    if (!workspaceId || !userId) return;
    setError(null);
    try {
      if (plan) await persist();
      const instanceId = await startSessionFromMeditation(userId, workspaceId, meditationId);
      router.push(`/run/${instanceId}`);
    } catch (err) {
      setError(errorText(err, "Could not start a session"));
    }
  };

  if (!library || !userId || !workspaceId) {
    return error ? (
      <p className="text-lg text-destructive">{error}</p>
    ) : (
      <p className="text-lg">Loading plan…</p>
    );
  }

  if (overlay?.type === "plans") {
    return (
      <main>
        <PickerPage
          title="Plans"
          items={library.plans.map((p) => ({ id: p.id, label: p.name }))}
          selectedId={plan?.id}
          onBack={() => setOverlay(null)}
          onSelect={(id) => void switchPlan(id)}
        />
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="flex flex-col gap-6">
        <p className="text-3xl font-semibold">No plan</p>
        <MeditationTiles
          meditations={library.meditations}
          types={library.meditationTypes}
          onPick={(id) => void startFromMeditation(id)}
        />
        <Button tier="primary" size="lg" onClick={() => void createPlan()}>
          New plan
        </Button>
        {error ? <p className="text-lg text-destructive">{error}</p> : null}
      </main>
    );
  }

  if (overlay?.type === "new") {
    // `Add meditation block` is the same picker a card's `Meditation` field opens —
    // every live meditation, every live type, with the type beside the name (§5).
    const { title, items } = pickerItems(overlay.kind, plan.blocks[0], library);
    return (
      <main>
        <PickerPage
          title={title}
          items={items}
          onBack={() => setOverlay(null)}
          onSelect={(id) => {
            addMeditationBlock(id);
            setOverlay(null);
          }}
        />
      </main>
    );
  }

  const pickingBlock =
    overlay?.type === "block"
      ? plan.blocks.find((b) => b.id === overlay.blockId)
      : undefined;
  const editingBlock =
    overlay?.type === "blockEditor"
      ? plan.blocks.find((b) => b.id === overlay.blockId)
      : undefined;

  if (overlay?.type === "blockEditor" && editingBlock) {
    const block = editingBlock;
    const back = () => setOverlay(null);
    // No `<main>` wrapper: `EditorChrome` **is** a `<main>`, and a main inside a
    // main is not a shell — it is two landmarks saying the same thing, which a
    // screen reader reads out twice and `page.locator("main")` refuses to guess at.
    return (
      <BlockEditor
        block={block}
        library={library}
        planDisplay={plan.display}
        planAlarmEnabled={plan.alarmEnabled !== false}
        onBack={back}
        onPatch={(patch) =>
          update((current) => ({
            ...current,
            blocks: current.blocks.map((b) => (b.id === block.id ? { ...b, ...patch } : b)),
          }))
        }
        onPick={(kind) => setOverlay({ type: "block", blockId: block.id, kind, from: block.id })}
        onAddStage={() => setOverlay({ type: "stageKind", blockId: block.id })}
        onDisplay={(column, patch) =>
          update((current) => ({
            ...current,
            blocks: current.blocks.map((b) =>
              b.id === block.id
                ? {
                    // `b.display ?? current.display` is what makes the first change
                    // give the block its own copy of the plan's, rather than the
                    // panel silently editing the plan's answer for every other
                    // meditation in the circuit.
                    ...b,
                    display: setDisplayColumn(b.display ?? current.display, column, patch),
                  }
                : b,
            ),
          }))
        }
      />
    );
  }

  /**
   * **Add stage** — which kind, then appended to this meditation's own list.
   *
   * The same `PickerPage` every other *which one?* in the app uses, and it returns to
   * the meditation's editor rather than dropping the reader out on the circuit with
   * their edit half-made. The stage arrives at its kind's own length and with its
   * kind's own flags (`defaultStage`), because a stage that began at `0:00` would be
   * one that does nothing until it is turned.
   */
  if (overlay?.type === "stageKind") {
    const blockId = overlay.blockId;
    return (
      <main>
        <PickerPage
          title="Add stage"
          items={STAGE_KINDS.map((kind) => ({
            id: kind,
            label: STAGE_KIND_LABELS[kind],
            hint: formatDurationMs(STAGE_KIND_DEFAULT_MS[kind]),
          }))}
          onBack={() => setOverlay({ type: "blockEditor", blockId })}
          onSelect={(id) => {
            update((current) => ({
              ...current,
              blocks: current.blocks.map((b) =>
                b.id === blockId
                  ? { ...b, stages: [...b.stages, defaultStage(createId(), id as StageKind)] }
                  : b,
              ),
            }));
            setOverlay({ type: "blockEditor", blockId });
          }}
        />
      </main>
    );
  }

  if (overlay?.type === "block" && pickingBlock) {
    const { title, items } = pickerItems(overlay.kind, pickingBlock, library);
    const returnToEditor = () =>
      setOverlay({ type: "blockEditor", blockId: overlay.from });
    const selectedId =
      overlay.kind === "meditation"
        ? (pickingBlock.meditationId ?? undefined)
        : overlay.kind === "symbol"
          ? pickingBlock.symbolId
            ? pickingBlock.symbolId
            : pickingBlock.symbolScope === "all"
              ? ALL_PICK_ID
              : NONE_PICK_ID
          : overlay.kind === "preset"
            ? (pickingBlock.binauralPresetId ?? NONE_PICK_ID)
            : overlay.kind === "ambient"
              ? (pickingBlock.ambientAssetId ?? NONE_PICK_ID)
              : (pickingBlock.alarmAssetId ?? NONE_PICK_ID);
    return (
      <main>
        <PickerPage
          title={title}
          items={items}
          selectedId={selectedId}
          onBack={returnToEditor}
          onSelect={(id) => {
            const kind = overlay.kind;
            const blockId = pickingBlock.id;
            update((current) => ({
              ...current,
              blocks: current.blocks.map((b) =>
                b.id === blockId
                  ? applyBlockPick(b, kind, id, library.entries, library.meditations, library.meditationTypes)
                  : b,
              ),
            }));
            returnToEditor();
          }}
        />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-8">
      {/* No page title: the navigation bar above already says `Plan`, and the
          owner's call is that a screen the nav names does not repeat its name. */}
      <MeditationTiles
        meditations={library.meditations}
        types={library.meditationTypes}
        onPick={(id) => void startFromMeditation(id)}
      />
      {/* The plan's own actions live in a toolbar rather than in the button wrap
          the tiles use. The tiles are large, accent-filled buttons that start a
          session; these switch which plan you are editing. They were the same
          shape at the same size, and the owner read the two rows as one set of
          buttons (round 6) — a bordered strip of compact actions reads as the
          chrome for the plan below it. `Delete plan` stays on this line, which
          is where the owner asked for it in round 1. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2">
        <Button size="sm" onClick={() => setOverlay({ type: "plans" })}>
          Switch plan
        </Button>
        <Button size="sm" onClick={() => void createPlan()}>
          New plan
        </Button>
        <Button size="sm" onClick={() => void duplicatePlan()}>
          Duplicate plan
        </Button>
        {library.plans.length > 1 ? (
          <Button
            size="sm"
            tier="destructive"
            armed={deleteArmed}
            onClick={() => void removePlan()}
          >
            {deleteArmed ? `Delete ${plan.name}?` : "Delete plan"}
          </Button>
        ) : null}
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-lg text-muted">Plan name</span>
        <input
          aria-label="Plan name"
          value={plan.name}
          onChange={(e) => {
            setDeleteArmed(false);
            update({ name: e.target.value });
          }}
          className="min-h-16 rounded-2xl bg-surface px-4 text-2xl font-semibold text-text"
        />
      </label>
      {/* One action under the name: the owner's round 15 replaced `Add focus` and
          `Add cool-off` with **Add meditation block**, which asks *which* meditation
          rather than *what kind of block* (§5). The `?block=meditation` request is the
          one the screen reads below, so the picker is the same overlay a card's own
          `Meditation` field opens. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setOverlay({ type: "new", kind: "meditation" })}>
          Add meditation block
        </Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={plan.blocks.map((b) => b.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2">
            {plan.blocks.map((block) => (
              <SortableBlock
                key={block.id}
                block={block}
                library={library}
                armed={armedBlockId === block.id}
                onOpen={() => {
                  setDeleteArmed(false);
                  setOverlay({ type: "blockEditor", blockId: block.id });
                }}
                onRemove={() => removeBlock(block.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {/* The plan's own settings, in one strip (the owner's round 19, item 8: *"settings
          on the plan page don't need big bars for single settings, make them compact
          and better usable"*). It is the shape the tools above already use, so one flag
          is one switch rather than a band of page furniture. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2">
        <Stepper
          size="sm"
          label="Cycles"
          value={plan.cycleCount}
          min={1}
          max={99}
          onChange={(cycleCount) => update({ cycleCount })}
        />
        <LatchButton
          size="sm"
          label="Repeat until stopped"
          pressed={plan.cycleUntilStopped}
          onChange={(cycleUntilStopped) => update({ cycleUntilStopped })}
        />
        <LatchButton
          size="sm"
          label="Auto-advance"
          pressed={plan.autoAdvance}
          onChange={(autoAdvance) => update({ autoAdvance })}
        />
        <LatchButton
          size="sm"
          label="Binaural beats"
          pressed={plan.binauralEnabled}
          onChange={(binauralEnabled) => update({ binauralEnabled })}
        />
        {/* The alarm is session-level like `Auto-advance` above (§12.21), so its switch
            sits with the plan's own switches rather than on a stage row: one control
            for one flag, and a stage row that carried it would be showing a switch
            that moves every block. */}
        <LatchButton
          size="sm"
          label="Alarm"
          pressed={plan.alarmEnabled !== false}
          onChange={(alarmEnabled) => update({ alarmEnabled })}
        />
      </div>
      {/* The Display panel is **not here any more** (the owner's round 17, item 13):
          it lives on each meditation, opened from its card. The plan keeps `display`
          as the answer a meditation that has never been asked inherits — the same
          shape `UserPreferences.alarmEnabled` has for a new plan — which is why a
          plan nobody has edited still shows them the app's default. */}
      <div className="flex flex-wrap items-center gap-3">
        {/* One size for both: Start session is the filled primary and Save the
            outline, but two buttons side by side must be the same shape. */}
        <Button size="lg" onClick={() => void save()}>
          {dirty ? "Save · unsaved" : "Save"}
        </Button>
        <Button tier="primary" size="lg" onClick={() => void load()}>
          Start session
        </Button>
      </div>
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
    </main>
  );
}
