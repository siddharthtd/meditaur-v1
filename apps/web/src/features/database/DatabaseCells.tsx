"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, TileGrid, TimeWheels } from "@meditaur/ui";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { BinauralPreset, CellType, Meditation, RefKind, Symbol } from "@meditaur/domain";
import { durationFromParts, durationParts } from "@meditaur/domain";
import { ImageFrame } from "../library/ImageFrame";
import type { DraftColumn, DraftLine, DraftOption } from "./database-model";

/**
 * One cell of the Database's grid (§6.2).
 *
 * Every control here is uncontrolled-by-default and reports a *committed* value:
 * the grid holds the draft, the cell holds what is being typed, and `onCommit`
 * is what moves one into the other. That split is what makes `Escape` cancel a
 * cell edit without cancelling the screen (§12.25) and what keeps a drag, a
 * wheel or a picker from writing into the draft on every keystroke.
 */

/**
 * The chip picker that is currently showing its panel, if any.
 *
 * A module-level slot rather than a context: the grid is the only reader, the
 * panels sit deep inside the table, and a context would have to be threaded
 * through every cell renderer to say one thing — "somebody else has the panel
 * now". Opening a second panel stands the first one down, which is what a
 * page-level popover does everywhere else, and the owner's report is what it
 * costs not to: several search boxes open at once over the same row.
 */
let closeOpenPanel: (() => void) | null = null;

export type CellRecords = {
  meditations: Meditation[];
  symbols: Symbol[];
  presets: BinauralPreset[];
};

/**
 * What every floating panel in the grid does about the reader looking away.
 *
 * Three rules, each of which the build used to get wrong:
 *
 * - **One at a time.** A second panel stands the first down.
 * - **A press outside closes it, and puts the cell down too.** A grid that keeps
 *   a caret in a cell the reader has moved on from shows two live places at once.
 * - **`Escape` belongs to the panel.** It is handled in the capture phase so the
 *   press can never also reach the screen's own `Escape`, which means "leave the
 *   Database" — one press, one thing (§12.25).
 */
export function useFloatingPanel({
  showing,
  panelRef,
  rootRef,
  onClose,
  onAway,
  closeOnScroll = true,
}: {
  showing: boolean;
  panelRef: RefObject<HTMLElement | null>;
  /** The control that opened it: a press inside this is not "away". */
  rootRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Runs after `onClose` when the reader pressed outside it. */
  onAway?: () => void;
  /** The column menu is short and is not anchored to a scrolling cell. */
  closeOnScroll?: boolean;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  const afterAway = useRef(onAway);
  afterAway.current = onAway;

  useEffect(() => {
    if (!showing) return;
    const mine = () => close.current();
    closeOpenPanel?.();
    closeOpenPanel = mine;
    return () => {
      if (closeOpenPanel === mine) closeOpenPanel = null;
    };
  }, [showing]);

  useEffect(() => {
    if (!showing) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (rootRef?.current?.contains(target) || panelRef.current?.contains(target))) {
        return;
      }
      close.current();
      afterAway.current?.();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close.current();
    };
    const onViewport = () => close.current();
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onViewport);
    if (closeOnScroll) window.addEventListener("scroll", onViewport, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onViewport);
      if (closeOnScroll) window.removeEventListener("scroll", onViewport, true);
    };
  }, [showing, panelRef, rootRef, closeOnScroll]);
}

/** A press that lands somewhere else puts the keyboard down too. */
function blurTheCell() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
}

/**
 * A control that stays out of the way until its row is hovered or something in
 * it has the keyboard.
 *
 * This is the rule the Database's own doc already asked for ("on a computer it
 * is quiet until hover or keyboard focus; on a phone it is always visible and
 * light") — the build shipped it always-on, which is most of why the grid read
 * as a form rather than as a table. A `pointer-fine` guard is what tells the two
 * apart: on a touch device there is nothing to hover *with*, so the control has
 * to be drawn, and it is. `opacity` and never `display`, so the row's geometry
 * cannot move under the reader's hand mid-gesture.
 */
export const REVEAL =
  "opacity-100 transition-opacity duration-150 " +
  "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 " +
  "pointer-fine:group-focus-within:opacity-100";

/**
 * The same, one level in: a line's own grip and arrows answer *that line*, not
 * the row. A row with six intentions would otherwise light up eighteen controls
 * at once the moment the pointer crossed it.
 */
const REVEAL_LINE =
  "opacity-100 transition-opacity duration-150 " +
  "pointer-fine:opacity-0 pointer-fine:group-hover/line:opacity-100 " +
  "pointer-fine:group-focus-within/line:opacity-100";

/**
 * A cell's editable text.
 *
 * The cell *reads* as text and becomes a control only when it has the press: the
 * input is borderless and unpainted until then, and paints its own fill and ring
 * on focus. A grid whose every cell is an outlined box is a form — which is
 * exactly what this screen looked like to the owner ("a shitty visual basic type
 * interface") — while a grid of text with one live cell is a table.
 */
export function TextCell({
  value,
  label,
  placeholder,
  long = false,
  numeric = false,
  strong = false,
  autoFocus = false,
  onCommit,
}: {
  value: string;
  /**
   * The cell's accessible name: which row, which column. A grid of bare boxes
   * tells a screen reader nothing, and it is also what lets a test say which cell
   * it means without counting `<input>`s.
   */
  label?: string;
  placeholder?: string;
  /** Holds a sentence rather than a word: its full text is worth offering. */
  long?: boolean;
  numeric?: boolean;
  /** The row's own name — the one cell a reader scans down. */
  strong?: boolean;
  /** A cell that has just appeared (a new row's name) takes the keyboard. */
  autoFocus?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  /**
   * Set by `Escape`, so the blur it causes does not commit the cancelled text.
   *
   * Blurring is what releases the keyboard: without it the cell kept the press
   * for good, and a reader whose cursor sat in a cell could not leave the screen
   * with `Escape` at all. `onBlur` normally commits, which would write back the
   * half-typed value the press just threw away.
   */
  const cancelled = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <input
      ref={ref}
      value={draft}
      aria-label={label}
      inputMode={numeric ? "decimal" : undefined}
      placeholder={placeholder ?? ""}
      // A one-line input cannot show a whole intention; the native tooltip is the
      // full text without a click, and the run screen is where it is read out.
      title={long && draft ? draft : undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
          return;
        }
        // `Escape` cancels *this cell* and nothing else: the press never reaches
        // the screen, so it cannot also mean "leave the Database" (§12.25). What
        // it does do is let go of the keyboard — the cell is left with the stored
        // text and no focus, so the next press is the screen's.
        if (event.key === "Escape") {
          event.stopPropagation();
          cancelled.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={`min-w-0 w-full rounded-md bg-transparent px-2 py-0.5 text-base text-text outline-none transition-colors placeholder:text-muted/60 hover:bg-bg/30 focus:bg-bg focus:ring-2 focus:ring-accent/40 ${
        strong ? "font-medium" : ""
      }`}
    />
  );
}

export function DurationCell({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  // Stored as the reader's own text — `12:30` or `750000` — and edited with the
  // alarm-clock wheels, which is the same control the planner and the run screen
  // use (IMPLEMENTATION: durations are wheels, not `−`/`+` steppers).
  const ms = Number.isFinite(Number(value)) ? Number(value) : 0;
  const parts = durationParts(ms);
  return (
    <div className="flex items-center justify-center rounded-md transition-colors hover:bg-bg/30">
      <TimeWheels
        size="sm"
        minutes={parts.minutes}
        seconds={parts.seconds}
        onMinutes={(minutes) => onCommit(String(durationFromParts(minutes, parts.seconds)))}
        onSeconds={(seconds) => onCommit(String(durationFromParts(parts.minutes, seconds)))}
      />
    </div>
  );
}

/**
 * A chip with a search bar behind it — the shape §12.13 asks for in place of a
 * native `<select>`, with the ARIA combobox roles §12.31 asks for in place of
 * nothing at all.
 *
 * Acting on the chip itself offers exactly two things (§6.2): **Open record**,
 * for the chips that point at one, and **X (clear)**, which clears this reference
 * and nothing else (§4). There is deliberately no "choose another": clear it and
 * type again.
 */
export function ChipPicker({
  value,
  label,
  placeholder,
  options,
  records,
  onPick,
  onOpen,
  onClear,
  onCreate,
}: {
  value: string;
  label: string;
  placeholder: string;
  options: { id: string; label: string }[];
  records: CellRecords;
  onPick: (id: string) => void;
  onOpen?: () => void;
  onClear?: () => void;
  /**
   * §6.2's context-aware create. It answers with the new record's id — or null if
   * the write failed — and the chip chooses it, so every caller gets the same
   * "what I made is what I picked" without threading it through itself.
   */
  onCreate?: (name: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const matched = options.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const exact = options.some(
    (option) => option.label.toLowerCase() === query.trim().toLowerCase(),
  );

  /**
   * The panel is drawn in a **portal**, pinned to this chip's own position.
   *
   * Absolutely positioned, it was trapped: the leading cell of every row is
   * `sticky` with a `z-index`, which is a stacking context, so a panel opening
   * downwards printed *under* the next row's sticky cell and its options could
   * not be pressed. The portal leaves every cell's stacking context and the
   * table's own overflow behind.
   */
  const hide = () => {
    setActing(false);
    setOpen(false);
  };

  const show = (which: "acting" | "search") => {
    const box = rootRef.current?.getBoundingClientRect();
    if (box) setAnchor({ left: box.left, top: box.bottom + 4 });
    setActing(which === "acting");
    setOpen(which === "search");
  };

  useFloatingPanel({
    showing: open || acting,
    rootRef,
    panelRef,
    onClose: hide,
    onAway: blurTheCell,
  });

  const createAndPick = async (name: string) => {
    if (!onCreate) return;
    hide();
    setQuery("");
    const id = await onCreate(name);
    if (id) onPick(id);
  };

  return (
    // `data-value` is the stored id, which is what a test (and a debugging eye)
    // wants to see behind the label the reader recognises.
    <div
      ref={rootRef}
      className="group/chip relative flex min-w-0 items-center"
      data-value={value || undefined}
    >
      {/* An empty cell is a quiet invitation, not a filled pill: `＋ meditation`
          must not read as a value the row already has. */}
      <button
        type="button"
        aria-label={`${label} — open or clear`}
        className={`max-w-full truncate rounded-md px-2 py-0.5 text-left text-sm transition-colors ${
          value
            ? "bg-bg/60 text-text hover:bg-surface-raised"
            : "text-muted hover:bg-bg/50 hover:text-text"
        }`}
        onMouseDown={(event) => {
          event.preventDefault();
          show("acting");
        }}
      >
        {label}
      </button>
      <button
        type="button"
        aria-label={`Change ${placeholder}`}
        className={`rounded px-0.5 text-xs text-muted hover:text-text ${REVEAL}`}
        onMouseDown={(event) => {
          event.preventDefault();
          show("search");
        }}
      >
        ▾
      </button>
      {anchor && (acting || open)
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-50 flex w-64 flex-col gap-1 rounded-xl border border-line bg-surface p-2 shadow-lg"
              style={{ left: anchor.left, top: anchor.top }}
            >
              {acting ? (
                <>
                  {onOpen && value ? (
                    <Button
                      size="sm"
                      tier="tertiary"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        hide();
                        onOpen();
                      }}
                    >
                      Open record
                    </Button>
                  ) : null}
                  {onClear && value ? (
                    <Button
                      size="sm"
                      tier="tertiary"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        hide();
                        onClear();
                      }}
                    >
                      ✕ Clear
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    tier="tertiary"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      hide();
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <input
                    autoFocus
                    role="combobox"
                    aria-expanded={matched.length > 0}
                    aria-controls={listId}
                    aria-activedescendant={matched[active] ? `${listId}-${active}` : undefined}
                    aria-label={placeholder}
                    value={query}
                    placeholder={placeholder}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActive(0);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        hide();
                        return;
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setActive((n) => Math.min(n + 1, matched.length - 1));
                        return;
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setActive((n) => Math.max(n - 1, 0));
                        return;
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const chosen = matched[active];
                        // A name that matches nothing chooses nothing: the reader
                        // gets the create row instead, never the nearest-looking
                        // option.
                        if (chosen) {
                          onPick(chosen.id);
                          hide();
                          setQuery("");
                        } else if (query.trim()) {
                          void createAndPick(query.trim());
                        }
                      }
                    }}
                    className="w-full rounded-lg border border-line bg-transparent px-2 py-1 text-sm outline-none"
                  />
                  <ul id={listId} role="listbox" className="max-h-56 overflow-y-auto">
                    {matched.map((option, index) => (
                      <li key={option.id}>
                        <button
                          id={`${listId}-${index}`}
                          type="button"
                          role="option"
                          aria-selected={index === active}
                          className={`block w-full truncate rounded px-2 py-1 text-left text-sm ${
                            index === active ? "bg-surface-raised" : ""
                          }`}
                          onClick={() => {
                            onPick(option.id);
                            hide();
                            setQuery("");
                          }}
                        >
                          {option.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {onCreate && query.trim() && !exact ? (
                    <Button
                      size="sm"
                      tier="tertiary"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        void createAndPick(query.trim());
                      }}
                    >
                      Add “{query.trim()}”
                    </Button>
                  ) : null}
                  {/* Every route out of a picker that has one: cancel. */}
                  <Button size="sm" tier="tertiary" onMouseDown={hide}>
                    Cancel
                  </Button>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
      {/* The records are here so a reference chip can resolve its own label; the
          caller passes them once for the whole table. */}
      <span className="sr-only">
        {records.meditations.length + records.symbols.length + records.presets.length} records
      </span>
    </div>
  );
}

export function SelectCell({
  value,
  column,
  options,
  records,
  onPick,
  onClear,
  onCreate,
}: {
  value: string;
  column: DraftColumn;
  options: DraftOption[];
  records: CellRecords;
  onPick: (optionId: string) => void;
  onClear: () => void;
  /** A new option for this column, answered with its id so the cell can choose it. */
  onCreate: (label: string) => Promise<string | null>;
}) {
  const chosen = options.find((option) => option.id === value);
  return (
    <ChipPicker
      value={value}
      label={chosen?.label ?? "…"}
      placeholder={`Pick one for ${column.label}`}
      options={options.map((option) => ({ id: option.id, label: option.label }))}
      records={records}
      onPick={onPick}
      onClear={onClear}
      onCreate={onCreate}
    />
  );
}

/**
 * A reference cell: a chip that names the record it points at.
 *
 * `onCreate` is what makes an unmatched name useful — §6.2's "context-aware
 * create": typing a symbol that does not exist yet offers to make it, and the
 * new record is chosen for the cell that asked.
 */
export function ReferenceCell({
  value,
  column,
  records,
  onPick,
  onOpen,
  onClear,
  onCreate,
}: {
  value: string;
  column: DraftColumn;
  records: CellRecords;
  onPick: (recordId: string) => void;
  onOpen: (kind: RefKindName, id: string) => void;
  onClear: () => void;
  onCreate?: (name: string) => Promise<string | null>;
}) {
  const kind = column.refKind ?? "meditation";
  const options =
    kind === "meditation"
      ? records.meditations
      : kind === "symbol"
        ? records.symbols
        : records.presets;
  const chosen = options.find((option) => option.id === value);
  return (
    <ChipPicker
      value={value}
      label={chosen?.name ?? "…"}
      placeholder={`Find a ${kindLabel(kind)}`}
      options={options.map((option) => ({ id: option.id, label: option.name }))}
      records={records}
      onPick={onPick}
      onOpen={() => onOpen(kind, value)}
      onClear={onClear}
      onCreate={onCreate}
    />
  );
}

/** The words the copy uses for a reference's target (§12.32: not spec vocabulary). */
export function kindLabel(kind: RefKindName): string {
  return kind === "meditation" ? "meditation" : kind;
}

/** What a reference column can point at, named the way the store names it. */
export type RefKindName = "meditation" | "symbol" | "preset";

export function ImageCell({
  value,
  url,
  alt,
  onUpload,
}: {
  value: string;
  url: string | null;
  alt: string;
  onUpload: (file: File) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="file"
        accept="image/*"
        aria-label={alt}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.target.value = "";
        }}
      />
      <ImageFrame src={url} alt={alt} />
      {value ? <span className="text-xs text-muted">Replace</span> : null}
    </label>
  );
}

/**
 * An entry's Intentions cell: the lines stack in the cell, each with its own `X`
 * and a drag handle, and `＋ Add` sits under them (§6.3).
 *
 * On a phone this cell opens the focused editor instead of stretching the row —
 * `compact` is that mode, and the same list renders in both.
 */
export function LinesCell({
  lines,
  compact = false,
  onAdd,
  onEdit,
  onArm,
  armedId,
  onMoveUp,
  onMoveDown,
  onMoveTo,
}: {
  lines: DraftLine[];
  compact?: boolean;
  onAdd: () => void;
  onEdit: (id: string, text: string) => void;
  onArm: (id: string | null) => void;
  armedId: string | null;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  /** Where a dropped line lands, counted among this entry's own lines. */
  onMoveTo: (id: string, to: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = lines.map((line) => line.id);
  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const to = ids.indexOf(String(event.over.id));
    if (to >= 0) onMoveTo(String(event.active.id), to);
  };

  // No `max-h` box any more. The cell used to hold a *nested* scroller, which
  // read as a window inside a table and clipped rows that had nothing to hide;
  // Notion's relation cells simply make the row taller, and so does this.
  return (
    <div className={`flex flex-col ${compact ? "gap-0.5" : ""}`}>
      {lines.length === 0 ? (
        <span className="px-2 py-1 text-sm text-muted">No intentions yet</span>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {lines.map((line) => (
            <SortableLine key={line.id} id={line.id}>
              {(handle) => (
                <div className="group/line flex items-center gap-0.5 rounded-md pr-0.5 transition-colors hover:bg-bg/40">
                  <button
                    type="button"
                    aria-label="Drag line"
                    className={`touch-none px-0.5 text-base text-muted hover:text-text ${REVEAL_LINE}`}
                    {...handle.attributes}
                    {...handle.listeners}
                  >
                    <span aria-hidden="true">⠿</span>
                  </button>
                  <div className={`flex shrink-0 flex-col ${REVEAL_LINE}`}>
                    <button
                      type="button"
                      aria-label="Move line up"
                      className="px-0.5 text-[0.625rem] leading-none text-muted hover:text-text"
                      onClick={() => onMoveUp(line.id)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Move line down"
                      className="px-0.5 text-[0.625rem] leading-none text-muted hover:text-text"
                      onClick={() => onMoveDown(line.id)}
                    >
                      ↓
                    </button>
                  </div>
                  <TextCell value={line.text} long onCommit={(text) => onEdit(line.id, text)} />
                  <span className={`shrink-0 ${armedId === line.id ? "opacity-100" : REVEAL_LINE}`}>
                    <LineX line={line} armed={armedId === line.id} onArm={onArm} />
                  </span>
                </div>
              )}
            </SortableLine>
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className="mt-0.5 w-fit rounded-md px-2 py-1 text-left text-sm text-muted transition hover:bg-bg/40 hover:text-text active:scale-95"
        onClick={onAdd}
      >
        ＋ Add
      </button>
    </div>
  );
}

/** The listener props a sortable gives its handle, whatever dnd-kit calls them. */
type HandleListeners = ReturnType<typeof useSortable>["listeners"];

/**
 * One line's wrapper: it holds the drop target and the transform, and the handle
 * inside it is what the reader grabs. A line is a row of the draft like any other,
 * so a drop writes the order at once and nothing animates into place (§6.1).
 */
function SortableLine({
  id,
  children,
}: {
  id: string;
  children: (handle: {
    attributes: DraggableAttributes;
    listeners: HandleListeners;
  }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-60" : undefined}
    >
      {children({ attributes, listeners })}
    </div>
  );
}

/**
 * The line's `X` → box.
 *
 * The box is the *caller's*: it names what it is about to do ("Remove this line"
 * or "Archive this line") and it is what distinguishes this `X` from a row's,
 * because the two look the same and do different things (§4, §12.22). All this
 * control does is hand the line back — arming is the grid's state, not the cell's.
 */
function LineX({
  line,
  armed,
  onArm,
}: {
  line: DraftLine;
  armed: boolean;
  onArm: (id: string | null) => void;
}) {
  return (
    <button
      type="button"
      aria-label={armed ? "Confirm" : "Remove or archive this line"}
      className="rounded px-1 text-muted transition-colors hover:bg-destructive/15 hover:text-destructive"
      onClick={() => onArm(armed ? null : line.id)}
    >
      ×
    </button>
  );
}

/** What a column can hold. The database's own vocabulary, so it lives with the cells. */
export const CELL_TYPES: { id: CellType; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "longText", label: "Long text" },
  { id: "number", label: "Number" },
  { id: "duration", label: "Duration" },
  { id: "date", label: "Date" },
  { id: "image", label: "Image" },
  { id: "reference", label: "Reference" },
  { id: "select", label: "Select" },
];

/** What a reference column can point at. */
export const REF_KINDS: { id: RefKind; label: string }[] = [
  { id: "meditation", label: "Meditation" },
  { id: "symbol", label: "Symbol" },
  { id: "preset", label: "Preset" },
];

/** A column's type in one word, for the chip on its heading line. */
export function cellTypeLabel(cellType: CellType): string {
  return CELL_TYPES.find((row) => row.id === cellType)?.label ?? "Text";
}

/**
 * A column's own menu — what it holds and what it is for.
 *
 * The owner's ask moved *adding* a column into the grid: `＋` inserts a column
 * with a heading you type into, so the form at the foot of the page is gone. The
 * things that form used to ask for beyond the heading live here, behind the small
 * chip on that column's own heading line — which is where a spreadsheet keeps
 * them, and the only place left that is near enough to the column to be about it.
 */
export function ColumnMenu({
  column,
  anchor,
  rootRef,
  onPatch,
  onClose,
}: {
  column: DraftColumn;
  anchor: { left: number; top: number };
  /** The heading cell: a press inside it is not "away". */
  rootRef: RefObject<HTMLElement | null>;
  onPatch: (patch: Partial<DraftColumn>) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFloatingPanel({ showing: true, rootRef, panelRef, onClose });
  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-50 flex w-72 flex-col gap-3 rounded-xl border border-line bg-surface p-3 shadow-lg"
      style={{ left: anchor.left, top: anchor.top }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-text">
          {column.label || "Untitled column"}
        </span>
        <button
          type="button"
          aria-label="Close the column menu"
          className="rounded px-1 text-muted transition-colors hover:text-text"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Holds</span>
        <TileGrid
          value={column.cellType}
          onChange={(cellType) => onPatch({ cellType })}
          tiles={CELL_TYPES}
          size="sm"
        />
      </div>
      {column.cellType === "reference" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Points at</span>
          <TileGrid
            value={column.refKind ?? "meditation"}
            onChange={(refKind) => onPatch({ refKind })}
            tiles={REF_KINDS}
            size="sm"
          />
        </div>
      ) : null}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">What it is for</span>
        <input
          aria-label="Column description"
          defaultValue={column.description}
          onBlur={(event) => onPatch({ description: event.target.value })}
          className="h-10 rounded-lg border border-line bg-bg px-2 text-sm text-text outline-none transition-colors placeholder:text-muted/50 focus:ring-2 focus:ring-accent/40"
        />
      </label>
    </div>,
    document.body,
  );
}
