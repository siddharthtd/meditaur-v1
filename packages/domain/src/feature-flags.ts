/**
 * The account's feature flags (`P0 · 23`, slice 23a), and the pure questions a surface
 * asks about them.
 *
 * The owner's answer is `DECISIONS.md` §11: **a flag belongs to an account, the admin
 * panel is its only writer, and every flag defaults to true.** This file is the
 * vocabulary half of that — the names, what each one means in a sentence, and the
 * questions — with no storage of its own. Where a value comes *from* is the port's
 * business (`FeatureFlagsPort` in `ports.ts`, the two adapters in `packages/db`).
 *
 * **A flag hides surfaces and keeps the data.** Nothing here refuses a write or drops a
 * row: a screen asks whether a table, a tab, an editor or a switch may be drawn, and a
 * plan made while a feature was on still runs. Flags are the owner's say over what one
 * reader sees, not a security boundary — the boundaries are the flags table's policies
 * and the admin function's own check.
 *
 * **Every default is true**, and that is what makes this harmless: a device with no
 * cloud, nobody signed in, or a row written before a flag existed behaves exactly as the
 * app does today. A flag is therefore only ever a subtraction the owner makes for one
 * account, which is why the "no set at all" branch of every question below answers the
 * same way the default does.
 *
 * The three reiki flags are `ReikiSystem`'s own values rather than a second spelling of
 * them, so a symbol's system can be asked about directly (`isSymbolSystemEnabled`, which
 * is in `reiki-systems.ts` beside the rest of the symbol vocabulary).
 */
import type { ReikiSystem } from "./models.ts";
import { CHAKRA_TYPE_ID } from "./meditation-types.ts";

/**
 * The flags, in one list and one order.
 *
 * This list is the only place the set is written down in code: the panel draws it, the
 * migration's key list is checked against it, and `DEFAULT_FEATURE_FLAGS` and
 * `FEATURE_FLAG_INFO` are keyed by it, so a flag added in one place and forgotten in
 * another fails to compile rather than going quietly missing.
 */
export const FEATURE_FLAGS: readonly FeatureFlag[] = [
  "account_management",
  "admin_panel",
  "karuna_reiki",
  "usui_reiki",
  "reiki_master",
  "chakras",
  "binaural",
  "auto_scroll",
  // The owner's round 24 (2026-09-24) — the three features the same round built, each
  // of them a subtraction the owner can make for one account. Note that they are
  // **behaviour** gates rather than surface gates alone: with the randomiser off a
  // session reads every line, and with the session colours off a run looks as it did.
  // Both are the `binaural` precedent (off means silent, the session still runs).
  "intention_randomiser",
  "colour_scheme",
  "chakra_immersion",
];

export type FeatureFlag =
  | "account_management"
  | "admin_panel"
  | "karuna_reiki"
  | "usui_reiki"
  | "reiki_master"
  | "chakras"
  | "binaural"
  | "auto_scroll"
  | "intention_randomiser"
  | "colour_scheme"
  | "chakra_immersion";

/**
 * The resolved set: every flag present, so a screen never asks a question whose answer
 * is "the row did not say".
 *
 * A row in the cloud is **sparse** — an absent key means the default — so normalizing is
 * the adapter's job (`normalizeFeatureFlags`) and what travels through the app is this:
 * complete, and therefore readable without a fallback at each read.
 */
export type FeatureFlags = Readonly<Record<FeatureFlag, boolean>>;

/**
 * Every flag on, which is what a device with no cloud, a reader who is not signed in, or
 * an account whose row says nothing all behave as.
 *
 * Written out rather than derived from a loop so that a flag added to the union fails
 * here first: a missing key is a compile error, and a default this file cannot forget.
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  account_management: true,
  admin_panel: true,
  karuna_reiki: true,
  usui_reiki: true,
  reiki_master: true,
  chakras: true,
  binaural: true,
  auto_scroll: true,
  intention_randomiser: true,
  colour_scheme: true,
  chakra_immersion: true,
};

/** One flag as the panel says it: the row's label and the line under it. */
export type FeatureFlagInfo = {
  label: string;
  summary: string;
};

/**
 * What each flag is called and what turning it off hides.
 *
 * The panel's own words, and the only place a flag is explained to a human: it is the
 * owner's tool, and the summaries name the *surfaces* rather than the catalogue rows,
 * because that is the rule the flags follow.
 *
 * The reiki summaries name symbols the way the owner named them (`DECISIONS.md` §11), so
 * the panel and the owner's own list read the same.
 */
export const FEATURE_FLAG_INFO: Readonly<Record<FeatureFlag, FeatureFlagInfo>> = {
  account_management: {
    label: "Account management",
    summary: "Sign-in, sign-up, and the account half of the Account screen.",
  },
  admin_panel: {
    label: "Admin panel",
    summary: "This panel itself. Off means nobody can reach it, whatever an account says.",
  },
  karuna_reiki: {
    label: "Karuna Reiki",
    summary: "The Karuna symbols, and the Karuna table that draws those rows.",
  },
  usui_reiki: {
    label: "Usui Reiki",
    summary: "Hon Sha Ze Sho Nen, Sei Hei Ki and Cho Ku Rei.",
  },
  reiki_master: {
    label: "Reiki master",
    summary: "The master symbol, Dai Kyo Mo.",
  },
  chakras: {
    label: "Chakras",
    summary: "The Chakra table, and the plans that use one.",
  },
  binaural: {
    label: "Binaural beats",
    summary: "The tone editors, the tuner, and the session's binaural switch.",
  },
  auto_scroll: {
    label: "Auto-scroll",
    summary: "The session's Scroll switch, and the editor's auto-scroll setting.",
  },
  intention_randomiser: {
    label: "Random intentions",
    summary:
      "A plan card's Intentions section, and the counts a session reads from it.",
  },
  colour_scheme: {
    label: "Colour schemes",
    summary: "The eight themes on Settings, and the colours each one repaints.",
  },
  chakra_immersion: {
    label: "Session colours",
    summary: "A session drawn in the colour of the meditation it is running.",
  },
};

/**
 * A stored row turned into the resolved set: every flag present, an absent key the
 * default, and anything the row says that is not a boolean ignored.
 *
 * The argument is `unknown` on purpose. It comes from a `jsonb` column that the browser
 * can read and only the service role writes, so the honest type is "what a row holds,
 * which may be a shape this build has never seen" — a flag added since the row was
 * written, a key from a version that named a flag differently, or a hand-edited value.
 * Every one of those reads as the default rather than as a broken screen.
 */
export function normalizeFeatureFlags(stored: unknown): FeatureFlags {
  const row = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const flags = { ...DEFAULT_FEATURE_FLAGS };
  for (const flag of FEATURE_FLAGS) {
    const value = row[flag];
    if (typeof value === "boolean") flags[flag] = value;
  }
  return flags;
}

/**
 * Whether a surface may be drawn.
 *
 * `flags` is nullable because "nobody has told us" is a real state — not signed in, no
 * cloud pair, or a read that failed — and it answers with the default: the app a reader
 * gets before any account exists is the app with everything on.
 *
 * A **partial** set is answered the same way, key by key, and that is not defensiveness:
 * a set stored by an older build has no entry for a flag added since, and a bare lookup
 * would read that absence as `false` — hiding a feature because the value predates it.
 * The type says `Partial` so callers may pass a stored row through unchanged.
 */
export function flagIsOn(
  flags: Partial<Record<FeatureFlag, boolean>> | null | undefined,
  flag: FeatureFlag,
): boolean {
  const value = flags?.[flag];
  return typeof value === "boolean" ? value : DEFAULT_FEATURE_FLAGS[flag];
}

/**
 * The meditation types a surface may list, with the chakra type behind its flag
 * (`P0 · 35`'s slice 35a).
 *
 * One seam, because every surface that offers a type asks this: the library's tab strip,
 * the Database's table and a plan's headings are all generated from these rows, so
 * filtering here is what makes the three agree. A reader's own types are never hidden —
 * the flag is the owner's say over the catalogue the app ships, and a type someone added
 * is not part of it.
 *
 * A stored plan that uses a chakra still runs: this decides what may be *offered*, and
 * nothing in the compile path reads it.
 */
export function visibleTypes<T extends { id: string }>(
  types: T[],
  flags: FeatureFlags | null | undefined,
): T[] {
  if (flagIsOn(flags, "chakras")) return types;
  return types.filter((type) => type.id !== CHAKRA_TYPE_ID);
}

/** The flags a symbol's system answers to; a symbol's system *is* a flag name. */
export type ReikiFlag = Extract<FeatureFlag, ReikiSystem>;
