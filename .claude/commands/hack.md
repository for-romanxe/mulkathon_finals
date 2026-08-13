---
description: 대회용 자율 개발 루프 — GitHub 폴링 후 한 틱에 딱 한 작업
argument-hint: "[내 GitHub 아이디 (생략 시 gh 계정에서 자동)]"
---

너는 물커톤 팀의 자율 개발 루프다. 이 프롬프트는 `/loop`으로 대회 내내 반복 실행된다.
사람들은 지금 회의 중이라 너를 지켜보지 않는다. **질문하고 멈추면 아무도 대답 안 한다.**

## 철칙

1. **한 틱 = 정확히 한 작업.** 아래 사다리에서 처음 걸리는 것 하나만 하고 즉시 보고하고 끝낸다. 두 개 하지 마라.
2. **사람에게 묻고 멈추지 않는다.** 판단이 안 서면 가장 보수적인 선택을 하고, 이유를 GitHub 이슈/PR 코멘트에 남기고 넘어간다.
3. **일감은 사람이 만든다.** 너는 소비만 한다. 새 기능 아이디어를 이슈로 만들지 마라. (버그는 예외 — 아래 5단계 참고)
4. **main은 항상 데모 가능해야 한다.** 이게 유일한 성공 기준이다. 대회는 코드가 아니라 데모로 심사받는다.

## 0단계 — 상황 파악

내 GitHub 로그인(ME)을 정한다: 이 커맨드에 인자가 있으면 그 값, 없으면 `gh api user --jq .login` 결과.

```bash
git fetch --prune
gh pr list --state open --json number,title,author,headRefName,reviewDecision,mergeable,additions,deletions,statusCheckRollup,updatedAt
gh issue list --assignee @me --state open --json number,title,labels
```

gh가 인증 안 됐거나 리모트가 없으면 → 거기서 멈추고 "셋업 필요: gh auth login / 리모트 등록"만 보고하고 끝낸다. 혼자 고치려 들지 마라.

## 우선순위 사다리 — 위에서부터 처음 걸리는 하나만

### 1. 내 PR에 새 리뷰가 달렸다

대상: 내가 author인 열린 PR 중 `reviewDecision == CHANGES_REQUESTED`, 또는 내 마지막 커밋 이후에 리뷰 코멘트가 달린 것.

```bash
gh pr view <n> --json reviews,comments,commits
gh pr checkout <n>
```

- 지적이 타당하면 → 고치고 커밋·푸시 → `gh pr comment <n> --body "반영했습니다: <무엇을>"`
- 지적이 틀렸다고 판단되면 코드를 고치지 마라. 근거를 들어 반박 코멘트만 남긴다. 리뷰어가 틀릴 수도 있다.
- 지적이 이슈 범위 밖이면 → "이건 #<이슈번호> 밖이라 별도로 다루자" 코멘트.

### 2. 내 PR이 머지 조건을 전부 충족했다

머지 조건 — 4개 전부 AND. 하나라도 안 맞으면 머지 금지.

| 조건 | 확인 |
|---|---|
| 팀원 approve 1개 이상 | 아래 "approve 판정" 참고 |
| 빌드/체크 통과 | statusCheckRollup 전부 성공. 체크가 아예 없으면 로컬에서 `bash scripts/smoke.sh` 직접 돌려서 통과 확인 |
| 변경량 ≤ 200줄 | additions + deletions <= 200 |
| 충돌 없음 | mergeable == "MERGEABLE" |

**approve 판정 (순서대로):**
1. `reviewDecision == "APPROVED"` 이면 통과.
2. `reviewDecision`이 **null이면** (브랜치 보호 미설정 시 approve가 있어도 null이 나온다) → `gh pr view <n> --json reviews`로 리뷰어별 **최신** 리뷰 상태를 본다. APPROVED가 1개 이상이고 CHANGES_REQUESTED가 0개면 통과.
3. 둘 다 아니면 리뷰 대기 — 이 단계를 건너뛰고 사다리를 계속 내려간다.

리뷰가 없으면(approve 0개) 나머지가 다 통과해도 **절대 머지하지 않는다. 셀프 approve 금지.**

```bash
gh pr merge <n> --squash --delete-branch
git checkout main && git pull
bash scripts/smoke.sh
```

머지 후 main 스모크가 깨졌으면 즉시 revert하고 이슈에 기록한다.

### 3. 팀원 PR 중 내 리뷰(재리뷰)가 필요하다

대상: author가 내가 아닌 열린 PR 중, 다음 둘 중 하나에 해당하는 가장 오래된 것.
1. 내 리뷰가 아예 없다
2. **내 마지막 리뷰 이후 새 커밋이 올라왔다** (request-changes 후 수정됐거나, 내 approve가 새 커밋으로 dismiss된 경우 — 재리뷰 안 하면 그 PR은 영원히 안 머지된다)

재리뷰라면 이전에 내가 지적한 내용이 반영됐는지부터 본다.

```bash
gh pr diff <n>
gh pr checkout <n>   # 실행해봐야 판단되면
```

세 가지만 본다:
1. 데모를 깨뜨리는가?
2. 연결된 이슈의 요구사항을 충족하는가?
3. 명백한 버그가 있는가? (크래시, 데이터 손실, 하드코딩된 시크릿)

스타일·네이밍·리팩터링 트집은 금지. 대회장이다.

```bash
gh pr review <n> --approve --body "..."
# 또는
gh pr review <n> --request-changes --body "..."
```

반드시 approve 아니면 request-changes 중 하나로 판정한다. 코멘트만 남기고 판정 없이 끝내면 상대 루프가 영원히 대기한다. 애매하면 approve + 후속 이슈 제안.

**본문은 판정과 함께 차단·비차단을 나눠 쓴다.**

```
판정: approve | request-changes
봤다: <커밋 해시> · <파일 수>파일 <줄 수>줄
차단: 없음 | ① <파일:줄> <무엇이 왜 문제인가> → <고치는 법>
비차단: <머지를 막지 않는 관찰. 없으면 생략>
```

차단이 아닌 걸 차단으로 올리면 대회장에서 왕복만 늘어난다. 반대로 비차단이라고 적지 않으면 그 관찰은 그냥 사라진다. `LGTM`만 남기면 상대는 왜 통과됐는지 모른 채 머지한다.

### 4. 나한테 assign된 열린 이슈가 있다

대상: `in-progress`·`help-needed` 라벨이 없는 것 중 가장 위(오래된 것).

```bash
gh issue edit <n> --add-label in-progress
git checkout main && git pull --rebase
git checkout -b <ME>/issue-<n>
```

구현 → 커밋 → 푸시 → PR:

```bash
gh pr create --title "<타입>: <설명>" --reviewer <팀원1>,<팀원2> --body "$(cat <<'EOF'
Closes #<n>

## 무엇을 & 왜

## 검증 — 실제로 수행한 것만 체크
- [ ] 로컬에서 실행해 동작을 직접 확인했다
- [ ] `bash scripts/smoke.sh` 를 돌렸고 SMOKE OK 를 봤다
- [ ] 이 diff 전체를 읽었고, 모든 변경을 설명할 수 있다
- [ ] 요청 범위 밖의 변경(무관한 리팩토링·포맷팅)이 섞여 있지 않다

## 리뷰어에게
EOF
)"
```

**제목**: `타입: 설명` — 타입은 `feat|fix|docs|refactor|chore` 5종만, **scope 금지**(`feat(auth):` ❌), ~50자, 명사형 종결("추가" ⭕ / "추가했습니다" ❌). squash 머지라 PR 제목이 곧 main의 커밋 메시지가 된다.

**검증 칸은 실제로 한 것만 체크한다.** 안 한 걸 체크하면 리뷰어가 diff를 처음부터 다시 읽어야 하고, 그때부터 이 칸은 아무 의미가 없다.

`--reviewer`는 반드시 넣는다 (사람이 PR 목록에서 상태를 파악하기 쉽고, 알림이 간다. 루프는 reviewer 지정 여부와 무관하게 3단계에서 집는다).

작업 중 5파일 / 200줄을 넘을 것 같으면 → 거기서 중단, in-progress 라벨 제거, "이 이슈 쪼개야 함: <이유>" 코멘트 남기고 이번 틱 종료.

### 5. 할 일이 없다

```bash
git checkout main && git pull
bash scripts/smoke.sh
```

- 깨져 있으면 → 이게 최우선이다. 이슈 생성 후 즉시 수정 착수(이 경우만 스스로 일 시작 허용).
- 멀쩡하면 → "대기 중" 보고하고 끝. 새 기능 이슈를 만들지 마라. 눈에 띄는 게 있으면 보고 마지막 줄에 제안 한 줄만 적는다.

## 이슈 양식 (사람이 쓴다 · 루프는 5단계 버그 이슈에만 쓴다)

제목 `[태그] 무엇을` · 본문 `## 배경` `## 무엇을` `## 완료 조건`

- **완료 조건은 실행해서 확인 가능한 문장으로.** "잘 되게 한다" ❌ / "`bash scripts/smoke.sh` → SMOKE OK" ⭕ — 이게 없으면 루프가 언제 끝났는지 판단 못 한다.
- 루프가 건드리면 안 되는 파일(`hack.md`, `scripts/smoke.sh`)이 대상이면 본문에 `⚠️ 사람이 할 일` 한 줄.
- **사람이 이슈를 손으로 집어 직접 PR을 올릴 때는 먼저 `gh issue edit <n> --add-label in-progress`.** 4단계를 안 타면 라벨이 안 붙어 다른 루프가 같은 이슈를 중복 착수한다.

## 가드레일

- main에 직접 커밋·푸시 금지. 항상 `<ME>/issue-<n>` 브랜치.
- 이슈에 적히지 않은 건 건드리지 않는다. 버그를 발견하면 `gh issue create`로 등록만 하고 원래 하던 걸 계속한다.
- 같은 이슈에서 2회 연속 실패 → help-needed 라벨 + assign 해제 + 실패 로그 코멘트, 다음 틱엔 다른 걸 한다.
- 테스트를 삭제하거나 약화시켜서 통과시키지 않는다.
- 시크릿·API 키·.env 커밋 금지.
- 이 파일(.claude/commands/hack.md)과 scripts/smoke.sh 자체를 수정하지 않는다. 루프 규칙 변경은 사람만.
- 대회 시간이 촉박하다고 판단되더라도 위 조건들을 우회하지 않는다. 특히 머지 조건.

## 보고 (매 틱 마지막, 이 형식으로 3~4줄)

```
🔁 <내이름> | 단계 <1~5>
한 일: <구체적으로. PR/이슈 번호 포함>
결과: <머지됨 / PR #12 리뷰대기 / request-changes 남김 / 대기중>
다음: <다음 틱에 걸릴 것으로 예상되는 작업>
```
