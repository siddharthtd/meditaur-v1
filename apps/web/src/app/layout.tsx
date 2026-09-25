import { SessionProvider } from "@/features/auth/SessionProvider";
import { ServiceWorkerSync } from "@/features/pwa/ServiceWorkerSync";
import { TextSizeSync } from "@/features/settings/TextSizeSync";
import { ThemeSync } from "@/features/settings/ThemeSync";
import { TEXT_SIZE_BOOTSTRAP } from "@/lib/text-size";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import { DEFAULT_THEME } from "@meditaur/domain";
import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Two families, one job each (UI_DESIGN.md §1.3). next/font downloads them at
// build time — no npm package, so the dependency allowlist is unchanged. These
// CSS variables are what the `@theme` block in globals.css maps to
// `font-sans` / `font-serif`.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: "Meditaur",
  description: "Meditation timers, binaural beats, and focus tables",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-text-size="md"
      data-theme={DEFAULT_THEME}
      className={`${manrope.variable} ${fraunces.variable}`}
    >
      <head>
        {/* Paints the reader's last text size and colour scheme before the first paint, so
            the document never renders at a default and jumps — a light scheme arriving
            after hydration is a white flash. The attributes above are the no-JS defaults:
            the app's designed 18px, and its own Warm Earth. */}
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-text antialiased">
        <SessionProvider>
          <ServiceWorkerSync />
          <TextSizeSync />
          <ThemeSync />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
