"use client";

import { DurationSteppers } from "@/features/DurationSteppers";
import { EYEBROW_CLASS } from "@meditaur/ui";
import { autoScrollForKind, binauralForKind, type CompiledStage } from "@meditaur/domain";

/**
 * The block's stages, as one row.
 *
 * The owner's round 16, item 3: *"arrange the 3 stages at the top horizontally along
 * with their timers … so that the real-estate on that page is completely utilized
 * displaying intentions."* It used to be a stack of full-width rows — label, wheels,
 * two switches each — which is most of a chakra's vertical budget spent before the
 * reader has read a line.
 *
 * The strip is the same row before Start and during the session; the stage that is
 * playing is the one marked `data-active`, so the reader can see where they are in
 * the block without a second component.
 *
 * The owner's round 17 moved three things here, and they are one idea — the strip is
 * a **control for the session**, not a form:
 *
 * - **The wheels are the clock.** They show what each stage has left, decrementing as
 *   the block runs, and they stop taking edits once the session has started:
 *   *"rather than the timer on top of the page, I would want to see the actual wheels
 *   for the 3 stages decrementing automatically (once the session starts, these can
 *   become read-only … and display the decreasing time in the same place)."* Before
 *   Start they are the wheels they have always been, which is why nothing moves when
 *   the session begins.
 * - **A stage is pickable.** Pressing a stage's name highlights it and holds the
 *   session there, so `Start`/`Space` runs *from that stage onwards* — *"clicking on
 *   the stage highlights it, and should be able to press Space or Start button to
 *   start from that stage onwards."*
 * - **A stage restarts.** The small `↺` on the stage's own line puts that stage back
 *   to the length it was set to and holds it there. The whole meditation's restart
 *   used to sit beside the strip; it is a transport control, so it now stands with
 *   `Pause`/`Skip`/`Stop` in the footer (the owner's round 19, item 3: *"the restart
 *   button for whole meditation restart is for the complete meditation, so it stays
 *   on the bottom"*).
 *
 * The owner's round 19, item 2, is the card's **height**: *"The height of the stage
 * cards determines how much space the main screen - intentions gets. So it is
 * imperative that we reduce the height. The wheels can stay as they are, but the rest
 * of it should take less height which could be accomplished by making them
 * horizontally wider instead of more high."* So everything that is not the wheels —
 * the binaural mark, the stage's name, its own `↺` — sits on one line **beside** them
 * rather than above and below, and the `Minutes`/`Seconds` captions are off. A card is
 * now as tall as its wheel window and nothing more.
 *
 * Binaural is **in the stage's name** (item 0.2): a `♪` mark that is itself the
 * switch. A kind that cannot carry binaural (`binauralForKind`) draws the mark as a
 * plain, quiet character rather than a control that cannot act — the app's rule is
 * that a control which cannot act is not drawn, and the mark is information about
 * the stage (this one is silent) rather than an action.
 */
export function StageStrip({
  stages,
  activeIndex,
  running,
  started,
  remainingMs,
  onDuration,
  onBinaural,
  onSelect,
}: {
  stages: CompiledStage[];
  /** Which stage is playing, or the one the reader picked, for the highlight. */
  activeIndex: number;
  running: boolean;
  /** Whether the session has begun — the point the timers stop taking edits. */
  started: boolean;
  /** What is left of the stage at `activeIndex`, from the engine. */
  remainingMs: number;
  onDuration: (stageIndex: number, durationMs: number) => void;
  onBinaural: (stageIndex: number, value: boolean) => void;
  /** Move the session to a stage, and hold it there. */
  onSelect: (stageIndex: number) => void;
}): React.ReactNode {
  /**
   * What a stage's wheel reads: nothing left for the stages already walked, the
   * time remaining for the one on screen, and its own length for the ones still to
   * come. Before Start that is exactly the block's set times, which is what makes
   * the strip a clock rather than a second control.
   */
  const shownMs = (index: number) => {
    if (index < activeIndex) return 0;
    if (index === activeIndex) return Math.max(0, remainingMs);
    return stages[index]?.durationMs ?? 0;
  };
  return (
    <ul aria-label="Stages" className="flex flex-wrap items-center gap-2" data-stage-strip>
      {stages.map((stage, index) => {
        const settable = binauralForKind(stage.kind);
        const active = index === activeIndex;
        return (
          <li
            key={stage.key}
            data-stage={index}
            data-active={active ? "true" : "false"}
            className={`flex items-center gap-1 rounded-xl border px-2 py-1 transition-colors ${
              active && running
                ? "border-accent/60 bg-surface-raised"
                : active
                  ? "border-accent/40 bg-surface"
                  : "border-line bg-surface"
            }`}
          >
            {settable ? (
              <button
                type="button"
                aria-label={`Binaural for ${stage.label}`}
                aria-pressed={stage.binaural}
                title={`Binaural for ${stage.label}`}
                onClick={() => onBinaural(index, !stage.binaural)}
                className={`flex h-5 w-5 items-center justify-center rounded-md text-sm transition-colors active:scale-95 ${
                  stage.binaural
                    ? "bg-accent/15 text-text"
                    : "text-muted hover:bg-bg/60 hover:text-text"
                }`}
              >
                ♪
              </button>
            ) : (
              // Not `aria-hidden`: the mark is the only thing that says this
              // stage is silent, and a screen reader should hear that too. It is
              // a description rather than a control, so it has no role and no
              // press.
              <span
                title="Binaural is off for this stage"
                className="flex h-5 w-5 items-center justify-center text-sm text-muted/40"
              >
                ♪
              </span>
            )}
            {/* A stage is pickable (the owner's round 17): the press highlights
                it and holds the session there, so Start runs from here on. */}
            <button
              type="button"
              aria-label={`${stage.label} stage`}
              aria-current={active ? "step" : undefined}
              title={`Start the session from ${stage.label}`}
              onClick={() => onSelect(index)}
              className={`${EYEBROW_CLASS} rounded-md px-1 text-xs transition-colors hover:text-text ${
                active ? "text-text" : "text-muted"
              }`}
            >
              {stage.label}
            </button>
            {/* The stage's own clock. Editable until the session begins, a reading
                from then on — and in the same place either way. The captions are off
                here and nowhere else: a card is as tall as this window (round 19,
                item 2), and the columns keep their accessible names. */}
            <DurationSteppers
              durationMs={shownMs(index)}
              readOnly={started}
              onChange={(ms) => onDuration(index, ms)}
              size="sm"
              captions={false}
            />
            {/* The owner's round 17: *"I want a restart button for each of the
                stages"*. It is the same move as picking the stage — back to its set
                length, holding, waiting for Start — because that is what a restart
                is. */}
            <button
              type="button"
              aria-label={`Restart ${stage.label}`}
              title={`Restart ${stage.label} from its set time`}
              onClick={() => onSelect(index)}
              className="rounded-md px-1 text-sm text-muted transition-colors hover:text-text active:scale-95"
            >
              ↺
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Whether this stage is one the reader reads — and so the one kind that carries the
 * auto-scroll switch in the footer.
 *
 * Exported so the footer asks the question once instead of re-deriving it from the
 * kind: the latch is drawn for an intentions or affirmations stage and for nothing
 * else, which is item 1's *"if something is not going to be scrolled, there is no
 * point in displaying it"*.
 */
export function scrollsForStage(stage: CompiledStage | null | undefined): boolean {
  return Boolean(stage && autoScrollForKind(stage.kind));
}
