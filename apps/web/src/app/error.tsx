"use client";

import { Button, EYEBROW_CLASS } from "@meditaur/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The boundary above every route.
 *
 * Each screen already reports its own failures — the runner, the library and
 * settings all carry an error string rather than leaving a spinner up forever
 * (the review, 2026-09-15). This is for the ones nothing caught: a render that threw, an
 * effect that met data it did not expect. Without it the reader gets an empty
 * document, which says nothing and offers no way back.
 *
 * Production error *reporting* is still the analytics item's `client_error` event, so the
 * console is where this goes until that lands.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col justify-center gap-4 p-6">
      <p className={EYEBROW_CLASS}>Something went wrong</p>
      <h1 className="font-serif text-3xl">This screen could not be shown</h1>
      <p className="text-lg text-muted">
        Your sessions, plans and library live on this device and are not affected.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button tier="primary" size="lg" onClick={reset}>
          Try again
        </Button>
        <Button tier="secondary" size="lg" onClick={() => router.push("/plan")}>
          Open the planner
        </Button>
      </div>
      {error.digest ? <p className="text-sm text-muted">Reference {error.digest}</p> : null}
    </main>
  );
}
