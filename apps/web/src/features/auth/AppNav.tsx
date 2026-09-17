"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/plan", label: "Plan" },
  { href: "/library", label: "Library" },
  { href: "/settings", label: "Settings" },
  { href: "/account", label: "Account" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="App" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {LINKS.map((link) => {
        const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
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
