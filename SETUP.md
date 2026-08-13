# 대회장 세팅 가이드 — 자율 개발 루프

> **세팅 담당: 주영** (1~3번 + `bash scripts/seed-issues.sh <주영> <승빈> <연성>` 실행까지)
> 이슈 백로그는 `BACKLOG.md` 참고 — 아침에 스크립트 한 번으로 18개 일괄 생성

> 이 폴더(repo-scaffold) 내용물을 대회장에서 만든 레포에 그대로 복사해서 첫 커밋으로 푸시한다.
> 규정상 핵심 로직은 본선 중에만 구현 — 이 스캐폴드는 "개발 환경 구축"(FAQ 허용 범위)에 해당.

## 1. 레포 생성 (대회장 도착 직후, 1명이)

```bash
gh repo create <레포명> --public --clone
cd <레포명>
# 스캐폴드 복사: .claude/ scripts/ SETUP.md 전부
git add -A && git commit -m "chore: loop scaffold" && git push
```

**⚠️ 반드시 public** — private + 무료 플랜은 브랜치 보호가 안 돼서 아래 3번이 불가능.

## 2. collaborator 초대 + 라벨

```bash
gh api -X PUT repos/<owner>/<레포명>/collaborators/<주영아이디> -f permission=push
gh api -X PUT repos/<owner>/<레포명>/collaborators/<승빈아이디> -f permission=push
gh label create in-progress --color FBCA04
gh label create help-needed --color D93F0B
```

(초대받은 사람은 메일/알림에서 수락)

## 3. 브랜치 보호 — 이거 안 하면 머지 루프가 영원히 안 돈다 🔴

`reviewDecision`은 브랜치 보호(리뷰 필수)가 없으면 approve가 달려도 null을 반환한다.
hack.md에 폴백을 넣어뒀지만, 보호 규칙을 걸면 "approve 없이 머지 금지 + main 직접 푸시 금지"가 플랫폼 강제가 된다.

```bash
cat > /tmp/protection.json <<'EOF'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null
}
EOF
gh api -X PUT repos/<owner>/<레포명>/branches/main/protection \
  -H "Accept: application/vnd.github+json" --input /tmp/protection.json
```

확인: `gh api repos/<owner>/<레포명>/branches/main/protection --jq .required_pull_request_reviews`

## 4. 각자 로컬 세팅

```bash
gh auth login        # 반드시 본인 계정
git clone <레포 URL> && cd <레포명>
bash scripts/smoke.sh   # SMOKE OK 나오는지
```

## 5. 실행 — 루프는 스스로 안 켜진다

각자 **클론한 레포 폴더에서** Claude Code를 열고:

```bash
/loop 1m /hack 본인깃헙아이디
```

- **1분이 최소 간격** — cron 최소 단위가 1분이라 `30s`로 적어도 조용히 1분으로 올림된다
- 스케줄 걸자마자 1회 즉시 실행된다 (첫 틱을 1분 기다리지 않음)
- 셋이 각자 자기 노트북에서 켜야 함. 노트북 덮으면 그 사람 루프는 멈춤
- 이슈가 하나도 없으면 루프는 "대기 중"만 반복 — 정상임

## 6. 사람이 하는 일 (이것만)

- 회의에서 나온 작업 → GitHub 이슈 생성 + 담당자 assign — **이게 루프의 연료. 없으면 아무 일도 안 일어남**
- 이슈는 작게 (200줄 이내 분량으로 쪼개서)
- 루프가 알아서 집어감. PR 리뷰도 루프끼리 함.
- 🔴 **첫 이슈로 프로젝트 뼈대가 잡히면 `scripts/smoke.sh`의 TODO(데모 시나리오 한 줄)를 사람이 직접 채울 것.** 이걸 채워야 "main이 데모 되는 상태" 검사가 실질이 됨. 루프는 이 파일 수정 금지라 사람만 할 수 있음

---

# 리허설 체크리스트 (본선 전 30분, 더미 레포로)

> ⚠️ 진짜 레포가 아니라 **버리는 더미 레포**로. (사전 커밋 이력 규정)

| # | 확인 | 통과 기준 |
|---|---|---|
| 1 | 위 1~4 세팅을 더미 레포로 그대로 | 셋 다 clone + smoke OK |
| 2 | 더미 이슈 2개 생성·assign 후 `/loop 1m /hack` 셋 다 실행 | 4단계가 돌아 PR 생성됨 |
| 3 | 다른 루프가 3단계에서 approve를 남기는가 | `gh pr view <n> --json reviews`에 APPROVED |
| 4 | **핵심**: `gh pr view <n> --json reviewDecision` | 보호 규칙 있으면 "APPROVED", 없으면 null임을 눈으로 확인 |
| 5 | 2단계 머지가 실제로 도는가 | squash 머지 + 브랜치 삭제 + main 스모크 |
| 6 | 셀프 approve 시도 | GitHub이 거부하는지 확인 (작성자는 자기 PR approve 불가) |
| 7 | 200줄 초과 시나리오 (큰 이슈 하나 억지로) | 중단 + "쪼개자" 코멘트 + in-progress 해제 |
| 8 | 2회 연속 실패 시나리오 (일부러 깨지는 이슈) | help-needed 전환 + 다음 틱에 다른 작업 |

리허설 끝나면 더미 레포 삭제: `gh repo delete <더미> --yes`

---

# 친구 원안에서 바뀐 것 (변경 이력)

1. **approve 판정에 폴백 추가** — reviewDecision null 함정 (브랜치 보호 없으면 approve 있어도 null → 머지 데드락)
2. **브랜치 보호 설정을 세팅 절차에 추가** — public 레포 필수 이유 명시
3. **스모크를 `scripts/smoke.sh`로 고정** — 루프 셋이 "빌드+데모 확인"을 제각각 해석하는 것 방지
4. `${ARGUMENTS:-...}` 셸 치환 → 산문 지시로 변경 (Claude Code 치환 패턴 이슈)
5. `--reviewer` 설명 교정 (안 넣어도 루프는 집는다 — 3단계 트리거는 "내 리뷰 없는 PR")
6. 원문에서 중복돼 있던 heredoc 블록 정리
