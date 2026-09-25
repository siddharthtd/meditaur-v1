"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { errorText } from "@/lib/error-text";
import { useScreenScroll } from "@/lib/screen-scroll";
import type { LibraryView } from "@meditaur/application";
import { visibleSymbols, visibleTypes, type Meditation } from "@meditaur/domain";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmLeaveDatabase, setDatabaseDirty } from "../database/database-guard";
import { DatabaseRecord } from "../database/DatabaseRecord";
import { DATABASE_HREF } from "../database/database-route";
import { BinauralConfigScreen } from "../library/BinauralConfig";
import { GoneScreen } from "../library/GoneScreen";
import { pruneBinauralDrafts } from "../library/library-model";
import { LIBRARY_HREF } from "../library/library-route";
import { MeditationSheet } from "../library/MeditationSheet";
import { SymbolSheet } from "../library/SymbolSheet";
import { readRecordRequest, type RecordKind } from "./record-route";

/**
 * **One** screen per record, and it reads before it writes.
 *
 * The owner's round 22, asked what to unify between the Library and the Database:
 * opening a record and editing it are one screen, with `Edit` turning it into
 * inputs in place. Round 20 had already given the two screens one read page and one
 * editor; what it left was two addresses for one record, two pieces of state, and a
 * flag whose only job was remembering which door the reader came through. This
 * replaces all three: the record has an address of its own (`record-route.ts`), and
 * the door it came through travels in that address as `from`.
 *
 * **The rule the merge must not lose** (the owner's round 4, library item 8): *"in
 * the open view in library for any chakra/symbol etc, there should be no editable or
 * selectable options, only displaying current statuses and values of configured
 * fields."* So arriving on a record draws the read-only view, and nothing here is an
 * input until `Edit` is pressed. `integrity.test.ts` fails a screen that draws a box
 * before that press.
 *
 * A **preset** is the one record kind with nothing to read, so it opens straight into
 * its editor — the same rule the Database's own row press has always had for presets,
 * and the reason this screen draws three things rather than two.
 *
 * The two halves are still the components that already existed — the read-only sheets
 * and `DatabaseRecord` — mounted **exclusively**, so exactly one shell owns `Esc` at
 * any moment. That is deliberate: the Database's grid and its record view used to
 * listen for `Esc` on the same screen at once, which is why the e2e clicks the legend
 * rather than pressing the key.
 */
export function RecordScreen() {
  const router = useRouter();
  const { ready: sessionReady, workspaceId: sessionWorkspaceId, flags } = useSession();
  const search = useSearchParams().toString();
  const request = useMemo(() => readRecordRequest(search), [search]);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [view, setView] = useState<LibraryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether the record is being edited. Seeded from the kind, because a preset has no
   * read-only half to arrive at.
   */
  const [editing, setEditing] = useState<RecordKind | null>(null);
  const [binauralMeditationId, setBinauralMeditationId] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const imageUrlsRef = useRef<Record<string, string>>({});
  /**
   * The editor's `save, but stay`, handed up by `DatabaseRecord` itself.
   *
   * The binaural config is a screen inside this one and the record may hold an unsaved
   * draft, so the draft is written before the swap — the rule `saveDraftThen` kept in
   * the library, and the one the Database's grid follows for `Tune`.
   */
  const recordSave = useRef<(() => Promise<void>) | null>(null);
  const registerSave = useCallback((save: (() => Promise<void>) | null) => {
    recordSave.current = save;
  }, []);

  /**
   * The view this screen draws from: the store's library with the rows a flag hides
   * taken out, so a record the reader cannot see reads as one that is gone rather
   * than one drawn from data they were never shown (`P0 · 35`, slices 35a/35b).
   */
  const recordView = useMemo(
    () =>
      view
        ? {
            ...view,
            meditationTypes: visibleTypes(view.meditationTypes, flags),
            symbols: visibleSymbols(view.symbols, flags),
          }
        : null,
    [view, flags],
  );

  const reload = useCallback(async (ws: string) => {
    const library = await app.getLibrary(ws);
    // A binaural draft is keyed by meditation id and is reached from here; one whose
    // meditation is gone is swept on every load, which is the same rule the library
    // used before the config moved behind this screen.
    pruneBinauralDrafts(library.meditations.map((fp) => fp.id));
    setView(library);
  }, []);

  useEffect(() => {
    if (!sessionReady || !sessionWorkspaceId) return;
    setWorkspaceId(sessionWorkspaceId);
    void reload(sessionWorkspaceId).catch((err) =>
      setError(errorText(err, "Could not load the record")),
    );
  }, [sessionReady, sessionWorkspaceId, reload]);

  /** The blob URL for one asset, fetched once and kept for the screen's life. */
  const urlForAsset = useCallback(async (id: string): Promise<string | null> => {
    const cached = imageUrlsRef.current[id];
    if (cached) return cached;
    const bytes = await app.getMediaBytes(id);
    if (!bytes) return null;
    const url = URL.createObjectURL(new Blob([bytes]));
    imageUrlsRef.current = { ...imageUrlsRef.current, [id]: url };
    setImageUrls(imageUrlsRef.current);
    return url;
  }, []);

  /**
   * Every image the workspace holds is decoded up front.
   *
   * A picture cell stores an asset id rather than a URL, so which ones are on screen at
   * any moment is a function of the draft — including a picture the reader is about to
   * choose. Loading the workspace's images instead is bounded by the pictures the reader
   * actually has, and it cannot miss one.
   */
  useEffect(() => {
    if (!view) return;
    for (const asset of view.mediaAssets) {
      if (asset.kind === "image") void urlForAsset(asset.id);
    }
  }, [view, urlForAsset]);

  useEffect(
    () => () => {
      for (const url of Object.values(imageUrlsRef.current)) URL.revokeObjectURL(url);
      imageUrlsRef.current = {};
      // The guard is this screen's, so it dies with it.
      setDatabaseDirty(false);
    },
    [],
  );

  /**
   * The way out: back to the screen the record was opened from.
   *
   * `from` is why the reader does not have to be asked, and why a link that never
   * carried one — a bookmark — lands on the Library's list rather than nowhere. The
   * unsaved-edits question is the same one the Database asks, because the record is
   * the one place outside the grid that holds a draft.
   */
  const leave = useCallback(() => {
    if (!confirmLeaveDatabase()) return;
    setDatabaseDirty(false);
    setError(null);
    router.push(request?.from === "database" ? DATABASE_HREF : LIBRARY_HREF);
  }, [request, router]);

  /**
   * The position this record was left at, under the key the sheets already used.
   *
   * `focus-sheet:<id>` and `symbol-sheet:<id>` are the ids the Library stored its scroll
   * positions under, so the reader's place survives the move rather than resetting once.
   */
  const scrollKey = useMemo(() => {
    if (!request) return "record";
    if (request.kind === "symbols") return `symbol-sheet:${request.id}`;
    if (request.kind === "meditation") return `focus-sheet:${request.id}`;
    return `record:presets:${request.id}`;
  }, [request]);
  useScreenScroll(scrollKey);

  /** A symbol's own picture, keyed by symbol id — what the meditation sheet draws beside a row. */
  const symbolImageUrls = useMemo(() => {
    const out: Record<string, string> = {};
    if (!recordView) return out;
    for (const symbol of recordView.symbols) {
      if (symbol.imageAssetId && imageUrls[symbol.imageAssetId]) {
        out[symbol.id] = imageUrls[symbol.imageAssetId]!;
      }
    }
    return out;
  }, [recordView, imageUrls]);

  if (!request) {
    // Not a record: a plain `/record` has nothing to answer with, and the honest answer
    // is a way back rather than a guess at which record was meant.
    return <GoneScreen message="That record is gone." onBack={leave} />;
  }

  if (!workspaceId || !recordView) {
    return error ? (
      <p className="text-lg text-destructive">{error}</p>
    ) : (
      <p className="text-lg">Loading the record…</p>
    );
  }

  if (binauralMeditationId) {
    const focus = recordView.meditations.find((row) => row.id === binauralMeditationId);
    if (!focus) {
      return <GoneScreen message="That meditation is gone." onBack={() => setBinauralMeditationId(null)} />;
    }
    return (
      <main className="flex flex-col gap-6">
        {error ? <p className="text-lg text-destructive">{error}</p> : null}
        <BinauralConfigScreen
          focus={focus}
          presets={recordView.presets}
          error={error}
          onBack={() => setBinauralMeditationId(null)}
          onError={setError}
          onSavePreset={async (preset) => {
            await app.savePreset(preset);
            await app.saveMeditation({ ...focus, defaultBinauralPresetId: preset.id });
            await reload(workspaceId);
          }}
          onToggleBinaural={async (enabled) => {
            await app.saveMeditation({ ...focus, binauralEnabled: enabled });
            await reload(workspaceId);
          }}
        />
      </main>
    );
  }

  // A preset has nothing to read, so its page *is* its editor — the one record kind
  // that skips the read-only step.
  const isEditing = editing !== null || request.kind === "presets";

  if (!isEditing && request.kind === "meditation") {
    const focus = recordView.meditations.find((row) => row.id === request.id);
    if (!focus) return <GoneScreen message="That meditation is gone." onBack={leave} />;
    return (
      <MeditationSheet
        focus={focus}
        types={recordView.meditationTypes}
        symbols={recordView.symbols}
        entries={recordView.entries}
        intentions={recordView.intentions}
        presets={recordView.presets}
        fieldDefs={recordView.fieldDefs}
        fieldValues={recordView.fieldValues}
        representationUrl={
          focus.representationAssetId ? (imageUrls[focus.representationAssetId] ?? null) : null
        }
        symbolImageUrls={symbolImageUrls}
        error={error}
        onBack={leave}
        onEdit={() => setEditing(request.kind)}
      />
    );
  }

  if (!isEditing && request.kind === "symbols") {
    const symbol = recordView.symbols.find((row) => row.id === request.id);
    if (!symbol) return <GoneScreen message="That symbol is gone." onBack={leave} />;
    const attachedTo = recordView.entries
      .filter((row) => row.archivedAt == null && row.symbolId === symbol.id)
      .map((row) => recordView.meditations.find((fp) => fp.id === row.meditationId)?.name)
      .filter((name): name is string => Boolean(name));
    return (
      <SymbolSheet
        symbol={symbol}
        attachedTo={attachedTo}
        fieldDefs={recordView.fieldDefs}
        fieldValues={recordView.fieldValues}
        imageUrl={symbol.imageAssetId ? (imageUrls[symbol.imageAssetId] ?? null) : null}
        error={error}
        onBack={leave}
        onEdit={() => setEditing(request.kind)}
      />
    );
  }

  return (
    <main className="flex flex-col gap-6">
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
      <DatabaseRecord
        app={app}
        workspaceId={workspaceId}
        view={recordView}
        screen={{ kind: "record", table: request.kind, id: request.id }}
        imageUrls={imageUrls}
        onBack={leave}
        onReload={() => reload(workspaceId)}
        onAddColumn={() => router.push(DATABASE_HREF)}
        onOpenBinaural={(focus: Meditation) => {
          // The binaural config is another screen and this one may hold an unsaved draft, so
          // the draft is written before the swap — the rule `saveDraftThen` kept in the
          // library, and the one the Database's grid follows for `Tune`. A save that fails
          // keeps the reader on the record with the message.
          void (async () => {
            const save = recordSave.current;
            try {
              if (save) await save();
            } catch (err) {
              setError(errorText(err, "Save failed"));
              return;
            }
            setError(null);
            setBinauralMeditationId(focus.id);
          })();
        }}
        registerSave={registerSave}
        onError={setError}
      />
    </main>
  );
}
