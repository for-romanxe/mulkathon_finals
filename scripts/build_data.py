"""원본 공공데이터를 화면·계산이 읽는 형태로 정규화한다.

입력  data/raw/   (커밋 금지 — .gitignore)
출력  public/data/*.json  (커밋 — 화면이 읽는다)

시각은 **초 단위로 보존**한다. 시각 셀 3,927행에 30초 값이 있어서
분으로 반올림하면 체류시간 합계가 완료 조건과 어긋난다.
"""

import csv
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"

API = "https://apis.data.go.kr/B551457/carriageStatistics/freightTrain"


def norm_station(name):
    """역명에서 괄호·대괄호 주석을 떼어낸다. '월롱(무배)[경의]' → '월롱'"""
    return re.sub(r"\(.*?\)|\[.*?\]", "", name).strip()


def to_seconds(hms):
    """'04:26:30' → 15990.  자정 넘김은 여기서 처리하지 않는다(시퀀스 복원의 몫)."""
    h, m, s = (int(x) for x in hms.split(":"))
    return h * 3600 + m * 60 + s


def read_csv(path, encoding="cp949"):
    with open(path, encoding=encoding, newline="") as f:
        return list(csv.DictReader(f))


def build_schedule():
    rows = read_csv(RAW / "freight_schedule.csv")
    out = []
    for r in rows:
        out.append(
            {
                "kind": r["열차종별"],
                "train": r["열차번호"],
                "updown": r["상하"],
                "seq": int(r["순서"]),
                "station": norm_station(r["역명"]),
                "station_raw": r["역명"],
                "arr_sec": to_seconds(r["도착시각"]),
                "dep_sec": to_seconds(r["출발시각"]),
                "stop_reason": r["정차사유"],
                "line": r["운행선"],
                "days": r["운행요일"],
            }
        )
    out.sort(key=lambda x: (x["train"], x["seq"]))
    return out


def build_od():
    with open(RAW / "ft_all.json", encoding="utf-8") as f:
        doc = json.load(f)

    def find_rows(node):
        if isinstance(node, list):
            return node
        if isinstance(node, dict):
            for v in node.values():
                found = find_rows(v)
                if found:
                    return found
        return None

    rows = find_rows(doc) or []
    out = []
    for r in rows:
        out.append(
            {
                "date": r["crtr_ymd"],
                "from": norm_station(r["sndng_stn_nm"]),
                "to": norm_station(r["arvl_stn_nm"]),
                "from_cd": r["sndng_stn_cd"],
                "to_cd": r["arvl_stn_cd"],
                "item": r["item_lclsf_nm"],
                "item_mid": r["item_mclsf_nm"],
                "ton": float(r["ftsd_ton"]),
                "tonkm": float(r["ftsp_dtkm"]),
            }
        )
    return out


def build_stations():
    rows = read_csv(RAW / "freight_stations.csv")
    out = []
    for r in rows:
        raw = r["역명"]
        out.append(
            {
                "region": r["지역"],
                "station": norm_station(raw),
                "station_raw": raw,
            }
        )
    return out


def fetch_od(key, rows=10142):
    """수송통계 API 전수 수집. 날짜 필터 파라미터가 없어 전부 받아 로컬에서 거른다."""
    url = f"{API}?serviceKey={key}&pageNo=1&numOfRows={rows}&dataType=JSON"
    with urllib.request.urlopen(url, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def write(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.json"
    # 한 줄로 쓴다 — diff가 수천 줄로 불어나는 것을 막는다.
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {path.relative_to(ROOT)}  {len(data):,}건  {path.stat().st_size/1024:,.0f}KB")


def main():
    if "--fetch" in sys.argv:
        key = os.environ.get("DATA_GO_KR_KEY")
        if not key:
            sys.exit("DATA_GO_KR_KEY 없음 — .env를 확인하세요 (커밋 금지)")
        RAW.mkdir(parents=True, exist_ok=True)
        with open(RAW / "ft_all.json", "w", encoding="utf-8") as f:
            json.dump(fetch_od(key), f, ensure_ascii=False)
        print("수송통계 API 재수집 완료")

    missing = [n for n in ("freight_schedule.csv", "ft_all.json", "freight_stations.csv") if not (RAW / n).exists()]
    if missing:
        sys.exit(
            f"data/raw/ 에 원본이 없습니다: {', '.join(missing)}\n"
            "  freight_schedule.csv  공공데이터포털 15042241 (cp949)\n"
            "  freight_stations.csv  공공데이터포털 15042207 (cp949)\n"
            "  ft_all.json           DATA_GO_KR_KEY 를 .env 에 넣고 --fetch"
        )

    print("정규화 중...")
    schedule, od, stations = build_schedule(), build_od(), build_stations()
    write("schedule", schedule)
    write("od", od)
    write("stations", stations)

    dates = sorted({r["date"] for r in od})
    write(
        "meta",
        {
            "schedule_rows": len(schedule),
            "trains": len({r["train"] for r in schedule}),
            "od_rows": len(od),
            "od_pairs": len({(r["from"], r["to"]) for r in od}),
            "od_from": dates[0],
            "od_to": dates[-1],
            "od_days": len(dates),
            "stations": len(stations),
            "note": "시각은 초 단위. 자정 넘김은 시퀀스 복원 단계에서 처리한다.",
        },
    )


if __name__ == "__main__":
    main()
