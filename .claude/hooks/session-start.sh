#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

npm ci --no-fund --no-audit >/dev/null 2>&1 || echo "session-start: could not install the tools; browser tests will skip" >&2

if [ ! -f build/style.json ]; then
  node scripts/build-style.mjs || echo "session-start: could not build build/style.json" >&2
fi

if node scripts/fetch-dev-assets.mjs; then
  node scripts/fetch-app-assets.mjs || echo "session-start: could not fetch app assets" >&2
  node scripts/build-quiz.mjs || echo "session-start: could not build the quiz data" >&2
else
  echo "session-start: could not fetch dev assets; data-dependent tests will skip" >&2
fi
