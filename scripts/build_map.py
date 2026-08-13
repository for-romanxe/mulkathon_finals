#!/usr/bin/env python3
"""남한 행정경계 GeoJSON → 화면용 경량 지오메트리(src/app/korea-geo.ts).

출처: southkorea/southkorea-maps (통계청 2013 시도 경계, 공개 저장소)
      https://github.com/southkorea/southkorea-maps

원본은 3,700여 점이라 그대로 넣으면 번들이 커진다. Douglas-Peucker로 단순화하고
아주 작은 섬은 버린다. 좌표는 소수 4자리(약 10m)로 반올림한다.

    python3 scripts/build_map.py <geojson 경로>
"""
import json
import sys
from pathlib import Path

TOLERANCE = 0.006  # 도 단위 — 약 600m
MIN_AREA = 0.004  # 이보다 작은 섬은 그리지 않는다
# 화면 밖 먼 섬(백령도·울릉도·독도)은 지도를 넓히기만 해서 뺀다
WINDOW = (125.5, 129.75, 32.9, 38.75)  # lon min/max, lat min/max


def perpendicular_distance(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return ((x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2) ** 0.5


def simplify(points, tol):
    if len(points) < 3:
        return points
    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], points[0], points[-1])
        if d > worst:
            worst, index = d, i
    if worst <= tol:
        return [points[0], points[-1]]
    return simplify(points[: index + 1], tol)[:-1] + simplify(points[index:], tol)


def ring_area(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(s) / 2


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "skorea_simple.json")
    doc = json.load(open(src, encoding="utf-8"))

    provinces = []
    for feat in doc["features"]:
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        rings = []
        for poly in polys:
            outer = [tuple(c) for c in poly[0]]
            if ring_area(outer) < MIN_AREA:
                continue
            cx = sum(c[0] for c in outer) / len(outer)
            cy = sum(c[1] for c in outer) / len(outer)
            if not (WINDOW[0] <= cx <= WINDOW[1] and WINDOW[2] <= cy <= WINDOW[3]):
                continue
            simple = simplify(outer, TOLERANCE)
            # [lon, lat] 를 평탄한 숫자 배열로 — 파일 크기를 줄인다
            flat = []
            for lon, lat in simple:
                flat += [round(lon, 4), round(lat, 4)]
            rings.append(flat)
        if rings:
            provinces.append({"name": feat["properties"].get("name", ""), "rings": rings})

    total = sum(len(r) // 2 for p in provinces for r in p["rings"])
    out = Path("src/app/korea-geo.ts")
    with open(out, "w", encoding="utf-8") as f:
        f.write(
            "// 생성 파일 — 손으로 고치지 않는다. `python3 scripts/build_map.py <geojson>` 로 만든다.\n"
            "// 출처: southkorea/southkorea-maps (통계청 2013 시도 경계).\n"
            "// 각 링은 [lon, lat, lon, lat, ...] 평탄 배열이다.\n"
            "export const KOREA_PROVINCES: { name: string; rings: number[][] }[] = "
        )
        json.dump(provinces, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"{out} — 시도 {len(provinces)}개 · 링 {sum(len(p['rings']) for p in provinces)}개 · 점 {total:,}개 · {out.stat().st_size / 1024:.0f}KB")


if __name__ == "__main__":
    main()
