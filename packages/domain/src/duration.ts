export const DEFAULT_FOCUS_DURATION_MS = 120_000;

export function durationParts(ms: number): { minutes: number; seconds: number } {
  const total = Math.max(0, Math.round(ms / 1000));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

export function durationFromParts(minutes: number, seconds: number): number {
  const m = Math.max(0, Math.floor(minutes));
  const s = Math.min(59, Math.max(0, Math.floor(seconds)));
  return (m * 60 + s) * 1000;
}
