import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meditaur",
    short_name: "Meditaur",
    description: "Meditation timers and binaural beats",
    start_url: "/plan",
    display: "standalone",
    background_color: "#17120d",
    theme_color: "#17120d",
    // Two entries, two routes. `/icon` renders at 192px and `/favicon.ico` at
    // 32px — the same drawing at two scales (`app/mark.tsx`). The 32px line here
    // used to point at `/icon`, which was a claim a launcher could act on: it
    // would pick the "small" entry for a favicon-sized slot and get a 192px
    // image scaled down. A size needs its own route, not its own line.
    icons: [
      { src: "/favicon.ico", sizes: "32x32", type: "image/png" },
      { src: "/icon", sizes: "192x192", type: "image/png" },
    ],
  };
}
