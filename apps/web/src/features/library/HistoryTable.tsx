import type { SessionLog } from "@meditaur/domain";
import { formatDurationMs } from "./library-model";

export function HistoryList({
  sessionsThisWeek,
  logs,
  planNames,
  onOpen,
}: {
  sessionsThisWeek: number;
  logs: SessionLog[];
  planNames: { id: string; name: string }[];
  onOpen: (planId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg text-text">Sessions completed this week: {sessionsThisWeek}</p>
      <ul className="flex flex-col gap-2">
        {logs.length === 0 ? (
          <li className="text-muted">No completed sessions yet.</li>
        ) : (
          logs.map((log) => {
            const planName = planNames.find((p) => p.id === log.planId)?.name ?? "Plan";
            return (
              <li key={log.id}>
                <button
                  type="button"
                  onClick={() => onOpen(log.planId)}
                  className="min-h-16 w-full rounded-2xl bg-surface px-4 py-4 text-left text-lg text-text"
                >
                  {planName} · {formatDurationMs(log.totalDurationMs)} ·{" "}
                  {new Date(log.completedAt).toLocaleString()}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
