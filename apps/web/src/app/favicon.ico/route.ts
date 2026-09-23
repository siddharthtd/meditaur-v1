import { markAt } from "../mark.tsx";

/**
 * The icon at the path a browser asks for by convention.
 *
 * `/favicon.ico` is not something the app links to — `layout.tsx`'s metadata and
 * the manifest point at `/icon` — but every browser requests it anyway on a
 * first visit, and until now it answered 404. Answering it is one small route
 * rather than a second copy of the drawing: `markAt(32)` is the same mark at
 * favicon size, and the manifest's `32x32` entry points here rather than at a
 * 192px image dressed as a small one.
 *
 * `.ico` is a name, not a format: the bytes are PNG, which browsers sniff, and
 * `ImageResponse` sets `content-type: image/png` on its own. There is no
 * `contentType` export here on purpose — that is a *metadata* file convention
 * (`icon.tsx` has one), and a route handler that exports it fails `next build`
 * with "not a valid Route export field", which `next dev` does not tell you.
 */
export function GET(): Response {
  return markAt(32);
}
