"use client";

import { Button, EYEBROW_CLASS } from "@meditaur/ui";
import { useRouter } from "next/navigation";

/**
 * An address that is not a screen.
 *
 * Without this, Next renders its own bare 404 — which is a different product
 * from the one the reader was using. The likeliest way to arrive here is a
 * `/run/<instanceId>` link whose session has since been cleared, so the copy
 * names that rather than blaming the reader.
 */
export default function NotFound() {
  const router = useRouter();
  return (
    <main className="flex min-h-screen flex-col justify-center gap-4 p-6">
      <p className={EYEBROW_CLASS}>Not found</p>
      <h1 className="font-serif text-3xl">There is nothing at this address</h1>
      <p className="text-lg text-muted">
        The link may be old, or the session it pointed at may have been cleared.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button tier="primary" size="lg" onClick={() => router.push("/plan")}>
          Open the planner
        </Button>
        <Button tier="secondary" size="lg" onClick={() => router.push("/")}>
          Start from the beginning
        </Button>
      </div>
    </main>
  );
}
