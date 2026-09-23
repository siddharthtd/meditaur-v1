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

# `db reset` restarts every container and replays every migration from scratch:
# 98s of `check:full`, which is most of why the gate felt long. What it buys is a
# local database that matches this checkout, and the CLI's own bookkeeping table
# answers that question directly — so it runs exactly when the migrations on disk
# are not the ones applied. A stack that is not there at all counts as "not
# applied", and `MEDITAUR_FORCE_DB_RESET=1` skips the check for the one case the
# table cannot see: a database dropped behind the CLI's back.
migrations_dir="${ROOT}/supabase/migrations"
wanted="$(ls "${migrations_dir}" 2>/dev/null | sed -n 's/^\([0-9]\{14\}\)_.*\.sql$/\1/p' | sort)"
db_container="$(docker ps --filter 'name=supabase_db_' --format '{{.Names}}' 2>/dev/null | head -1 || true)"
applied=""
if [[ -n "${db_container}" ]]; then
  applied="$(docker exec "${db_container}" psql -U postgres -d postgres -Atc \
    'select version from supabase_migrations.schema_migrations order by version' 2>/dev/null || true)"
fi

if [[ "${MEDITAUR_FORCE_DB_RESET:-}" != "1" && -n "${wanted}" && "${applied}" == "${wanted}" ]]; then
  echo "meditaur: the local stack already carries this checkout's $(printf '%s\n' "${wanted}" | wc -l | tr -d ' ') migrations; skipping db reset."
  echo "meditaur: force a reset with MEDITAUR_FORCE_DB_RESET=1 ./scripts/meditaur up"
else
  supabase db reset --yes
fi
