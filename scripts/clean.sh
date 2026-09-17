#!/usr/bin/env bash
# Remove generated leftovers. Does not delete .tools caches or node_modules.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

rm -rf \
  "${ROOT}/.turbo" \
  "${ROOT}/coverage" \
  "${ROOT}/playwright-report" \
  "${ROOT}/test-results" \
  "${ROOT}/blob-report" \
  "${ROOT}/apps/web/.next" \
  "${ROOT}/apps/web/out" \
  "${ROOT}/apps/web/playwright-report" \
  "${ROOT}/apps/web/test-results" \
  "${ROOT}/apps/web/blob-report" \
  "${ROOT}/tests/e2e/playwright-report" \
  "${ROOT}/tests/e2e/test-results" \
  "${ROOT}/tests/e2e/blob-report"

rm -rf "${ROOT}/apps/"*/.turbo "${ROOT}/packages/"*/.turbo "${ROOT}/tests/"*/.turbo
find "${ROOT}/apps" "${ROOT}/packages" "${ROOT}/tests" -name "*.tsbuildinfo" -delete 2>/dev/null || true
find "${ROOT}/apps" "${ROOT}/packages" "${ROOT}/tests" -type d -name ".vite" -prune -exec rm -rf {} + 2>/dev/null || true
if [[ -d "${ROOT}/node_modules" ]]; then
  find "${ROOT}/node_modules" -type d -name ".vite" -prune -exec rm -rf {} + 2>/dev/null || true
fi

echo "meditaur: cleaned generated artifacts"
