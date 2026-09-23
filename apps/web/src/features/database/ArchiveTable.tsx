"use client";

import { Button } from "@meditaur/ui";
import { useState } from "react";
import type { LibraryView, MeditaurApp } from "@meditaur/application";
import { errorText } from "@/lib/error-text";
import { typeName } from "../library/library-model";

/**
 * The Archive (§8).
 *
 * Everything that stepped aside lives here: a chakra, a symbol, a preset, a row of
 * Karuna, or a single line — **most recently archived first** — with what it was
 * attached to and the two things you can do with it. `Restore` puts it back exactly
 * as it was, because archiving never touched anything that depends on it; `Delete`
 * is the only permanent one in the product, and it says what it takes before the
 * second press.
 *
 * A record is *one* item here, not one per row it hides: the rows are hidden by the
 * visibility rule and reappear with it, so listing them would be listing the same
 * act several times over.
 */
type ArchivedItem = {
  id: string;
  kind: "meditation" | "meditationType" | "symbol" | "preset" | "entry" | "line";
  label: string;
  detail: string;
  archivedAt: number;
};

export function ArchiveList({
  app,
  workspaceId,
  view,
  onReload,
}: {
  app: MeditaurApp;
  workspaceId: string;
  view: LibraryView;
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [armed, setArmed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const focusName = (id: string | null) =>
    view.meditations.find((row) => row.id === id)?.name ?? null;  const symbolName = (id: string | null) =>
    view.symbols.find((row) => row.id === id)?.name ?? null;

  const items: ArchivedItem[] = [
    ...view.meditations
      .filter((row) => row.archivedAt != null)
      .map((row) => ({
        id: row.id,
        kind: "meditation" as const,
        label: row.name,
        detail: typeName(view.meditationTypes, row.typeId),
        archivedAt: row.archivedAt!,
      })),
    ...view.meditationTypes
      .filter((row) => row.archivedAt != null)
      .map((row) => ({
        id: row.id,
        kind: "meditationType" as const,
        label: row.name,
        detail: "Meditation type",
        archivedAt: row.archivedAt!,
      })),
    ...view.symbols
      .filter((row) => row.archivedAt != null)
      .map((row) => ({
        id: row.id,
        kind: "symbol" as const,
        label: row.name,
        detail: row.description,
        archivedAt: row.archivedAt!,
      })),
    ...view.presets
      .filter((row) => row.archivedAt != null)
      .map((row) => ({
        id: row.id,
        kind: "preset" as const,
        label: row.name,
        detail: "Sound",
        archivedAt: row.archivedAt!,
      })),
    ...view.entries
      .filter((row) => row.archivedAt != null)
      .map((row) => {
        const parts = [focusName(row.meditationId), symbolName(row.symbolId)].filter(Boolean);
        return {
          id: row.id,
          kind: "entry" as const,
          label: parts.length > 0 ? parts.join(" × ") : "A row",
          detail: "Row",
          archivedAt: row.archivedAt!,
        };
      }),
    // A sentence's label is its sentence — that is the whole row (§2.1): what it was
    // written about rides in the detail line, and an orphan has nothing to say there.
    ...view.intentions
      .filter((row) => row.archivedAt != null)
      .map((row) => {
        const entry = view.entries.find((item) => item.id === row.entryId);
        const parts = [focusName(entry?.meditationId ?? null), symbolName(entry?.symbolId ?? null)]
          .filter(Boolean)
          .join(" × ");
        return {
          id: row.id,
          kind: "line" as const,
          label: row.text,
          detail: parts || "Line",
          archivedAt: row.archivedAt!,
        };
      }),
  ].sort((a, b) => b.archivedAt - a.archivedAt);

  const restore = async (item: ArchivedItem) => {
    setArmed(null);
    setNotice(null);
    setError(null);
    try {
      if (
        item.kind === "meditation" ||
        item.kind === "meditationType" ||
        item.kind === "symbol" ||
        item.kind === "preset"
      ) {
        await app.restoreRecord(workspaceId, item.kind, item.id);
      } else if (item.kind === "entry") {
        await app.restoreEntry(workspaceId, item.id);
      } else {
        await app.restoreLine(workspaceId, item.id);
      }
      await onReload();
    } catch (err) {
      setError(errorText(err, "Could not restore it"));
    }
  };

  const remove = async (item: ArchivedItem) => {
    setArmed(null);
    setNotice(null);
    setError(null);
    try {
      if (item.kind === "meditation") await app.deleteMeditation(workspaceId, item.id);
      else if (item.kind === "meditationType") await app.deleteMeditationType(workspaceId, item.id);
      else if (item.kind === "symbol") await app.deleteSymbol(workspaceId, item.id);
      else if (item.kind === "preset") await app.deletePreset(workspaceId, item.id);
      else if (item.kind === "entry") await app.deleteEntry(workspaceId, item.id);
      else await app.deleteLine(workspaceId, item.id);
      await onReload();
    } catch (err) {
      setError(errorText(err, "Could not delete it"));
    }
  };

  const arm = async (item: ArchivedItem) => {
    if (armed === item.id) return;
    setArmed(item.id);
    setNotice(null);
    setError(null);
    try {
      setNotice(await app.getDeletionImpact(workspaceId, item.kind, item.id, "delete"));
    } catch {
      setNotice(null);
    }
  };

  if (items.length === 0) {
    return (
      <p className="text-lg text-muted">
        Nothing archived — items you archive appear here.
      </p>
    );
  }

  const grouped = [
    { title: "Records", rows: items.filter((row) => row.kind !== "entry" && row.kind !== "line") },
    { title: "Rows", rows: items.filter((row) => row.kind === "entry") },
    { title: "Lines", rows: items.filter((row) => row.kind === "line") },
  ].filter((group) => group.rows.length > 0);

  return (
    <section className="flex flex-col gap-6">
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
      {grouped.map((group) => (
        <details key={group.title} open className="flex flex-col gap-3">
          <summary className="cursor-pointer text-xl text-text">
            {group.title} ({group.rows.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {group.rows.map((item) => (
              <li
                key={`${item.kind}:${item.id}`}
                className="flex flex-wrap items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg">{item.label}</p>
                  <p className="text-sm text-muted">
                    {item.detail} · archived {new Date(item.archivedAt).toLocaleString()}
                  </p>
                </div>
                <Button size="sm" tier="tertiary" onClick={() => void restore(item)}>
                  Restore
                </Button>
                <Button
                  size="sm"
                  tier="destructive"
                  armed={armed === item.id}
                  onClick={() => (armed === item.id ? void remove(item) : void arm(item))}
                >
                  {armed === item.id ? `Delete ${item.label}?` : "Delete"}
                </Button>
                {armed === item.id && notice ? (
                  <p className="w-full text-sm text-destructive">{notice}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
