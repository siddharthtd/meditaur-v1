#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"${ROOT}/scripts/clean-run.sh"
if command -v docker >/dev/null 2>&1; then
  if command -v timeout >/dev/null 2>&1; then
    timeout 20 docker compose -p meditaur -f "${ROOT}/infra/compose.yaml" down --remove-orphans >/dev/null 2>&1 || true
    timeout 20 docker compose -p "$("${ROOT}/scripts/session.sh" project)" -f "${ROOT}/infra/compose.e2e.yaml" down --remove-orphans >/dev/null 2>&1 || true
    timeout 20 docker compose -p meditaur-tools -f "${ROOT}/infra/compose.tools.yaml" down --remove-orphans >/dev/null 2>&1 || true
  else
    docker compose -p meditaur -f "${ROOT}/infra/compose.yaml" down --remove-orphans >/dev/null 2>&1 || true
    docker compose -p "$("${ROOT}/scripts/session.sh" project)" -f "${ROOT}/infra/compose.e2e.yaml" down --remove-orphans >/dev/null 2>&1 || true
    docker compose -p meditaur-tools -f "${ROOT}/infra/compose.tools.yaml" down --remove-orphans >/dev/null 2>&1 || true
  fi
fi
if command -v supabase >/dev/null 2>&1; then
  supabase stop >/dev/null 2>&1 || true
fi
echo "meditaur: local stack stopped"
