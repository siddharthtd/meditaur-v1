import { Library } from "@/features/library/Library";
import { Suspense } from "react";

/**
 * The library's route.
 *
 * `Library` reads the query string with `useSearchParams`, which is how the Database
 * asks it to open one record's page (`library-route.ts`). Next needs that read to sit
 * inside a `Suspense` boundary, so the boundary is here rather than inside the screen —
 * the same shape, and for the same reason, as the Database's own route.
 */
export default function LibraryPage() {
  return (
    <Suspense fallback={null}>
      <Library />
    </Suspense>
  );
}
