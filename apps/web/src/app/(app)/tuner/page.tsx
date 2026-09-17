import { Tuner } from "@/features/binaural-tuner/Tuner";
import { Suspense } from "react";

export default function TunerPage() {
  return (
    <Suspense fallback={<p className="text-lg text-muted">Loading tuner…</p>}>
      <Tuner />
    </Suspense>
  );
}
