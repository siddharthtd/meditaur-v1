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
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/icon", sizes: "192x192", type: "image/png" },
    ],
  };
}
