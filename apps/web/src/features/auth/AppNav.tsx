"use client";

import { confirmLeaveDatabase } from "@/features/database/database-guard";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/plan", label: "Plan" },
  { href: "/library", label: "Library" },
  // The Database left the library's tab strip on 2026-09-19: it is data, and the
  // owner's call is that data gets a tab of its own beside the screens it feeds
  // rather than one inside the screen that browses it.
  { href: "/database", label: "Database" },
  { href: "/settings", label: "Settings" },
  { href: "/account", label: "Account" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="App" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {LINKS.map((link) => {
        const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            onClick={(event) => {
              // The Database is the one screen where leaving discards, so it is
              // the one link that can refuse a press. Every other destination
              // answers `true` without asking anything.
              if (!current && !confirmLeaveDatabase()) event.preventDefault();
            }}
            className={`flex min-h-16 items-center justify-center rounded-2xl text-lg font-medium ${
              current ? "bg-accent text-bg" : "bg-surface text-text"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
