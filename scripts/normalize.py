#!/usr/bin/env python3
"""data/raw/* → public/data/*.json 정규화.

팀 표준 (연성 검증으로 확립):
- 시각은 초로 합산 후 분 환산. 분으로 버리면 :30 셀이 계통적으로 잘린다.
- 자정 넘김은 차이 계산 시점에 % 86400.
- 역명 정규화: 괄호·대괄호 주석 제거.
- 열차번호 단독 키 (날짜·편성 조합 금지).

원본(data/raw/)은 재배포 금지라 커밋하지 않는다 — 이 스크립트가 로컬에서 생성한
public/data/*.json 만 커밋된다.
"""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

RAW = Path("data/raw")
OUT = Path("public/data")


def norm(name: str) -> str:
    return re.sub(r"\(.*?\)|\[.*?\]", "", name).strip()


def sec(hms: str) -> int:
    h, m, s = hms.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def load_stations():
    rows = csv.DictReader(open(RAW / "freight_stations_15042207.csv", encoding="cp949"))
    return [{"region": r["지역"], "name": norm(r["역명"]), "raw": r["역명"]} for r in rows]


def load_trains():
    trains = {}
    for r in csv.DictReader(open(RAW / "timetable_15042241.csv", encoding="cp949")):
        t = trains.setdefault(r["열차번호"], {
            "no": r["열차번호"], "type": r["열차종별"], "updown": r["상하"],
            "line": r["운행선"], "days": r["운행요일"], "stops": [],
        })
        t["stops"].append({
            "seq": int(r["순서"]), "station": norm(r["역명"]),
            "arr": sec(r["도착시각"]), "dep": sec(r["출발시각"]), "reason": r["정차사유"],
        })
    for t in trains.values():
        t["stops"].sort(key=lambda s: s["seq"])
    return list(trains.values())


def load_runcounts():
    def one(path):
        # 빈 칸은 해당 선구 운행 0회
        return [{"line": r["선명"], "container": int(r["컨테이너(회_일)"] or 0), "freight": int(r["화물(회_일)"] or 0)}
                for r in csv.DictReader(open(path, encoding="cp949"))]
    return {"weekday": one(RAW / "runcount_weekday_15068417.csv"),
            "weekend": one(RAW / "runcount_weekend_15068420.csv")}


def load_od():
    recs = json.load(open(RAW / "freight_train.json", encoding="utf-8"))
    # items: 품목대분류별 톤. B5(편방향 구간의 도착역에서 "같은 품목"이 나가는지)는
    # 쌍 합계만으로 판정할 수 없어서 품목을 집계에 남긴다. 기존 필드는 그대로 둔다.
    # 물량 0인 품목은 빼고 넣는다 — 원본 10,245건 중 995건이 ton·tonkm 둘 다 0이라
    # 그대로 두면 "그 품목이 나간다"로 오탐된다.
    agg = defaultdict(lambda: {"ton": 0.0, "tkm": 0.0, "container_ton": 0.0,
                               "items": defaultdict(float)})
    for r in recs:
        k = (norm(r["sndng_stn_nm"]), norm(r["arvl_stn_nm"]))
        ton = float(r["ftsd_ton"])
        agg[k]["ton"] += ton
        agg[k]["tkm"] += float(r["ftsp_dtkm"])
        agg[k]["items"][r["item_lclsf_nm"]] += ton
        if r["item_lclsf_nm"] == "컨테이너":
            agg[k]["container_ton"] += ton
    od = []
    for (a, b), v in sorted(agg.items()):
        od.append({"from": a, "to": b, "ton": round(v["ton"], 1), "tkm": round(v["tkm"], 1),
                   "km": round(v["tkm"] / v["ton"], 1) if v["ton"] else None,
                   "container_ton": round(v["container_ton"], 1),
                   "items": {i: round(t, 1) for i, t in
                             sorted(v["items"].items(), key=lambda x: -x[1]) if t}})
    return od, len(recs), recs[0]["crtr_ymd"] if recs else None


def summarize(trains, od, od_n, od_date):
    dwell_by_reason = defaultdict(int)
    total_dwell = total_span = mid_dwell = 0
    for t in trains:
        st = t["stops"]
        for i, s in enumerate(st):
            dw = (s["dep"] - s["arr"]) % 86400
            total_dwell += dw
            dwell_by_reason[s["reason"]] += dw
            if 0 < i < len(st) - 1:
                mid_dwell += dw
        total_span += (st[-1]["arr"] - st[0]["dep"]) % 86400
    pairs = defaultdict(lambda: [0.0, 0.0])
    for r in od:
        k = tuple(sorted([r["from"], r["to"]]))
        pairs[k][0 if (r["from"], r["to"]) == k else 1] += r["ton"]
    tot = sum(sum(v) for v in pairs.values())
    return {
        "source": {"trains": len(trains), "od_records": od_n, "od_stat_date": od_date},
        "dwell_min_by_reason": {k: round(v / 60, 1) for k, v in
                                sorted(dwell_by_reason.items(), key=lambda x: -x[1]) if v},
        "mid_station_dwell_min": round(mid_dwell / 60, 1),
        "total_span_min": round(total_span / 60, 1),
        "dwell_share_pct": round(total_dwell / total_span * 100, 1),
        "x_factor": round(total_span / (total_span - total_dwell), 3),
        "od": {
            "pairs_undirected": len(pairs),
            "total_ton": round(tot, 1),
            "dominant_dir_ton_pct": round(sum(max(v) for v in pairs.values()) / tot * 100, 1),
            "reverse_dir_ton_pct": round(sum(min(v) for v in pairs.values()) / tot * 100, 1),
            "bidirectional_pair_pct": round(
                sum(1 for v in pairs.values() if v[0] and v[1]) / len(pairs) * 100, 1),
        },
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    stations = load_stations()
    trains = load_trains()
    runcounts = load_runcounts()
    od, od_n, od_date = load_od()
    summary = summarize(trains, od, od_n, od_date)
    for name, data in [("stations", stations), ("trains", trains), ("runcounts", runcounts),
                       ("od_stats", od), ("summary", summary)]:
        with open(OUT / f"{name}.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print("검증용 요약:", json.dumps(summary["dwell_min_by_reason"], ensure_ascii=False),
          f"| 정차 {summary['dwell_share_pct']}% | X {summary['x_factor']}")


if __name__ == "__main__":
    main()
