import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  TIME_WHEEL_ROWS,
  wheelBandTopPx,
  wheelOffsetFor,
  wheelPadPx,
  wheelValueAt,
} from "./wheel-math.ts";

/**
 * TimeWheels — the minutes-and-seconds control, in the shape of an alarm clock's.
 *
 * The owner's round 5: "I want the time-setting appearance like in android alarm
 * clocks. The minutes/seconds slides vertically upwards to increase, downwards to
 * decrease, also you can click on it to edit it like a textbox." Round 7 is the
 * same control done properly: it *is* a scroll container now, rather than a stack
 * of numbers dressed up as one.
 *
 * - **A real scroller.** The column is `overflow-y-scroll`, one fixed-height row
 *   per value, with `scroll-snap-type: y mandatory`. That is what makes it
 *   scrollable *on the web*: the mouse wheel, a trackpad and touch all work
 *   natively, and the browser does the momentum and the snapping. Before this,
 *   only a hand-rolled mouse drag moved it, which is why it read as "not
 *   scrollable".
 * - **Fixed geometry, so the columns cannot drift apart.** A row is a row and the
 *   window is always {@link TIME_WHEEL_ROWS} of them. The old column rendered a
 *   neighbour line only when that neighbour existed, so any value at its minimum
 *   — every freshly opened `2:00` — lost the line above it and sat ~24px higher
 *   than its neighbour: the owner's "seconds is dangling above".
 * - **It rests on a row, exactly.** The browser's snapping is left alone while
 *   the reader is turning the wheel, and when the gesture stops the offset is
 *   written back to the row the value names. Nothing is written *during* the
 *   gesture — a mandatory-snap scroller that is written to mid-momentum loses
 *   the gesture it is in the middle of, which is how the column used to stop
 *   between two digits (the owner's round 9: "the time scroller doesn't land
 *   exactly on the digit when scrolled using trackpad").
 * - **A drag still turns it, for the mouse.** Touch is left to the browser: the
 *   column is not `touch-none`, so a finger pans it natively and never drags the
 *   page instead.
 * - **A press that does not turn the wheel opens a text box** over the value
 *   (Enter or blur commits, Escape puts it back, a non-number is refused). The
 *   owner's round 7: "the textbox one is working fine" — so it is unchanged.
 * - **The keyboard works too**: arrows, PageUp/PageDown and Home/End. A wheel you
 *   can only turn with a finger is a wheel half the readers cannot use.
 *
 * It is deliberately not a `<select>` (the repo bans those) and not a pair of
 * `−`/`+` buttons, which is what the planner's cards had: two of those plus
 * their labels took more room than the rest of the card.
 */
export type TimeWheelSize = "sm" | "md";

type SizeSpec = {
  /** One row, in CSS pixels. Every other measurement follows from it. */
  rowPx: number;
  /** The column's width — narrow: it holds a number, not a word. */
  column: string;
  /** The digits. */
  value: string;
  /** The `Minutes` / `Seconds` caption under the window. */
  caption: string;
};

const SIZES: Record<TimeWheelSize, SizeSpec> = {
  // `text-2xl` is 27px at this app's 18px root font, in a 36px line box.
  sm: { rowPx: 36, column: "w-11", value: "text-2xl", caption: "text-xs" },
  md: { rowPx: 52, column: "w-14", value: "text-4xl", caption: "text-sm" },
};

/**
 * The neighbours fading into the band instead of being cut off by it. A picker
 * that stops dead at its edges reads as a list; one that fades reads as a wheel.
 */
const FADE = "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)";

/**
 * How long the wheel is left alone before it is told to rest.
 *
 * A trackpad's momentum keeps sending scroll events after the fingers have
 * stopped, so "the reader has stopped" is not an event: it is a quiet period a
 * little longer than the gap between two momentum events. Short enough that the
 * row is on the line while the eye is still travelling with it, long enough that
 * a slow scroll is never mistaken for a stop.
 */
const SETTLE_MS = 120;

export function TimeWheel({
  label,
  value,
  min,
  max,
  onChange,
  size = "md",
  band = true,
}: {
  /** The column's name, e.g. `Minutes`. Its accessible name and its caption. */
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  size?: TimeWheelSize;
  /** Off when a parent draws one band across several columns (`TimeWheels`). */
  band?: boolean;
}): ReactNode {
  const spec = SIZES[size];
  const { rowPx } = spec;
  const windowPx = rowPx * TIME_WHEEL_ROWS;
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState("");
  const [dragging, setDragging] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startTop: number; moved: boolean } | null>(null);
  /** A drag ends with a click on the column; it must not open the text box. */
  const justDragged = useRef(false);
  /**
   * True from the first scroll event of a gesture until the wheel has stopped.
   *
   * While the reader is turning the wheel the offset is *theirs*, and this
   * component must not write it: a mandatory-snap scroller that is written to
   * mid-gesture loses the gesture it was in the middle of — the momentum and the
   * snap it was going to make with it — and then rests wherever the last finger
   * movement happened to leave it, between two digits as often as not.
   */
  const turning = useRef(false);
  const restTimer = useRef<number | null>(null);
  /** The value as of this render, for a timer that outlives it. */
  const valueRef = useRef(value);
  valueRef.current = value;

  const rows: number[] = [];
  for (let n = min; n <= max; n += 1) rows.push(n);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const step = (delta: number) => onChange(clamp(value + delta));

  /** Put the column on the row the value names, if it is not already there. */
  const placeOnValue = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const top = wheelOffsetFor(valueRef.current, rowPx, min);
    if (Math.abs(node.scrollTop - top) < 1) return;
    node.scrollTop = top;
  }, [rowPx, min]);

  // Keep the wheel where the value is. The value also changes from outside — the
  // screen it sits on, the minutes column moving the seconds, a typed value — so
  // the offset has to follow it. Skipped while the reader is turning the wheel or
  // dragging it, because the two would then fight over the same offset.
  useLayoutEffect(() => {
    if (dragging || turning.current) return;
    placeOnValue();
  }, [value, min, rowPx, dragging, placeOnValue]);

  /**
   * The gesture is over: the wheel is put on the row it names.
   *
   * The value is the app's, so it is what the column has to agree with — the
   * nearest row is the same row, except when the browser did not snap (a
   * trackpad's momentum is not snapped everywhere) or when the screen refused
   * the value. Either way the wheel now rests on a digit rather than beside one.
   */
  const rest = useCallback(() => {
    restTimer.current = null;
    turning.current = false;
    // A drag writes its own offset and lands on a row when it is let go.
    if (!drag.current) placeOnValue();
  }, [placeOnValue]);

  useEffect(
    () => () => {
      if (restTimer.current !== null) window.clearTimeout(restTimer.current);
    },
    [],
  );

  /**
   * The wheel is what the reader is turning, so its offset is the source of truth
   * while it moves: the offset names the value and the value follows. It cannot
   * loop — a programmatic scroll lands on the value it scrolled to, and a value
   * equal to the current one is not reported.
   *
   * No offset is written here. The one thing this handler does beyond reporting
   * the value is arm the rest, and it re-arms it on every event, so a gesture is
   * "quiet for {@link SETTLE_MS}" rather than "ended".
   */
  const onScroll = () => {
    const node = scroller.current;
    if (!node) return;
    turning.current = true;
    if (restTimer.current !== null) window.clearTimeout(restTimer.current);
    restTimer.current = window.setTimeout(rest, SETTLE_MS);
    const next = wheelValueAt(node.scrollTop, rowPx, min, max);
    if (next !== value) onChange(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const node = scroller.current;
    // Touch and pen pan the column themselves (the container allows it), so this
    // drag exists for the one pointer that has no native drag: the mouse.
    if (event.pointerType !== "mouse" || !node || editing) return;
    drag.current = { startY: event.clientY, startTop: node.scrollTop, moved: false };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const node = scroller.current;
    const current = drag.current;
    if (!node || !current) return;
    const travelled = current.startY - event.clientY;
    if (!current.moved && Math.abs(travelled) < 3) return;
    current.moved = true;
    node.scrollTop = current.startTop + travelled;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const node = scroller.current;
    const current = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    if (!node || !current?.moved) return;
    // Land on a row: a wheel rests between values only while it is being turned.
    justDragged.current = true;
    const landed = wheelValueAt(node.scrollTop, rowPx, min, max);
    node.scrollTop = wheelOffsetFor(landed, rowPx, min);
    if (landed !== value) onChange(landed);
  };

  /** A press that did not turn the wheel is a request to type the value. */
  const onClick = () => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    setTyped(String(value));
    setEditing(true);
  };

  const commit = () => {
    const parsed = Number.parseInt(typed.trim(), 10);
    setEditing(false);
    if (Number.isNaN(parsed)) return;
    onChange(clamp(parsed));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") step(1);
    else if (event.key === "ArrowDown") step(-1);
    else if (event.key === "PageUp") step(5);
    else if (event.key === "PageDown") step(-5);
    else if (event.key === "Home") onChange(min);
    else if (event.key === "End") onChange(max);
    else if (event.key === "Enter" || event.key === " ") {
      setTyped(String(value));
      setEditing(true);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {/* The window is the spinbutton and the rows inside it are decoration, so
          the value is announced once rather than twice. */}
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} ${label.toLowerCase()}`}
        className={`relative select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${spec.column}`}
        style={{ height: windowPx }}
        onKeyDown={onKeyDown}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {band ? (
          // Before the scroller in the DOM, and both of them positioned: the rows
          // paint over the band without a z-index anywhere.
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 rounded-xl bg-surface-raised"
            style={{ top: wheelBandTopPx(rowPx), height: rowPx }}
          />
        ) : null}
        <div
          ref={scroller}
          aria-hidden="true"
          className="time-wheel relative h-full w-full cursor-ns-resize snap-y snap-mandatory overflow-y-scroll overscroll-contain"
          style={{
            // A drag writes the offset itself, and mandatory snapping would fight
            // it for the offset on every write.
            scrollSnapType: dragging ? "none" : undefined,
            maskImage: FADE,
            WebkitMaskImage: FADE,
          }}
          onScroll={onScroll}
        >
          <div style={{ height: wheelPadPx(rowPx) }} />
          {rows.map((row) => (
            <div
              key={row}
              className={`flex snap-center items-center justify-center tabular-nums ${
                spec.value
              } ${row === value ? "text-text" : "text-muted"}`}
              style={{ height: rowPx }}
            >
              {row}
            </div>
          ))}
          <div style={{ height: wheelPadPx(rowPx) }} />
        </div>
        {editing ? (
          <input
            autoFocus
            aria-label={`${label} value`}
            value={typed}
            inputMode="numeric"
            onChange={(e) => setTyped(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              // Escape abandons the edit without changing anything, and the
              // editor it may sit inside must not read it as "go back".
              if (e.key === "Escape") {
                e.stopPropagation();
                setEditing(false);
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            className={`absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-xl bg-surface-raised px-1 text-center tabular-nums text-text ${spec.value}`}
            style={{ height: rowPx }}
          />
        ) : null}
      </div>
      <span className={`${spec.caption} text-muted`}>{label}</span>
    </div>
  );
}

/**
 * Minutes and seconds, side by side under one highlight band — the pair every
 * duration in the app is set with (a plan block's length, a focus point's
 * default, the run screen's clock before it starts).
 *
 * There is no `:` between them: the owner's round 7, "you can remove the : from
 * the middle". Two columns inside one band, each captioned, read as a single
 * value — the way Android's time picker does it — and the colon was taking the
 * width a digit of the pair needed.
 */
export function TimeWheels({
  minutes,
  seconds,
  onMinutes,
  onSeconds,
  size = "md",
  minuteMax = 180,
}: {
  minutes: number;
  seconds: number;
  onMinutes: (next: number) => void;
  onSeconds: (next: number) => void;
  size?: TimeWheelSize;
  minuteMax?: number;
}): ReactNode {
  const { rowPx } = SIZES[size];
  return (
    <div className="relative flex items-start gap-1">
      {/* One band across both columns, lined up with the middle row of each. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 rounded-xl bg-surface-raised"
        style={{ top: wheelBandTopPx(rowPx), height: rowPx }}
      />
      <TimeWheel
        label="Minutes"
        value={minutes}
        min={0}
        max={minuteMax}
        onChange={onMinutes}
        size={size}
        band={false}
      />
      <TimeWheel
        label="Seconds"
        value={seconds}
        min={0}
        max={59}
        onChange={onSeconds}
        size={size}
        band={false}
      />
    </div>
  );
}
