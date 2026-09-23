import type { NextConfig } from "next";

/**
 * Content-Security-Policy — production only, and deliberately.
 *
 * `next dev` compiles with `eval` and injects its own inline scripts, so a
 * policy strict enough to be worth having breaks the dev server. The e2e suite
 * runs against `next dev` (it boots `pnpm exec next dev` as its webServer), so
 * it could never have caught that — which is why this is scoped rather than
 * applied everywhere and hoped for.
 *
 * `script-src 'unsafe-inline'` is the honest weak spot. Two things require it:
 * the blocking inline text-size bootstrap in `app/layout.tsx`, which paints the
 * reader's size before hydration, and the inline RSC payload Next emits. Taking
 * it away needs a nonce threaded through middleware — a real change, not a
 * config tweak. Do not "tighten" this by deleting the keyword; the app stops
 * working and the tests will not tell you.
 */
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  // The only cross-origin call the app makes. With no cloud config the app is
  // Dexie-only and makes none, so an empty origin here is correct, not a gap.
  ["connect-src 'self'", supabaseOrigin].filter(Boolean).join(" "),
  // `next/font` downloads and self-hosts at build time, so 'self' is the whole
  // list — there is no fonts.googleapis.com origin to allow.
  "font-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  transpilePackages: [
    "@meditaur/application",
    "@meditaur/audio-web",
    "@meditaur/db",
    "@meditaur/domain",
    "@meditaur/ui",
  ],
  async headers() {
    const headers = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // The app asks for none of these three and has no code path that could
      // (checked: no getUserMedia, no MediaRecorder, no geolocation). `autoplay`
      // is deliberately absent — denying it would stop the Web Audio graph from
      // starting, and the graph is the session.
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Content-Security-Policy", value: CSP });
    }
    return [{ source: "/:path*", headers }];
  },
  async redirects() {
    return [{ source: "/dev/tuner", destination: "/tuner", permanent: false }];
  },
};

export default nextConfig;
