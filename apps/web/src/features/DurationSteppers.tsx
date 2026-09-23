import {
  durationFromParts,
  durationParts,
} from "@meditaur/domain";
import { TimeWheels, type TimeWheelSize } from "@meditaur/ui";

/**
 * A duration, set with the alarm-clock wheels.
 *
 * The screen-facing shape is unchanged from the `−`/`+` steppers this replaced
 * (milliseconds in, milliseconds out), so every call site kept working while the
 * control underneath changed — the owner's round 5, plan-screen item 3: "the
 * minutes/seconds slides vertically upwards to increase, downwards to decrease,
 * also you can click on it to edit it like a textbox. Use the same form in the
 * cards on the plan screen."
 *
 * `readOnly` makes it a reading in the same place rather than a control (the owner's
 * round 17): a run screen's stage timer stops taking edits once the session starts,
 * and what it shows from then on is the time left. `onChange` is required either
 * way so that no call site has to change shape when it flips — a timer that becomes
 * read-only mid-session is the same timer.
 *
 * The **seconds column wraps** by default (the owner's round 19, item 1: *"the
 * timers' seconds should wrap around, after 59, it should again become 0, minute
 * wheel stays the same"*). Every duration in the app is set with this control, so one
 * default answers for the session screen, a plan's editor, a Database cell and a
 * library editor alike. The minutes column is untouched: `durationFromParts` still
 * bounds it, and a wrap never carries into it.
 *
 * `captions` is for the one caller that cannot spare a line of height — the session
 * screen's stage cards (round 19, item 2) — and every other screen keeps them.
 */
export function DurationSteppers({
  durationMs,
  onChange,
  size = "md",
  readOnly = false,
  wrapSeconds = true,
  captions = true,
}: {
  durationMs: number;
  onChange: (ms: number) => void;
  size?: TimeWheelSize;
  readOnly?: boolean;
  wrapSeconds?: boolean;
  captions?: boolean;
}) {
  const { minutes, seconds } = durationParts(durationMs);
  return (
    <TimeWheels
      minutes={minutes}
      seconds={seconds}
      size={size}
      readOnly={readOnly}
      wrapSeconds={wrapSeconds}
      captions={captions}
      onMinutes={(m) => onChange(durationFromParts(m, seconds))}
      onSeconds={(s) => onChange(durationFromParts(minutes, s))}
    />
  );
}
