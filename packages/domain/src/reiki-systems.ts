/**
 * The reiki systems, and which of them the app enables (the owner's round 16,
 * §2.5 and §6).
 *
 * A symbol carries the system it belongs to. Which systems a surface *lists* is a
 * **feature flag** since `P0 · 23`: the owner's words of 2026-09-22 are that the flags are
 * per account and the admin panel is the one that sets them, so the constant this file
 * used to answer with (`ENABLED_REIKI_SYSTEMS`, every system, for ever) is a value in
 * `account_flags` now.
 *
 * Every surface that lists symbols asks `visibleSymbols` or `isSymbolSystemEnabled` and
 * nothing else, so there is one answer to "may this row be shown" rather than one per
 * table.
 *
 * The four rows below are the ones the owner asked for in §6. They live here rather
 * than in the seed for the reason `SEEDED_MEDITATION_TYPES` does: **three mirrors
 * have to agree about them** — the seed a fresh device gets, the Dexie version that
 * places them on a device that already holds a catalogue, and the SQL migration that
 * does it for the cloud tables — and a list written once is what makes them agree.
 * The ids are the slots the seed mints (`nid()`, `01900000-0000-7000-8000-…`), so a
 * device seeding itself, a device repairing itself and a cloud row are the same row.
 */
import { flagIsOn, type FeatureFlags } from "./feature-flags.ts";
import type { ReikiSystem } from "./models.ts";

/**
 * The system a symbol belongs to when nothing says otherwise.
 *
 * Before this round the app shipped one system, so this is not a default of
 * convenience: it is what every symbol that already exists *is* — the eight seeded
 * ones, and a reader's own rows with them, which a catalogue file written earlier
 * cannot tell apart and has no reason to.
 */
export const DEFAULT_REIKI_SYSTEM: ReikiSystem = "karuna_reiki";

/** Every system the app knows, in the order the owner's §2.5 names them. */
export const REIKI_SYSTEMS: readonly ReikiSystem[] = [
  "karuna_reiki",
  "usui_reiki",
  "reiki_master",
];

/**
 * Whether a symbol of this system is listed.
 *
 * The one question a surface asks, and it is asked with `undefined` as often as with a
 * value: a symbol the app does not place in a system — one the reader added, or a row
 * written before the field existed — is **never hidden**. That is the safety property
 * the gate needs: it is the owner's say over the catalogue the app ships, and a row that
 * names no system is in no system that could be turned off.
 *
 * The answer comes from the account's flags since `P0 · 23`'s slice 23a, which is what
 * finally gives `DECISIONS.md` §4's Karuna gate a caller. The two vocabularies line up by
 * construction rather than by a mapping table: a `ReikiSystem` **is** a feature flag
 * (`ReikiFlag` in `feature-flags.ts`), so a system is asked about under its own name and
 * a fourth system would be a flag or a compile error.
 */
export function isSymbolSystemEnabled(
  system: ReikiSystem | null | undefined,
  flags: FeatureFlags | null | undefined,
): boolean {
  return system == null || flagIsOn(flags, system);
}

/**
 * The symbols a surface may list (`P0 · 35`'s slice 35b).
 *
 * One seam, because the four surfaces that offer a symbol — the library's Symbols tab,
 * the Database's Symbols table, the sentences a plan block picks and the run screen — all
 * read the same rows, and a gate applied at four call sites is a gate that will be
 * applied at three. A symbol naming no system is never hidden; this is only ever about
 * the systems the owner turned off for one account.
 */
export function visibleSymbols<T extends { reikiSystem?: ReikiSystem | null }>(
  symbols: T[],
  flags: FeatureFlags | null | undefined,
): T[] {
  return symbols.filter((symbol) => isSymbolSystemEnabled(symbol.reikiSystem, flags));
}

/**
 * The rows the owner's §2.5 adds to the catalogue, in the order they read in.
 *
 * Four symbols and nothing else: their Description and Usage are seeded **empty**,
 * because the owner said they will fill them in. The last one is spelled the way the
 * owner spelled it — it is the Usui Master symbol, usually written "Dai Ko Myo", and
 * the label is the owner's to choose.
 */
export const SEEDED_REIKI_SYMBOLS: {
  id: string;
  name: string;
  reikiSystem: ReikiSystem;
}[] = [
  {
    id: "01900000-0000-7000-8000-000000000038",
    name: "Hon Sha Ze Sho Nen",
    reikiSystem: "usui_reiki",
  },
  {
    id: "01900000-0000-7000-8000-000000000039",
    name: "Sei Hei Ki",
    reikiSystem: "usui_reiki",
  },
  {
    id: "01900000-0000-7000-8000-00000000003a",
    name: "Cho Ku Rei",
    reikiSystem: "usui_reiki",
  },
  {
    id: "01900000-0000-7000-8000-00000000003b",
    name: "Dai Kyo Mo",
    reikiSystem: "reiki_master",
  },
];
