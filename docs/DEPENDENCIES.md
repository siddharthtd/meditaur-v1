# Dependency allowlist

Security default: **the fewest third-party libraries that can ship the session**. New
packages, Docker base images, GitHub Actions, and `pnpm dlx` / `npx` CI tools
are out of bounds until they are added here and to
`tests/unit/architecture/integrity.test.ts` in the same change.

Workspace packages (`@meditaur/*`) are not third-party.

## Runtime (ships to the browser or preview image)

| Package | Why it is allowed | Where |
| --- | --- | --- |
| `react`, `react-dom` | App UI. No alternative in this stack. | `@meditaur/web`, peer of `@meditaur/ui` |
| `next` | App router / PWA host. | `@meditaur/web` |
| `dexie` | Local IndexedDB. Domain stays SQL-free. | `@meditaur/db` |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | Drag reorder: the planner's block strip, and the library editors' symbol and intention lists. Do not add another DnD kit. | `@meditaur/web` (Planner + Library only) |
| `@supabase/supabase-js` | Auth, preferences **and client-error events**, behind `AuthPort` / `PreferencesRepository` / `EventPort`. Supabase Inc. maintains it and the platform is already the pinned backend. **Exactly one module may import it** — `packages/db/src/supabase.ts`, the Supabase module: the client and every adapter that needs it — which the integrity test enforces. | `@meditaur/db` |

`@supabase/supabase-js` is **in as of 2026-09-15** (`2.116.0`, first resolved at
`^2.116.0`): the `AuthPort` adapter imports it, which is the condition this file
used to state. It is inert unless `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set — a build without them wires
`createLocalAuthPort` instead and stays Dexie-only. The service-role key is never
used by the browser and never reaches the bundle.

Analytics is first-party — a domain event port plus an `events` table. No
analytics SDK (PostHog, Plausible, Segment, …) is allowed without an allowlist
change here and in the integrity test.

**The Edge Functions are deploy surfaces, not packages**, and they are the repo's
only server-side code: `close-account` holds the service-role key — injected into
it by Supabase, never committed — so it can remove the `auth.users` row, which no
browser may do, and `admin` holds the same key so it can write `account_flags`,
which no account may write for itself (`P0 · 23`). Both carry **no imports at all**,
on purpose: a handful of `fetch` calls, because the one-module rule above is about
importers and a function is a second runtime rather than a second importer. Both are
deployed by `./scripts/meditaur cloud --yes`, after the migrations and against the
same project. `ALLOWED_ORIGINS` is the optional and tightening setting: unset, any
origin may call them, which is the closed beta's default.

## Toolchain (dev / CI / Docker — not product UI)

| Package | Why it is allowed |
| --- | --- |
| `typescript`, `@types/node` (^24.13.3, tracks Node 24), `@types/react`, `@types/react-dom` | Types |
| `eslint`, `@eslint/js`, `typescript-eslint` | Lint + hexagon import bans |
| `vitest` | Unit / integration |
| `turbo` | Monorepo `check` / `build` graph |
| `tailwindcss`, `@tailwindcss/postcss` | Utility CSS already in the app |
| `@playwright/test` | Run-mode e2e |
| `fake-indexeddb` | IndexedDB in Node, so a test can build **the device's own store** rather than a hand-written fake: the flags mirror, the Dexie upgrade paths, and the sync proof's device side. Dev-only — nothing in a bundle imports it, and the suites that use it are the ones that cannot reach a browser |

## Platform (not npm)

| Item | Pin / note |
| --- | --- |
| Node | `24.20.0` in `.nvmrc` and Docker. `engines.node` is `24.x` (Vercel major only). Do not put a patch in `engines`. Vercel **Project Settings → Node.js Version** must be **24.x**. |
| pnpm | `10.17.1` (`packageManager`, Corepack) |
| Docker `FROM` | `node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e` (multi-arch index digest). Bump digest in the same change as `.nvmrc`. |
| GitHub Actions | SHA-pinned, version in a comment: `actions/checkout@3d3c42e5…` (v7.0.1), `actions/setup-node@82076278…` (v7.0.0), `pnpm/action-setup@ea17c68d…` (v6.1.0), `docker/setup-buildx-action@f87e5991…` (v4.4.1), `docker/build-push-action@c3c9e263…` (v7.4.0). Do not use floating `@vN`. `ubuntu-latest` is unpinned. **Dependabot raises these, and this row is the only place the versions are written down** — a merged bump that leaves this line behind is a stale doc, so move it in the same pass |
| Markdown skip | Not an agent rule. Every workflow `pull_request`/`push` sets `paths-ignore: "**.md"`. `vercel.json` `ignoreCommand` is `sh $(git rev-parse --show-toplevel)/scripts/skip-build-if-md-only.sh || exit 1` (cwd is Vercel Root Directory, often `apps/web`). Docker contexts exclude `**/*.md`. Integrity test enumerates `.github/workflows` and pins the command. |
| Dependabot | `.github/dependabot.yml` — `github-actions` only, weekly. Not npm, not Docker Hub. |
| `.npmrc` hoist | `shamefully-hoist=true`. Tried `false`; `next build` failed (`@meditaur/ui` has no `react` types). Keep true. |
| Supabase CLI | Optional operator tool for `./scripts/meditaur up` — the one command that needs a host tool. Verified with CLI **2.117.0** (2026-09-14). Not an npm dependency. Live RLS uses `fetch`, not the JS SDK; the tools container reaches the host stack at `host.docker.internal`. A cold first `up` can time out the storage health check while images pull — re-running it is idempotent. |
| `pnpm dlx vercel@59.11.7` | Deploy job only. Version is in the workflow. Unpinned `pnpm dlx vercel` is forbidden. Not a lockfile package — do not add `vercel` to `package.json`. |

## Hexagon constraints

- Domain / application / audio-web: no npm besides workspace links.
- Features must not import `@meditaur/db` (composition only).
- No second HTTP client. Use `fetch`.
- Transitive lockfile size is not an excuse to add more directs. ~300 lockfile
  packages is Next + Playwright, not a budget to grow. The Vercel CLI is
  `pnpm dlx vercel@59.11.7` on the deploy job only so PR CI and the e2e image
  do not download it.

## Adding a library

1. Argue why a platform API or existing allowlisted package cannot do it.
2. Name a well-known maintainer (React, Vercel, Microsoft, dnd-kit, Dexie).
3. Update this file and the integrity allowlist test together.
4. Do not add it on a feature branch “to try.”

## Advisories (`pnpm audit`, 2026-09-15)

Ran in `meditaur-tools:local`. **4** findings: 2 high, 2 moderate — the accepted
PostCSS set below. (On 2026-09-14 this was 6; the `vitest` pair is now fixed.)

**Accepted — `postcss` via Next (4).** All one path: `next@15.5.25` →
`postcss@8.4.31`.

| Severity | Advisory | Patched |
| --- | --- | --- |
| high | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) sourceMappingURL file read | `postcss >= 8.5.12` |
| high | [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) sourceMappingURL `.map` disclosure | `postcss >= 8.5.18` |
| moderate | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) stringify XSS | `postcss >= 8.5.10` |
| moderate | [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) incomplete fix of the first | `postcss >= 8.5.23` |

Tailwind’s `postcss@8.5.28` in this lockfile is already patched. Next still vendors `8.4.31`.

**Decision (2026-09-04):** accept until Next vendors a patched PostCSS (**1-A**). Do not add `pnpm.overrides`. Do not bump Next solely to chase this advisory. Re-run `pnpm audit` after a Next upgrade.

**When it clears (checked 2026-09-15):** `next@15.5.25` vendors `postcss@8.4.31`
(vulnerable); `next@16.3.5` vendors **`postcss@8.5.23`**, the patched version for
all four. A Next 16 upgrade therefore closes them — but that is a major upgrade
and is not to be taken to chase this advisory.

These issues need attacker-controlled CSS at PostCSS process time (typically `next build` / `next dev` on this repo’s own styles).

**Resolved — `vitest` / `@vitest/mocker` (2).** First seen 2026-09-14.

| Severity | Advisory | Vulnerable | Patched |
| --- | --- | --- | --- |
| moderate | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) path traversal / arbitrary file read via the `@vitest/mocker` redirect mock | `vitest >=2.1.0 <4.1.11` | `>=4.1.11` |

Fixed 2026-09-15: `vitest ^3.2.4` → **`^4.1.11`** (paths `.>vitest`,
`.>vitest>@vitest/mocker`). V4 is the maintained line and the patched floor;
`5.0.0` is `latest` but was deliberately not taken while closing an advisory —
bump to it later, on purpose. Verified at the time: 112 unit tests, the live
RLS integration test, the build, and 17/17 e2e all pass, and `pnpm audit` no
longer reports the pair. Read those as a 2026-09-15 record rather than a current
count — the suite has grown a good deal since, and what matters is that
`./scripts/meditaur check:full` is green.

## ESLint (current)

On **eslint@10.10.0** and **@eslint/js@10.0.1** (those packages version independently; 10.10.0 does not exist for `@eslint/js`). `js.configs.recommended` is on. v10 recommended includes `no-unassigned-vars`, `no-useless-assignment`, and `preserve-caught-error` at error. `pnpm lint` after the bump reported **zero** findings; catch sites already use `err`. Do not add `eslint-config-next`. Do not disable recommended to paper over a future failure.

v9.x is EOL (2026-08-06). Do not go back.

## Docker / GitHub Action pins (current)

Image and Actions are digest/SHA pinned. Node is **24.20.0** locally and in CI; `engines.node` is **24.x** for Vercel. Dependabot updates **github-actions** weekly so Action SHAs do not freeze. Docker digest updates in the same change as `.nvmrc`. `ubuntu-latest` stays a floating runner image.

A Dependabot Action bump is merged only after verifying the proposed SHA is the
commit its release tag points at (`GET /repos/<owner>/<repo>/commits/<tag>`) and
that the `# vX.Y.Z` comment matches — the integrity test only checks that the SHA
is 40 hex chars, not which commit it is. Read the release notes for behavior
changes and confirm the workflow's `with:` inputs still apply. Record the new pin
in this file in the same change.

`.npmrc` `shamefully-hoist=true` is accepted after a failed `false` trial (`next build` could not typecheck `@meditaur/ui` against `react`).
