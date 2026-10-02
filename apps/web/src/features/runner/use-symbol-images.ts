"use client";

import { app } from "@/composition";
import type { CompiledBlock } from "@meditaur/domain";
import { useEffect, useRef, useState } from "react";

/**
 * Resolves the current block's pictures to blob URLs: its symbols', and the meditation's own —
 * the picture a Focus stage draws in the meditation's colour.
 *
 * The cache lives for the whole session, because a circuit revisits the same symbols, and the
 * URLs are revoked once, when the run screen unmounts.
 *
 * A picture that will not load is dropped rather than raised: the run screen is mid-session, and
 * a missing glyph must not end the session.
 */
export function useSymbolImageUrls(block: CompiledBlock | null): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});
  const wantedKey = [
    ...new Set(
      [
        ...(block?.symbolGroups ?? []).map((group) => group.imageAssetId),
        block?.representationAssetId ?? null,
      ].filter((id): id is string => Boolean(id)),
    ),
  ].join("|");

  useEffect(() => {
    let cancelled = false;
    for (const id of wantedKey ? wantedKey.split("|") : []) {
      if (urlsRef.current[id]) continue;
      void (async () => {
        try {
          const bytes = await app.getMediaBytes(id);
          if (!bytes || cancelled || urlsRef.current[id]) return;
          urlsRef.current = {
            ...urlsRef.current,
            [id]: URL.createObjectURL(new Blob([bytes])),
          };
          setUrls(urlsRef.current);
        } catch {
          /* an unreadable picture is not worth failing a session for */
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [wantedKey]);

  useEffect(
    () => () => {
      for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
      urlsRef.current = {};
    },
    [],
  );

  return urls;
}
