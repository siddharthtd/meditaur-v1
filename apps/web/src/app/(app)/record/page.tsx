import { RecordScreen } from "@/features/record/RecordScreen";
import { Suspense } from "react";

/**
 * A record's route.
 *
 * `RecordScreen` reads the query string with `useSearchParams` — which record, and the
 * door it was opened from — so Next needs that read to sit inside a `Suspense`
 * boundary. Same shape as `/database` and `/library`: everything the screen can suspend
 * on is the query string, and the screen carries its own loading line.
 */
export default function RecordPage() {
  return (
    <Suspense fallback={null}>
      <RecordScreen />
    </Suspense>
  );
}
