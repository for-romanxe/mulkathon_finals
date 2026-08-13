# 철도 전환 편익 오케스트레이터 (rail-console)

코레일 영업 담당자가 화주 미팅에서 쓰는 도구 — 화주의 자연어 질문에, **숫자는 코드가 계산하고 AI는 호출 결정과 해석만** 하는 구조로 철도 전환의 편익을 근거와 함께 답한다.

```
화주 질문 ─→ LLM (도구 선택) ─→ 순수 함수 (B·C층, 환각 0)
                 │                    │
                 ←── 지식 베이스 (데이터 한계 주입)
                 ↓
         답변 + 함수 호출 배지 + 근거 카드
```

- 데이터에 없는 구간·역은 **모른다고 답한다** (예: 부산신항은 시간표 데이터 밖).
- 원단위가 확정되지 않은 편익은 금액을 지어내지 않고 "확정 전"으로 표시한다.

## 실행

```bash
npm install
cp .env.example .env   # 아래 키 채우기
python3 scripts/normalize.py   # data/raw/ 원본 → public/data/*.json
npm run dev
```

`normalize.py` 는 `data/raw/` 에서 이 5개를 이름 그대로 찾는다. 하나라도 없으면 `FileNotFoundError` 로 떨어진다.

```
data/raw/timetable_15042241.csv              화물열차 시간표 (cp949)
data/raw/freight_stations_15042207.csv       화물취급역 명부 (cp949)
data/raw/runcount_weekday_15068417.csv       선구별 운행횟수 평일 (cp949)
data/raw/runcount_weekend_15068420.csv       선구별 운행횟수 주말 (cp949)
data/raw/freight_train.json                  수송통계 O-D
```

`.env` (커밋 금지):

| 키 | 용도 |
|---|---|
| `ANTHROPIC_API_KEY` | LLM 라우팅 (`/api/chat`) |
| `DATA_GO_KR_KEY_ENC` | 수송통계 API 재수집용 — **재수집 경로는 아직 미구현**(#64) |

검증은 전부 `bash scripts/smoke.sh` 하나로 한다 (빌드 + 데이터 + 파이썬 문법).

## 배포

- 제출 링크: <https://rail-console-for-romanxe1.vercel.app>

`https://rail-console.vercel.app` 는 A1 플레이스홀더를 서빙 중인 **다른 프로젝트**다. 제출에 쓰지 않는다.

## 데이터 출처

| 데이터 | 출처 | 비고 |
|---|---|---|
| 화물열차 시간표 | 공공데이터포털 15042241 | cp949 · 시각 셀에 30초 값 존재 → **초 단위로 계산** |
| 화물취급역 명부 | 공공데이터포털 15042207 | 2019년 기준 명부 |
| 선구별 운행횟수 | 공공데이터포털 15068417·15068420 | 평일/주말, 빈 칸 = 0회 |
| 수송통계 O-D | 공공데이터포털 수송통계 API | 스냅샷 창에 따라 건수 변동 — `public/data/summary.json` 의 `source.od_stat_date` 확인 |

**원본(`data/raw/`)은 재배포 금지 조건이라 커밋하지 않는다.** 위 5개 파일명 그대로 각 출처에서 내려받아 `data/raw/` 에 둔다.

시간표 실측 검증치 (두 사람이 독립 재현): 중간역 화물취급 정차 **5,094분** · 승무원교대 3,230분 · 운전취급 1,749분 · 정차 비중 **22.8%** · X-factor **1.296**.

## 편익 원단위 출처

도로→철도 전환의 환경(탄소·대기오염)·사회(교통사고·혼잡) 편익 원단위는 **국토교통부 「교통시설 투자평가지침」(국토교통부 고시 제2022-500호)** 를 따른다. 구체 수치 확정은 #35(C1)·#37(C2)에서 — 확정 전까지 앱은 금액을 표시하지 않는다.

## 팀

| 이름 | 역할 |
|---|---|
| 연성 ([@for-romanxe](https://github.com/for-romanxe)) | 총괄·발표·데이터 파이프라인 |
| 주영 ([@Imtylerrrrrr](https://github.com/Imtylerrrrrr)) | 인프라·배포·오케스트레이션·화면 |
| 승빈 ([@sonamoo0407](https://github.com/sonamoo0407)) | 계산 함수(B층)·지식 베이스(D2) |
