#!/usr/bin/env bash
# Build (layer-cached) and run Playwright in the e2e image. Chromium lives in
# the image, not on the host, so app-code rebuilds do not re-download it.
# CI sets MEDITAUR_E2E_SKIP_BUILD=1 after docker/build-push-action has loaded the image.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -p meditaur-e2e -f "${ROOT}/infra/compose.e2e.yaml")
if ! command -v docker >/dev/null 2>&1; then
  echo "meditaur: docker is required for e2e" >&2
  exit 1
fi
"${ROOT}/scripts/clean-run.sh" --keep-next
if [[ "${MEDITAUR_E2E_SKIP_BUILD:-}" != "1" ]]; then
  "${COMPOSE[@]}" build
fi
"${COMPOSE[@]}" run --rm --no-deps e2e
