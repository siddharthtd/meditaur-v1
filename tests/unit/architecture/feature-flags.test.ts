import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FEATURE_FLAGS } from "@meditaur/domain";

/**
 * The account flags' two boundaries (`P0 · 23`, slice 23b).
 *
 * The domain's union and the database's key list have to say the same thing, and the
 * table has to be readable by its owner and writable by nobody. Both are rules a
 * passing test suite would otherwise not notice: a flag missing from the check is a flag
 * the admin function cannot write, and a self-write policy is a reader setting their own
 * gates — which is the one thing `DECISIONS.md` §11 rules out.
 *
 * The migration is read as text rather than through a client, the way `schema-unions`
 * and `sync-marks` read theirs: the unit suite has no database, and what is being
 * asserted is what the file says, not what a particular stack happens to hold.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Every migration that mentions the table, joined: the RLS and column assertions read it. */
function accountFlagsSql(): string {
  const dir = join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .filter((text) => text.includes("account_flags"))
    .join("\n");
}

/**
 * Each migration's own statement of the key check, oldest first.
 *
 * The check is **replaced**, never appended: a flag added later means a later migration
 * drops the constraint and re-states the whole list, which is the additive shape every
 * migration here follows. So the newest statement is the contract and an earlier one is
 * history.
 *
 * Reading this as a list rather than one joined string is the whole point: an earlier
 * version of this file joined every migration that mentioned `account_flags` and
 * asserted no name appeared twice, which passed while there was one migration and failed
 * the moment a second one legitimately re-stated the check — the guard would have
 * forbidden the only additive way to add a flag.
 */
function keyListsByMigration(): { name: string; keys: string[] }[] {
  const dir = join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }))
    .filter((file) => file.text.includes("account_flags_known_keys"))
    .map((file) => ({
      name: file.name,
      // `flags - 'x'` drops one key, so the dashes *are* the list; nothing else in
      // these files uses that shape.
      keys: [...file.text.matchAll(/- '([a-z_]+)'/g)].map(([, key]) => key),
    }))
    .filter((file) => file.keys.length > 0);
}

const sql = accountFlagsSql();
const keyLists = keyListsByMigration();
const latestKeys = keyLists.at(-1)?.keys ?? [];

/**
 * The admin function is Deno, outside every project this toolchain compiles, so the
 * only way to keep its copy of the eight in step is to read it as text — which is also
 * why a guard belongs there at all: nothing else would notice a flag the panel could
 * draw and not write.
 */
function adminFunction(): string {
  return readFileSync(join(repoRoot, "supabase/functions/admin/index.ts"), "utf8");
}

/** The names in the function's own `KNOWN_FLAGS` literal, read between its brackets. */
const flagsInFunction = [
  ...(adminFunction().match(/const KNOWN_FLAGS = \[([\s\S]*?)\] as const;/)?.[1] ?? "").matchAll(
    /"([a-z_]+)"/g,
  ),
].map(([, key]) => key);

/**
 * The flag names the newest statement of the check accepts. `flags - 'x'` drops one key,
 * so the dashes *are* the list; nothing else in these files uses that shape.
 */
const keysInSql = latestKeys;

describe("the account flags", () => {
  it("keeps the union the domain knows and the keys the check accepts in step", () => {
    // The list is read as a set of names, not as a statement, because the check may be
    // rewritten (a flag added, the layout changed) and only the names are the contract.
    expect(keyLists.at(-1)?.name, "no migration states the flags check — has it moved?") 
      .toBeTruthy();
    expect(keysInSql.length, "the check's key list was not found — has it been renamed?")
      .toBeGreaterThan(0);
    expect([...keysInSql].sort()).toEqual([...FEATURE_FLAGS].sort());
    expect(new Set(keysInSql).size, "no key twice").toBe(keysInSql.length);
  });

  it("re-states the check additively, so a live database can take a new flag", () => {
    // Every statement of the check drops the constraint before adding it. That is what
    // makes the migration re-runnable, and it is also what makes the *newest* statement
    // the one a database ends up holding — without the drop, the second statement would
    // fail on a database that already had the first.
    expect(keyLists.length, "at least one migration states the check").toBeGreaterThan(0);
    for (const file of keyLists) {
      const text = readFileSync(join(repoRoot, "supabase/migrations", file.name), "utf8");
      expect(text, `${file.name} drops the constraint before adding it`).toMatch(
        /drop constraint if exists account_flags_known_keys/,
      );
    }
  });

  it("lets an account read its own flags and write none", () => {
    // The asymmetry is the design: the browser has to read its own row, because the
    // flags gate the app, and no account may write one, because a flag is the owner's
    // decision about that account. The only writer is the `admin` function's service
    // role, which bypasses RLS — so "no write policy" is what makes the function the
    // one door, rather than a detail that could be relaxed by accident.
    expect(sql).toMatch(/alter table public\.account_flags enable row level security;/);
    expect(sql).toMatch(/for select using \(user_id = auth\.uid\(\)\)/);

    const policies = [...sql.matchAll(/create policy \w+ on public\.account_flags\s+for (\w+)/g)]
      .map(([, command]) => command);
    expect(policies, "the table has a policy").toContain("select");
    expect(
      policies.filter((command) => command !== "select"),
      "nothing but a self-select policy",
    ).toEqual([]);
  });

  it("is one row per account, and a row that can be absent", () => {
    // Keyed by identity rather than by a list, `on delete cascade` so closing an account
    // takes its flags with it, and a sparse default so an account with no row is an
    // account with every default — the state every account starts in.
    expect(sql).toMatch(
      /user_id uuid primary key references auth\.users\(id\) on delete cascade/,
    );
    expect(sql).toMatch(/flags jsonb not null default '\{\}'::jsonb/);
    expect(sql).toMatch(/is_admin boolean not null default false/);
  });

  it("keeps the admin function's own key list in step, and strict on the way in", () => {
    // The third mirror: the union in the domain, the check in the migration, and this —
    // a Deno function cannot import the domain, so it carries the list. The function is
    // the only writer the table has, so a flag missing here is a flag the owner cannot
    // set, and the register's `P4 · 34` means nothing else would catch it: no typecheck,
    // no lint and no unit test reaches `supabase/functions/`.
    expect(
      flagsInFunction.length,
      "the function's key list was not found — has `KNOWN_FLAGS` moved or been renamed?",
    ).toBeGreaterThan(0);
    expect([...flagsInFunction].sort()).toEqual([...FEATURE_FLAGS].sort());

    const source = adminFunction();
    // Strict on the way in, unlike the read path: a tolerant write turns a typo into an
    // account whose exclusions were silently cleared, which is the one failure the owner
    // could not see.
    expect(source, "an unknown key is refused rather than written").toMatch(/unknown_flag/);
    expect(source, "a value that is not a boolean is refused").toMatch(/invalid_flag_value/);
    // The marker is not writable through the function, so an admin cannot mint another.
    // Read as "never named as a key": the file reads `row.is_admin` and filters on
    // `is_admin`, and neither is a write.
    expect(source, "`is_admin` is never a written key").not.toMatch(/["']is_admin["']/);
  });
});

/**
 * Where each flag is asked, and the expression that has to stay there (`P0 · 35`, slice
 * 35g).
 *
 * Every gate in item 35 lands at a **default-on** seam, so the whole suite — unit,
 * integration and e2e — exercises the app with nothing hidden: delete one of these
 * expressions and every other test still passes, because everything they run has the
 * flags on. That is the one failure mode a flags feature has, and this is the guard for
 * it: the file, the expression, and one line saying which surface it is.
 */
const GATES: readonly { file: string; must: RegExp; what: string }[] = [
  {
    file: "packages/domain/src/feature-flags.ts",
    must: /return types\.filter\(\(type\) => type\.id !== CHAKRA_TYPE_ID\)/,
    what: "the chakra type, out of every list a screen asks this for",
  },
  {
    file: "packages/domain/src/reiki-systems.ts",
    must: /return symbols\.filter\(\(symbol\) => isSymbolSystemEnabled\(symbol\.reikiSystem, flags\)\)/,
    what: "the reiki symbols, by the system the row names",
  },
  {
    file: "apps/web/src/features/library/Library.tsx",
    must: /visibleTypes\(view\.meditationTypes, flags\)/,
    what: "the library's type tabs and a type tab's own list",
  },
  {
    file: "apps/web/src/features/library/library-model.ts",
    must: /row\.id !== "presets" \|\| flagIsOn\(flags, "binaural"\)/,
    what: "the library's Presets tab",
  },
  {
    file: "apps/web/src/features/library/MeditationTable.tsx",
    must: /showChakra && flags\.binaural/,
    what: "the editor's `Binaural` section, which the record page draws too",
  },
  {
    file: "apps/web/src/features/database/DatabaseScreen.tsx",
    must: /symbols: visibleSymbols\(view\.symbols, flags\)/,
    what: "the Database's Symbols table and the chips that bind one",
  },
  {
    file: "apps/web/src/features/database/database-tables.ts",
    must: /flagIsOn\(flags, "karuna_reiki"\)/,
    what: "the Karuna and Affirmations tables",
  },
  {
    file: "apps/web/src/features/database/database-tables.ts",
    must: /row\.id !== "presets" \|\| flagIsOn\(flags, "binaural"\)/,
    what: "the Database's Presets table",
  },
  {
    file: "apps/web/src/features/database/DatabaseTable.tsx",
    must: /!BINAURAL_COLUMNS\.includes\(row\.key\) \|\| flagIsOn\(flags, "binaural"\)/,
    what: "the grid's two binaural columns, which is also the toolbar's list",
  },
  {
    file: "apps/web/src/features/planner/Planner.tsx",
    must: /meditationTypes: pickerTypes,/,
    what: "both picker doors, through the one gated library",
  },
  {
    file: "apps/web/src/features/planner/Planner.tsx",
    must: /flags\.auto_scroll && autoScrollForKind\(stage\.kind\)/,
    what: "the stage card's auto-scroll switch",
  },
  {
    file: "packages/application/src/create-app.ts",
    must: /binauralSilent: !flags\.binaural/,
    what: "the silent compile — the tones, not a screen",
  },
  {
    file: "apps/web/src/features/runner/StageStrip.tsx",
    must: /\{binauralOn \? \(/,
    what: "the run's stage mark",
  },
  {
    file: "apps/web/src/features/runner/Runner.tsx",
    must: /flags\.auto_scroll &&\n {4}Boolean\(block && stageKind/,
    what: "the run's scroll derivation, and the footer latch with it",
  },
  {
    file: "apps/web/src/features/auth/AuthPanel.tsx",
    must: /if \(!flags\.account_management\)/,
    what: "sign-in and sign-up, which is both of their routes",
  },
  {
    file: "apps/web/src/features/admin/AdminPanel.tsx",
    must: /flags\.admin_panel/,
    what: "the panel itself",
  },
  {
    file: "apps/web/src/features/binaural-tuner/Tuner.tsx",
    must: /if \(!flags\.binaural\)/,
    what: "the tuner's own answer to a typed address",
  },
  {
    file: "apps/web/src/features/planner/Planner.tsx",
    must: /flags\.intention_randomiser/,
    what: "the plan card's Intentions section",
  },
  {
    file: "packages/application/src/create-app.ts",
    must: /randomiseIntentions: flags\.intention_randomiser/,
    what: "the randomiser itself — off means a session reads every line",
  },
  {
    file: "apps/web/src/features/settings/Settings.tsx",
    must: /flags\.colour_scheme \? \(/,
    what: "the eight themes, which is the only place a scheme is chosen",
  },
  {
    file: "apps/web/src/features/runner/Runner.tsx",
    must: /flags\.chakra_immersion/,
    what: "the session drawn in the meditation's own colour",
  },
];

/** Everything the gates are read out of, plus the file that names every flag. */
const GATED_FILES = [
  ...new Set([
    ...GATES.map((row) => row.file),
    "packages/domain/src/reiki-systems.ts",
    "packages/domain/src/feature-flags.ts",
  ]),
];

describe("the surfaces a flag hides", () => {
  it("keeps every gate where it was written, with the expression that does it", () => {
    // Read as text, the way this suite reads migrations: what is asserted is what the
    // file says. A gate deleted here and re-added as a comment fails, and so does one
    // moved into a helper that no longer receives the flags.
    for (const gate of GATES) {
      const source = readFileSync(join(repoRoot, gate.file), "utf8");
      expect(source, `${gate.what} (${gate.file})`).toMatch(gate.must);
    }
  });

  it("names every flag in the files that gate them", () => {
    // The other half: a flag added to the union and wired *nowhere* would otherwise be a
    // name the panel can set and nothing reads — the shape of a feature that looks
    // delivered. The three reiki names are the system union's own spelling, so
    // `reiki-systems.ts` naming them is what counts for those two.
    const text = GATED_FILES.map((file) => readFileSync(join(repoRoot, file), "utf8")).join("\n");
    for (const flag of FEATURE_FLAGS) {
      expect(text, `${flag} is asked by name somewhere`).toMatch(
        new RegExp(`flags\\.${flag}|"${flag}"`),
      );
    }
  });
});
