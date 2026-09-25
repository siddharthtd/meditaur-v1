"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { catalogRestoreError, errorText } from "@/lib/error-text";
import { useScreenScroll } from "@/lib/screen-scroll";
import { PLAN_ERRORS, type CatalogChangeSet, type LibraryView } from "@meditaur/application";
import { Button, EYEBROW_CLASS } from "@meditaur/ui";
import {
  visibleSymbols,
  visibleTypes,
  type BinauralPreset,
  type MediaAsset,
} from "@meditaur/domain";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveList } from "../database/ArchiveTable";
import { databaseHref } from "../database/database-route";
import { meditationTableId } from "../database/database-tables";
import { recordHref, type RecordKind } from "../record/record-route";
import type { DatabaseRequest } from "../database/DatabaseTab";
import { AudioList } from "./AudioTable";
import { CatalogBackupPanel } from "./CatalogBackupPanel";
import { LibraryColumnPicker } from "./CatalogDataTable";
import { patchLibrary, withRow } from "./library-patch";
import { MeditationList, SymbolsList } from "./MeditationTable";
import { HistoryList } from "./HistoryTable";
import {
  MEDITATION_BUILTIN_COLUMNS,
  libraryTabs,
  poolColumns,
  readLibraryTable,
  readListMode,
  readTableColumns,
  toggleOrdered,
  writeLibraryTable,
  writeListMode,
  writeTableColumns,
  SYMBOL_BUILTIN_COLUMNS,
  typeTabTypeId,
  type ListMode,
  type TableId,
} from "./library-model";
import { PlansList } from "./PlansTable";
import { PresetsList } from "./PresetsTable";

/**
 * The library (§5, §8).
 *
 * Two things about its shape are worth knowing before reading on. It **reads**:
 * every tab here shows the store, and the browse tabs have **no actions at all**
 * (§8) — a chakra's page is for reading, and editing it means opening the
 * Database, which is a route of its own since 2026-09-19. And the store's rows
 * arrive whole — archived ones included — because the Archive reads the same list
 * the grid does and the visibility rule, not a filter here, is what hides them.
 */
export function Library() {
  const router = useRouter();
  const {
    ready: sessionReady,
    userId: sessionUserId,
    workspaceId: sessionWorkspaceId,
    flags,
  } = useSession();
  const [table, setTable] = useState<TableId | null>(null);
  const [listMode, setListMode] = useState<ListMode>("cards");
  const [columnKeys, setColumnKeys] = useState<string[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [view, setView] = useState<LibraryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armedCardId, setArmedCardId] = useState<string | null>(null);
  const [cardImpact, setCardImpact] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const mediaUrlsRef = useRef<Record<string, string>>({});
  /**
   * Which record a fetched deletion sentence belongs to.
   *
   * `getDeletionImpact` is a round trip, so a slow answer could paint the previous
   * row's sentence under a button that is now armed for this one.
   */
  const impactToken = useRef<string | null>(null);
  /**
   * The Audio files tab's two pickers. A bare `<input type="file">` is the
   * browser's own control, which read as plain text beside every other button in
   * the library; these are the hidden halves behind real buttons.
   */
  const ambientInput = useRef<HTMLInputElement>(null);
  const alarmInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async (ws: string) => {
    // Blob URLs deliberately survive a reload: asset ids are immutable, so a
    // cached URL stays correct, and revoking here made every picture blank and
    // re-decode after every save (the register's `P2 · 4`).
    //
    // This is the whole catalogue — nine storage scans — and only two things still
    // need it: the mount, and a catalog restore, which rewrites every table at once.
    // A mutation patches the view from the answer it gets instead (`library-patch.ts`).
    const library = await app.getLibrary(ws);
    setView(library);
  }, []);

  useEffect(() => {
    if (!sessionReady || !sessionWorkspaceId) return;
    setUserId(sessionUserId ?? "");
    setWorkspaceId(sessionWorkspaceId);
    void (async () => {
      try {
        await reload(sessionWorkspaceId);
      } catch (err) {
        setError(errorText(err, "Could not load the library"));
      }
    })();
  }, [sessionReady, sessionUserId, sessionWorkspaceId, reload]);

  useEffect(() => {
    setTable(readLibraryTable());
  }, []);

  /**
   * The types this screen may offer (`P0 · 35`, slice 35a).
   *
   * The question is asked **here**, once, and the answer is the list the screen
   * hands down: a type's tab, the tiles behind it and the list it opens all come
   * from this one list, so there is no second place for the two to disagree. The
   * listing functions stay questions about the store — `liveTypes` is
   * archived-ness and order, nothing more.
   */
  const typeRows = useMemo(
    () => (view ? visibleTypes(view.meditationTypes, flags) : []),
    [view, flags],
  );
  /**
   * The strip the store draws: one tab per live type, then the fixed screens.
   *
   * A type is a row, so this is a question about `view` and not about a list in
   * this file — a reader who adds a type gets a tab with nothing to register.
   */
  const tabs = useMemo(() => (view ? libraryTabs(typeRows, flags) : []), [view, typeRows, flags]);
  /** The tab in front of the reader: their own choice, or the strip's first. */
  const active: TableId | null = table ?? tabs[0]?.id ?? null;

  /**
   * A remembered tab that no longer exists — an archived type, one a flag hides,
   * or one of the old ids — falls back to the strip's first tab.
   *
   * It matters because the type tabs are the store's rows: a type can be
   * archived between two visits, and the id in `sessionStorage` would then name
   * nothing at all.
   */
  useEffect(() => {
    if (!view || !table) return;
    if (!tabs.some((row) => row.id === table)) setTable(null);
  }, [view, tabs, table]);

  useEffect(() => {
    if (!active) return;
    setListMode(readListMode(active));
    setColumnKeys(readTableColumns(active));
  }, [active]);

  useEffect(
    () => () => {
      for (const url of Object.values(mediaUrlsRef.current)) URL.revokeObjectURL(url);
      mediaUrlsRef.current = {};
    },
    [],
  );

  useScreenScroll(active ? `list:${active}` : "list");

  /** The blob URL for one asset, fetched once and kept for the screen's life. */
  const urlForAsset = useCallback(async (id: string | null): Promise<string | null> => {
    if (!id) return null;
    const cached = mediaUrlsRef.current[id];
    if (cached) return cached;
    const bytes = await app.getMediaBytes(id);
    if (!bytes) return null;
    const url = URL.createObjectURL(new Blob([bytes]));
    mediaUrlsRef.current = { ...mediaUrlsRef.current, [id]: url };
    setMediaUrls(mediaUrlsRef.current);
    return url;
  }, []);

  const loadImages = useCallback(
    async (ids: (string | null | undefined)[]) => {
      await Promise.all(ids.map((id) => urlForAsset(id ?? null)));
    },
    [urlForAsset],
  );

  // Only what the screen in front of the reader needs: a picture per meditation on
  // a type's tab, a symbol's own image on its view, and the pair's on the sheets.
  useEffect(() => {
    if (!view || !active) return;
    const typeId = typeTabTypeId(active);
    if (typeId) {
      void loadImages(
        view.meditations
          .filter((fp) => fp.typeId === typeId)
          .map((fp) => fp.representationAssetId),
      );
    }
    if (active === "symbols") {
      void loadImages(view.symbols.map((s) => s.imageAssetId));
    }
  }, [view, active, loadImages]);

  const selectTable = (id: TableId) => {
    setArmedCardId(null);
    setError(null);
    setTable(id);
    writeLibraryTable(id);
  };
  /**
   * The library's `Add …` lands in the Database, which is a route of its own.
   *
   * Only **creating** goes there now. A record's page and its editor are one screen at one
   * address (`record-route.ts`) since the owner's round 22, so nothing on this list opens a
   * record into the Database any more. A preset is the exception the round kept: it has
   * nothing to read, so `Add preset` asks for the editor and lands in it directly.
   */
  const goToDatabase = (request: DatabaseRequest) => {
    setArmedCardId(null);
    setError(null);
    router.push(databaseHref(request));
  };

  /**
   * A card's press: the record's own address, carrying the door it came through.
   *
   * That `from` is what lets the record's `Esc` come back to this list rather than
   * guessing, and unlike the flag it replaces it survives a reload.
   */
  const openRecord = (kind: RecordKind, id: string) => {
    setError(null);
    setArmedCardId(null);
    router.push(recordHref({ kind, id, from: "library" }));
  };

  const downloadCatalog = async () => {
    if (!workspaceId) return;
    setError(null);
    try {
      const backup = await app.exportCatalog(workspaceId);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "meditaur-catalog.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorText(err, "Could not download catalog"));
    }
  };

  const restoreCatalog = async (file: File | undefined) => {
    if (!workspaceId || !file) return;
    setError(null);
    try {
      const raw: unknown = JSON.parse(await file.text());
      await app.importCatalog(workspaceId, raw);
      await reload(workspaceId);
    } catch (err) {
      setError(catalogRestoreError(err));
    }
  };

  const openLibraryPlan = async (planId: string) => {
    if (!userId || !workspaceId) return;
    const opened = await app.openPlan(userId, workspaceId, planId);
    if (!opened) {
      setError(PLAN_ERRORS.missing);
      return;
    }
    router.push("/plan");
  };

  const uploadMedia = async (kind: MediaAsset["kind"], file: File | undefined) => {
    if (!workspaceId || !file) return;
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      const ctx = new AudioContext();
      let durationMs = 0;
      try {
        const decoded = await ctx.decodeAudioData(bytes.slice(0));
        durationMs = Math.round(decoded.duration * 1000);
      } finally {
        await ctx.close();
      }
      const asset = await app.saveMediaAsset({
        workspaceId,
        kind,
        name: file.name.replace(/\.[^.]+$/, "") || file.name,
        bytes,
        mimeType: file.type,
        durationMs,
      });
      // The upload answers with the row it stored, in the order it was given, so
      // the list gains it in place instead of the catalogue being re-read
      // (`P2 · 4`).
      setView((current) =>
        current ? { ...current, mediaAssets: withRow(current.mediaAssets, asset) } : current,
      );
    } catch (err) {
      setError(errorText(err, "Could not add audio"));
    }
  };

  /**
   * The first press of a card's delete arms it and fetches what else goes with it;
   * the second runs the work. `getDeletionImpact` answers with a sentence, and it
   * is guarded by a token so a slow answer cannot paint the *previous* card's
   * damage under a now-armed button.
   */
  const cardDelete = async (
    id: string,
    kind: "preset" | "media",
    work: () => Promise<CatalogChangeSet>,
  ) => {
    if (!workspaceId) return;
    if (armedCardId !== id) {
      setArmedCardId(id);
      setCardImpact(null);
      const token = `${kind}:${id}`;
      impactToken.current = token;
      try {
        const sentence = await app.getDeletionImpact(workspaceId, kind, id);
        if (impactToken.current === token) setCardImpact(sentence);
      } catch {
        if (impactToken.current === token) setCardImpact(null);
      }
      return;
    }
    setArmedCardId(null);
    setCardImpact(null);
    impactToken.current = null;
    setError(null);
    try {
      const changes = await work();
      // The delete answers with every row its cascade rewrote, and that is what
      // makes a patch exact: dropping the id alone would leave the meditations and
      // the symbols that pointed at it stale in this very view.
      setView((current) => (current ? patchLibrary(current, changes) : current));
    } catch (err) {
      setError(errorText(err, "Delete failed"));
    }
  };

  if (!workspaceId || !view) {
    return error ? (
      <p className="text-lg text-destructive">{error}</p>
    ) : (
      <p className="text-lg">Loading library…</p>
    );
  }

  const columns = (which: "focus" | "symbols") =>
    which === "focus"
      ? poolColumns(MEDITATION_BUILTIN_COLUMNS, view.fieldDefs, "meditation", typeTabTypeId(active))
      : poolColumns(SYMBOL_BUILTIN_COLUMNS, view.fieldDefs, "symbol");

  /**
   * The live type the active tab belongs to, or `null` for a fixed screen.
   *
   * A tab is `type:<id>` and the row it names is the store's, so the pane's
   * filter, its heading and its `Add` all come from this one lookup.
   */
  const activeTypeId = typeTabTypeId(active);

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className={EYEBROW_CLASS}>Library</p>
      </header>

      {/* The tab strip is generated: one tab per live type — the store's rows, in
          the reader's order — then the fixed screens (§8). It scrolls sideways
          rather than wrapping away a tab (§12.23). */}
      <nav className="flex flex-wrap items-center gap-2">
        {tabs.map((row) => (
          <Button
            key={row.id}
            size="sm"
            tier={row.id === active ? "primary" : "tertiary"}
            aria-current={row.id === active ? "page" : undefined}
            onClick={() => selectTable(row.id)}
          >
            {row.label}
          </Button>
        ))}
      </nav>

      {error ? <p className="text-lg text-destructive">{error}</p> : null}

      {active === "archive" ? (
        <ArchiveList
          app={app}
          workspaceId={workspaceId}
          view={view}
          onReload={() => reload(workspaceId)}
          onError={setError}
        />
      ) : null}

      {activeTypeId && active ? (
        <>
          {/* The Add action leads the row and the view switch — with the column
              picker that belongs to the table it switches to — is pushed to the
              right edge (the owner's round 14: the switch sat beside `Add focus
              point`, where it read as an action on the section rather than a
              setting for its list). The button says just `Add` because the tab
              above it already names the type, and a plural name ("Chakras") reads
              wrong in "Add chakras" (the owner's round 15). */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              tier="primary"
              onClick={() => goToDatabase({ kind: "add", table: meditationTableId(activeTypeId) })}
            >
              Add
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                tier="tertiary"
                aria-pressed={listMode === "table"}
                onClick={() => {
                  const mode: ListMode = listMode === "table" ? "cards" : "table";
                  setListMode(mode);
                  writeListMode(active, mode);
                }}
              >
                {listMode === "table" ? "Cards" : "Table"}
              </Button>
              {listMode === "table" ? (
                <LibraryColumnPicker
                  columns={columns("focus")}
                  selected={columnKeys ?? columns("focus").map((col) => col.key)}
                  onToggle={(key) => {
                    const keys = toggleOrdered(
                      columnKeys ?? columns("focus").map((col) => col.key),
                      key,
                      columns("focus").map((col) => col.key),
                    );
                    setColumnKeys(keys);
                    writeTableColumns(active, keys);
                  }}
                />
              ) : null}
            </div>
          </div>
          <MeditationList
            meditations={view.meditations.filter(
              (row) => row.archivedAt == null && row.typeId === activeTypeId,
            )}
            types={typeRows}
            entries={view.entries}
            fieldDefs={view.fieldDefs}
            fieldValues={view.fieldValues}
            imageUrls={mediaUrls}
            columnKeys={columnKeys}
            listMode={listMode}
            onOpenRecord={(focus) => openRecord("meditation", focus.id)}
            typeId={activeTypeId}
          />
        </>
      ) : null}

      {active === "symbols" ? (
        <>
          {/* The same arrangement as the Meditations row, for the same reason. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              tier="primary"
              onClick={() => goToDatabase({ kind: "add", table: "symbols" })}
            >
              Add symbol
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                tier="tertiary"
                aria-pressed={listMode === "table"}
                onClick={() => {
                  const mode: ListMode = listMode === "table" ? "cards" : "table";
                  setListMode(mode);
                  writeListMode("symbols", mode);
                }}
              >
                {listMode === "table" ? "Cards" : "Table"}
              </Button>
              {listMode === "table" ? (
                <LibraryColumnPicker
                  columns={columns("symbols")}
                  selected={columnKeys ?? columns("symbols").map((col) => col.key)}
                  onToggle={(key) => {
                    const keys = toggleOrdered(
                      columnKeys ?? columns("symbols").map((col) => col.key),
                      key,
                      columns("symbols").map((col) => col.key),
                    );
                    setColumnKeys(keys);
                    writeTableColumns("symbols", keys);
                  }}
                />
              ) : null}
            </div>
          </div>
          {/* An offer, so a symbol whose system's flag is off is not in it (`P0 · 35`,
              slice 35b). A symbol that names no system is never hidden. */}
          <SymbolsList
            symbols={visibleSymbols(view.symbols, flags).filter((row) => row.archivedAt == null)}
            fieldDefs={view.fieldDefs}
            fieldValues={view.fieldValues}
            imageUrls={mediaUrls}
            columnKeys={columnKeys}
            listMode={listMode}
            onOpenRecord={(symbol) => openRecord("symbols", symbol.id)}
          />
        </>
      ) : null}

      {active === "audio" ? (
        <>
          {/* Two real buttons over two hidden file pickers, in the tier and size
              every other action in the library uses. The bare
              `<input type="file">` they replace was the browser's own control,
              so this tab read as unstyled text (the owner's round 14). */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" tier="primary" onClick={() => ambientInput.current?.click()}>
              Add ambient audio
            </Button>
            <Button size="sm" onClick={() => alarmInput.current?.click()}>
              Add alarm audio
            </Button>
            <input
              ref={ambientInput}
              type="file"
              accept="audio/*"
              // The buttons above are the controls; these are their hidden
              // halves, kept out of the accessibility tree because an
              // `input[type=file]` carries the `button` role and would answer to
              // the same name.
              aria-hidden="true"
              tabIndex={-1}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Cleared so choosing the same file twice still fires.
                event.target.value = "";
                void uploadMedia("ambient", file);
              }}
            />
            <input
              ref={alarmInput}
              type="file"
              accept="audio/*"
              aria-hidden="true"
              tabIndex={-1}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void uploadMedia("alarm", file);
              }}
            />
          </div>
          <AudioList
            mediaAssets={view.mediaAssets}
            armedId={armedCardId}
            deleteNotice={cardImpact}
            onDelete={(asset) =>
              void cardDelete(asset.id, "media", () => app.deleteMediaAsset(workspaceId, asset.id))
            }
          />
        </>
      ) : null}

      {active === "presets" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              tier="primary"
              onClick={() => goToDatabase({ kind: "new-record", table: "presets" })}
            >
              Add preset
            </Button>
          </div>
          <PresetsList
            presets={view.presets.filter((row) => row.archivedAt == null)}
            armedId={armedCardId}
            deleteNotice={cardImpact}
            onEdit={(preset: BinauralPreset) => openRecord("presets", preset.id)}
            onDuplicate={(preset: BinauralPreset) =>
              void (async () => {
                setError(null);
                try {
                  const saved = await app.savePreset(preset);
                  const copy = await app.duplicatePreset(workspaceId, saved.id);
                  // The copy is a new row with its own place; the catalogue does not
                  // have to be re-read to show it (`P2 · 4`).
                  setView((current) =>
                    current ? { ...current, presets: withRow(current.presets, copy) } : current,
                  );
                } catch (err) {
                  setError(errorText(err, "Could not duplicate preset"));
                }
              })()
            }
            onDelete={(preset: BinauralPreset) =>
              void cardDelete(preset.id, "preset", () =>
                app.deletePreset(workspaceId, preset.id),
              )
            }
          />
        </>
      ) : null}

      {active === "plans" ? (
        <PlansList planNames={view.plans} onOpen={(id) => void openLibraryPlan(id)} />
      ) : null}

      {active === "history" ? (
        <HistoryList
          sessionsThisWeek={view.sessionsThisWeek}
          logs={view.logs}
          planNames={view.plans}
          onOpen={(id) => void openLibraryPlan(id)}
        />
      ) : null}

      {activeTypeId != null || active === "plans" ? (
        <CatalogBackupPanel onDownload={() => void downloadCatalog()} onRestore={(file) => void restoreCatalog(file)} />
      ) : null}
    </main>
  );
}
