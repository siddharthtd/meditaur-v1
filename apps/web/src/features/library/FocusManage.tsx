import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FieldDef, FocusPoint, FocusSymbolBinding, Intention, Symbol } from "@meditaur/domain";
import { Button, LatchButton } from "@meditaur/ui";
import {
  Fragment,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useArmedId } from "@/lib/armed";
import { CustomFields, EditorSection, type FieldDelete } from "./EditorSection";
import { ImageFrame } from "./ImageFrame";

/**
 * Everything that *changes* a focus point, in one place — the second half of the
 * owner's round 4, library item 8: the open view shows, and "whatever you remove
 * from here should be added to the edit mode".
 *
 * The order of the symbols is the order `Rotate next` walks them, so it is a
 * real setting rather than a display detail, and the owner asked for it to be
 * dragged instead of stepped: "instead of the up/down/remove buttons, only
 * retain the remove button, the up down button should rather be draggable. Same
 * for Intentions." The rows below are sortable lists built from
 * `@dnd-kit/sortable`, so a row is picked up where it lies.
 *
 * Each section's `Add …` sits on the section's heading line, which is where the
 * owner asked for it ("the add new button should be in line with the heading").
 */
export function FocusManage({
  focus,
  symbols,
  bindings,
  intentions,
  fieldDefs,
  fieldDrafts,
  fieldDelete,
  symbolImageUrls,
  presetName,
  onAttachSymbol,
  onUnbind,
  onReorderSymbols,
  onOpenIntention,
  onAddIntention,
  onDeleteIntention,
  onReorderIntentions,
  onDraftChange,
  onSaveFields,
  onAddField,
  onToggleBinaural,
  onOpenBinaural,
}: {
  focus: FocusPoint;
  symbols: Symbol[];
  bindings: FocusSymbolBinding[];
  intentions: Intention[];
  fieldDefs: FieldDef[];
  fieldDrafts: Record<string, string>;
  /** The two-press delete each custom field carries on its heading line. */
  fieldDelete: FieldDelete;
  symbolImageUrls: Record<string, string>;
  presetName: string;
  onAttachSymbol: () => void;
  onUnbind: (symbolId: string) => void;
  /** The new order, as symbol ids, after a drag. */
  onReorderSymbols: (symbolIds: string[]) => void;
  onOpenIntention: (intention: Intention) => void;
  onAddIntention: () => void;
  onDeleteIntention: (intention: Intention) => void;
  /** The new order, as intention ids, after a drag. */
  onReorderIntentions: (intentionIds: string[]) => void;
  onDraftChange: (fieldDefId: string, text: string) => void;
  onSaveFields: () => void;
  onAddField: () => void;
  onToggleBinaural: (enabled: boolean) => void;
  onOpenBinaural: () => void;
}) {
  // Unbinding a symbol is a remove like any other: one press arms that row, the
  // second does it, and five seconds of nothing disarms it again.
  const [armedSymbolId, setArmedSymbolId] = useArmedId();
  const [armedIntentionId, setArmedIntentionId] = useArmedId();
  const bound = [...bindings]
    .filter((row) => row.focusPointId === focus.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => symbols.find((s) => s.id === row.symbolId))
    .filter((s): s is Symbol => Boolean(s));
  const scoped = intentions
    .filter((row) => row.focusPointId === focus.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const focusFields = [...fieldDefs]
    .filter((d) => d.entityType === "focusPoint")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <>
      <CustomFields
        defs={focusFields}
        drafts={fieldDrafts}
        onDraftChange={onDraftChange}
        onAdd={onAddField}
        onSave={onSaveFields}
        fieldDelete={fieldDelete}
      />
      <EditorSection
        title="Symbols"
        action={
          <Button size="sm" onClick={onAttachSymbol}>
            Add symbol
          </Button>
        }
      >
        {bound.length === 0 ? (
          <p className="text-muted">No symbols attached.</p>
        ) : (
          <SortableRows
            ids={bound.map((symbol) => symbol.id)}
            onReorder={onReorderSymbols}
            items={bound}
            renderItem={(symbol, justDropped) => (
              <ManageRow
                id={symbol.id}
                justDropped={justDropped}
                label={`Move ${symbol.name}`}
                removeLabel={armedSymbolId === symbol.id ? `Remove ${symbol.name}?` : "Remove"}
                removeArmed={armedSymbolId === symbol.id}
                onRemove={() => {
                  if (armedSymbolId !== symbol.id) {
                    setArmedSymbolId(symbol.id);
                    return;
                  }
                  setArmedSymbolId(null);
                  onUnbind(symbol.id);
                }}
                picture={
                  <ImageFrame
                    src={symbolImageUrls[symbol.id] ?? null}
                    alt={symbol.name}
                    className="h-12 w-12 shrink-0"
                  />
                }
                title={symbol.name}
              />
            )}
          />
        )}
        {symbols.length === 0 ? <p className="text-muted">Add a symbol first.</p> : null}
      </EditorSection>
      <EditorSection
        title="Intentions"
        action={
          <Button size="sm" onClick={onAddIntention}>
            Add intention
          </Button>
        }
      >
        {scoped.length === 0 ? (
          <p className="text-muted">No intentions yet.</p>
        ) : (
          <SortableRows
            ids={scoped.map((row) => row.id)}
            onReorder={onReorderIntentions}
            items={scoped}
            renderItem={(row, justDropped) => {
              const symbol = row.symbolId ? symbols.find((s) => s.id === row.symbolId) : null;
              return (
                <ManageRow
                  id={row.id}
                  justDropped={justDropped}
                  label={`Move ${row.text}`}
                  removeLabel={armedIntentionId === row.id ? "Remove?" : "Remove"}
                  removeArmed={armedIntentionId === row.id}
                  onRemove={() => {
                    if (armedIntentionId !== row.id) {
                      setArmedIntentionId(row.id);
                      return;
                    }
                    setArmedIntentionId(null);
                    onDeleteIntention(row);
                  }}
                  title={row.text}
                  subtitle={symbol ? symbol.name : "Focus only"}
                >
                  <Button size="sm" onClick={() => onOpenIntention(row)}>
                    Edit
                  </Button>
                </ManageRow>
              );
            }}
          />
        )}
      </EditorSection>
      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <h2 className="text-xl text-text">Binaural</h2>
        <p className="text-muted">Preset: {presetName}</p>
        <LatchButton
          pressed={focus.binauralEnabled !== false}
          onChange={onToggleBinaural}
          label="Binaural beats"
        />
        <div>
          <Button size="sm" onClick={onOpenBinaural}>
            Open binaural config
          </Button>
        </div>
      </section>
    </>
  );
}

/**
 * One sortable list. The drag is a vertical one, so the x half of the transform
 * is dropped the way the planner's strip drops its y half: a row being moved
 * stays in its column instead of sliding sideways over the buttons next to it.
 *
 * Both sensors are wired: the pointer for a drag, and the keyboard (Space to
 * lift, arrows to move, Space to drop) because a reorder that can only be done
 * by dragging is a reorder half the readers cannot do.
 */
function SortableRows<T extends { id: string }>({
  ids,
  items,
  renderItem,
  onReorder,
}: {
  ids: string[];
  items: T[];
  renderItem: (item: T, justDropped: boolean) => ReactNode;
  onReorder: (ids: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  /**
   * The row that has just been put down.
   *
   * dnd-kit hands a lifted row a `transition: transform 200ms` the moment it is
   * released and drops its transform, so the row animates from wherever it was
   * released into its slot — the owner's round 8, library item 3: "I click and
   * drag the card to where I want it to stay. It jumps and shuffles and then
   * lands at that place. I don't want the jump shuffle to be there." The row
   * that was dragged is therefore rendered without a transition and is simply
   * in its new place; its neighbours keep theirs, so the live preview still
   * slides while the drag is in flight.
   *
   * Dropping the transition was only half of it. The list also has to be in its
   * new order in the same commit — `reorderBindings` in `Library.tsx` redraws it
   * before the write — or the row is put down back where it came from and only
   * moves to the right place when the reload lands. Without the transition that
   * is two jumps instead of one, which is what the owner was still watching in
   * round 9.
   */
  const [settling, setSettling] = useState<string | null>(null);
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setSettling(String(active.id));
    onReorder(arrayMove(ids, from, to));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => setSettling(null)}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {/* Keyed by id, the way the planner's cards are: a row is the same row
              wherever it has been dragged to, so React moves that one node
              instead of rewriting whichever node happens to sit at the index
              the list has just changed. */}
          {items.map((item) => (
            <Fragment key={item.id}>{renderItem(item, settling === item.id)}</Fragment>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function ManageRow({
  id,
  label,
  title,
  subtitle,
  picture,
  removeLabel,
  removeArmed,
  onRemove,
  justDropped,
  children,
}: {
  id: string;
  /** The drag handle's accessible name, e.g. `Move Lotus`. */
  label: string;
  title: string;
  subtitle?: string;
  picture?: ReactNode;
  removeLabel: string;
  removeArmed: boolean;
  onRemove: () => void;
  /** True for the row the reader has just dropped: it is placed, not animated. */
  justDropped?: boolean;
  children?: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  // dnd-kit's own keydown handler arrives inside `listeners`, so a plain
  // `onKeyDown` after the spread would be replaced by it (or replace it, and
  // break the keyboard drag). Compose the two instead: the sensor first, then
  // the guard — Escape cancels the drag, and `EditorChrome` reads Escape as
  // "leave this screen", so without stopping it the cancel also walks the
  // reader out of the editor mid-drag.
  const { onKeyDown: dragKeyDown, ...dragListeners } = listeners ?? {};
  const onKeyDown = (event: ReactKeyboardEvent) => {
    dragKeyDown?.(event);
    if (event.key === "Escape") event.stopPropagation();
  };
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? CSS.Translate.toString({ ...transform, x: 0 }) : undefined,
        // A dropped row is not animated into its slot (see `settling` above).
        transition: justDropped ? undefined : transition,
      }}
      className={`flex items-center gap-3 rounded-2xl bg-surface p-3 ${isDragging ? "z-10" : ""}`}
    >
      <button
        type="button"
        aria-label={label}
        className="flex min-h-12 min-w-0 flex-1 touch-none items-center gap-3 rounded-xl bg-surface-raised px-3 text-left text-lg text-text transition active:scale-95 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        {...attributes}
        {...dragListeners}
        onKeyDown={onKeyDown}
      >
        {picture}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{title}</span>
          {subtitle ? <span className="block truncate text-sm text-muted">{subtitle}</span> : null}
        </span>
        <span className="text-muted" aria-hidden="true">
          ⠿
        </span>
      </button>
      {children}
      <Button size="sm" tier="destructive" armed={removeArmed} onClick={onRemove}>
        {removeLabel}
      </Button>
    </div>
  );
}
