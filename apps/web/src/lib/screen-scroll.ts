import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * React warns when `useLayoutEffect` runs during a server render. The library is
 * a client component, but Next still prerenders it, so the effect falls back to
 * `useEffect` there — where there is no scroll position to restore anyway.
 */
const useLayout =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Remembers where each screen of a client-side screen stack was scrolled to, and
 * puts the reader back there.
 *
 * The library is one page whose screens are React state, not routes, so nothing
 * in the browser tracks a position per screen: scroll 3000px down a focus
 * point's editor, open one of its intentions (a short screen), press `Back`, and
 * the editor came back at the top — the owner's round 6: "when going back from
 * edit intention page […] the edit page starts at the top again, the page
 * position should be where we left off". The same clamp ran the other way: a
 * screen opened from a scrolled list started part-way down itself.
 *
 * The position is recorded as the reader scrolls, not on the way out: by the
 * time an effect's cleanup runs, React has already rendered the next screen and
 * the browser has clamped the offset to the new page's height, so the value read
 * there is the one being left *for*, not the one being left.
 *
 * A screen seen for the first time starts at the top, which is what a screen
 * should do.
 */
export function useScreenScroll(key: string): void {
  const positions = useRef(new Map<string, number>());

  // Before paint: restoring from `useEffect` would show one frame of the new
  // screen at the old offset, which reads as a jump.
  useLayout(() => {
    const record = () => positions.current.set(key, window.scrollY);
    window.addEventListener("scroll", record, { passive: true });
    window.scrollTo({ top: positions.current.get(key) ?? 0 });
    return () => window.removeEventListener("scroll", record);
  }, [key]);
}
