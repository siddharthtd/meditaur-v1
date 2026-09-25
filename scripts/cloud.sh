#!/usr/bin/env bash
# Hosted Supabase, end to end: link the project, show what the migrations would
# do, apply them, then prove it with the live integration tests.
#
# This is the one place the project asks for a host tool, and it is the same one
# `./scripts/meditaur up` uses (the Supabase CLI). Everything else runs in Docker.
# See docs/DEPENDENCIES.md for why that is allowed, and docs/ARCHITECTURE.md
# ("Where keys live") for where the two keys may sit.
#
# The database password is typed at the CLI's own prompt and never passes through
# this script, a log, or a shell history entry.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

ASSUME_YES=0
DRY_RUN=0
for arg in "$@"; do
  case "${arg}" in
    -y | --yes) ASSUME_YES=1 ;;
    -n | --dry-run) DRY_RUN=1 ;;
    *)
      echo "meditaur: unknown option '${arg}'" >&2
      echo "usage: ./scripts/meditaur cloud [--dry-run] [--yes]" >&2
      exit 2
      ;;
  esac
done

if ! command -v supabase >/dev/null 2>&1; then
  echo "meditaur: the Supabase CLI is not installed." >&2
  echo "meditaur: install it with: brew install supabase/tap/supabase" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "meditaur: .env is missing. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

env_value() {
  # Same read as scripts/in-docker.sh: last assignment wins, then strip one layer
  # of quotes. No eval, no sourcing, so a stray line cannot run anything.
  local name="$1"
  sed -n "s/^${name}=//p" .env | tail -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
}

url="$(env_value NEXT_PUBLIC_SUPABASE_URL)"
if [[ -z "${url}" ]]; then
  echo "meditaur: NEXT_PUBLIC_SUPABASE_URL is empty in .env (see .env.example)." >&2
  exit 1
fi

# https://<project-ref>.supabase.co -> <project-ref>. A self-hosted URL will not
# match this shape, which is the point: this command is for the hosted project.
ref="$(printf '%s' "${url}" | sed -E 's#^https?://([A-Za-z0-9-]+)\.supabase\.(co|in).*#\1#')"
if [[ "${ref}" == "${url}" || -z "${ref}" ]]; then
  echo "meditaur: could not read a hosted project ref from NEXT_PUBLIC_SUPABASE_URL=${url}" >&2
  echo "meditaur: expected https://<project-ref>.supabase.co" >&2
  exit 1
fi

for name in NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  if [[ -z "$(env_value "${name}")" ]]; then
    echo "meditaur: ${name} is empty in .env; the live tests would skip." >&2
  fi
done

echo "meditaur: hosted project ${ref}"
echo "meditaur: migrations in supabase/migrations ($(ls supabase/migrations/*.sql | wc -l | tr -d ' ') files)"

linked=""
if [[ -f supabase/.temp/project-ref ]]; then
  linked="$(cat supabase/.temp/project-ref)"
fi

if [[ "${linked}" == "${ref}" ]]; then
  echo "meditaur: already linked to ${ref}"
else
  echo "--- supabase link (the CLI will ask for the database password) ---"
  supabase link --project-ref "${ref}"
fi

echo "--- supabase db push --dry-run ---"
supabase db push --dry-run

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "meditaur: --dry-run set; nothing applied."
  exit 0
fi

if [[ "${ASSUME_YES}" -ne 1 ]]; then
  printf 'Apply these migrations to %s? [y/N] ' "${ref}"
  read -r answer
  if [[ "${answer}" != "y" && "${answer}" != "Y" ]]; then
    echo "meditaur: stopped without applying anything."
    exit 0
  fi
fi

echo "--- supabase db push ---"
supabase db push

echo "--- supabase functions deploy ---"
# Two halves no browser may do, both deployed with the schema they run against, so a
# release cannot ship a caller without its other half. `close-account` removes the
# `auth.users` row; `admin` is the only writer of `account_flags` — the panel behind it
# is where the owner sets an account's flags, creates an account and sets a password by
# hand (`P0 · 23`). The platform verifies the JWT before either runs (no
# `--no-verify-jwt`).
supabase functions deploy close-account
supabase functions deploy admin

echo "--- live integration tests against ${ref} ---"
# Explicit: the suite must not decide by accident which database it hits.
export SUPABASE_TARGET=hosted
"${SCRIPT_DIR}/in-docker.sh" pnpm test:integration

echo "meditaur: hosted project is at the schema the repo describes."
echo "meditaur: next, sign in from the deployed app and watch /account report the user id."
