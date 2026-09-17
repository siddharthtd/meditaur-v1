import { useEffect, useState } from "react";

/**
 * The arm step behind every destructive control — IMPLEMENTATION.md's UI rules.
 *
 * The first press never deletes: it arms the control (`Delete Heart Chakra?`)
 * and fills it with a light red, and a second press on that same armed control
 * is what does the work. An armed control disarms itself after
 * {@link ARM_TIMEOUT_MS}, so a half-pressed delete cannot sit there for the rest
 * of the session waiting for a stray tap.
 *
 * Two hooks, because the two shapes of state are genuinely different: a screen
 * with one delete button in front of it needs a flag, a list needs one armed id.
 * Both restart the timer whenever the armed thing changes, so arming a second
 * row gets that row the full window rather than the remains of the first one's.
 */
export const ARM_TIMEOUT_MS = 5000;

/** For a screen with one destructive button: the editors, the planner, a sheet. */
export function useArmedFlag(
  timeoutMs: number = ARM_TIMEOUT_MS,
): readonly [boolean, (next: boolean) => void] {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const handle = window.setTimeout(() => setArmed(false), timeoutMs);
    return () => window.clearTimeout(handle);
  }, [armed, timeoutMs]);
  return [armed, setArmed] as const;
}

/** For a list where each row has its own delete: null means nothing is armed. */
export function useArmedId(
  timeoutMs: number = ARM_TIMEOUT_MS,
): readonly [string | null, (next: string | null) => void] {
  const [armedId, setArmedId] = useState<string | null>(null);
  useEffect(() => {
    if (!armedId) return;
    const handle = window.setTimeout(() => setArmedId(null), timeoutMs);
    return () => window.clearTimeout(handle);
  }, [armedId, timeoutMs]);
  return [armedId, setArmedId] as const;
}
