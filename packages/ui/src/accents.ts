import type { CSSProperties } from "react";

/**
 * Chakra accents — UI_DESIGN.md §1.2.
 *
 * The mapping is deliberately static and lives here, keyed by the seven
 * canonical chakra names the app seeds ("Root Chakra", "Hara Chakra", "Solar
 * Plexus", "Heart Chakra", "Throat Chakra", "Third-Eye Chakra", "Crown
 * Chakra"). There is no chakra→colour data in the workspace and no schema
 * change is wanted, so a focus point is tinted by looking its name up here.
 * `FocusPoint.colour` stays an optional override on top (see
 * `accentForFocusPoint`).
 *
 * Every class string below is written out in full rather than composed at
 * runtime, so Tailwind can see it in the source and generate it.
 */
export type Accent = {
  key: string;
  hex: string;
  /** Filled: background, plus a label colour that actually reads on it. */
  solid: string;
  /** Outline: border plus accent label over a transparent fill. */
  outline: string;
  /** Accent label, no fill and no border. */
  text: string;
  /** A ring, e.g. around a representation image. */
  ring: string;
};

/** Point and Custom focus points: no chakra hue, so the neutral cream accent. */
export const NEUTRAL_ACCENT: Accent = {
  key: "neutral",
  hex: "#d8c9a8",
  solid: "bg-accent text-bg",
  outline: "border border-accent bg-transparent text-accent",
  text: "text-accent",
  ring: "ring-accent",
};

/**
 * key → canonical seeded name, hue, and the class set the tokens generate.
 * The `solid` label colour is picked per hue for contrast: the two dark hues
 * take the cream text, the five lighter ones take the near-black page tone.
 */
const CHAKRA_ACCENTS: Record<string, Accent> = {
  root: {
    key: "root",
    hex: "#b5533c",
    solid: "bg-chakra-root text-text",
    outline: "border border-chakra-root bg-transparent text-chakra-root",
    text: "text-chakra-root",
    ring: "ring-chakra-root",
  },
  hara: {
    key: "hara",
    hex: "#c97a3d",
    solid: "bg-chakra-hara text-bg",
    outline: "border border-chakra-hara bg-transparent text-chakra-hara",
    text: "text-chakra-hara",
    ring: "ring-chakra-hara",
  },
  "solar-plexus": {
    key: "solar-plexus",
    hex: "#c9a227",
    solid: "bg-chakra-solar-plexus text-bg",
    outline: "border border-chakra-solar-plexus bg-transparent text-chakra-solar-plexus",
    text: "text-chakra-solar-plexus",
    ring: "ring-chakra-solar-plexus",
  },
  heart: {
    key: "heart",
    hex: "#6b8f5e",
    solid: "bg-chakra-heart text-bg",
    outline: "border border-chakra-heart bg-transparent text-chakra-heart",
    text: "text-chakra-heart",
    ring: "ring-chakra-heart",
  },
  throat: {
    key: "throat",
    hex: "#4e85a3",
    solid: "bg-chakra-throat text-bg",
    outline: "border border-chakra-throat bg-transparent text-chakra-throat",
    text: "text-chakra-throat",
    ring: "ring-chakra-throat",
  },
  "third-eye": {
    key: "third-eye",
    hex: "#5b5c99",
    solid: "bg-chakra-third-eye text-text",
    outline: "border border-chakra-third-eye bg-transparent text-chakra-third-eye",
    text: "text-chakra-third-eye",
    ring: "ring-chakra-third-eye",
  },
  crown: {
    key: "crown",
    hex: "#8a6baf",
    solid: "bg-chakra-crown text-bg",
    outline: "border border-chakra-crown bg-transparent text-chakra-crown",
    text: "text-chakra-crown",
    ring: "ring-chakra-crown",
  },
};

/** Canonical name → accent key. Letters only, so "Third Eye" == "Third-Eye". */
const KEY_BY_NAME: Record<string, string> = {
  root: "root",
  rootchakra: "root",
  muladhara: "root",
  hara: "hara",
  harachakra: "hara",
  svadhisthana: "hara",
  sacral: "hara",
  solarplexus: "solar-plexus",
  solar: "solar-plexus",
  manipura: "solar-plexus",
  heart: "heart",
  heartchakra: "heart",
  anahata: "heart",
  throat: "throat",
  throatchakra: "throat",
  vishuddha: "throat",
  thirdeye: "third-eye",
  thirdeyechakra: "third-eye",
  ajna: "third-eye",
  crown: "crown",
  crownchakra: "crown",
  sahasrara: "crown",
};

function lookupKey(name: string | null | undefined): string | null {
  if (!name) return null;
  return KEY_BY_NAME[name.toLowerCase().replace(/[^a-z]/g, "")] ?? null;
}

/**
 * The accent for a focus-point name. Anything that is not one of the seven
 * canonical centres — a Point, a Custom focus point, or a chakra whose name a
 * reader rewrote — falls back to the neutral cream accent.
 */
export function accentForName(name: string | null | undefined): Accent {
  const key = lookupKey(name);
  return key ? CHAKRA_ACCENTS[key]! : NEUTRAL_ACCENT;
}

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The accent for a focus point, honouring the reader's own `colour` when it is
 * a hex value. The override is carried as `hex`; paint it with `accentStyle`
 * (Tailwind cannot generate a utility for a colour it cannot see).
 */
export function accentForFocusPoint(focusPoint: {
  name: string;
  colour?: string | null;
}): Accent {
  const base = accentForName(focusPoint.name);
  const custom = focusPoint.colour?.trim();
  if (custom && HEX_COLOUR.test(custom)) {
    return { ...base, key: "custom", hex: custom };
  }
  return base;
}

/** Inline paint for a custom-colour accent, or null for a static token. */
export function accentStyle(accent: Accent): CSSProperties | null {
  if (accent.key !== "custom") return null;
  return { color: accent.hex, borderColor: accent.hex };
}

