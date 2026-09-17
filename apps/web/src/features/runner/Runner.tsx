"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { DurationSteppers } from "@/features/DurationSteppers";
import {
  claimRunnerLock,
  heartbeatRunnerLock,
  releaseRunnerLock,
  runnerLockHeartbeatMs,
} from "@/lib/engine-lock";
import { errorText } from "@/lib/error-text";
import { speakIntentions, stopSpeech } from "@/lib/tts";
import { getEngine, getMixer } from "@/runtime";
import {
  sessionIsLive,
  type CompiledBlock,
  type CompiledSymbolGroup,
  type PublicSessionState,
} from "@meditaur/domain";
import {
  Button,
  EYEBROW_CLASS,
  KeyHints,
  LatchButton,
  accentForName,
  type Accent,
} from "@meditaur/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type WakeLockSentinel = { release: () => Promise<void> };

async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    const api = (
      navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
      }
    ).wakeLock;
    return (await api?.request("screen")) ?? null;
  } catch {
    return null;
  }
}

async function releaseWakeLock(sentinel: WakeLockSentinel | null): Promise<void> {
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    /* already released */
  }
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * The run screen's intentions table — UI_DESIGN.md §2.
 *
 * One focus point is active at a time, but the space they occupy flips: the
 * clock shrinks to a compact always-visible element and the intentions take
 * what is left, as a real table instead of a bulleted list. Nothing here
 * changes the compile pipeline — `focusIntentions` and `symbolGroups` already
 * carry exactly this data, so a library edit shows up on the next compile.
 */
const MISSING = "-";

/** A glyph for the run controls. Drawn rather than typed so it does not depend
 *  on a font that happens to carry the media symbols. */
function Glyph({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 fill-none stroke-current stroke-[1.5]"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

const GLYPH = {
  pause: "M6 3.5v9M10 3.5v9",
  resume: "M5.5 3.5 12 8l-6.5 4.5z",
  skip: "M4.5 3.5 11 8l-6.5 4.5zM12.5 3.5v9",
  stop: "M4.5 4.5h7v7h-7z",
};

/**
 * Resolves the current block's symbol pictures to blob URLs. The cache lives
 * for the whole session, because a circuit revisits the same symbols, and the
 * URLs are revoked once, when the run screen unmounts.
 *
 * A picture that will not load is dropped rather than raised: the run screen is
 * mid-session, and a missing glyph must not end the session.
 */
function useSymbolImageUrls(block: CompiledBlock | null): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});
  const wantedKey = [
    ...new Set(
      (block?.symbolGroups ?? [])
        .map((group) => group.imageAssetId)
        .filter((id): id is string => Boolean(id)),
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

/**
 * The symbol identity — its picture and its name — is one cell spanning that
 * symbol's intention rows. The picture comes from `imageAssetId` on the
 * compiled group; a symbol without one keeps the name and the accent dot.
 */
function SymbolCell({
  group,
  accent,
  imageUrl,
}: {
  group: CompiledSymbolGroup;
  accent: Accent;
  imageUrl: string | null;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${group.name} symbol`}
            className="mr-1 h-14 w-14 shrink-0 rounded-2xl bg-surface-raised/80 object-contain"
          />
        ) : null}
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 shrink-0 rounded-full bg-current align-middle ${accent.text}`}
        />
        <h3 className="inline align-middle text-xl">{group.name}</h3>
      </div>
      <p className="mt-1 text-sm text-muted">{group.description || MISSING}</p>
      <p className="mt-1 text-xs text-muted">{group.usage || MISSING}</p>
    </>
  );
}

function IntentionsTable({
  block,
  symbolImages,
}: {
  block: CompiledBlock;
  symbolImages: Record<string, string>;
}) {
  const accent = accentForName(block.focusPointName);
  const focusLines = block.focusIntentions ?? [];
  const groups = block.symbolGroups ?? [];
  // Sessions compiled before symbol grouping carry plain intentions only.
  const legacy =
    groups.length === 0 && focusLines.length === 0 ? (block.intentions ?? []) : [];

  return (
    <section className="w-full" aria-labelledby="run-intentions">
      <h2 id="run-intentions" className={`${EYEBROW_CLASS} text-sm`}>
        Intentions
      </h2>
      <div className="mt-2 rounded-2xl border border-line bg-surface px-4 py-2">
        {focusLines.length > 0 ? (
          // Focus-level intentions belong to the chakra itself, so they have
          // no symbol column at all.
          <table className="w-full table-fixed border-collapse text-left">
            <tbody>
              {focusLines.map((text, index) => (
                <tr key={`focus-${index}-${text}`} className="border-t border-line first:border-t-0">
                  <td className="py-3 text-lg">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {groups.length > 0 ? (
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className={`${EYEBROW_CLASS} text-xs`}>
                <th scope="col" className="w-2/5 py-2 pr-4 text-left sm:w-1/3 landscape:w-1/4">
                  Symbol
                </th>
                <th scope="col" className="py-2 text-left">
                  Intention
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) =>
                (group.intentions.length > 0 ? group.intentions : [null]).map((text, index) => (
                  <tr
                    key={`${group.name}-${index}`}
                    className={index === 0 ? "border-t border-line" : undefined}
                  >
                    {index === 0 ? (
                      <th
                        scope="rowgroup"
                        rowSpan={Math.max(1, group.intentions.length)}
                        className="align-top py-3 pr-4 font-normal landscape:align-middle"
                      >
                        <SymbolCell
                          group={group}
                          accent={accent}
                          imageUrl={symbolImages[group.imageAssetId ?? ""] ?? null}
                        />
                      </th>
                    ) : null}
                    <td className="border-t border-line/50 py-3 align-top text-lg first:border-t-0">
                      {text ?? MISSING}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        ) : null}
        {legacy.length > 0 ? (
          <table className="w-full table-fixed border-collapse text-left">
            <tbody>
              {legacy.map((text, index) => (
                <tr key={`legacy-${index}-${text}`} className="border-t border-line first:border-t-0">
                  <td className="py-3 text-lg">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {focusLines.length === 0 && groups.length === 0 && legacy.length === 0 ? (
          <p className="py-3 text-muted">No intentions for this block.</p>
        ) : null}
      </div>
    </section>
  );
}

export function Runner({ instanceId }: { instanceId: string }) {
  const router = useRouter();
  const engine = getEngine();
  const state = useSyncExternalStore(
    (cb) => engine.subscribeStore(cb),
    () => engine.getSnapshot(),
    (): PublicSessionState => ({
      status: "idle",
      instanceId: null,
      remainingMs: 0,
      blockIndex: 0,
      cycleIndex: 0,
      block: null,
      autoAdvance: true,
      cycleCount: 1,
      cycleUntilStopped: false,
    }),
  );
  const [ready, setReady] = useState(false);
  const [blocks, setBlocks] = useState<CompiledBlock[]>([]);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [planId, setPlanId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [lockError, setLockError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const {
    ready: sessionReady,
    userId: sessionUserId,
    workspaceId: sessionWorkspaceId,
  } = useSession();
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const tabIdRef = useRef(crypto.randomUUID());
  // The lock's scope is read at call time: `releaseSession` also runs from the
  // unmount-only effect below, which would otherwise close over the first
  // render's (still empty) user id and leak the lock.
  const lockUserIdRef = useRef("");
  lockUserIdRef.current = sessionUserId ?? "";

  const dropWakeLock = () => {
    void releaseWakeLock(wakeLockRef.current);
    wakeLockRef.current = null;
  };

  const releaseSession = () => {
    dropWakeLock();
    releaseRunnerLock(lockUserIdRef.current, tabIdRef.current);
  };

  useEffect(() => {
    if (!sessionReady || !sessionUserId || !sessionWorkspaceId) return;
    void (async () => {
      try {
        setWorkspaceId(sessionWorkspaceId);
        const prefs = await app.getPreferences(sessionUserId);
        setTtsEnabled(Boolean(prefs?.ttsEnabled));
        getMixer("runner").setMasterVolume(prefs?.masterVolume ?? 0.7);
        getMixer("runner").setAlarmVolume(prefs?.alarmVolume ?? 0.6);
        const current = engine.getSnapshot();
        if (
          sessionIsLive(current.status) &&
          current.instanceId &&
          current.instanceId !== instanceId
        ) {
          router.replace(`/run/${current.instanceId}`);
          return;
        }
        if (current.status === "idle" || current.status === "completed") {
          const row = await app.getSnapshot(sessionWorkspaceId, instanceId);
          if (row) {
            engine.load(row);
            setBlocks(row.blocks);
            setPlanId(row.planId);
          }
        } else {
          const row = await app.getSnapshot(
            sessionWorkspaceId,
            current.instanceId ?? instanceId,
          );
          if (row) {
            setBlocks(row.blocks);
            setPlanId(row.planId);
          }
        }
        setReady(true);
      } catch (err) {
        setLoadError(errorText(err, "Could not load the session"));
      }
    })();
  }, [sessionReady, sessionUserId, sessionWorkspaceId, engine, instanceId, router]);

  useEffect(() => {
    return () => {
      releaseSession();
    };
  }, []);

  useEffect(() => {
    return engine.subscribe((event) => {
      if (event.type === "blockStart" && ttsEnabled) {
        speakIntentions(event.block.intentions);
      }
      if (event.type === "completed") {
        stopSpeech();
        releaseSession();
        void app.recordSessionCompletion({
          workspaceId,
          planId,
          blockCount: blocks.length,
          totalDurationMs: blocks.reduce((sum, b) => sum + b.durationMs, 0),
        });
      }
    });
  }, [blocks, engine, planId, ttsEnabled, workspaceId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        const status = engine.getSnapshot().status;
        if (status === "loaded" || status === "idle") {
          void start();
        } else if (status === "paused") {
          void engine.resume();
        } else if (status === "running") {
          engine.pause();
        }
        return;
      }
      if (event.code === "ArrowRight") {
        event.preventDefault();
        engine.skipToNext();
        return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        stopSpeech();
        releaseSession();
        engine.stop();
        router.push("/plan");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, router]);

  useEffect(() => {
    if (state.status !== "running" || !sessionUserId) return;
    const tabId = tabIdRef.current;
    heartbeatRunnerLock(lockUserIdRef.current, tabId);
    const timer = window.setInterval(
      () => heartbeatRunnerLock(lockUserIdRef.current, tabId),
      runnerLockHeartbeatMs(),
    );
    return () => window.clearInterval(timer);
  }, [state.status, sessionUserId]);

  const start = async () => {
    if (!lockUserIdRef.current) {
      setLockError("Still starting up. Try again in a moment.");
      return;
    }
    if (!claimRunnerLock(lockUserIdRef.current, tabIdRef.current)) {
      setLockError("A session is already running in another tab");
      return;
    }
    setLockError(null);
    dropWakeLock();
    wakeLockRef.current = await requestWakeLock();
    await engine.start();
  };

  /** Leaving the run screen always gives the session up: the engine, the
   *  wake lock, and the cross-tab lock go together. */
  const exitToPlanner = () => {
    stopSpeech();
    releaseSession();
    engine.stop();
    router.push("/plan");
  };

  /**
   * The reader's length for the block on screen.
   *
   * Three copies have to agree: the engine's (what is playing), the runner's
   * blocks (what the completion log sums), and the stored snapshot (what a
   * reload or a second tab reads).
   */
  const setBlockDuration = (durationMs: number) => {
    engine.setBlockDuration(durationMs);
    setBlocks((rows) =>
      rows.map((row, index) => (index === state.blockIndex ? { ...row, durationMs } : row)),
    );
    const liveInstanceId = state.instanceId ?? instanceId;
    if (workspaceId && liveInstanceId) {
      void app.saveSessionBlockDuration(workspaceId, liveInstanceId, state.blockIndex, durationMs);
    }
  };

  // `state.block` has to be read before the early return below, so the picture
  // hook is called on every render in the same order.
  const block = state.block;
  const symbolImages = useSymbolImageUrls(block);

  if (!ready) {
    return loadError ? (
      <p className="text-lg text-destructive">{loadError}</p>
    ) : (
      <p className="text-lg text-muted">Loading session…</p>
    );
  }

  const table = block?.table;
  const live = sessionIsLive(state.status);
  const accent = accentForName(block?.focusPointName ?? null);
  // A single-cycle session has no cycle to speak of, so it says nothing rather
  // than a `cycle 1` that never becomes a `cycle 2` (the owner's round 5, item
  // 2: "the cycle 1 and 2:00 text is still present").
  const cycleLabel =
    state.cycleCount > 1 || state.cycleUntilStopped
      ? `cycle ${state.cycleIndex + 1}${state.cycleCount > 1 ? ` of ${state.cycleCount}` : ""}`
      : "";
  // Only the keys that do something right now: `→` skips nothing before the
  // first Start, and a legend that promises it is what the owner reported as a
  // button that does not work.
  const runHints = [
    {
      keys: ["Space"],
      label:
        state.status === "running"
          ? "pause"
          : state.status === "paused"
            ? "resume"
            : state.status === "loaded"
              ? "start"
              : "",
    },
    ...(state.status === "running" || state.status === "awaitingSkip"
      ? [{ keys: ["→"], label: "skip to the next block" }]
      : []),
    { keys: ["Esc"], label: "end the session" },
  ].filter((hint) => hint.label !== "");

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col gap-4 px-4 py-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          tier="tertiary"
          size="sm"
          onClick={exitToPlanner}
          title="Back to the planner — this ends the session"
        >
          Back
        </Button>
        <p className={`${EYEBROW_CLASS} order-last w-full sm:order-none sm:w-auto`}>
          {block?.focusPointName ?? "Cool-off"}
          {cycleLabel ? ` · ${cycleLabel}` : ""}
        </p>
        {state.status === "loaded" ? (
          // Before the first Start, the clock *is* the block's length, so it is
          // the length control: the one-tap focus session used to open on a
          // frozen `2:00` with nowhere to change it (owner's round 5, item 2).
          <div className="ml-auto flex flex-col items-center gap-1">
            <span className={`${EYEBROW_CLASS} text-xs`}>Length of this block</span>
            <DurationSteppers
              durationMs={block?.durationMs ?? 0}
              onChange={setBlockDuration}
              size="sm"
            />
          </div>
        ) : (
          <p className={`ml-auto text-3xl font-medium tabular-nums ${accent.text}`}>
            {formatMs(state.remainingMs)}
          </p>
        )}
      </header>
      {block ? (
        <IntentionsTable block={block} symbolImages={symbolImages} />
      ) : (
        <p className="text-muted">No block yet.</p>
      )}
      {table ? (
        <section className="w-full" aria-labelledby="run-view">
          <h2 id="run-view" className={`${EYEBROW_CLASS} text-sm`}>
            {table.viewName}
          </h2>
          <div className="mt-2 overflow-x-auto rounded-2xl border border-line bg-surface p-4">
            <table className="w-full text-left text-lg">
              <thead>
                <tr>
                  {table.columns.map((col) => (
                    <th key={col.key} className="px-2 py-2 font-medium text-muted">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-t border-line">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {lockError ? <p className="text-lg text-destructive">{lockError}</p> : null}
      <footer className="sticky bottom-0 z-10 mt-auto flex flex-col gap-3 border-t border-line bg-bg/95 py-3 backdrop-blur sm:flex-row sm:items-center sm:gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {state.status === "completed" ? (
            <Button
              tier="primary"
              size="lg"
              accent={accent}
              onClick={() => router.push("/plan")}
            >
              Start another session
            </Button>
          ) : !live ? (
            <Button tier="primary" size="lg" accent={accent} onClick={() => void start()}>
              Start
            </Button>
          ) : (
            <>
              <Button
                size="xl"
                onClick={() =>
                  state.status === "paused" ? void engine.resume() : engine.pause()
                }
              >
                <Glyph path={state.status === "paused" ? GLYPH.resume : GLYPH.pause} />
                {state.status === "paused" ? "Resume" : "Pause"}
              </Button>
              <Button size="xl" onClick={() => engine.skipToNext()}>
                <Glyph path={GLYPH.skip} />
                Skip
              </Button>
              <Button size="xl" onClick={exitToPlanner}>
                <Glyph path={GLYPH.stop} />
                Stop
              </Button>
            </>
          )}
        </div>
        <div className="hidden lg:block">
          <KeyHints hints={runHints} />
        </div>
        <div className="w-full sm:ml-auto sm:w-72">
          <LatchButton
            label="Auto-advance"
            pressed={state.autoAdvance}
            onChange={(v) => engine.setAutoAdvance(v)}
          />
        </div>
      </footer>
    </main>
  );
}
