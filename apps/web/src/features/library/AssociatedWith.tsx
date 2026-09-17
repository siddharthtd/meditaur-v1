import type { FocusPoint, Intention, Symbol } from "@meditaur/domain";
import { EYEBROW_CLASS, TileGrid } from "@meditaur/ui";
import { EditorSection } from "./EditorSection";
import { ASSOC_TILES, type AssocMode } from "./library-model";

/**
 * Which focus point and symbol an intention is attached to.
 *
 * The two rows are the app's field language (the planner's block cards and the
 * focus point's `Default sound` do the same): a full-width button with the field
 * name in small caps over the value, and the value reading `Choose` when nothing
 * is picked yet. The owner's round 4, library item 9 called the old shape
 * ("Pick focus point" as a button label) the old formatting — a button labelled
 * with an instruction does not say what it currently holds.
 */
function FieldRow({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${value}`}
      onClick={onPick}
      className="flex min-h-16 w-full flex-col items-start justify-center gap-1 rounded-2xl bg-surface px-4 py-3 text-left transition active:scale-95 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className={`${EYEBROW_CLASS} text-xs`}>{label}</span>
      <span className="w-full truncate text-lg text-text">{value}</span>
    </button>
  );
}

export function AssociatedWith({
  intention,
  mode,
  focusPoints,
  symbols,
  onChangeMode,
  onPickFocus,
  onPickSymbol,
}: {
  intention: Intention;
  mode: AssocMode;
  focusPoints: FocusPoint[];
  symbols: Symbol[];
  onChangeMode: (mode: AssocMode) => void;
  onPickFocus: () => void;
  onPickSymbol: () => void;
}) {
  const focus = intention.focusPointId
    ? focusPoints.find((fp) => fp.id === intention.focusPointId)
    : null;
  const symbol = intention.symbolId
    ? symbols.find((s) => s.id === intention.symbolId)
    : null;
  return (
    <EditorSection title="Associated with">
      <TileGrid value={mode} onChange={onChangeMode} tiles={ASSOC_TILES} />
      {mode === "focus" || mode === "both" ? (
        <FieldRow
          label="Focus point"
          value={focus?.name ?? "Choose"}
          onPick={onPickFocus}
        />
      ) : null}
      {mode === "symbol" || mode === "both" ? (
        <FieldRow label="Symbol" value={symbol?.name ?? "Choose"} onPick={onPickSymbol} />
      ) : null}
    </EditorSection>
  );
}

export function associationLabel(
  intention: Intention,
  focusPoints: FocusPoint[],
  symbols: Symbol[],
): string {
  const focus = intention.focusPointId
    ? focusPoints.find((fp) => fp.id === intention.focusPointId)?.name
    : null;
  const symbol = intention.symbolId
    ? symbols.find((s) => s.id === intention.symbolId)?.name
    : null;
  if (focus && symbol) return `${focus} · ${symbol}`;
  if (focus) return focus;
  if (symbol) return symbol;
  return "Unassociated";
}
