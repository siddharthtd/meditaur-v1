"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { errorText } from "@/lib/error-text";
import { useScreenScroll } from "@/lib/screen-scroll";
import type { LibraryView } from "@meditaur/application";
import { visibleSymbols, visibleTypes, type Meditation } from "@meditaur/domain";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BinauralConfigScreen } from "../library/BinauralConfig";
import { GoneScreen } from "../library/GoneScreen";
import { pruneBinauralDrafts } from "../library/library-model";
import { recordHref } from "../record/record-route";
import { confirmLeaveDatabase, setDatabaseDirty } from "./database-guard";
import { DATABASE_HREF, readDatabaseRequest } from "./database-route";
import { DatabaseRecord, type DatabaseRecordScreen } from "./DatabaseRecord";
import { DatabaseTab, type DatabaseRequest } from "./DatabaseTab";

/**
 * The Database's screen, and the one place in the app where leaving discards.
 *
 * It owns the draft's lifetime by owning the component that holds it: the grid
 * unmounts when this screen does, which is what throws the draft away — the same
 * mechanism the tab had, with the difference that the exit is a route change and
 * the guard therefore has to answer the nav bar too (`database-guard.ts`).
 *
 * The record view and the binaural config are *screens inside this one*: the binaural
 * config is reached from the grid's `Tune` cell, and a **preset's new-record editor** is
 * reached from the Presets tab's `Add preset`.
 *
 * Opening an **existing** record is not here at all since the owner's round 22: a
 * meditation, a symbol and a preset all have one address of their own (`record-route.ts`),
 * where one screen reads the record and edits it in place. So this screen holds the one
 * *editor for a row that does not exist yet*, and the record route holds the one for a row
 * that does — which is the whole of the two-path problem that round was about.
 */
export function DatabaseScreen() {
  const router = useRouter();
  const { ready: sessionReady, workspaceId: sessionWorkspaceId, flags } = useSession();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [view, setView] = useState<LibraryView | null>(null);
  /**
   * The view **this screen** draws from: the store's library, with the types and the
   * symbols a flag hides taken out (`P0 · 35`, slices 35a and 35b).
   *
   * Filtered at the screen and handed down whole, so everything under it agrees —
   * the table strip, the Symbols table, the type a brand-new row is given, the rows
   * the draft holds, and the address's own validity, since `readDatabaseRequest` asks
   * *this* list and a request naming a hidden table lands the way an unknown one
   * does. A draft that never holds such a row is also what keeps a save from
   * differing against rows the reader was never shown.
   */
  const gridView = useMemo(
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
  const [error, setError] = useState<string | null>(null);
  /**
   * A record this screen is creating: a new preset, and nothing else.
   *
   * Every other record has an id and therefore an address. A row that does not exist yet
   * has neither, which is why the one creation flow that opens an editor rather than a
   * grid cell still lives here.
   */
  const [recordScreen, setRecordScreen] = useState<DatabaseRecordScreen | null>(null);
  const [binauralMeditationId, setBinauralMeditationId] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  /**
   * What the library asked for on the way in, read from the address.
   *
   * Next's own view of the query is the one that is right at the moment this
   * screen renders. Reading `window.location` in a lazy initializer looked
   * equivalent and was not: it raced the navigation and arrived empty, which read
   * on screen as "the grid ignored the press".
   */
  const search = useSearchParams().toString();
  const [request, setRequest] = useState<DatabaseRequest | null>(null);
  const imageUrlsRef = useRef<Record<string, string>>({});
  /**
   * The record editor's `save, but stay`, handed up by the editor itself.
   *
   * `Tune` is the one door out of the Database that is not "leaving", so the
   * draft is written before this screen swaps the binaural config in. A save that
   * fails keeps the reader on the editor with the message.
   */
  const recordSave = useRef<(() => Promise<void>) | null>(null);
  const registerRecordSave = useCallback((save: (() => Promise<void>) | null) => {
    recordSave.current = save;
  }, []);

  const reload = useCallback(async (ws: string) => {
    const library = await app.getLibrary(ws);
    // The binaural config is a *draft* keyed by meditation id, and it is reached
    // from here — a `Tune` cell or the record view. A draft whose meditation is
    // gone is swept on every load, which is the same rule the library used.
    pruneBinauralDrafts(library.meditations.map((fp) => fp.id));
    setView(library);
  }, []);

  useEffect(() => {
    if (!sessionReady || !sessionWorkspaceId) return;
    setWorkspaceId(sessionWorkspaceId);
    void (async () => {
      try {
        await reload(sessionWorkspaceId);
      } catch (err) {
        setError(errorText(err, "Could not load the Database"));
      }
    })();
  }, [sessionReady, sessionWorkspaceId, reload]);

  useScreenScroll(
    recordScreen
      ? recordScreen.kind === "record"
        ? `record:${recordScreen.table}:${recordScreen.id}`
        : `new-record:${recordScreen.table}`
      : "database",
  );

  /**
   * The address asks for something; the screen takes it on once.
   *
   * `router.replace` below empties the query, so the request cannot fire twice —
   * and the `search` value is recorded as it is spent, because a type's table is
   * one of the store's rows and the address can only be read once `view` has
   * arrived. Without the record, the second `view` (a reload) would re-read the
   * same address and hand the grid the same `Add` again — two rows, one press.
   */
  const spentSearch = useRef<string | null>(null);
  useEffect(() => {
    if (!view) return;
    if (spentSearch.current === search) return;
    spentSearch.current = search;
    const next = readDatabaseRequest(search, gridView?.meditationTypes ?? []);
    if (next) setRequest(next);
  }, [search, gridView]);

  /**
   * `new-record` opens a preset's empty editor; a grid request is the grid's.
   *
   * Only **creating** is left here. Opening an existing record became the record's own
   * address (the owner's round 22), so the `record` kind this effect used to act on is
   * gone — the row press navigates instead of handing this screen a record to draw. A
   * preset is created here and nowhere else, because a preset with no row in the store
   * has no id for an address to name.
   */
  useEffect(() => {
    if (!request) return;
    if (request.kind !== "new-record") return;
    setRecordScreen({ kind: "new", table: request.table });
    setRequest(null);
    router.replace(DATABASE_HREF);
  }, [request, router]);

  /** The blob URL for one asset, fetched once and kept for the screen's life. */
  const urlForAsset = useCallback(async (id: string) => {
    if (imageUrlsRef.current[id]) return;
    const bytes = await app.getMediaBytes(id);
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes]));
    imageUrlsRef.current = { ...imageUrlsRef.current, [id]: url };
    setImageUrls(imageUrlsRef.current);
  }, []);

  /**
   * Every image the workspace holds is decoded up front.
   *
   * A picture cell stores an asset id rather than a URL, so which ones are on
   * screen at any moment is a function of the draft — a row the reader is about
   * to add included. Loading the workspace's images instead is bounded by the
   * pictures the reader actually has, and it cannot miss one.
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
   * A tab close or refresh gets the browser's own prompt; a move inside the app
   * gets the question `confirmLeaveDatabase` asks.
   */
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome needs the return value; the string is never shown.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /** The one exit: the nav bar's `Database` is the destination it came from. */
  const leave = useCallback(() => {
    if (!confirmLeaveDatabase()) return;
    setDatabaseDirty(false);
    setError(null);
    router.push("/library");
  }, [router]);

  /**
   * Leave the record editor for the binaural config, writing its draft first.
   */
  const openBinaural = async (focus: Meditation) => {
    const save = recordSave.current;
    try {
      if (save) await save();
    } catch (err) {
      setError(errorText(err, "Save failed"));
      return;
    }
    setError(null);
    // The config is a screen of its own, so this one has to stand down for it.
    setRecordScreen(null);
    setBinauralMeditationId(focus.id);
  };

  const backToGrid = () => {
    setRecordScreen(null);
    setBinauralMeditationId(null);
    setError(null);
  };

  if (!workspaceId || !view) {
    return error ? (
      <p className="text-lg text-destructive">{error}</p>
    ) : (
      <p className="text-lg">Loading the Database…</p>
    );
  }

  if (binauralMeditationId) {
    const focus = view.meditations.find((fp) => fp.id === binauralMeditationId);
    if (!focus) {
      return <GoneScreen message="That meditation is gone." onBack={backToGrid} />;
    }
    return (
      <BinauralConfigScreen
        focus={focus}
        presets={view.presets}
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
    );
  }

  if (recordScreen) {
    return (
      <main className="flex flex-col gap-6">
        {error ? <p className="text-lg text-destructive">{error}</p> : null}
        <DatabaseRecord
          app={app}
          workspaceId={workspaceId}
          view={gridView ?? view}
          screen={recordScreen}
          imageUrls={imageUrls}
          onBack={backToGrid}
          onReload={() => reload(workspaceId)}
          onAddColumn={backToGrid}
          onOpenBinaural={(focus) => void openBinaural(focus)}
          registerSave={registerRecordSave}
          onError={setError}
        />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
      <DatabaseTab
        app={app}
        workspaceId={workspaceId}
        view={gridView ?? view}
        imageUrls={imageUrls}
        request={request?.kind === "add" ? request : null}
        onRequestHandled={() => {
          // The request is spent, so the address stops asking for it: a reload of
          // what is now an ordinary `/database` opens the grid where it stands.
          setRequest(null);
          router.replace(DATABASE_HREF);
        }}
        onReload={() => reload(workspaceId)}
        onOpenRecord={(which, id) => {
          // **One** address per record now (the owner's round 22): a row press is a
          // navigation to the record's own page, where it reads first and `Edit` turns it
          // into its editor in place. `from` is what brings the reader back to this grid
          // when they leave, and it is in the address rather than in a flag so a reload
          // does not forget it. A preset goes to the same page: it has nothing to read, so
          // it opens already editing.
          router.push(recordHref({ kind: which, id, from: "database" }));
        }}
        onNewRecord={(which) => {
          setRecordScreen({ kind: "new", table: which });
        }}
        onOpenBinaural={(focus) => void openBinaural(focus)}
        onDirtyChange={setDatabaseDirty}
        onError={setError}
        onLeave={leave}
      />
    </main>
  );
}
