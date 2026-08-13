#!/usr/bin/env bash
# 스모크 테스트 — 루프의 "빌드+데모 확인"은 전부 이 스크립트 하나로 판정한다.
# 통과 = exit 0, 실패 = exit 1. 루프는 이 스크립트를 수정하지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "SMOKE FAIL: $1" >&2; exit 1; }

# ── 빌드 ──
if [ -f package.json ]; then
  npm install --silent --no-audit --no-fund || fail "npm install"
  if npm run | grep -q "  build"; then
    npm run build --silent || fail "npm run build"
  fi
elif [ -f requirements.txt ]; then
  python3 -m pip install -q -r requirements.txt || fail "pip install"
fi

# ── 데모 시나리오 ──
# TODO(8/13 스택 확정 시 채움): 데모 핵심 경로 1개를 여기서 실행한다.
# 예) curl -sf http://localhost:3000/api/health || fail "health check"
# 예) python3 -c "import app; app.self_check()" || fail "self check"

echo "SMOKE OK"
