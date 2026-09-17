import type { SessionLog } from "@meditaur/domain";

export function startOfLocalIsoWeek(nowMs: number): number {
  const date = new Date(nowMs);
  const weekday = date.getDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysFromMonday);
  return date.getTime();
}

export function countSessionsThisWeek(
  logs: Pick<SessionLog, "completedAt">[],
  nowMs: number,
): number {
  const start = startOfLocalIsoWeek(nowMs);
  return logs.filter((log) => log.completedAt >= start && log.completedAt <= nowMs).length;
}
