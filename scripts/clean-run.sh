#!/usr/bin/env bash
# Stop leftover local preview containers and wipe last-run outputs.
# Pass --keep-next to leave apps/web/.next (used before `dev` / e2e).
#
# It deliberately does **not** touch `.turbo`: turbo's cache is keyed on content
# hashes, so deleting it before a gate only throws away work that would have been
# reused — 134s of typecheck and lint on a cold `check:full`. Caches are dropped
# by `scripts/clean.sh` (`./scripts/meditaur clean`), which is asked for by name.
# The meditaur-tools project is included: a `run --rm` container is not removed
# when its client dies (closed terminal, killed editor) and it holds port 3000,
# which makes the next `preview` fail to bind. Inside the tools container there
# is no docker CLI, so this block is a no-op there.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEEP_NEXT=0
if [[ "${1:-}" == "--keep-next" ]]; then
  KEEP_NEXT=1
fi

# The e2e project is this session's (`scripts/session.sh`), so a teardown here cannot reach
# into another session's run. The dev and tools projects are machine-wide, which is exactly
# why the teardown is gated below: downing `meditaur` or `meditaur-tools` from here kills a
# live `pnpm check` or a running browser container belonging to somebody else. That is where
# round 24's `Protocol error … session closed` and its mass of 15-second timeouts came from.
if command -v docker >/dev/null 2>&1; then
  E2E_PROJECT="$("${ROOT}/scripts/session.sh" project)"
  teardown() {
    if command -v timeout >/dev/null 2>&1; then
      timeout 20 docker compose -p meditaur -f "${ROOT}/infra/compose.yaml" down --remove-orphans >/dev/null 2>&1 || true
      timeout 20 docker compose -p "${E2E_PROJECT}" -f "${ROOT}/infra/compose.e2e.yaml" down --remove-orphans >/dev/null 2>&1 || true
      timeout 20 docker compose -p meditaur-tools -f "${ROOT}/infra/compose.tools.yaml" down --remove-orphans >/dev/null 2>&1 || true
    else
      docker compose -p meditaur -f "${ROOT}/infra/compose.yaml" down --remove-orphans >/dev/null 2>&1 || true
      docker compose -p "${E2E_PROJECT}" -f "${ROOT}/infra/compose.e2e.yaml" down --remove-orphans >/dev/null 2>&1 || true
      docker compose -p meditaur-tools -f "${ROOT}/infra/compose.tools.yaml" down --remove-orphans >/dev/null 2>&1 || true
    fi
  }
  # Inside a gate the lock is already this session's, so the teardown is ours to do. Outside
  # one, take the lock for the few seconds the teardown lasts — and if another session holds
  # it, do nothing at all rather than tear down containers it is using.
  if [[ -n "${MEDITAUR_PREP_LOCK_HELD:-}" ]]; then
    teardown
  elif "${ROOT}/scripts/session.sh" hold "a teardown" 2>/dev/null; then
    teardown
    "${ROOT}/scripts/session.sh" release
  else
    echo "meditaur: another session is preparing the stack; leaving its containers alone"
  fi
fi

rm -rf \
  "${ROOT}/apps/web/playwright-report" \
  "${ROOT}/apps/web/test-results" \
  "${ROOT}/apps/web/blob-report" \
  "${ROOT}/tests/e2e/playwright-report" \
  "${ROOT}/tests/e2e/test-results" \
  "${ROOT}/tests/e2e/blob-report" \
  "${ROOT}/playwright-report" \
  "${ROOT}/test-results" \
  "${ROOT}/blob-report" \
  "${ROOT}/coverage"

if [[ "${KEEP_NEXT}" -eq 0 ]]; then
  rm -rf "${ROOT}/apps/web/.next" "${ROOT}/apps/web/out"
fi

echo "meditaur: previous run leftovers removed"
