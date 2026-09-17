# Agent notes

External libraries are a **security** constraint. Read
[docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) before adding a package, Docker
image, GitHub Action, or `pnpm dlx` tool. Default is no.

What to build next is [docs/ROADMAP.md](docs/ROADMAP.md). What the owner already
asked for — and what was decided about it — is
[docs/REVIEW_LOG.md](docs/REVIEW_LOG.md). **Append a round to it every time the
owner reviews the app**, including the asks that were answered rather than
implemented, and keep its "still open" table honest: a request must never be
dropped silently. The review's Phase 0 (critical fixes), Phase 1 (accounts),
Phase 4 (the UI redesign, all of it) and the whole unblocked backlog have landed —
Requirements v2, the live two-user RLS run, review M4, M7's visible half, the
minor issues, the SQL union checks, the sign-up path (`/signup` sharing
`AuthPanel` with `/login`), and the owner's rounds 4–8 (cascading deletes and the
read-only open views; the alarm-clock wheels, which are real scroll containers
now; one editor shape with custom fields named by their heading; the compact
`Kind` row, the `Esc` legend sitting with the screen's action, and a dragged card
that lands instead of animating). **Phase 2 landed 2026-09-16** — the preference
overwrite (M11), the catalogue row versioning (M5), the `lastPlanId` guard and
the read-through bootstrap, with the live suite green on both databases. Still
open: Phase 3, and the short deferral list at the end of the roadmap. **The
hosted Supabase project exists** — created 2026-09-16, all 14 migrations applied
(the last two, `user_preferences.revision` and the catalogue row versioning,
pushed 2026-09-17), and real login verified end to end (live suite green against
it, browser sign-in reaching `/plan` with the device's workspace adopted), so the
P2.6 last mile has landed. What is left is Phase 3's own work (the event
port and the privacy
decisions). A local stack still exists for dev; `./scripts/meditaur cloud` drives
the hosted one. Domain, application, and
audio-web stay npm-free except workspace links.
`@supabase/supabase-js` is allowed in exactly one module —
`packages/db/src/supabase.ts`, the module behind `AuthPort` and the cloud
preferences adapter — and the
integrity test enforces that; it is inert unless the two `NEXT_PUBLIC_SUPABASE_*`
values are set, and the service-role key never reaches the browser.

Toolchain: Node and pnpm live in `meditaur-tools:local`. Use `./scripts/meditaur`
(`check`, `check:full`, `e2e`, `preview`) — never install Node on the host.
`./scripts/meditaur up` (host Supabase CLI) is the single exception. The coding
contract is [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md). Do not start REST,
native, or a brand rewrite to “make it nicer.”

**The public review mirror is generated, never copied.** `meditaur-v1` is public
and this repo is private; `~/workspace/agent-tools/mirror-export.sh` publishes a
snapshot from `git archive HEAD`, so only committed files leave and the mirror
gets this repo's `.gitignore` verbatim. Never copy the working tree into it — that
is how the Supabase CLI's local key material under `supabase/.temp/` reached the
public repo once already.

**Agent and owner tooling lives outside this repo**, in
`~/workspace/agent-tools/`. Do not add helper scripts to `scripts/` unless this
project's own command flow runs them — nothing else belongs in the tree.

**DeepSeek off-peak window — firm, user-level, enforced.** AI work is allowed
only between **04:00–06:00** and **10:00–01:00 UTC**. Peak is 01:00–04:00 and
06:00–10:00 UTC, and the default is no. The gate is deliberately **not** part of
this repo: it lives at `~/.copilot/hooks/deepseek-window.sh`, wired as
user-level agent hooks, so every workspace on this machine obeys the same
window, and a launchd watcher announces both boundaries. During peak the hooks
refuse tool calls, stop the session, and park the request in
`~/.deepseek-window/handoff`; when the window opens the parked work is handed
back to the session (or restarted by the watcher). Stop when it stops you: do
not retry refused calls, do not disable the hooks, and never arm the override —
that is owner-only (interactive terminal plus a typed phrase). State and
operator notes: `~/.copilot/hooks/deepseek-window.sh status`.

