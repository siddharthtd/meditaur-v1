#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -p meditaur -f "${ROOT}/infra/compose.yaml")
if ! command -v docker >/dev/null 2>&1; then
  echo "meditaur: docker is required for preview" >&2
  exit 1
fi
"${ROOT}/scripts/clean-run.sh"
"${COMPOSE[@]}" up -d --build --force-recreate --remove-orphans

# `up -d` exits 0 even when the container crashes a moment later, so wait for
# the server to answer before reporting that the preview is up.
if ! command -v curl >/dev/null 2>&1; then
  echo "meditaur: curl not found; skipping the readiness check" >&2
  echo "meditaur: preview at http://localhost:3000"
  exit 0
fi
cid="$("${COMPOSE[@]}" ps -q web)"
ok=0
for _ in $(seq 1 30); do
  if [[ -z "${cid}" || "$(docker inspect -f '{{.State.Running}}' "${cid}" 2>/dev/null)" != "true" ]]; then
    break
  fi
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/ || true)" == "200" ]]; then
    ok=1
    break
  fi
  sleep 1
done
if [[ "${ok}" -ne 1 ]]; then
  echo "meditaur: preview container is not serving http://localhost:3000" >&2
  "${COMPOSE[@]}" logs --tail 20 web >&2 || true
  exit 1
fi
echo "meditaur: preview at http://localhost:3000"
