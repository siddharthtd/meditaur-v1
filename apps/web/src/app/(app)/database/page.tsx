import { DatabaseScreen } from "@/features/database/DatabaseScreen";
import { Suspense } from "react";

/**
 * The Database's route.
 *
 * `DatabaseScreen` reads the query string with `useSearchParams`, which is how it
 * learns what the library asked for (`Add meditation` is an address, not a prop).
 * Next needs that read to sit inside a `Suspense` boundary, so the boundary is
 * here rather than inside the screen: everything it can suspend on is the query
 * string, and the screen already carries its own loading line.
 */
export default function DatabasePage() {
  return (
    <Suspense fallback={null}>
      <DatabaseScreen />
    </Suspense>
  );
}
