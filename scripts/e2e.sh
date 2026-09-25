#!/usr/bin/env bash
# Build (layer-cached) and run Playwright in the e2e image. Chromium lives in
# the image, not on the host, so app-code rebuilds do not re-download it.
# CI sets MEDITAUR_E2E_SKIP_BUILD=1 after docker/build-push-action has loaded the image.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# This session's project and image tag (`scripts/session.sh`): unset, both are the names this
# script has always used. `MEDITAUR_SESSION=alpha` gives two agents in one checkout their own
# project and their own image, so neither builds over the other's layers.
E2E_PROJECT="$("${ROOT}/scripts/session.sh" project)"
export MEDITAUR_E2E_IMAGE="$("${ROOT}/scripts/session.sh" image)"
COMPOSE=(docker compose -p "${E2E_PROJECT}" -f "${ROOT}/infra/compose.e2e.yaml")
if ! command -v docker >/dev/null 2>&1; then
  echo "meditaur: docker is required for e2e" >&2
  exit 1
fi
# The run itself is deliberately **not** locked: a full suite must not block the other
# session's single-spec run, which is the way to make progress on a busy machine.
"${ROOT}/scripts/session.sh" warn-if-other
"${ROOT}/scripts/clean-run.sh" --keep-next
if [[ "${MEDITAUR_E2E_SKIP_BUILD:-}" != "1" ]]; then
  "${COMPOSE[@]}" build
fi
# Arguments reach Playwright, so one behaviour can be read without the whole suite:
# `./scripts/meditaur e2e tests/e2e/plans.spec.ts` or `… e2e -g "colour scheme"`. Playwright
# prints the count it collected (`Running N tests`) — compare it with the spec file, because a
# filter that matches nothing exits 0 and proves nothing.
#
# The build happens **inside this container**, immediately before Playwright, because the
# suite is served a production build (`next start`) rather than `next dev`. The container's
# filesystem is its own, so no run can test a build somebody made earlier — `.next` is
# excluded from the image's context (`infra/Dockerfile.e2e.dockerignore`), which is what used
# to make "the image bakes the sources" a trap. `sh -lc` so corepack's shim is on PATH and
# `"$@"` forwards the caller's spec or filter to Playwright.
"${COMPOSE[@]}" run --rm --no-deps e2e sh -lc 'pnpm build && pnpm test:e2e "$@"' e2e "$@"
