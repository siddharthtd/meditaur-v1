import type { ReactNode } from "react";
import { AppNav } from "@/features/auth/AppNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-8">
      <AppNav />
      {children}
    </div>
  );
}
