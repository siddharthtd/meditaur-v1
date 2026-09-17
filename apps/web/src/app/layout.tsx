import { SessionProvider } from "@/features/auth/SessionProvider";
import { TextSizeSync } from "@/features/settings/TextSizeSync";
import { TEXT_SIZE_BOOTSTRAP } from "@/lib/text-size";
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
      data-text-size="lg"
      className={`${manrope.variable} ${fraunces.variable}`}
    >
      <head>
        {/* Paints the reader's last text size before the first paint, so the
            document never renders at `lg` and jumps. The attribute above is
            the no-JS default; TEXT_SIZE_BOOTSTRAP overrides it early. */}
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-text antialiased">
        <SessionProvider>
          <TextSizeSync />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
