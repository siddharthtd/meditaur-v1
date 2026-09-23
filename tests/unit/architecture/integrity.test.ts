import { lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function listTsFiles(relativeDir: string): string[] {
  const dir = join(repoRoot, relativeDir);
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (name.endsWith(".ts") || name.endsWith(".tsx")) {
        out.push(path.slice(repoRoot.length + 1));
      }
    }
  };
  walk(dir);
  return out;
}

function listWorkflowRelPaths(): string[] {
  const dir = join(repoRoot, ".github/workflows");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => `.github/workflows/${name}`);
}

const PATH_FILTER_EVENTS = ["pull_request", "push", "pull_request_target"];

function workflowOnBlock(text: string): string {
  expect(text).not.toMatch(/^on:\s*\[/m);
  expect(text).not.toMatch(/^on:\s*[a-z_]+\s*$/m);
  const match = text.match(
    /^on:\n([\s\S]*?)^(?:concurrency|permissions|env|defaults|jobs):/m,
  );
  expect(match, "workflow on: mapping before jobs").toBeTruthy();
  return match![1];
}

function eventBodies(onBlock: string): Map<string, string> {
  const events = new Map<string, string>();
  const matches = [...onBlock.matchAll(/^ {2}([a-z_]+):\n/gm)];
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1];
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : onBlock.length;
    events.set(name, onBlock.slice(start, end));
  }
  return events;
}

function eventIgnoresAllMarkdown(body: string): boolean {
  return /(?:^|\n) {4}paths-ignore:\n(?: {6}- .+\n)* {6}- ["']\*\*\.md["']\s*(?:\n|$)/.test(
    body,
  );
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("hexagon and schema contracts", () => {
  it("wires Dexie only in composition; runtime loads bytes through MeditaurApp", () => {
    const composition = readRepo("apps/web/src/composition.ts");
    const runtime = readRepo("apps/web/src/runtime.ts");
    expect(composition).toMatch(/blobs:\s*dexieBlobs/);
    expect(composition).toMatch(/runInTransaction:\s*dexieRunInTransaction/);
    expect(composition).not.toMatch(/NEXT_PUBLIC_E2E/);
    expect(composition).toMatch(/sessionStorage\.getItem\(E2E_DURATION_STORAGE_KEY\)/);
    expect(readRepo(".env.example")).not.toMatch(/NEXT_PUBLIC_E2E/);
    expect(runtime).not.toMatch(/@meditaur\/db/);
    expect(runtime).toMatch(/app\.getMediaBytes/);
    expect(runtime).toMatch(/export function getMixer\(scope: MixerScope\)/);
    expect(runtime).toMatch(/getMixer\("runner"\)/);
    expect(runtime).toMatch(/if \(key !== scope\) other\.suspend\(\)/);
    expect(readRepo("packages/domain/src/audio-port.ts")).toMatch(
      /setMasterVolume\(value: number\): void/,
    );
    expect(readRepo("packages/domain/src/audio-port.ts")).toMatch(
      /setAlarmVolume\(value: number\): void/,
    );
    expect(readRepo("apps/web/src/features/binaural-tuner/Tuner.tsx")).toMatch(
      /getMixer\("tuner"\)/,
    );
    // The product calls one run a "session" and the overall loudness "master
    // volume". These are the three labels a reader meets first, so they are
    // pinned here rather than left to drift back.
    expect(readRepo("apps/web/src/features/home/Home.tsx")).toContain("Start session");
    expect(readRepo("apps/web/src/features/runner/Runner.tsx")).toContain(
      "Start another session",
    );
    expect(readRepo("apps/web/src/features/library/HistoryTable.tsx")).toContain(
      "Sessions completed this week",
    );

    for (const file of listTsFiles("apps/web/src")) {
      if (file === "apps/web/src/composition.ts") continue;
      expect(readRepo(file), file).not.toMatch(/from ["']@meditaur\/db["']/);
    }
  });

  it("keeps BlobStore off the catalog and storagePath adapter-opaque", () => {
    const ports = readRepo("packages/domain/src/ports.ts");
    expect(ports).toMatch(/export type BlobStore = \{/);
    expect(ports).toMatch(/saveMediaAsset\(asset: MediaAsset\): Promise<void>/);
    expect(ports).not.toMatch(/saveMediaAsset\([^)]*ArrayBuffer/);
    expect(ports).toMatch(
      /loadCompileLibrary\(workspaceId: string, plan\?: Plan\): Promise<CompileLibrary>/,
    );
    expect(readRepo("packages/application/src/media-writes.ts")).not.toMatch(/dexie:/);
    expect(readRepo("packages/application/src/media-writes.ts")).toMatch(
      /storagePath:\s*input\.id/,
    );
    expect(readRepo("packages/application/src/create-app.ts")).toMatch(
      /blobs\.put\(asset\.id, bytes, mimeType\)/,
    );
    expect(readRepo("packages/db/src/index.ts")).not.toMatch(/loadMediaBytes/);
  });

  it("scopes Dexie compile reads when a plan is given", () => {
    const ports = readRepo("packages/db/src/ports.ts");
    const fn = ports.slice(
      ports.indexOf("async loadCompileLibrary"),
      ports.indexOf("listMeditations:"),
    );
    expect(fn).toContain("if (!plan)");
    // The scoped branch reads by the ids the plan names. It used to be the table
    // views that decided the scope; the plan's own blocks do that now, and the
    // associations come from the entries of the chakras it runs.
    const planBranchStart = fn.indexOf("const explicitSymbolIds");
    expect(planBranchStart).toBeGreaterThan(-1);
    const scoped = fn.slice(planBranchStart);
    expect(scoped).toContain("mediaIds");
    expect(scoped).toContain("entriesForMeditationIds");
    expect(scoped).toMatch(/mediaAssets\.bulkGet/);
    expect(scoped).not.toMatch(/mediaAssets\.where\("workspaceId"\)/);
    expect(scoped).not.toMatch(/presets\.where\("workspaceId"\)/);
  });

  it("uses stable UUID bootstrap ids and a single in-flight seed", () => {
    const seed = readRepo("packages/db/src/seed.ts");
    const user = seed.match(/export const LOCAL_USER = "([^"]+)"/)?.[1];
    const workspace = seed.match(/export const LOCAL_WS = "([^"]+)"/)?.[1];
    expect(user).toMatch(UUID);
    expect(workspace).toMatch(UUID);
    expect(seed).toMatch(/let seedInFlight:/);
    expect(seed).toMatch(/if \(!seedInFlight\)/);
  });

  it("versions the catalogue rows in the domain, Dexie and SQL", () => {
    // The catalogue's per-row revision: the basis a later push compares. Every catalogue row that sync
    // will send has to say the same thing in all three descriptions of the
    // product, and the write path has to be the one that moves it.
    const models = readRepo("packages/domain/src/models.ts");
    const dexie = readRepo("packages/db/src/schema.ts");
    const sql = readRepo("supabase/migrations/20260916180000_catalog_row_versioning.sql");
    const app = readRepo("packages/application/src/create-app.ts");

    expect(models).toMatch(
      /export type Versioned = \{[\s\S]*?revision: number;[\s\S]*?updatedAt: number;/,
    );
    for (const type of [
      "Meditation",
      "Symbol",
      "Intention",
      "FieldDef",
      "FieldOption",
      "FieldValue",
      "BinauralPreset",
      "MediaAsset",
    ]) {
      expect(models, type).toMatch(new RegExp(`export type ${type} = (?:Archived|Versioned) & \\{`));
    }
    // The Database's own new row, and the state that lets a record step aside
    // without anything that depends on it being touched.
    expect(models).toMatch(/export type Archived = Versioned & \{[\s\S]*?archivedAt: number \| null;/);
    expect(models).toMatch(/export type Entry = Archived & \{[\s\S]*?meditationId: string \| null;/);

    // Dexie backfills those rows in one data-only version.
    const v13 = dexie.slice(dexie.indexOf("this.version(13)"), dexie.indexOf("this.version(14)"));
    expect(v13.length).toBeGreaterThan(0);
    for (const table of [
      "focusPoints",
      "symbols",
      "intentions",
      "fieldDefs",
      "fieldValuesByEntity",
      "presets",
      "mediaAssets",
    ]) {
      expect(v13, table).toContain(`"${table}"`);
    }
    // v15 is the Database: two tables arrive, two are dropped, and every stored
    // pair becomes a row before the pair-scoped columns go.
    const v15 = dexie.slice(dexie.indexOf("this.version(15)"), dexie.indexOf("export const db"));
    expect(v15).toContain('entries: "id, workspaceId, focusPointId, symbolId"');
    expect(v15).toContain("focusSymbolBindings: null");
    expect(v15).toContain("tableViews: null");
    expect(v15).toMatch(/table\("entries"\)\.bulkPut/);
    expect(v15).toMatch(/intentions: "id, workspaceId, entryId"/);

    // The owner's round 15 (2026-09-19) renamed the stored world — the table, the columns
    // that named a meditation, and the two stored unions — in its own migration.
    // The assertions above deliberately keep the *old* words, because they read
    // files that are history and an applied migration is never edited; this is what
    // asserts the schema a database has today, and that the history is what the
    // rename says it is.
    const rename = readRepo("supabase/migrations/20260919140000_rename_meditations.sql");
    expect(rename).toMatch(/alter table public\.focus_points rename to meditations/);
    expect(rename).toMatch(/rename column focus_point_id to meditation_id/);
    expect(rename).toMatch(/set scope = 'meditation' where scope = 'focusPoint'/);
    expect(rename).toMatch(/set ref_kind = 'meditation' where ref_kind = 'focusPoint'/);
    expect(rename).toMatch(/check \(scope in \('entry', 'meditation', 'symbol'\)\)/);
    expect(rename).toMatch(/check \(ref_kind is null or ref_kind in \('meditation', 'symbol', 'preset'\)\)/);
    // And the Dexie side of the same move is one version that declares the old
    // store gone, creates the new one and rewrites the field it indexed.
    const v18 = dexie.slice(dexie.indexOf("this.version(18)"), dexie.indexOf("export const db"));
    expect(v18).toMatch(/focusPoints: null/);
    expect(v18).toMatch(/meditations: "id, workspaceId"/);
    expect(v18).toMatch(/entries: "id, workspaceId, meditationId, symbolId"/);
    expect(v18).toMatch(/renameField\("entries", "focusPointId", "meditationId"\)/);

    // Stages (round 15, 2026-09-19) are three columns and one drop, in their own migration:
    // a type's template, a meditation's own copy of it, and a block's materialised
    // rows — with the single `duration_ms` gone, because a block's length is now the
    // sum of its stages.
    const stages = readRepo("supabase/migrations/20260919150000_stages.sql");
    expect(stages).toMatch(
      /alter table public\.meditation_types\s+add column if not exists stages jsonb not null default '\[\]'::jsonb/,
    );
    expect(stages).toMatch(/alter table public\.meditations\s+add column if not exists stages jsonb/);
    expect(stages).toMatch(
      /alter table public\.plan_blocks\s+add column if not exists stages jsonb not null default '\[\]'::jsonb/,
    );
    expect(stages).toMatch(/alter table public\.plan_blocks\s+drop column if exists duration_ms/);
    // The Dexie side is one repair version: a type row with no template, and a
    // meditation with no copy of its own.
    const v20 = dexie.slice(dexie.indexOf("this.version(20)"), dexie.indexOf("export const db"));
    expect(v20).toMatch(/copyStages\(seeded\.get\(row\.id as string\) \?\? \[\]\)/);
    expect(v20).toMatch(/stages: template \? copyStages\(template\) : null/);

    // And the SQL migration adds both columns to each of those tables — one
    // statement each, so a table that quietly lost its columns cannot be covered
    // by the next one matching instead.
    const statements = sql.split(/alter table public\./).slice(1);
    expect(statements.length).toBe(8);
    expect(new Set(statements.map((row) => row.split("\n")[0].trim())).size).toBe(8);
    for (const statement of statements) {
      expect(statement).toMatch(
        /add column if not exists revision int not null[\s\S]*add column if not exists updated_at timestamptz not null/,
      );
    }
    // Append-only rows are deliberately left out of it.
    expect(sql).not.toMatch(/alter table public\.session_logs/);

    // The one place a catalogue write is stamped.
    expect(app).toMatch(/function stamped<T extends Versioned>\(row: T\): T \{/);
    expect(app).toMatch(/return versionedRow\(row, ports\.clock\.nowMs\(\)\);/);
  });

  it("orders media assets in the domain, Dexie and SQL", () => {
    // `P2 · 4`, the owner's answer 2026-09-21: an upload has an order, so a screen
    // can insert it where it belongs instead of re-reading the catalogue. The column
    // has to exist in all three descriptions of the product for the same reason the
    // revision does — a device numbers what it already holds, and the cloud row that
    // sync will send carries the same number (`P2 · 3`).
    const models = readRepo("packages/domain/src/models.ts");
    const dexie = readRepo("packages/db/src/schema.ts");
    const sql = readRepo("supabase/migrations/20260921120000_media_asset_order.sql");

    expect(models).toMatch(
      /export type MediaAsset = Versioned & \{[\s\S]*?sortOrder: number;[\s\S]*?\};/,
    );
    expect(dexie).toMatch(/this\.version\(26\)[\s\S]*?assetsWithOrder\(/);
    expect(sql).toMatch(/alter table public\.media_assets\s+add column if not exists sort_order int/);
  });

  it("describes the same product in SQL as Dexie: revision, snapshots, logs, cascading deletes", () => {
    const sql = [
      "supabase/migrations/20260904120000_init.sql",
      "supabase/migrations/20260905010000_session_gc_on_plan_delete.sql",
      "supabase/migrations/20260905020000_focus_symbol_bindings.sql",
      "supabase/migrations/20260916140000_cascade_catalog_deletes.sql",
    ]
      .map((file) => readRepo(file))
      .join("\n");
    const dexie = readRepo("packages/db/src/schema.ts");
    const models = readRepo("packages/domain/src/models.ts");
    expect(models).toMatch(/revision: number;/);
    expect(models).toMatch(/schemaVersion: number;/);
    expect(dexie).toMatch(/mediaBlobs/);
    expect(dexie).toMatch(/sessionLogs/);
    expect(dexie).toMatch(/\[workspaceId\+completedAt\]/);
    expect(sql).toMatch(/revision int not null/);
    expect(sql).toMatch(/create table if not exists public\.session_snapshots/);
    expect(sql).toMatch(/schema_version int not null/);
    expect(sql).toMatch(/create table if not exists public\.session_logs/);
    expect(sql).toMatch(/session_logs_plan_id_fkey[\s\S]*on delete cascade/);
    expect(sql).toMatch(/tts_enabled boolean not null/);
    expect(sql).toMatch(/alarm_volume real not null/);
    // The catalogue used to refuse; since 2026-09-16 it cascades. The two files
    // that created the old constraints still say `restrict` — they are history —
    // so this pins the replacement, and the application's behaviour with it
    // (tests/unit/application/create-app.test.ts carries the actual cascades).
    const cascade = readRepo("supabase/migrations/20260916140000_cascade_catalog_deletes.sql");
    expect(cascade).toMatch(
      /foreign key \(focus_point_id\) references public\.focus_points\(id\) on delete cascade/,
    );
    expect(cascade).toMatch(
      /foreign key \(focus_point_id\) references public\.focus_points\(id\) on delete cascade[\s\S]*plan_blocks/,
    );
    expect(cascade).toMatch(/foreign key \(symbol_id\) references public\.symbols\(id\) on delete set null/);
    expect(cascade).toMatch(/foreign key \(ambient_asset_id\) references public\.media_assets\(id\) on delete set null/);
    expect(cascade).toMatch(/foreign key \(alarm_asset_id\) references public\.media_assets\(id\) on delete set null/);
    expect(cascade).toMatch(/foreign key \(field_def_id\) references public\.field_defs\(id\) on delete cascade/);
    expect(cascade).not.toMatch(/on delete restrict/);
  });

  it("versions user preferences in the domain, Dexie and SQL, with the store as the swap", () => {
    // Preferences carry a revision, so a settings save that
    // another writer has moved past is refused instead of overwriting it. The
    // field has to exist in all three descriptions of the product, and the
    // compare-and-swap has to be the store's — a preference write may be a
    // network call, and a caller-side transaction cannot span one.
    const models = readRepo("packages/domain/src/models.ts");
    const dexie = readRepo("packages/db/src/schema.ts");
    const sql = readRepo("supabase/migrations/20260916170000_user_preferences_revision.sql");
    const ports = readRepo("packages/domain/src/ports.ts");
    const local = readRepo("packages/db/src/ports.ts");
    const cloud = readRepo("packages/db/src/supabase.ts");
    const app = readRepo("packages/application/src/create-app.ts");

    expect(models).toMatch(/export type UserPreferences = \{[\s\S]*?revision: number;/);
    expect(dexie).toMatch(/this\.version\(12\)[\s\S]*?revision: 0/);
    expect(sql).toMatch(
      /user_preferences[\s\S]*add column if not exists revision int not null/,
    );

    // The port says the store refuses a row whose revision it has moved past.
    expect(ports).toMatch(/save\(prefs: UserPreferences\): Promise<UserPreferences \| null>/);
    // Local: the read, the check and the write share one Dexie transaction.
    const localSave = local.slice(local.indexOf("export const dexiePreferences"));
    expect(localSave).toContain('db.transaction("rw", db.preferences');
    expect(localSave).toContain("revision !== prefs.revision");
    // Remote: the revision is part of the update's own predicate, so the swap is
    // one statement instead of two requests with a race between them.
    expect(cloud).toMatch(
      /updateWhere\(PREFERENCES_TABLE, values, \{[\s\S]*?revision: prefs\.revision/,
    );

    const start = app.indexOf("savePreferences: async (prefs) =>");
    const end = app.indexOf("getSnapshot: async (workspaceId, instanceId)");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const savePreferences = app.slice(start, end);
    expect(savePreferences).toContain("ports.preferences.save(");
    expect(savePreferences).toContain("preferencesConflict()");
    // Not wrapped in a transaction here: the store owns atomicity now.
    expect(savePreferences).not.toContain("runInTransaction");
  });

  it("keeps the requirements v2 migration aligned with Dexie v6", () => {
    const sql = readRepo("supabase/migrations/20260915000000_requirements_v2.sql");    const models = readRepo("packages/domain/src/models.ts");
    const dexie = readRepo("packages/db/src/schema.ts");
    expect(models).toMatch(/export type Intention = Archived & \{/);
    // Nullable since the owner's round 16 (§2.1): an affirmation merged into the
    // sentences, and a sentence written about nothing yet is the **orphan** the
    // Affirmations table holds — so the pair it names is optional by design.
    expect(models).toMatch(/entryId: string \| null;/);
    expect(models).toMatch(/binauralEnabled: boolean;/);
    expect(dexie).toMatch(/this\.version\(6\)/);
    // v6 declared the pair-scoped shape; v15 is what replaces it, and both stay in
    // the file because a database stored below v15 still walks through them.
    expect(dexie).toMatch(/intentions: "id, workspaceId, focusPointId, symbolId"/);
    expect(dexie).toMatch(/intentions: "id, workspaceId, entryId"/);
    expect(sql).toMatch(/update public\.focus_points set kind = 'point' where kind = 'body'/);
    expect(sql).toMatch(/create table if not exists public\.intentions/);
    // The cascade migration replaces this constraint; the file stays history.
    expect(sql).toMatch(
      /focus_point_id uuid references public\.focus_points\(id\) on delete restrict/,
    );
    expect(sql).toMatch(/alter table public\.field_values rename column symbol_id to entity_id/);
    expect(sql).toMatch(/entity_type in \('symbol', 'focusPoint'\)/);
    expect(sql).toMatch(/media_assets_kind_check check \(kind in \('ambient', 'alarm', 'image'\)\)/);
    expect(sql).toMatch(/binaural_enabled boolean not null default true/);
    expect(sql).toMatch(/drop table if exists public\.affirmations/);
  });

  it("treats Plan, Library, and Run as distinct shells", () => {    expect(readRepo("apps/web/src/app/(app)/layout.tsx")).toMatch(/AppNav/);
    expect(readRepo("apps/web/src/app/run/layout.tsx")).not.toMatch(/AppNav/);
    const nav = readRepo("apps/web/src/features/auth/AppNav.tsx");
    expect(nav).toMatch(/usePathname/);
    expect(nav).toMatch(/aria-current/);
    // The redesign (§1.3, §4) moved the eyebrow to one shared token-based class
    // in packages/ui. The invariant is unchanged: the three shells carry the
    // same small-caps label treatment, and none of them re-spells it.
    expect(readRepo("packages/ui/src/eyebrow.ts")).toMatch(
      /export const EYEBROW_CLASS = "uppercase tracking-wide text-muted"/,
    );
    // The owner's call on 2026-09-16: a screen the navigation bar names does not
    // repeat its own name as a title, so Plan, Library and Settings dropped
    // theirs. Only the run screen, which sits outside AppNav, still carries one.
    expect(readRepo("apps/web/src/features/runner/Runner.tsx")).toMatch(/EYEBROW_CLASS/);
    const namedByNav: [string, string][] = [
      ["planner/Planner.tsx", "Plan"],
      ["library/Library.tsx", "Library"],
      ["settings/Settings.tsx", "Settings"],
    ];
    for (const [file, label] of namedByNav) {
      const text = readRepo(`apps/web/src/features/${file}`);
      expect(text, file).not.toMatch(new RegExp(`<h[12][^>]*>\\s*${label}\\s*<`));
    }
    // And the library section heading is gone too: the active tab already names
    // the section, and the Add action took that place.
    expect(readRepo("apps/web/src/features/library/Library.tsx")).not.toMatch(
      /<h2 className="text-xl">\{activeTab\.label\}<\/h2>/,
    );
  });

  it("keeps the owner's review log wired up", () => {
    // docs/REVIEW_LOG.md is how a request from the owner survives the round it
    // was made in. This guards the wiring — the file, the link from the agent
    // notes and the README, a commit named on every round, and the section that
    // holds what is still outstanding — not the prose inside it, which only the
    // owner can judge.
    const log = readRepo("docs/REVIEW_LOG.md");
    const rounds = log.match(/^## \d{4}-\d{2}-\d{2} — .+$/gm) ?? [];
    expect(rounds.length, "at least one review round").toBeGreaterThan(0);
    for (const round of rounds) {
      expect(round, "every round names the commit it landed in").toMatch(
        /\(commits? `[0-9a-f]{7}`/,
      );
    }
    expect(log).toMatch(/^## Still open from the reviews$/m);
    expect(log).toMatch(/\*\*Info only\.\*\*/);
    expect(readRepo("AGENTS.md")).toMatch(/docs\/REVIEW_LOG\.md/);
    expect(readRepo("README.md")).toMatch(/docs\/REVIEW_LOG\.md/);
  });

  it("keeps the open views read-only, and editing in the editors", () => {
    // The owner's fourth review, library items 6–8: pressing a card or a row
    // opens the entry, and what opens only *shows* — "no editable or selectable
    // options". Everything that changes a meditation or a symbol lives in the
    // editor, so a control that creeps back onto a sheet has to fail here first.
    for (const sheet of [
      "apps/web/src/features/library/MeditationSheet.tsx",
      "apps/web/src/features/library/SymbolSheet.tsx",
    ]) {
      const source = readRepo(sheet);
      expect(source, `${sheet} renders no inputs`).not.toMatch(/<input|<textarea|<LatchButton/);
      expect(source, `${sheet} carries no remove`).not.toMatch(/tier="destructive"/);
      expect(source, `${sheet} offers Edit`).toMatch(/onEdit/);
    }
    // The editors own the management controls: the binaural entry point and the
    // chakra-only sections. They live in `MeditationTable.tsx` since the Database tab
    // took the rows and the columns, and the record view is what renders them.
    const manage = readRepo("apps/web/src/features/library/MeditationTable.tsx");
    expect(manage).toMatch(/Open binaural config/);
    expect(manage).toMatch(/function MeditationEditor/);
    // The drag lists moved with the rows, into the Database (§5).
    expect(readRepo("apps/web/src/features/database/DatabaseTable.tsx")).toMatch(/useSortable/);
    // A card has no `Open` button any more: the card itself is the open target.
    expect(readRepo("apps/web/src/features/library/CatalogCard.tsx")).not.toMatch(/>\s*Open\s*</);
    expect(readRepo("apps/web/src/features/library/MeditationTable.tsx")).not.toMatch(
      /aria-label=\{`Open \$\{/,
    );
    // Table rows open the entry anywhere on the row, not only in the name cell.
    const table = readRepo("apps/web/src/features/library/CatalogDataTable.tsx");
    expect(table).toMatch(/<tr[\s\S]{0,200}onClick=\{row\.onOpen\}/);
  });

  it("keeps every documentation link pointing at a file that exists", () => {
    // Retiring a document is the one edit that silently breaks every reference
    // to it — the v2 spec was linked from the roadmap when it went. This checks
    // the link *target* only: anchors need a slug rule, and prose is the
    // owner's to judge, not this test's.
    const docs = [
      "README.md",
      "AGENTS.md",
      ...readdirSync(join(repoRoot, "docs"))
        .filter((name) => name.endsWith(".md"))
        .map((name) => `docs/${name}`),
    ];
    const broken: string[] = [];
    for (const doc of docs) {
      const text = readRepo(doc);
      for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1]!.split("#")[0]!;
        if (!target || !target.endsWith(".md")) continue;
        if (/^[a-z]+:/i.test(target)) continue; // http:, mailto:, …
        const resolved = join(dirname(doc), target);
        if (!lstatSync(join(repoRoot, resolved), { throwIfNoEntry: false })) {
          broken.push(`${doc} → ${target}`);
        }
      }
    }
    expect(broken, "documentation links to files that are not there").toEqual([]);
  });

  it("keeps the removed Mandatory flag removed", () => {
    // The owner's call on 2026-09-16: nothing in the product is mandatory. The
    // flag was a picker label that never bound a symbol to anything, so it is
    // gone from the model, both stores, the UI and the guides. Only the code that
    // removes it from a stored row is allowed to name it at all.
    const schema = readRepo("packages/db/src/schema.ts");
    const cleanup = schema.indexOf("this.version(9)");
    expect(cleanup, "the v9 cleanup version").toBeGreaterThan(-1);
    expect(schema.slice(cleanup), "v9 drops the stored flag").toMatch(/isMandatory/);
    expect(schema.slice(0, cleanup), "nothing before v9 names it").not.toMatch(/isMandatory/i);

    for (const file of [
      ...listTsFiles("packages/domain/src"),
      ...listTsFiles("packages/application/src"),
      ...listTsFiles("apps/web/src"),
    ]) {
      expect(readRepo(file), file).not.toMatch(/isMandatory/i);
    }
    expect(readRepo("supabase/migrations/20260916130000_drop_symbol_mandatory.sql")).toMatch(
      /alter table public\.symbols drop column if exists is_mandatory;/,
    );
  });

  it("keeps third-party packages on the dependency allowlist", () => {
    function keys(value: unknown): string[] {
      if (!value || typeof value !== "object") return [];
      return Object.keys(value).sort();
    }
    function pkg(relativePath: string) {
      return JSON.parse(readRepo(relativePath)) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
    }

    expect(keys(pkg("packages/domain/package.json").dependencies)).toEqual([]);
    expect(keys(pkg("packages/application/package.json").dependencies)).toEqual([
      "@meditaur/domain",
    ]);
    expect(keys(pkg("packages/audio-web/package.json").dependencies)).toEqual([
      "@meditaur/domain",
    ]);
    expect(keys(pkg("packages/ui/package.json").peerDependencies)).toEqual(["react"]);
    expect(keys(pkg("packages/db/package.json").dependencies)).toEqual([
      "@meditaur/domain",
      "@supabase/supabase-js",
      "dexie",
    ]);
    expect(keys(pkg("apps/web/package.json").dependencies)).toEqual([
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@meditaur/application",
      "@meditaur/audio-web",
      "@meditaur/db",
      "@meditaur/domain",
      "@meditaur/ui",
      "next",
      "react",
      "react-dom",
    ]);
    expect(keys(pkg("apps/web/package.json").devDependencies)).toEqual([
      "@playwright/test",
      "@tailwindcss/postcss",
      "@types/react",
      "@types/react-dom",
      "tailwindcss",
    ]);
    expect(keys(pkg("package.json").devDependencies)).toEqual([
      "@eslint/js",
      "@meditaur/application",
      "@meditaur/audio-web",
      "@meditaur/domain",
      "@types/node",
      "eslint",
      "turbo",
      "typescript",
      "typescript-eslint",
      "vitest",
    ]);
    expect(readRepo("apps/web/package.json")).not.toMatch(/@supabase\/supabase-js/);
    expect(readRepo(".github/workflows/ci.yml")).not.toMatch(/pnpm dlx/);
    expect(readRepo(".github/workflows/e2e.yml")).not.toMatch(/pnpm dlx/);
    expect(JSON.parse(readRepo("vercel.json")).ignoreCommand).toBe(
      "sh $(git rev-parse --show-toplevel)/scripts/skip-build-if-md-only.sh || exit 1",
    );
    // What the gate does with that command — which range it reads, and what it
    // counts as documentation — is run for real in
    // tests/unit/architecture/deploy-gate.test.ts; this pins the wiring only.

    for (const file of [
      ".dockerignore",
      "infra/Dockerfile.e2e.dockerignore",
    ]) {
      expect(readRepo(file), file).toMatch(/^\*\*\/\*\.md$/m);
    }

    const workflowFiles = listWorkflowRelPaths();
    expect(workflowFiles.length).toBeGreaterThan(0);
    for (const file of workflowFiles) {
      const text = readRepo(file);
      const events = eventBodies(workflowOnBlock(text));
      for (const name of PATH_FILTER_EVENTS) {
        const body = events.get(name);
        if (body === undefined) continue;
        expect(eventIgnoresAllMarkdown(body), `${file} ${name}`).toBe(true);
      }
    }
    expect(readRepo(".github/workflows/deploy.yml")).toMatch(
      /pnpm dlx vercel@59\.11\.7 deploy --prod --yes/,
    );
    expect(readRepo(".github/workflows/deploy.yml")).not.toMatch(
      /pnpm dlx vercel(?:\s|$)/,
    );

    const nvmrc = readRepo(".nvmrc").trim();
    expect(nvmrc).toBe("24.20.0");
    const nodeMajor = nvmrc.split(".")[0];
    expect(JSON.parse(readRepo("package.json")).engines.node).toBe(
      `${nodeMajor}.x`,
    );
    expect(process.versions.node.split(".")[0]).toBe(nodeMajor);

    const nodeImage = `FROM node:${nvmrc}-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e`;
    for (const file of [
      "infra/Dockerfile.tools",
      "infra/Dockerfile.web",
      "infra/Dockerfile.e2e",
    ]) {
      expect(readRepo(file), file).toContain(nodeImage);
      expect(readRepo(file), file).not.toMatch(
        new RegExp(`FROM node:${nvmrc.replaceAll(".", "\\.")}-bookworm-slim(?!@sha256:)`),
      );
    }

    const allowedActions = new Set([
      "actions/checkout",
      "actions/setup-node",
      "pnpm/action-setup",
      "docker/setup-buildx-action",
      "docker/build-push-action",
    ]);
    const pinnedUses =
      /^\s+- uses: ([^@\s]+)@([0-9a-f]{40}) # v[\w.-]+$/gm;
    for (const file of workflowFiles) {
      const text = readRepo(file);
      expect(text, file).not.toMatch(/^\s+- uses: \S+@v\d+\s*$/m);
      const found = [...text.matchAll(pinnedUses)];
      expect(found.length, file).toBeGreaterThan(0);
      for (const match of found) {
        expect(allowedActions.has(match[1]), `${file} ${match[1]}`).toBe(true);
      }
      if (text.includes("actions/setup-node")) {
        expect(text, file).toMatch(/node-version-file:\s*\.nvmrc/);
      }
    }

    const dependabot = readRepo(".github/dependabot.yml");
    expect(dependabot).toMatch(/package-ecosystem:\s*github-actions/);
    expect(dependabot).not.toMatch(/package-ecosystem:\s*npm/);
    expect(dependabot).not.toMatch(/package-ecosystem:\s*docker/);

    expect(readRepo(".npmrc")).toMatch(/^engine-strict=true$/m);
    expect(readRepo(".npmrc")).toMatch(/^shamefully-hoist=true$/m);

    for (const file of listTsFiles("apps/web/src")) {
      expect(readRepo(file), file).not.toMatch(/from ["']@supabase\/supabase-js["']/);
    }
  });

  it("routes identity through AuthPort and keeps the Supabase SDK to one adapter", () => {
    const ports = readRepo("packages/domain/src/ports.ts");
    expect(ports).toMatch(/export type AuthPort = \{/);
    expect(ports).toMatch(/export type AuthSession = \{/);
    expect(readRepo("packages/domain/src/index.ts")).toMatch(/AuthPort,/);
    expect(readRepo("apps/web/src/composition.ts")).toMatch(/auth:\s*ports\.auth/);
    expect(readRepo("apps/web/src/composition.ts")).toMatch(/createSupabaseClient/);
    expect(readRepo("apps/web/src/composition.ts")).toMatch(/createLocalAuthPort\(\)/);
    expect(readRepo("apps/web/src/composition.ts")).toMatch(/createCachedPreferences/);
    expect(readRepo("apps/web/src/composition.ts")).toMatch(/preferences:\s*ports\.preferences/);
    expect(readRepo("packages/application/src/create-app.ts")).toMatch(/auth:\s*AuthPort;/);

    // Sign-up rides the same port and the same route through the app, and the web
    // app has to actually offer it — a route nobody can reach is not a sign-up
    // path. The SDK stays behind the adapter in every case.
    expect(ports).toMatch(/signUp\(email: string, password: string\): Promise<SignUpOutcome>/);
    expect(readRepo("packages/application/src/create-app.ts")).toMatch(
      /signUp\(email: string, password: string\): Promise<SignUpOutcome>/,
    );
    expect(readRepo("apps/web/src/features/auth/AuthPanel.tsx")).toMatch(/app\.signUp\(/);
    expect(readRepo("apps/web/src/app/(auth)/signup/page.tsx")).toMatch(
      /AuthPanel mode="signUp"/,
    );

    const sourceDirs = [
      "apps/web/src",
      "packages/domain/src",
      "packages/application/src",
      "packages/db/src",
      "packages/audio-web/src",
      "packages/ui/src",
    ];
    const importers = sourceDirs
      .flatMap((dir) => listTsFiles(dir))
      .filter((file) => /from ["']@supabase\/supabase-js["']/.test(readRepo(file)));
    // Exactly one module may import the SDK: the Supabase module, which holds
    // the client and every adapter that needs it. Zero is the state on a build
    // with no cloud config; the count must never grow past one.
    expect(importers.length).toBeLessThanOrEqual(1);
    for (const file of importers) {
      expect(file, file).toBe("packages/db/src/supabase.ts");
    }

    // One bootstrap for the whole app: only the provider may call it.
    const provider = "apps/web/src/features/auth/SessionProvider.tsx";
    const bootstrappers = listTsFiles("apps/web/src").filter(
      (file) => file !== provider && /app\.bootstrap\(\)/.test(readRepo(file)),
    );
    expect(bootstrappers, bootstrappers.join(", ")).toEqual([]);
    expect(readRepo(provider)).toMatch(/export function useSession\(\)/);
  });

  it("keeps key material out of committable files", () => {
    // Secrets may live in exactly two ignored places: the operator's `.env` and
    // the Supabase CLI's own state under `supabase/.temp`. Everything else in the
    // working tree must be safe to commit, so scan it for key-shaped values.
    // fs-based on purpose: the tools image has no git, so `git ls-files` /
    // `git grep` would silently no-op on the local gate.
    const gitignore = readRepo(".gitignore");
    for (const entry of [".env", "supabase/.temp/", "supabase/.branches/"]) {
      expect(gitignore, entry).toContain(entry);
    }
    for (const file of [".dockerignore", "infra/Dockerfile.e2e.dockerignore"]) {
      expect(readRepo(file), file).toMatch(/^\.env$/m);
    }

    const SECRET_SHAPED =
      /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|sb_secret_[A-Za-z0-9_-]{8,}|sb_publishable_[A-Za-z0-9_-]{8,}/;
    // Generated output is never committed, so it is never scanned. These mirror
    // .gitignore by *name*, at any depth: `.next/server/app/(app)/plan/page.js`
    // carries whatever the bundler inlined, and with `NEXT_PUBLIC_SUPABASE_*` in
    // the operator's `.env` that is the publishable key — which is public by
    // design, deliberate, and would otherwise fail the gate on every build after
    // the first. The tools image has no git, so this cannot ask git.
    const IGNORED_DIRS = new Set([
      ".git",
      ".tools",
      ".turbo",
      ".next",
      ".vscode",
      ".vercel",
      ".supabase",
      "node_modules",
      "coverage",
      "playwright-report",
      "test-results",
      "blob-report",
      "dist",
      "out",
    ]);
    const IGNORED_PATHS = ["supabase/.temp", "supabase/.branches"];
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        const rel = path.slice(repoRoot.length + 1);
        const stats = lstatSync(path);
        if (stats.isSymbolicLink()) continue; // never follow links out of the repo
        if (stats.isDirectory()) {
          if (!IGNORED_DIRS.has(name) && !IGNORED_PATHS.includes(rel)) {
            walk(path);
          }
          continue;
        }
        if (name === ".env" || name.startsWith(".env.")) continue;
        if (stats.size > 2_000_000) continue;
        if (SECRET_SHAPED.test(readFileSync(path, "utf8"))) offenders.push(rel);
      }
    };
    walk(repoRoot);

    // .env.example is tracked, so it must stay value-free (names only).
    expect(readRepo(".env.example")).not.toMatch(SECRET_SHAPED);
    expect(offenders, `key-shaped value found in: ${offenders.join(", ")}`).toEqual([]);
  });
});
