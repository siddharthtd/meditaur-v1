import type { ReactNode } from "react";

/**
 * The run route is exactly one viewport tall and never scrolls.
 *
 * It used to be a page like any other — `min-h-screen` plus its own padding —
 * which meant a session with several symbols scrolled, and a meditation that has
 * to be scrolled is not a meditation (the owner's round 14). `Runner` fills this
 * box and gives the overflowing intentions a card of their own to scroll in, so
 * the controls never leave the bottom edge.
 */
export default function RunLayout({ children }: { children: ReactNode }) {
  return <div className="h-[100dvh] overflow-hidden">{children}</div>;
}
