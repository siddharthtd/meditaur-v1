"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { errorText } from "@/lib/error-text";
import { useScreenScroll } from "@/lib/screen-scroll";
import type { LibraryView } from "@meditaur/application";
import type { Meditation } from "@meditaur/domain";
import { Button } from "@meditaur/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BinauralConfigScreen } from "../library/BinauralConfig";
import { pruneBinauralDrafts } from "../library/library-model";
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
 * The record view and the binaural config are *screens inside this one*, exactly
 * as they were inside the library: a record's own page is reached from its row's
 * `Open`, and the binaural config is reached from the record view or from a
 * `Tune` cell. Neither is a route.
 */
export function DatabaseScreen() {
  const router = useRouter();
  const { ready: sessionReady, workspaceId: sessionWorkspaceId } = useSession();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [view, setView] = useState<LibraryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordScreen, setRecordScreen] = useState<DatabaseRecordScreen | null>(null);
  /**
   * True while the record on screen is one the **library** asked for.
   *
   * `Add preset` and a preset card's `Edit` come from the Presets tab, so `Back`
   * has to end up back on that list rather than on the grid the reader never saw;
   * the library reopens the section it remembers, so a plain `/library` is enough.
   * A record opened from a grid row clears this and returns to the grid.
   */
  const [recordFromLibrary, setRecordFromLibrary] = useState(false);
  const [binauralMeditationId, setBinauralMeditationId] = useState<string | null>(null);
  /** Which screen the binaural config hands back to. */
  const [binauralFrom, setBinauralFrom] = useState<"record" | "database">("record");
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
    const next = readDatabaseRequest(search, view.meditationTypes);
    if (next) setRequest(next);
  }, [search, view]);

  /**
   * A preset's `Add`/`Edit` opens its page; a grid request is the grid's.
   *
   * The record kinds never reach the grid, so they are spent here — the same
   * "acted on once" rule, split by what the request is for.
   */
  useEffect(() => {
    if (!request) return;
    if (request.kind === "record") {
      setRecordScreen({ kind: "record", table: request.table, id: request.id });
      setRecordFromLibrary(true);
    } else if (request.kind === "new-record") {
      setRecordScreen({ kind: "new", table: request.table });
      setRecordFromLibrary(true);
    } else {
      return;
    }
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
  const openBinaural = async (focus: Meditation, from: "record" | "database" = "record") => {
    const save = recordSave.current;
    try {
      if (save) await save();
    } catch (err) {
      setError(errorText(err, "Save failed"));
      return;
    }
    setError(null);
    // The record screen is what the binaural config hands back to, so it has to
    // stand down for it.
    setBinauralFrom(from);
    setRecordScreen(null);
    setBinauralMeditationId(focus.id);
  };

  const backToGrid = () => {
    setRecordScreen(null);
    setBinauralMeditationId(null);
    setError(null);
  };

  /**
   * `Back` out of a record: to the grid, or to the library that asked for it.
   */
  const backFromRecord = () => {
    setError(null);
    setRecordScreen(null);
    if (!recordFromLibrary) return;
    setRecordFromLibrary(false);
    setDatabaseDirty(false);
    router.push("/library");
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
      return (
        <main className="flex flex-col gap-6">
          <p className="text-lg">That meditation is gone.</p>
          <Button tier="tertiary" size="sm" onClick={backToGrid}>
            Back
          </Button>
        </main>
      );
    }
    return (
      <BinauralConfigScreen
        focus={focus}
        presets={view.presets}
        error={error}
        onBack={() => {
          setBinauralMeditationId(null);
          if (binauralFrom === "record") setRecordScreen({ kind: "record", table: "meditation", id: focus.id });
        }}
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
          view={view}
          screen={recordScreen}
          imageUrls={imageUrls}
          onBack={backFromRecord}
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
        view={view}
        imageUrls={imageUrls}
        request={request && (request.kind === "add" || request.kind === "edit") ? request : null}
        onRequestHandled={() => {
          // The request is spent, so the address stops asking for it: a reload of
          // what is now an ordinary `/database` opens the grid where it stands.
          setRequest(null);
          router.replace(DATABASE_HREF);
        }}
        onReload={() => reload(workspaceId)}
        onOpenRecord={(which, id) => {
          setRecordFromLibrary(false);
          setRecordScreen({ kind: "record", table: which, id });
        }}
        onNewRecord={(which) => {
          setRecordFromLibrary(false);
          setRecordScreen({ kind: "new", table: which });
        }}
        onOpenBinaural={(focus) => void openBinaural(focus, "database")}
        onDirtyChange={setDatabaseDirty}
        onError={setError}
        onLeave={leave}
      />
    </main>
  );
}
