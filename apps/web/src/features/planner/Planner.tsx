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
import { useArmedFlag, useArmedId } from "@/lib/armed";
import { errorText } from "@/lib/error-text";
import { startSession, startSessionFromFocus } from "@/runtime";
import {
  ALL_PICK_ID,
  NONE_PICK_ID,
  applyBlockPick,
  type BlockPickKind,
  type LibraryView,
} from "@meditaur/application";
import {
  DEFAULT_FOCUS_DURATION_MS,
  createId,
  type FocusKind,
  type Plan,
  type PlanBlock,
} from "@meditaur/domain";
import {
  Button,
  EYEBROW_CLASS,
  LatchButton,
  PickerPage,
  Stepper,
  accentForFocusPoint,
  type PickerItem,
} from "@meditaur/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DurationSteppers } from "../DurationSteppers";

type Overlay =
  | { type: "block"; blockId: string; kind: BlockPickKind }
  | { type: "plans" };

const FOCUS_KIND_GROUPS: { kind: FocusKind; label: string }[] = [
  { kind: "chakra", label: "Chakras" },
  // Plural like its neighbour: this heading names a group of focus points, and
  // the owner read "Point" as a single odd one out (round 6).
  { kind: "point", label: "Points" },
  { kind: "custom", label: "Custom" },
];

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

function FocusTiles({
  focusPoints,
  onPick,
}: {
  focusPoints: LibraryView["focusPoints"];
  onPick: (focusId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {FOCUS_KIND_GROUPS.map((group) => {
        const items = focusPoints.filter((fp) => fp.kind === group.kind);
        if (items.length === 0) return null;
        return (
          <section key={group.kind} className="flex flex-col gap-3">
            <h2 className="text-xl text-text">{group.label}</h2>
            <div className="flex flex-wrap gap-2">
              {items.map((fp) => (
                <Button
                  key={fp.id}
                  accent={accentForFocusPoint(fp)}
                  onClick={() => onPick(fp.id)}
                >
                  {fp.name}
                </Button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * One pickable field on a block card: the field's name in small caps over its
 * value, both centred in the button. The whole `Focus: Heart Chakra` line stays
 * the accessible name, so a screen reader still hears which field it is, and
 * the value never wraps into a ragged left-aligned pair.
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
      className="mt-2 flex min-h-16 w-full flex-col items-center justify-center gap-0.5 rounded-xl bg-surface-raised px-2 py-2 transition active:scale-95 active:opacity-80"
    >
      <span className={`${EYEBROW_CLASS} text-xs`}>{label}</span>
      <span className="w-full truncate text-center text-base text-text">{value}</span>
    </button>
  );
}

function SortableBlock({
  block,
  library,
  armed,
  onDuration,
  onRemove,
  onPick,
}: {
  block: PlanBlock;
  library: LibraryView;
  /** True while this card's Remove is waiting for its confirm press. */
  armed: boolean;
  onDuration: (ms: number) => void;
  onRemove: () => void;
  onPick: (kind: BlockPickKind) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const isFocus = block.type === "focus";
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
      className={`relative flex w-52 min-w-52 shrink-0 flex-col gap-2 rounded-2xl bg-surface px-3 py-4 ${
        isDragging ? "z-10" : ""
      }`}
    >
      {/* Title and Remove share the top line. The card's fields stack under it,
          so every card in the strip lines up at the top whatever it holds — a
          focus card has fields a cool-off card does not.

          The handle says what the card *is*, not how to move it: the owner's
          round 5 removed "· drag" from every card, because six cards said the
          same word and it was the widest thing on the card. It is the drag
          handle for a screen reader through its aria-label instead. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Drag ${isFocus ? "focus" : "cool-off"} block`}
          className="flex min-h-12 min-w-0 flex-1 touch-none items-center justify-center truncate rounded-xl bg-surface-raised text-lg text-text transition active:scale-95 active:opacity-80"
          {...attributes}
          {...listeners}
        >
          {isFocus ? "Focus" : "Cool-off"}
        </button>
        <Button tier="destructive" size="sm" armed={armed} onClick={onRemove}>
          {armed ? "Remove?" : "Remove"}
        </Button>
      </div>
      <div className="flex justify-center">
        <DurationSteppers durationMs={block.durationMs} onChange={onDuration} size="sm" />
      </div>
      {isFocus ? (
        <>
          <FieldButton
            label="Focus"
            value={nameOf(block.focusPointId, library.focusPoints, "Choose")}
            onClick={() => onPick("focus")}
          />
          <FieldButton
            label="Symbol"
            value={symbolPickLabel(block, library)}
            onClick={() => onPick("symbol")}
          />
        </>
      ) : null}
      <FieldButton
        label="Binaural"
        value={nameOf(block.binauralPresetId, library.presets, "None")}
        onClick={() => onPick("preset")}
      />
      <FieldButton
        label="Table"
        value={nameOf(block.tableViewId, library.tableViews, "None")}
        onClick={() => onPick("table")}
      />
      <FieldButton
        label="Ambient"
        value={nameOf(block.ambientAssetId, library.mediaAssets, "None")}
        onClick={() => onPick("ambient")}
      />
      <FieldButton
        label="Alarm"
        value={nameOf(block.alarmAssetId, library.mediaAssets, "Beep")}
        onClick={() => onPick("alarm")}
      />
    </div>
  );
}

function pickerItems(
  kind: BlockPickKind,
  block: PlanBlock,
  library: LibraryView,
): { title: string; items: PickerItem[] } {
  if (kind === "focus") {
    return {
      title: "Focus point",
      items: library.focusPoints.map((fp) => ({
        id: fp.id,
        label: fp.name,
        hint: fp.locationText,
      })),
    };
  }
  if (kind === "symbol") {
    const boundIds = new Set(
      library.bindings
        .filter((row) => row.focusPointId === block.focusPointId)
        .map((row) => row.symbolId),
    );
    const scoped = library.symbols.filter((s) => boundIds.has(s.id));
    return {
      title: "Symbol",
      items: [
        { id: NONE_PICK_ID, label: "Rotate next", hint: "Walk this focus point's symbols" },
        { id: ALL_PICK_ID, label: "All symbols", hint: "Whole sheet for this focus" },
        ...scoped.map((s) => ({ id: s.id, label: s.name, hint: s.usage })),
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
  return {
    title: "Table",
    items: [
      { id: NONE_PICK_ID, label: "None" },
      ...library.tableViews.map((v) => ({ id: v.id, label: v.name })),
    ],
  };
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

  const refreshLibrary = useCallback(async (ws: string) => {
    setLibrary(await app.getLibrary(ws));
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

  const addBlock = (type: PlanBlock["type"]) => {
    if (!library) return;
    update((current) => {
      const defaultFocus =
        current.blocks.find((b) => b.focusPointId)?.focusPointId ??
        library.focusPoints[0]?.id ??
        null;
      const focusRow = library.focusPoints.find((fp) => fp.id === defaultFocus);
      const next: PlanBlock = {
        id: createId(),
        sortOrder: current.blocks.length,
        type,
        durationMs:
          type === "focus" ? (focusRow?.defaultDurationMs ?? DEFAULT_FOCUS_DURATION_MS) : 30_000,
        focusPointId: type === "focus" ? defaultFocus : null,
        symbolId: null,
        symbolScope: "rotate",
        binauralPresetId:
          type === "focus" ? (focusRow?.defaultBinauralPresetId ?? library.presets[0]?.id ?? null) : null,
        tableViewId:
          current.blocks.find((b) => b.tableViewId)?.tableViewId ??
          library.tableViews[0]?.id ??
          null,
        ambientAssetId: null,
        alarmAssetId: null,
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
      await refreshLibrary(workspaceId);
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
      await refreshLibrary(saved.workspaceId);
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
      await refreshLibrary(workspaceId);
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
      await refreshLibrary(workspaceId);
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

  const startFromFocus = async (focusId: string) => {
    if (!workspaceId || !userId) return;
    setError(null);
    try {
      if (plan) await persist();
      const instanceId = await startSessionFromFocus(userId, workspaceId, focusId);
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
        <FocusTiles focusPoints={library.focusPoints} onPick={(id) => void startFromFocus(id)} />
        <Button tier="primary" size="lg" onClick={() => void createPlan()}>
          New plan
        </Button>
        {error ? <p className="text-lg text-destructive">{error}</p> : null}
      </main>
    );
  }

  const pickingBlock =
    overlay?.type === "block"
      ? plan.blocks.find((b) => b.id === overlay.blockId)
      : undefined;

  if (overlay?.type === "block" && pickingBlock) {
    const { title, items } = pickerItems(overlay.kind, pickingBlock, library);
    const selectedId =
      overlay.kind === "focus"
        ? (pickingBlock.focusPointId ?? undefined)
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
              : overlay.kind === "alarm"
                ? (pickingBlock.alarmAssetId ?? NONE_PICK_ID)
                : (pickingBlock.tableViewId ?? NONE_PICK_ID);
    return (
      <main>
        <PickerPage
          title={title}
          items={items}
          selectedId={selectedId}
          onBack={() => setOverlay(null)}
          onSelect={(id) => {
            const kind = overlay.kind;
            const blockId = pickingBlock.id;
            update((current) => ({
              ...current,
              blocks: current.blocks.map((b) =>
                b.id === blockId
                  ? applyBlockPick(b, kind, id, library.bindings, library.focusPoints)
                  : b,
              ),
            }));
            setOverlay(null);
          }}
        />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-8">
      {/* No page title: the navigation bar above already says `Plan`, and the
          owner's call is that a screen the nav names does not repeat its name. */}
      <FocusTiles focusPoints={library.focusPoints} onPick={(id) => void startFromFocus(id)} />
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
      {/* Only the two add actions sit under the name. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => addBlock("focus")}>Add focus</Button>
        <Button onClick={() => addBlock("cooloff")}>Add cool-off</Button>
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
                onDuration={(ms) =>
                  update((current) => ({
                    ...current,
                    blocks: current.blocks.map((b) =>
                      b.id === block.id ? { ...b, durationMs: ms } : b,
                    ),
                  }))
                }
                onRemove={() => removeBlock(block.id)}
                onPick={(kind) => {
                  setDeleteArmed(false);
                  if (kind === "symbol" && !block.focusPointId) {
                    setOverlay({ type: "block", blockId: block.id, kind: "focus" });
                    return;
                  }
                  setOverlay({ type: "block", blockId: block.id, kind });
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Stepper
        label="Cycles"
        value={plan.cycleCount}
        min={1}
        max={99}
        onChange={(cycleCount) => update({ cycleCount })}
      />
      <LatchButton
        label="Repeat until stopped"
        pressed={plan.cycleUntilStopped}
        onChange={(cycleUntilStopped) => update({ cycleUntilStopped })}
      />
      <LatchButton
        label="Auto-advance"
        pressed={plan.autoAdvance}
        onChange={(autoAdvance) => update({ autoAdvance })}
      />
      <LatchButton
        label="Binaural beats"
        pressed={plan.binauralEnabled}
        onChange={(binauralEnabled) => update({ binauralEnabled })}
      />
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
