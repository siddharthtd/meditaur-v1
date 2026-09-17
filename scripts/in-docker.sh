#!/usr/bin/env bash
# Run a command in meditaur-tools:local (Node 24.20.0 + pnpm 10.17.1).
# Node is not installed on the host. Playwright is not in this image.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
if ! command -v docker >/dev/null 2>&1; then
  echo "meditaur: docker is required for the Node toolchain" >&2
  exit 1
fi

PUBLISH=0
if [[ "${1:-}" == "--publish" ]]; then
  PUBLISH=1
  shift
fi
if [[ $# -eq 0 ]]; then
  echo "usage: in-docker.sh [--publish] <command> [args...]" >&2
  exit 2
fi

mkdir -p \
  "${ROOT}/.tools/corepack" \
  "${ROOT}/.tools/pnpm-home" \
  "${ROOT}/.tools/pnpm-store" \
  "${ROOT}/.tools/npm-cache"

export MEDITAUR_UID
export MEDITAUR_GID
MEDITAUR_UID="$(id -u)"
MEDITAUR_GID="$(id -g)"

# Forward the optional Supabase settings so the integration tests can run their
# live branch, for whichever target was selected (see tests/fixtures/
# supabase-target.ts). Values come from the shell first, then from the repo `.env`.
# The local stack is reached at http://host.docker.internal:54321: 127.0.0.1 inside
# this container is the container itself (see .env.example).
ENV_ARGS=()
DQ='"'
SQ="'"
for name in \
  SUPABASE_TARGET \
  SUPABASE_URL \
  SUPABASE_ANON_KEY \
  SUPABASE_SERVICE_ROLE_KEY \
  SUPABASE_LOCAL_URL \
  SUPABASE_LOCAL_ANON_KEY \
  SUPABASE_LOCAL_SERVICE_ROLE_KEY \
  NEXT_PUBLIC_SUPABASE_URL \
  NEXT_PUBLIC_SUPABASE_ANON_KEY; do
  value="${!name:-}"
  if [[ -z "${value}" && -f "${ROOT}/.env" ]]; then
    value="$(sed -n "s/^${name}=//p" "${ROOT}/.env" | tail -1)"
    value="${value%$DQ}"
    value="${value#$DQ}"
    value="${value%$SQ}"
    value="${value#$SQ}"
  fi
  if [[ -n "${value}" ]]; then
    ENV_ARGS+=(-e "${name}=${value}")
  fi
done

COMPOSE=(docker compose -p meditaur-tools -f "${ROOT}/infra/compose.tools.yaml")
if [[ "${MEDITAUR_TOOLS_SKIP_BUILD:-}" != "1" ]]; then
  "${COMPOSE[@]}" build
fi

RUN=(run --rm --no-deps --user "${MEDITAUR_UID}:${MEDITAUR_GID}")
if [[ "${PUBLISH}" -eq 1 ]]; then
  RUN+=(--service-ports)
fi
exec "${COMPOSE[@]}" "${RUN[@]}" ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} tools "$@"
