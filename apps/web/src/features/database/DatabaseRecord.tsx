"use client";

import { useEffect, useRef, useState } from "react";
import type { BinauralPreset, FieldDef, FieldScope, Meditation, Symbol } from "@meditaur/domain";
import type { LibraryView, MeditaurApp } from "@meditaur/application";
import { errorText } from "@/lib/error-text";
import { GoneScreen } from "../library/GoneScreen";
import { MeditationEditor, MeditationPresetPicker, SymbolEditor } from "../library/MeditationTable";
import { PresetEditor } from "../library/PresetsTable";
import type { RecordTable } from "./database-tables";
import { emptyRecord } from "./database-model";

/**
 * The Database's record view and its new-record screen (§5.5).
 *
 * A record — a chakra, a symbol, a preset — is edited on the screen it has always
 * been edited on: this *is* `MeditationEditor`, `SymbolEditor` and `PresetEditor`, which
 * the library used to open from a card. Two things changed with the move. The pages
 * that open it are read-only (§8), so this is the only way in; and the screen is
 * reached from the Database, so its `Back` returns to the table it came from.
 *
 * It keeps its own `Save` rather than joining the grid's draft: a record's own
 * fields are not a batch edit, and the screen was entered deliberately to change
 * one thing. The grid's draft is what batches rows, lines and cells (§7).
 */
export type DatabaseRecordScreen =
  | { kind: "record"; table: RecordTable; id: string }
  | { kind: "new"; table: RecordTable };

export function DatabaseRecord({
  app,
  workspaceId,
  view,
  screen,
  imageUrls,
  onBack,
  onReload,
  onAddColumn,
  onOpenBinaural,
  registerSave,
  onError,
}: {
  app: MeditaurApp;
  workspaceId: string;
  view: LibraryView;
  screen: DatabaseRecordScreen;
  imageUrls: Record<string, string>;
  onBack: () => void;
  onReload: () => Promise<void>;
  onAddColumn: () => void;
  onOpenBinaural: (focus: Meditation) => void;
  /**
   * Hands the shell a `save, but stay here` function.
   *
   * The binaural config and the default-sound picker are *other screens*, and
   * this one holds an unsaved draft, so the shell has to write the draft before
   * it swaps the screen out — otherwise a half-typed name is gone when `Back`
   * comes back to it (the rule `saveDraftThen` kept in the library). The shell
   * holds the reference rather than the draft: whose draft it is stays here.
   */
  registerSave?: (save: (() => Promise<void>) | null) => void;
  onError: (message: string | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [armedFieldId, setArmedFieldId] = useState<string | null>(null);
  const [fieldImpact, setFieldImpact] = useState<string | null>(null);
  /** The default-sound picker replaces this screen, so the draft never moves. */
  const [pickingPreset, setPickingPreset] = useState(false);
  const [draft, setDraft] = useState<{ focus?: Meditation; symbol?: Symbol; preset?: BinauralPreset }>(
    {},
  );
  /** The newest draft, for the callbacks that run outside this render. */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  /**
   * The picture chosen most recently, and the record it was chosen for.
   *
   * A file input's `onChange` writes the asset asynchronously and returns at once,
   * so the editor used to be saveable while that write was still in flight — and it
   * then stored the record from before the upload, silently dropping the picture.
   * Reactive state cannot close that on its own: React commits asynchronously too,
   * so a save that merely waited could still read the pre-upload value. The save
   * therefore joins this promise and merges the id itself, and only for the record
   * the picture was chosen for — otherwise opening a second record and saving would
   * hand it the first one's picture.
   */
  const pendingPicture = useRef<{ entityId: string; assetId: Promise<string | null> } | null>(null);

  const scopeOfTable: Record<RecordTable, FieldScope | null> = {
    meditation: "meditation",
    symbols: "symbol",
    presets: null,
  };
  const scope = scopeOfTable[screen.table];

  // The draft's starting point: the stored row, or a new one of that table.
  useEffect(() => {
    setError(null);
    setArmedFieldId(null);
    setFieldImpact(null);
    if (screen.table === "presets") {
      const stored =
        screen.kind === "record" ? view.presets.find((row) => row.id === screen.id) : undefined;
      const value =
        stored ??
        (screen.kind === "new"
          ? ((emptyRecord("presets", workspaceId, view.meditationTypes).source as BinauralPreset) ?? null)
          : null);
      if (value) setDraft({ preset: value });
      return;
    }
    if (screen.table === "symbols") {
      const stored =
        screen.kind === "record" ? view.symbols.find((row) => row.id === screen.id) : undefined;
      const value =
        stored ??
        (screen.kind === "new"
          ? ((emptyRecord("symbols", workspaceId, view.meditationTypes).source as Symbol) ?? null)
          : null);
      if (value) {
        setDraft({ symbol: value });
        setFieldDrafts(draftsFor(value.id, view, "symbol"));
      }
      return;
    }
    const stored =
      screen.kind === "record" ? view.meditations.find((row) => row.id === screen.id) : undefined;
    const value =
      stored ??
      (screen.kind === "new"
        ? ((emptyRecord("meditation", workspaceId, view.meditationTypes).source as Meditation) ?? null)
        : null);
    if (value) {
      setDraft({ focus: value });
      setFieldDrafts(draftsFor(value.id, view, "meditation"));
    }
  }, [screen, view, workspaceId]);

  const defsFor = (which: FieldScope): FieldDef[] =>
    view.fieldDefs
      .filter((def) => def.archivedAt == null && def.scope === which)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  /** One picture for one record: the write starts now, the id arrives later. */
  const choosePicture = (entityId: string, file: File | undefined) => {
    const assetId = uploadImage(app, workspaceId, file, setError, onReload);
    pendingPicture.current = { entityId, assetId };
    void assetId.then((id) => {
      if (!id) return;
      setDraft((current) => {
        if (current.symbol && current.symbol.id === entityId) {
          return { symbol: { ...current.symbol, imageAssetId: id } };
        }
        if (current.focus && current.focus.id === entityId) {
          return { focus: { ...current.focus, representationAssetId: id } };
        }
        return current;
      });
    });
  };

  const saveValues = async (entityId: string, which: FieldScope): Promise<void> => {
    for (const def of defsFor(which)) {
      const stored = view.fieldValues.find(
        (row) => row.entityId === entityId && row.fieldDefId === def.id,
      );
      await app.saveFieldValue({
        entityId,
        fieldDefId: def.id,
        text: fieldDrafts[def.id] ?? "",
        revision: stored?.revision ?? 0,
        updatedAt: 0,
      });
    }
  };

  const fieldDelete = {
    armedId: armedFieldId,
    impact: fieldImpact,
    onArm: (def: FieldDef) => {
      setArmedFieldId(def.id);
      void app
        .getDeletionImpact(workspaceId, "field", def.id)
        .then(setFieldImpact)
        .catch(() => setFieldImpact(null));
    },
    onDelete: (def: FieldDef) => {
      setArmedFieldId(null);
      setFieldImpact(null);
      void (async () => {
        try {
          await app.deleteFieldDef(workspaceId, def.id);
          await onReload();
        } catch (err) {
          setError(errorText(err, "Could not delete the column"));
        }
      })();
    },
  };

  const saveAll = async (leave = true): Promise<void> => {
    setError(null);
    try {
      const current = draftRef.current;
      let focus = current.focus;
      let symbol = current.symbol;
      // A picture is written as an asset the moment it is chosen, and its id
      // arrives asynchronously. A save that ran before it landed wrote the record
      // as it stood *before* the upload and silently dropped the picture — the
      // race `saveSymbolNow`/`saveMeditationNow` closed in the library — so the
      // save joins that write and merges its id into the record it is saving.
      const pending = pendingPicture.current;
      if (pending) {
        const assetId = await pending.assetId;
        if (assetId) {
          if (symbol && symbol.id === pending.entityId) {
            symbol = { ...symbol, imageAssetId: assetId };
          }
          if (focus && focus.id === pending.entityId) {
            focus = { ...focus, representationAssetId: assetId };
          }
        }
      }
      if (focus) {
        const saved = await app.saveMeditation(focus);
        setDraft({ focus: saved });
        await saveValues(saved.id, "meditation");
      } else if (symbol) {
        const saved = await app.saveSymbol(symbol);
        setDraft({ symbol: saved });
        await saveValues(saved.id, "symbol");
      } else if (current.preset) {
        const saved = await app.savePreset(current.preset);
        setDraft({ preset: saved });
      }
      await onReload();
      if (leave) onBack();
    } catch (err) {
      const message = errorText(err, "Save failed");
      setError(message);
      onError(null);
    }
  };

  // Registered once, and reading the newest `saveAll` through a ref: the shell
  // calls it from outside this component's render, so it must not capture a
  // draft from an earlier render.
  const saveRef = useRef(saveAll);
  saveRef.current = saveAll;
  useEffect(() => {
    registerSave?.(() => saveRef.current(false));
    return () => registerSave?.(null);
  }, [registerSave]);

  const commonProps = {
    fieldDefs: defsFor(scope ?? "meditation"),
    fieldDrafts,
    fieldDelete,
    error: error ?? null,
    onBack,
    onDraftChange: (fieldDefId: string, text: string) =>
      setFieldDrafts((current) => ({ ...current, [fieldDefId]: text })),
    onAddField: onAddColumn,
    onSave: () => void saveAll(),
  };

  if (pickingPreset && draft.focus) {
    const focus = draft.focus;
    return (
      <main>
        <MeditationPresetPicker
          value={focus.defaultBinauralPresetId}
          presets={view.presets}
          onBack={() => setPickingPreset(false)}
          onSelect={(id) => {
            setPickingPreset(false);
            setDraft({
              focus: { ...focus, defaultBinauralPresetId: id === "__none__" ? null : id },
            });
          }}
        />
      </main>
    );
  }

  if (screen.table === "presets") {
    if (!draft.preset) return <GoneScreen message={GONE} onBack={onBack} />;
    return (
      <PresetEditor
        {...commonProps}
        screen={{ value: draft.preset, isNew: screen.kind === "new" }}
        onChange={(preset) => setDraft({ preset })}
        deleteArmed={false}
        deleteImpact={null}
        onDelete={() => undefined}
      />
    );
  }

  if (screen.table === "symbols") {
    if (!draft.symbol) return <GoneScreen message={GONE} onBack={onBack} />;
    const symbol = draft.symbol;
    return (
      <SymbolEditor
        {...commonProps}
        screen={{ value: symbol, isNew: screen.kind === "new" }}
        imageUrl={symbol.imageAssetId ? (imageUrls[symbol.imageAssetId] ?? null) : null}
        onChange={(next) => setDraft({ symbol: next })}
        onUploadImage={(file) => choosePicture(symbol.id, file)}
      />
    );
  }

  if (screen.table === "meditation") {
    if (!draft.focus) return <GoneScreen message={GONE} onBack={onBack} />;
    const focus = draft.focus;
    return (
      <MeditationEditor
        {...commonProps}
        presets={view.presets}
        types={view.meditationTypes}
        screen={{ value: focus, isNew: screen.kind === "new" }}
        representationUrl={
          focus.representationAssetId ? (imageUrls[focus.representationAssetId] ?? null) : null
        }
        onChange={(next) => setDraft({ focus: next })}
        onPickPreset={() => setPickingPreset(true)}
        onUploadRepresentation={(file) => choosePicture(focus.id, file)}
        onToggleBinaural={(enabled) => setDraft({ focus: { ...focus, binauralEnabled: enabled } })}
        onOpenBinaural={() => onOpenBinaural(focus)}
      />
    );
  }

  return <GoneScreen message={GONE} onBack={onBack} />;
}

function draftsFor(entityId: string, view: LibraryView, scope: FieldScope): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of view.fieldDefs) {
    if (def.scope !== scope) continue;
    out[def.id] =
      view.fieldValues.find((row) => row.entityId === entityId && row.fieldDefId === def.id)?.text ??
      "";
  }
  return out;
}

/**
 * What every dead end in this screen says: the row the address asked for is not in the
 * store. One constant rather than four copies, because a screen that says four things
 * about one situation says nothing.
 */
const GONE = "That record is gone.";
/**
 * Writes a picture for one record and answers with its asset id.
 *
 * The write is asynchronous and the file input's `onChange` returns at once, so
 * the id has to come from the promise rather than from a re-read of the screen.
 * `choosePicture` keeps that promise where `saveAll` can join it.
 */
async function uploadImage(
  app: MeditaurApp,
  workspaceId: string,
  file: File | undefined,
  setError: (message: string | null) => void,
  onReload: () => Promise<void>,
): Promise<string | null> {
  if (!file) return null;
  try {
    const bytes = await file.arrayBuffer();
    const asset = await app.saveMediaAsset({
      workspaceId,
      kind: "image",
      name: file.name.replace(/\.[^.]+$/, "") || file.name,
      bytes,
      mimeType: file.type,
      durationMs: 0,
    });
    await onReload();
    return asset.id;
  } catch (err) {
    setError(errorText(err, "Could not add image"));
    return null;
  }
}
