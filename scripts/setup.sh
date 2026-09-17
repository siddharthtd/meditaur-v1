#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/in-docker.sh" pnpm install --frozen-lockfile
echo "meditaur: setup complete. Run ./scripts/meditaur dev  (e2e is Docker: ./scripts/meditaur e2e)"
