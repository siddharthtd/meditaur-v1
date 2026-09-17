#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"
if ! command -v supabase >/dev/null 2>&1; then
  echo "meditaur: 'up' is the one command that needs a host tool: the Supabase CLI." >&2
  echo "meditaur: everything else runs in Docker — use ./scripts/meditaur check:full." >&2
  echo "meditaur: install: https://supabase.com/docs/guides/local-development/cli/getting-started" >&2
  exit 1
fi
supabase start
supabase db reset --yes
