import type { ReactNode } from "react";

export default function RunLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-10">
      {children}
    </div>
  );
}
