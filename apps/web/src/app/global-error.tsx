"use client";

/**
 * The boundary of last resort.
 *
 * It replaces the root layout, which is why it renders its own `<html>` and
 * `<body>` — and why it cannot use the theme's classes, the `@theme` tokens or
 * the `next/font` variables. The colours below are that palette copied by hand,
 * deliberately: this is the screen for when the stylesheet, the fonts or the
 * bundling itself is what failed, so it may not depend on any of them. It is
 * also the one screen whose only real recovery is a fresh document, which is why
 * "Open the planner" is a plain link rather than a client-side navigation.
 */
const INK = "#f3e9d6";
const MUTED = "#a89a86";
const BG = "#17120d";
const SURFACE = "#241c16";
const LINE = "#3b2f24";

const ACTION = {
  minHeight: "3.5rem",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 1.5rem",
  borderRadius: "1rem",
  border: `1px solid ${LINE}`,
  background: SURFACE,
  color: INK,
  fontSize: "1.05rem",
  textDecoration: "none",
  cursor: "pointer",
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "0.9rem",
          padding: "1.5rem",
          background: BG,
          color: INK,
          fontFamily: "system-ui, sans-serif",
          fontSize: "18px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "0.75rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          Something went wrong
        </p>
        <h1 style={{ margin: 0, fontSize: "1.7rem", fontWeight: 600 }}>
          Meditaur could not start
        </h1>
        <p style={{ margin: 0, color: MUTED }}>
          Your sessions, plans and library live on this device and are not affected.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <button type="button" onClick={reset} style={ACTION}>
            Try again
          </button>
          <a href="/plan" style={ACTION}>
            Open the planner
          </a>
        </div>
        {error.digest ? (
          <p style={{ margin: 0, fontSize: "0.8rem", color: MUTED }}>
            Reference {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
