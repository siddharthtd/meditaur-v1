import { ImageResponse } from "next/og";

/**
 * The app's mark, drawn once.
 *
 * Two routes serve it: `/icon` at 192px for the manifest and the page's own
 * `rel="icon"` link, and `/favicon.ico` at 32px, which is where a browser looks
 * without being told — that probe 404'd before, and a 404 in the network log of
 * every first visit is noise a reader cannot act on.
 *
 * Shared rather than copied because the alternative is two drawings that drift:
 * the small one is where a mark change is forgotten first, and it is also the
 * one nobody looks at.
 */
export function markAt(px: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#17120d",
          color: "#f3d19a",
          // Half the square, which is what the 192px version has always used,
          // so the two sizes are the same drawing at two scales.
          fontSize: px / 2,
          fontWeight: 700,
        }}
      >
        M
      </div>
    ),
    { width: px, height: px },
  );
}
