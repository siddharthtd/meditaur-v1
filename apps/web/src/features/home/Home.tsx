"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { errorText } from "@/lib/error-text";
import { startSession } from "@/runtime";
import { Button } from "@meditaur/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Home() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { userId, workspaceId, flags } = useSession();

  const startSessionNow = async () => {
    setError(null);
    setBusy(true);
    try {
      if (!userId || !workspaceId) {
        setError("Still starting up. Try again in a moment.");
        return;
      }
      const plan = await app.getActivePlan(userId, workspaceId);
      if (!plan) {
        setError("No plan to start. Open the planner first.");
        return;
      }
      const instanceId = await startSession(userId, workspaceId, plan.id);
      router.push(`/run/${instanceId}`);
    } catch (err) {
      setError(errorText(err, "Could not start a session"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
      <h1 className="text-4xl font-semibold">Meditaur</h1>
      <p className="text-lg text-muted">
        Staggered meditation timers, generated binaural beats, and focus
        tables. This is a wellness tool, not a medical device.
      </p>
      <Button
        tier="primary"
        size="lg"
        disabled={busy}
        onClick={() => void startSessionNow()}
        className="w-full"
      >
        Start session
      </Button>
      <Link
        href="/plan"
        className="inline-flex h-14 w-full items-center justify-center rounded-2xl border border-line px-6 text-lg text-text"
      >
        Open planner
      </Link>
      {flags.account_management ? (
        <Link
          href="/login"
          className="inline-flex h-14 w-full items-center justify-center rounded-2xl border border-line px-6 text-lg text-text"
        >
          Account
        </Link>
      ) : null}
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
    </main>
  );
}
