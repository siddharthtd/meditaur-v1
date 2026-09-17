#!/bin/sh
# Vercel ignoreCommand. Exit 0: skip (only documentation changed since the last
# deployment). Exit 1: build.
#
# The unit is the branch since the last deployment, not the tip commit. The gate
# used to be `git diff HEAD^ HEAD`, and Vercel builds the tip of a push: a code
# commit with a docs commit on top of it — the way the owner commits — read as
# documentation-only, so the deploy was cancelled and the previous code stayed
# live. `VERCEL_GIT_PREVIOUS_SHA` is the last deployed commit for this project and
# branch, and the diff from there to HEAD is "everything that changed since the
# deployment", whichever commit of the push did it.
#
# Vercel only exposes that variable because this file is the Ignored Build Step,
# and for the same reason its clone is `--depth=10`: a last deployment older than
# those ten commits has to be fetched before the range can be read.
#
# "Documentation" is markdown anywhere plus anything under `docs/`: nothing there
# is a build input, and a docs commit should not spend a build. Everything else —
# source, config, lockfile, migrations, workflows — builds, and an unrecognised
# path builds. The file name is historical; the rule is documentation, not `.md`.
set -eu

# Invoked via git toplevel so cwd can be apps/web (Vercel Root Directory).
cd "$(git rev-parse --show-toplevel)" || exit 1

previous=${VERCEL_GIT_PREVIOUS_SHA:-}
if [ -n "$previous" ] &&
  ! git rev-parse --verify --quiet "${previous}^{commit}" >/dev/null 2>&1; then
  # Not in the ten-commit clone. A failed fetch just means the fallback below.
  GIT_TERMINAL_PROMPT=0 git fetch --quiet --depth=1 origin "$previous" >/dev/null 2>&1 || true
fi

if [ -n "$previous" ] &&
  git rev-parse --verify --quiet "${previous}^{commit}" >/dev/null 2>&1; then
  base=$previous
elif git rev-parse --verify --quiet 'HEAD^' >/dev/null 2>&1; then
  # No deployment to compare against — a first deploy, or a command run without
  # the Ignored Build Step variables. Fall back to the tip commit, as before.
  base='HEAD^'
else
  # No history at all. A first deployment always builds.
  exit 1
fi

files=$(git diff --name-only "$base" HEAD) || exit 1
if [ -z "$files" ]; then
  # Nothing landed since the last deployment.
  exit 0
fi
if printf '%s\n' "$files" | grep -qvE '(^docs/|\.md$)'; then
  exit 1
fi
exit 0
