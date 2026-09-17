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
 */
export function DurationSteppers({
  durationMs,
  onChange,
  size = "md",
}: {
  durationMs: number;
  onChange: (ms: number) => void;
  size?: TimeWheelSize;
}) {
  const { minutes, seconds } = durationParts(durationMs);
  return (
    <TimeWheels
      minutes={minutes}
      seconds={seconds}
      size={size}
      onMinutes={(m) => onChange(durationFromParts(m, seconds))}
      onSeconds={(s) => onChange(durationFromParts(minutes, s))}
    />
  );
}
