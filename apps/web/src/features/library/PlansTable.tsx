export function PlansList({
  planNames,
  onOpen,
}: {
  planNames: { id: string; name: string }[];
  onOpen: (planId: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {planNames.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onOpen(p.id)}
            className="min-h-16 w-full rounded-2xl bg-surface px-4 py-4 text-left text-lg text-text"
          >
            {p.name}
          </button>
        </li>
      ))}
    </ul>
  );
}
