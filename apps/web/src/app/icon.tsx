import { markAt } from "./mark.tsx";

/**
 * The 192px mark, for the manifest and the page's own icon link.
 *
 * The drawing lives in `mark.tsx` because `/favicon.ico` needs the same one at
 * 32px; see that file for why there are two sizes.
 */
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon(): Response {
  return markAt(192);
}
