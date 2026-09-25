"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
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
  autoScrollForKind,
  sessionIsLive,
  type CompiledBlock,
  type PublicSessionState,
} from "@meditaur/domain";
import { Button, EYEBROW_CLASS, KeyHints, LatchButton, accentForMeditation } from "@meditaur/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { FocusVisuals } from "./FocusVisuals";
import { StageStrip, scrollsForStage } from "./StageStrip";
import {
  IntentionsTable,
  MeditationStrip,
  SymbolGallery,
  SymbolRail,
  blockLines,
} from "./SessionRegions";
import { drawnRegions, sessionLayout, sessionRegions } from "./session-regions";
import { progressIndex } from "./stage-progress";

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

/**
 * The Media Session API, or nothing.
 *
 * A browser global, not a dependency — the same tier as `navigator.wakeLock` —
 * and just as absent in the places that do not have it, so this reports the
 * absence rather than assuming the declaration.
 */
function mediaSession(): MediaSession | undefined {
  const api = navigator as unknown as { mediaSession?: MediaSession | null };
  return api.mediaSession ?? undefined;
}

/**
 * How long a run of arrow-key presses counts as one gesture.
 *
 * The owner's round 17: *"pressing it twice in 2 seconds"*, and the same window for
 * the back arrow's three. It is a wall-clock window rather than a timeout, because
 * nothing is deferred by it — the first press does its own job immediately, and the
 * window only decides what the *next* press means.
 *
 * The owner's round 20 shortened it to a second: *"for the right and left arrows when
 * pressed within a few seconds should change the meditation — reduce that timer to 1
 * second. If an arrow is pressed after a second, consider it a stage advancement not
 * a meditation advancement."* So a stage step is the default reading of an arrow, and
 * only a press that comes straight after another one means "next meditation".
 */
const ARROW_CHAIN_MS = 1000;

/**
 * The run screen's three regions — UI_DESIGN.md §2, the owner's round 15 §6.
 *
 * One meditation is active at a time: a **fixed** meditation panel, a symbol panel
 * that updates in place, and the intentions in one auto-scrolling column. The whole
 * screen is one viewport tall, so a session with five symbols cannot bury the
 * controls under a scroll, and only the intentions column scrolls — on its own,
 * inside its own card.
 */

/** A glyph for the run controls. Drawn rather than typed so it does not depend
 *  on a font that happens to carry the media symbols. `className` sizes it: the
 *  transport's wordless buttons take a larger one than a labelled button did. */
function Glyph({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`${className} shrink-0 fill-none stroke-current stroke-[1.5]`}
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
 * Resolves the current block's pictures to blob URLs: its symbols', and the
 * meditation's own — the picture a Focus stage draws in the meditation's colour
 * (the owner's round 20, item 5). The cache lives for the whole session, because a
 * circuit revisits the same symbols, and the URLs are revoked once, when the run
 * screen unmounts.
 *
 * A picture that will not load is dropped rather than raised: the run screen is
 * mid-session, and a missing glyph must not end the session.
 */
function useSymbolImageUrls(block: CompiledBlock | null): Record<string, string> {
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


/**
 * Whether the reader's system asks for less motion.
 *
 * The intentions column's scroll honours this by starting **off** (§6.3) — a reader
 * who has asked their machine for less motion has asked this app too — and the
 * stage's own switch is how they say otherwise. Read on mount and again whenever the
 * preference changes, because it can change mid-session.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
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
      blockRemainingMs: 0,
      blockIndex: 0,
      stageIndex: 0,
      stageCount: 0,
      stage: null,
      cycleIndex: 0,
      block: null,
      autoAdvance: true,
      alarmEnabled: false,
      cycleCount: 1,
      cycleUntilStopped: false,
      holdingAlarm: false,
    }),
  );
  const [ready, setReady] = useState(false);
  const [blocks, setBlocks] = useState<CompiledBlock[]>([]);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [planId, setPlanId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  /**
   * Why the session could not start — a name broad enough for all three reasons
   * it cannot. It held only the cross-tab lock's two cases until round 12, when
   * the third arrived: `Start` pressed before the engine has a snapshot, where
   * `SessionEngine.start()` fails with `session.notLoaded` and the `void start()`
   * handler swallowed it, so the reader saw nothing at all.
   */
  const [startError, setStartError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const {
    ready: sessionReady,
    userId: sessionUserId,
    workspaceId: sessionWorkspaceId,
    flags,
  } = useSession();
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const tabIdRef = useRef(crypto.randomUUID());
  /**
   * The compiled blocks, for the key handler.
   *
   * A ref rather than the state itself: the handler is registered once against the
   * engine and must not be torn down and rebuilt on every tick to see a new array —
   * the same reason the runner lock and the wake lock are read through refs.
   */
  const blocksRef = useRef<CompiledBlock[]>([]);
  // The lock's scope is read at call time: `releaseSession` also runs from the
  // unmount-only effect below, which would otherwise close over the first
  // render's (still empty) user id and leak the lock.
  const lockUserIdRef = useRef("");
  lockUserIdRef.current = sessionUserId ?? "";
  blocksRef.current = blocks;

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
          } else {
            // A stale or mistyped `/run/<id>`, or a snapshot the prune already
            // took. Without this the screen came up empty — an unloaded engine
            // and a `Start` that could only fail — and said nothing about why.
            setLoadError("This session is no longer on this device.");
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

  /**
   * Neither of a hidden tab's losses comes back on its own.
   *
   * The browser force-releases a screen wake lock the moment the document goes
   * hidden, so it has to be asked for again by hand on the way back — and only
   * while a session is actually live, which is when it matters that the screen
   * stays awake. And a hidden tab's timers are throttled or suspended outright,
   * so the engine can be sitting on an expiry that came due while nobody was
   * looking: `resync()` makes it read the clock now instead of whenever that
   * timer is finally allowed to run. `dropWakeLock` reads `wakeLockRef`, so the
   * closure this effect captured is still the live one.
   */
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (sessionIsLive(engine.getSnapshot().status)) {
        dropWakeLock();
        void requestWakeLock().then((sentinel) => {
          wakeLockRef.current = sentinel;
        });
      }
      engine.resync();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [engine]);

  /**
   * The lock screen is the one piece of a session that survives the screen going
   * off.
   *
   * Registering a media session also tells the browser this tab is legitimately
   * doing background audio rather than sitting idle, which is what stops some
   * Android browsers and iOS Safari suspending the `AudioContext` the moment it
   * is hidden.
   *
   * Nothing here plays through an `<audio>` element: the graph is Web Audio, so
   * every part of this is a claim the page makes rather than something the
   * browser can read off an element. `playbackState` is the one that matters
   * most — with no element to infer from, a session left at its default `none` is
   * one Android is entitled to show no controls for at all, which is what the
   * owner hit on a Galaxy S26 in round 11. The handlers are cleared, and the state
   * put back to `none`, when the session stops being live, so a finished session
   * leaves no lock-screen controls behind to press.
   */
  useEffect(() => {
    const session = mediaSession();
    if (!session) return;
    const clear = () => {
      for (const action of ["pause", "play", "stop"] as const) {
        session.setActionHandler(action, null);
      }
      session.metadata = null;
      session.playbackState = "none";
    };
    if (!sessionIsLive(state.status)) {
      clear();
      return;
    }
    if (typeof MediaMetadata !== "undefined") {
      session.metadata = new MediaMetadata({
        title: state.block?.meditationName ?? "Meditaur session",
        artist: "Meditaur",
      });
    }
    // `awaitingSkip` is paused from the lock screen's point of view: the alarm is
    // ringing over a block that has ended, and pressing play resumes it.
    session.playbackState = state.status === "running" ? "playing" : "paused";
    session.setActionHandler("pause", () => engine.pause());
    session.setActionHandler("play", () => void engine.resume());
    session.setActionHandler("stop", () => exitToPlanner());
    return clear;
  }, [engine, state.block?.meditationName, state.status]);

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

  /**
   * What the arrow keys do, and how many presses say what.
   *
   * The owner's round 17, quoted exactly, because the arithmetic is theirs:
   *
   * - **`→`** once is the *next stage*; twice inside two seconds is the *next
   *   meditation*.
   * - **`←`** once *resets this stage's timer*; twice inside two seconds is the
   *   *previous stage*; three times — *"doesn't matter how many stages exist in the
   *   meditation"* — is the *previous meditation in the circuit*.
   *
   * Every one of them goes through `engine.seek`, which is what makes the last part
   * of the ask true: *"Don't start the meditation though … If arrow keys are pressed,
   * don't start the session automatically."* A key lands on a stage, clears its clock
   * to the length it was set to — *"the clock again starts from the originally set
   * seeded mark (no resume)"* — and holds it, so `Space`/`Start` runs from there.
   *
   * Where a key has nowhere to go — `→` past the last stage of the last block, `←`
   * before the first of either — nothing happens at all. Wrapping a reader into a
   * block they did not ask for would be a worse answer than no answer.
   */
  const arrowChain = useRef<{ dir: "next" | "prev"; count: number; at: number }>({
    dir: "next",
    count: 0,
    at: 0,
  });
  const moveByArrow = useCallback(
    (dir: "next" | "prev") => {
      const now = performance.now();
      const chain = arrowChain.current;
      const count =
        chain.dir === dir && now - chain.at < ARROW_CHAIN_MS ? chain.count + 1 : 1;
      const current = engine.getSnapshot();
      const block = current.block;
      const remember = (n: number) => {
        arrowChain.current = { dir, count: n, at: now };
      };
      /** A meditation jump ends the run, so the press after it starts a new count. */
      const jumpBlock = (delta: number) => {
        arrowChain.current = { dir, count: 0, at: 0 };
        const next = current.blockIndex + delta;
        if (next < 0 || next > blocksRef.current.length - 1) return;
        engine.seek(next, 0);
      };
      const stepStage = (delta: number) => {
        remember(count);
        const next = current.stageIndex + delta;
        if (!block || next < 0 || next >= block.stages.length) return;
        engine.seek(current.blockIndex, next);
      };
      if (dir === "next") {
        if (count >= 2) jumpBlock(1);
        else stepStage(1);
        return;
      }
      if (count >= 3) {
        jumpBlock(-1);
        return;
      }
      if (count === 2) {
        stepStage(-1);
        return;
      }
      // One press of `←`: the stage's clock goes back to the length the reader set
      // and holds there. The position does not move, so this is not a jump and the
      // run is not ended.
      remember(1);
      engine.seek(current.blockIndex, current.stageIndex);
    },
    [engine],
  );

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
      if (event.code === "ArrowRight" || event.code === "ArrowLeft") {
        event.preventDefault();
        moveByArrow(event.code === "ArrowRight" ? "next" : "prev");
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
  }, [engine, moveByArrow, router]);

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
      setStartError("Still starting up. Try again in a moment.");
      return;
    }
    if (!claimRunnerLock(lockUserIdRef.current, tabIdRef.current)) {
      setStartError("A session is already running in another tab");
      return;
    }
    setStartError(null);
    dropWakeLock();
    wakeLockRef.current = await requestWakeLock();
    try {
      await engine.start();
      // From here the stage timers are a reading rather than a control (item 2), and
      // it stays that way for the rest of the screen's life however the engine's own
      // `status` moves — an arrow key holds the engine back at `loaded`.
      setStarted(true);
    } catch (err) {
      // The caller is `void start()`, so anything thrown here is a press that
      // does nothing at all. That is exactly what `session.notLoaded` did.
      setStartError(errorText(err, "Could not start the session"));
    }
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
   * The reader's length for the stage on screen.
   *
   * Three copies have to agree: the engine's (what is playing), the runner's
   * blocks (what the completion log sums), and the stored snapshot plus the plan
   * block (what a reload or the next session reads back).
   */
  const setStageDuration = (stageIndex: number, durationMs: number) => {
    engine.setStageDuration(durationMs, stageIndex);
    setBlocks((rows) =>
      rows.map((row, index) =>
        index === state.blockIndex
          ? {
              ...row,
              durationMs:
                row.durationMs +
                (durationMs - (row.stages[stageIndex]?.durationMs ?? 0)),
              stages: row.stages.map((stage, at) =>
                at === stageIndex ? { ...stage, durationMs } : stage,
              ),
            }
          : row,
      ),
    );
    const liveInstanceId = state.instanceId ?? instanceId;
    if (workspaceId && liveInstanceId) {
      void app.saveSessionStageDuration(
        workspaceId,
        liveInstanceId,
        state.blockIndex,
        stageIndex,
        durationMs,
      );
    }
  };

  /**
   * One of the stage's own switches, from the row beside its timer.
   *
   * The same three copies as the length above (engine, runner, stored snapshot and
   * plan block), and the same rule about which row is editable: before Start any of
   * them, afterwards only the one playing (§7).
   */
  const setStageFlag = (
    stageIndex: number,
    flag: "binaural" | "autoScroll",
    value: boolean,
  ) => {
    // Turning the scroll on by hand is the reader overruling a reduced-motion
    // setting, so it is remembered for the session (§6.3).
    if (flag === "autoScroll" && value) setScrollAsked(true);
    engine.setStageFlag(flag, value, stageIndex);
    setBlocks((rows) =>
      rows.map((row, index) =>
        index === state.blockIndex
          ? {
              ...row,
              stages: row.stages.map((stage, at) =>
                at === stageIndex ? { ...stage, [flag]: value } : stage,
              ),
            }
          : row,
      ),
    );
    const liveInstanceId = state.instanceId ?? instanceId;
    if (workspaceId && liveInstanceId) {
      void app.saveSessionStageFlag(
        workspaceId,
        liveInstanceId,
        state.blockIndex,
        stageIndex,
        flag,
        value,
      );
    }
  };

  // `state.block` has to be read before the early return below, so the picture
  // hook is called on every render in the same order.
  const block = state.block;
  const symbolImages = useSymbolImageUrls(block);
  /**
   * The lines the intentions column shows, for the stage that is on screen.
   *
   * Memoised because the column's own effect keys on it: a new array every render
   * would re-register the listener, tell the panel which symbol is on top, and start
   * that loop over again.
   */
  const stageKind = state.stage?.kind ?? null;
  const lines = useMemo(() => (block ? blockLines(block, stageKind) : []), [block, stageKind]);
  /**
   * The screen's regions, and the grid the drawn ones need.
   *
   * The owner's round 16, items 4 and 8: the screen arranges itself from what the
   * block actually has, so a region with nothing to say is not drawn and the room it
   * would have taken goes to the intentions. `session-regions.ts` holds the rule;
   * this is only where it is asked.
   */
  const regions = sessionRegions({
    meditationFacts: block?.meditationFacts,
    symbolGroups: block?.symbolGroups,
    stageKind: state.stage?.kind ?? null,
  });
  const drawn = drawnRegions(regions);
  const layout = sessionLayout(drawn);
  const draws = (id: string) => drawn.some((region) => region.id === id);
  /**
   * The stage the reader is looking at, before or during the session.
   *
   * The engine carries one only once a session is loaded, so before Start these
   * are the block's own stages and the one the screen is about to run. Without it
   * the footer's scroll latch had nothing to ask and simply was not drawn — a
   * switch that vanishes exactly when the reader is setting the session up.
   */
  const shownStage = state.stage ?? block?.stages[state.stageIndex] ?? block?.stages[0] ?? null;
  /**
   * What the intentions column last reported: which symbol's lines are on top, and
   * whether the column has anywhere left to travel.
   *
   * `index` is `null` when the meditation's own lines are on top, which means the
   * block's first symbol is in play (§6.2). `atEnd` is the owner's round 17, item 7:
   * a column that has stopped moving cannot say which symbol the reader is with, so
   * the clock takes over (see `currentGroupIndex`).
   */
  const [topGroup, setTopGroup] = useState<{ index: number | null; atEnd: boolean }>({
    index: null,
    atEnd: false,
  });
  /**
   * The column's report, flattened to one stable callback.
   *
   * A state setter cannot take two arguments — the second is dropped — and a fresh
   * lambda every render would re-register the column's scroll listener on every tick.
   * Returning the same object when nothing changed is what keeps that listener, and
   * this screen's render, still.
   */
  const onTopGroup = useCallback((index: number | null, atEnd: boolean) => {
    setTopGroup((current) =>
      current.index === index && current.atEnd === atEnd ? current : { index, atEnd },
    );
  }, []);
  /**
   * Whether the session has begun, which is when a stage's timer stops taking edits
   * (the owner's round 17, item 2).
   *
   * Kept here rather than read off the engine's `status`, because a stage the reader
   * picks — or an arrow key lands on — holds the engine back at `loaded`, and the
   * wheels must not become editable again half way through a session.
   */
  const [started, setStarted] = useState(false);
  /**
   * A reader whose system asks for reduced motion gets the scroll **off** even when
   * the stage's own switch is on, until they say otherwise in this session (§6.3):
   * the switch is theirs, so turning it on is what overrides the preference.
   */
  const reduceMotion = usePrefersReducedMotion();
  const [scrollAsked, setScrollAsked] = useState(false);
  /**
   * Whether the main region holds the symbols themselves, or the lines to read.
   *
   * The owner's round 17, item 4: *"The symbol stage doesn't need to show me the
   * intentions, only symbols."*
   */
  const showsSymbols = stageKind === "symbols";
  /**
   * Which symbol is in play, so the panel beside the main region updates in place.
   *
   * Three answers, in order of who knows best:
   *
   * - a **symbols** stage has no column to follow — its region is a sheet of pictures
   *   — so the clock decides;
   * - a column that has run out of travel cannot say any more either: the owner's
   *   round 17, item 7, *"When the scroll ends … it should be updated with time even
   *   though the scrolling stops"*;
   * - otherwise the column's own top line decides, which is what makes the panel
   *   follow a reader who scrolled by hand (§6.2, §6.3).
   *
   * **Above the `!ready` return, with every other hook**: a `useMemo` after an early
   * return is a hook order that changes between the first render and the second, and
   * React throws on it — a screen that typechecks, lints and passes every unit test
   * and then fails as "Rendered more hooks than during the previous render".
   */
  const currentGroupIndex = useMemo(() => {
    const groups = block?.symbolGroups ?? [];
    if (groups.length === 0) return 0;
    if (showsSymbols || topGroup.atEnd) {
      const count = showsSymbols ? groups.length : lines.length;
      const at = progressIndex(count, state.remainingMs, shownStage?.durationMs ?? 0);
      // Past the end of a list is not a thing, and a line of the meditation's own
      // belongs to no symbol: both answer with the block's first symbol.
      return showsSymbols ? at : (lines[at]?.groupIndex ?? 0);
    }
    return topGroup.index ?? 0;
  }, [block, lines, showsSymbols, shownStage, state.remainingMs, topGroup]);

  if (!ready) {
    return loadError ? (
      <p className="text-lg text-destructive">{loadError}</p>
    ) : (
      <p className="text-lg text-muted">Loading session…</p>
    );
  }

  const live = sessionIsLive(state.status);
  // The accent is the **meditation's**, not its name's (the owner's round 24, `P2 · 47`):
  // `accentForMeditation` honours the reader's own `Meditation.colour` override, which
  // `accentForName` — what this screen used — could not see. `CompiledBlock.colour` is the
  // colour the block leads with, stamped at compile time beside the picture a Focus stage
  // draws, so the transport and the artwork always agree.
  const accent = accentForMeditation({
    name: block?.meditationName ?? "",
    colour: block?.colour ?? null,
  });
  // The chakra's own colour over the whole screen, or `null` for the app's palette — the
  // `chakra_immersion` flag (`P2 · 44`). The **key** rather than the hex: the wash is a set
  // of token overrides, one rule per chakra (`globals.css`), so the surfaces take the hue
  // too and every control follows without knowing a session is running. A reader's custom
  // hex and a point's neutral accent have no rule, so they keep the ink accents and the
  // app's own ground.
  const immersion = flags.chakra_immersion ? accent.key : null;
  // §6.3: only an intentions or affirmations stage scrolls, and only when that
  // stage's own switch is on — with the reader's own press overruling a
  // reduced-motion preference for this session. And only for an account whose
  // `auto_scroll` flag is on (`P0 · 35`, slice 35e): the gate is on this derivation
  // rather than on the stored stage, so no plan is edited to achieve a still column.
  const stageScrolls =
    flags.auto_scroll &&
    Boolean(block && stageKind && autoScrollForKind(stageKind) && state.stage?.autoScroll);
  const scrollHeld = stageScrolls && reduceMotion && !scrollAsked;
  const scrollEnabled = stageScrolls && !scrollHeld;
  // A single-cycle session has no cycle to speak of, so it says nothing rather
  // than a `cycle 1` that never becomes a `cycle 2` (the owner's round 5, item
  // 2: "the cycle 1 and 2:00 text is still present").
  const cycleLabel =
    state.cycleCount > 1 || state.cycleUntilStopped
      ? `cycle ${state.cycleIndex + 1}${state.cycleCount > 1 ? ` of ${state.cycleCount}` : ""}`
      : "";
  // Whether `Auto-advance` can ever do anything in this session. A one-block
  // session that does not repeat has nothing to queue next, so the latch would
  // only be a switch that does nothing — the owner's round 11: "auto-advance
  // doesn't make any sense here, as nothing will ever be queued next". Asked of
  // the whole session rather than of the block on screen, so that it does not
  // blink out of the footer as a longer plan reaches its last block.
  const sessionCanAdvance =
    blocks.length > 1 || state.cycleUntilStopped || state.cycleCount > 1;
  // Only the keys that do something right now, and only the two the owner asked for
  // (round 19, item 4: *"all the instructions that you have coded at the bottom are
  // taking up more space than I can offer, only retain Esc and Space"*). The arrow
  // keys still step a stage and a meditation — round 17's item 9 — they are simply no
  // longer advertised down here.
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
    // The legend is the control (the owner's round 20): the run screen's only way
    // out of the top-left used to be a `Back` button that did exactly what this
    // does, so it is gone and this is pressable.
    { keys: ["Esc"], label: "end the session", onPress: exitToPlanner },
  ].filter((hint) => hint.label !== "");
  // Whether the whole meditation can be put back to its first stage from here.
  // `engine.seek` refuses while the alarm holds — the block on screen is over, and
  // `Skip`/`Stop` are the honest presses — and once the walk has finished there is
  // nowhere to hold, so the control is drawn in neither state. The app's rule is the
  // one the disabled `Start` follows: a control that cannot act is not drawn.
  const canRestart = block !== null && !state.holdingAlarm && state.status !== "completed";

  return (
    // Exactly one viewport tall, and the page itself does not scroll: the
    // intentions take what is left and scroll inside their own card, so the
    // controls never leave the bottom edge however many symbols a block has.
    // `run/layout.tsx` is the box this fills.
    //
    // `bg-bg` is load-bearing rather than decoration: the wash overrides the tokens for
    // this subtree, and without a background of its own the shell would show the body's
    // root tone behind it — the panels tinted and the page not.
    <main
      data-chakra={immersion}
      className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 overflow-hidden bg-bg px-4 py-4"
    >
      <header className="flex shrink-0 flex-col gap-2">
        <div className="flex items-center gap-3">
          {/* No `Back` button: the footer's `Esc end the session` legend is the
              control now (the owner's round 20), so the header starts with the
              meditation it is showing. */}
          {/* The meditation over its type — the pair a plan card's handle shows — and
              *not* a box of its own: the owner's round 16, item 0, is that the panel
              that repeated the name was a box with nothing in it. What the block
              carries beyond that pair is the top strip below (`MeditationStrip`),
              which is the ask round 15 recorded. */}
          {block ? (
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-lg leading-tight">
                {block.meditationName ?? "This block"}
              </h1>
              {block.meditationTypeName || cycleLabel ? (
                <p className={`${EYEBROW_CLASS} truncate text-xs`}>
                  {block.meditationTypeName ?? ""}
                  {cycleLabel ? `${block.meditationTypeName ? " · " : ""}${cycleLabel}` : ""}
                </p>
              ) : null}
            </div>
          ) : (
            <p className={`${EYEBROW_CLASS} text-xs`}>{cycleLabel}</p>
          )}
        </div>
        {/* The stages as one row, before Start and during the session (item 3). The
            stage's own switches are no longer here: binaural is the mark in its
            name, and the scroll switch is in the footer with the alarm (items 0.2
            and 1).

            This is also where the clock lives now: the owner's round 17 replaced the
            big timer at the top of the page with the stages' own wheels, which count
            down where the reader set them up. */}
        {block ? (
          <StageStrip
            stages={block.stages}
            activeIndex={state.stageIndex}
            running={state.status === "running"}
            started={started}
            remainingMs={state.remainingMs}
            binauralOn={flags.binaural}
            onDuration={setStageDuration}
            onBinaural={(index, value) => setStageFlag(index, "binaural", value)}
            onSelect={(index) => engine.seek(state.blockIndex, index)}
          />
        ) : null}
      </header>
      {block ? (
        // The regions, placed by the layout the drawn set needs: a rail only when
        // there is a symbol to show, a top strip only when the meditation has a value
        // in one of the plan's columns, and the intentions always — taking whatever
        // the other two did not (items 4 and 8).
        <div
          data-session-regions
          className="grid min-h-0 flex-1 gap-3 overflow-hidden"
          style={{
            gridTemplateAreas: layout.areas.map((row) => `"${row}"`).join(" "),
            gridTemplateColumns: layout.columns,
            gridTemplateRows: layout.rows,
          }}
        >
          {draws("meditation") ? (
            <div data-region="meditation" style={{ gridArea: "top" }} className="flex min-h-0 flex-col">
              <MeditationStrip facts={block.meditationFacts ?? []} />
            </div>
          ) : null}
          {draws("symbol") ? (
            <div data-region="symbol" style={{ gridArea: "rail" }} className="flex min-h-0">
              <SymbolRail
                group={block.symbolGroups?.[currentGroupIndex] ?? block.symbolGroups?.[0] ?? null}
                imageUrl={
                  symbolImages[
                    (block.symbolGroups?.[currentGroupIndex] ?? block.symbolGroups?.[0])
                      ?.imageAssetId ?? ""
                  ] ?? null
                }
              />
            </div>
          ) : null}
          {/* The main region is the stage's own content (the owner's round 17, item
              4): a `symbols` stage shows the block's symbols as a sheet, a `focus`
              stage holds its space and draws nothing yet, and every other stage shows
              the lines it reads. */}
          <div
            data-region={
              draws("symbols") ? "symbols" : draws("focus") ? "focus" : "intentions"
            }
            style={{ gridArea: "main" }}
            className="flex min-h-0"
          >
            {showsSymbols ? (
              <SymbolGallery
                groups={block.symbolGroups ?? []}
                currentIndex={currentGroupIndex}
                imageUrls={symbolImages}
              />
            ) : draws("focus") ? (
              // The owner's round 20, item 5, built now: the meditation's own
              // picture in its colour, and the block's symbols breathing in the same one,
              // filling the space the intentions table fills on every other stage. Before
              // this it drew nothing at all, which is what the round asked for while the
              // artwork did not exist.
              <FocusVisuals
                name={block?.meditationName ?? null}
                colour={block?.colour ?? null}
                representationUrl={
                  block?.representationAssetId
                    ? (symbolImages[block.representationAssetId] ?? null)
                    : null
                }
                groups={block?.symbolGroups ?? []}
                currentIndex={currentGroupIndex}
                imageUrls={symbolImages}
                reduceMotion={reduceMotion}
              />
            ) : (
              <IntentionsTable
                title={stageKind === "affirmations" ? "Affirmations" : "Intentions"}
                lines={lines}
                enabled={scrollEnabled}
                held={scrollHeld}
                running={state.status === "running"}
                remainingMs={state.remainingMs}
                stageKey={`${state.blockIndex}:${state.stageIndex}`}
                onTopGroup={onTopGroup}
              />
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted">No block yet.</p>
      )}
      {startError ? <p className="text-lg text-destructive">{startError}</p> : null}
      {/* `loadError` is also rendered by the `!ready` branch above, which returns
          early; once the screen is up, a load that found nothing has no other
          place to say so, and the disabled `Start` below relies on it. */}
      {loadError ? <p className="text-lg text-destructive">{loadError}</p> : null}
      <footer className="z-10 mt-auto flex shrink-0 flex-col gap-3 border-t border-line bg-bg/95 py-3 backdrop-blur sm:flex-row sm:items-center sm:gap-4">
        <div className="flex flex-wrap items-center gap-2">
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
            // Unavailable until the engine really has a session. A `Start` that
            // can only fail is worse than one that is visibly not ready, and the
            // line above it says which of the two states this is.
            <Button
              tier="primary"
              size="lg"
              accent={accent}
              disabled={state.status !== "loaded"}
              onClick={() => void start()}
            >
              Start
            </Button>
          ) : (
            <>
              {/* No Pause while the alarm holds: the block is over, and the only
                  honest presses are the ones beside it — `Skip` past the hold or
                  `Stop` the session. A control that cannot act is not drawn,
                  which is the same rule the disabled `Start` follows above. */}
              {state.holdingAlarm ? null : (
                <Button
                  size="xl"
                  iconOnly
                  aria-label={state.status === "paused" ? "Resume" : "Pause"}
                  title={
                    state.status === "paused" ? "Resume the session" : "Pause the session"
                  }
                  onClick={() =>
                    state.status === "paused" ? void engine.resume() : engine.pause()
                  }
                >
                  <Glyph
                    className="h-6 w-6"
                    path={state.status === "paused" ? GLYPH.resume : GLYPH.pause}
                  />
                </Button>
              )}
              <Button
                size="xl"
                iconOnly
                aria-label="Skip"
                title="Skip to the next stage"
                onClick={() => engine.skipToNext()}
              >
                <Glyph className="h-6 w-6" path={GLYPH.skip} />
              </Button>
              <Button
                size="xl"
                iconOnly
                aria-label="Stop"
                title="End the session"
                onClick={exitToPlanner}
              >
                <Glyph className="h-6 w-6" path={GLYPH.stop} />
              </Button>
            </>
          )}
          {/* The whole meditation, as one press — the owner's round 17, *"Another
              restart button for the entire meditation"* — now standing with the rest
              of the transport (the owner's round 19, item 6: *"restart should be just
              the circular arrow besides these buttons"*). It is the same move the
              strip's `↺` makes for one stage, one level up, and it is always the same
              square as its neighbours. */}
          {canRestart ? (
            <Button
              size="xl"
              iconOnly
              aria-label="Restart meditation"
              title="Restart this meditation from its first stage"
              onClick={() => engine.seek(state.blockIndex, 0)}
            >
              <span aria-hidden="true" className="text-2xl leading-none">
                ↺
              </span>
            </Button>
          ) : null}
        </div>
        <div className="hidden lg:block">
          <KeyHints hints={runHints} />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {/* The three session-wide latches, together (the owner's round 16, item
              1): the alarm is session-level like `Auto-advance` and holds for this
              session, and `Scroll` is the stage's own flag shown where the reader is
              — drawn only for a stage that scrolls, because a switch beside content
              that never moves is the height item 1 gave back.

              They are the compact `sm` switch with the short names the owner asked
              for in round 19, item 5: *"need to be of the same size, smaller, give
              them smaller names so that they take up less space"*. `Auto-scroll` and
              `Auto-advance` shorten to `Scroll` and `Advance` — the switch is in the
              session's own footer, and there is nothing else for either word to be
              about. */}
          <LatchButton
            size="sm"
            label="Alarm"
            pressed={state.alarmEnabled}
            onChange={(v) => engine.setAlarmEnabled(v)}
          />
          {flags.auto_scroll && scrollsForStage(shownStage) ? (
            <LatchButton
              size="sm"
              label="Scroll"
              pressed={Boolean(shownStage?.autoScroll)}
              onChange={(v) => setStageFlag(state.stageIndex, "autoScroll", v)}
            />
          ) : null}
          {sessionCanAdvance ? (
            <LatchButton
              size="sm"
              label="Advance"
              pressed={state.autoAdvance}
              onChange={(v) => engine.setAutoAdvance(v)}
            />
          ) : null}
        </div>
      </footer>
    </main>
  );
}
