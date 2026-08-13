#!/usr/bin/env bash
# 스모크 테스트 — 루프의 "빌드+데모 확인"은 전부 이 스크립트 하나로 판정한다.
# 통과 = exit 0, 실패 = exit 1. 루프는 이 스크립트를 수정하지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "SMOKE FAIL: $1" >&2; exit 1; }

# ── 빌드 ──
if [ -f package.json ]; then
  npm install --silent --no-audit --no-fund || fail "npm install"
  # build 존재 여부는 package.json을 직접 읽어 판정한다.
  # `npm run | grep`은 npm의 사람용 출력 서식에 의존해서, 서식이 바뀌면 빌드를 조용히 건너뛴다.
  if python3 -c "import json,sys; sys.exit(0 if 'build' in json.load(open('package.json')).get('scripts',{}) else 1)"; then
    npm run build --silent || fail "npm run build"
  fi
elif [ -f requirements.txt ]; then
  python3 -m pip install -q -r requirements.txt || fail "pip install"
fi

# ── 데모 시나리오 (A1에서 주영이 채움 — 스택: Next.js) ──

# 1) 데모 진입점이 실제로 빌드 산출물에 있는가
[ -d .next ] && { [ -f .next/BUILD_ID ] || fail "빌드 산출물 없음"; }

# 2) 화면이 읽는 데이터가 실제로 있고 비어있지 않은가
#    (층1·층2 산출물은 public/data/*.json 으로 나간다)
for f in public/data/*.json; do
  [ -e "$f" ] || continue
  python3 -c "
import json,sys
d=json.load(open('$f',encoding='utf-8'))
if not d: sys.exit('비어있음')
" || fail "$f — 데이터가 비었거나 JSON이 깨짐"
done

# 3) 파이썬 파이프라인이 문법적으로 성립하는가 (깨진 채 머지되는 것 방지)
if compgen -G "scripts/*.py" >/dev/null; then
  for f in scripts/*.py; do
    python3 -m py_compile "$f" || fail "$f 문법 오류"
  done
fi

echo "SMOKE OK"
