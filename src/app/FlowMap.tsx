"use client";
// 전국 화물 흐름 개략도.
// 선 굵기 = 물량, 선 색 = 편방향 심각도(역방향이 없을수록 붉다 — 돌아올 때 빈 화차).
// 질문한 구간은 강조되고, 선을 클릭하면 그 구간을 묻는다.
import { useMemo } from "react";
import { STATION_GEO } from "./map-data";

export type Flow = { from: string; to: string; ton: number };

const VIEW_W = 420;
const VIEW_H = 560;
const PAD = 34;

type Pair = { a: string; b: string; fwd: number; rev: number; total: number; revShare: number };

// 편방향일수록 붉게. 역방향 비중 0% → 진한 주황, 40%↑ → 청록
function flowColor(revShare: number) {
  if (revShare < 5) return "#c2410c";
  if (revShare < 15) return "#e08b2c";
  if (revShare < 30) return "#7ba3d0";
  return "#3f72af";
}

export default function FlowMap({
  flows,
  active,
  onPick,
}: {
  flows: Flow[];
  active?: { from: string; to: string } | null;
  onPick: (from: string, to: string) => void;
}) {
  const { pairs, project, hubs } = useMemo(() => {
    const drawn = flows.filter((f) => STATION_GEO[f.from] && STATION_GEO[f.to] && f.ton > 0);

    // 방향 있는 흐름을 무방향 쌍으로 합치고 정·역방향을 분리한다
    const merged = new Map<string, Pair>();
    for (const f of drawn) {
      const [a, b] = [f.from, f.to].sort();
      const key = `${a}|${b}`;
      const p = merged.get(key) ?? { a, b, fwd: 0, rev: 0, total: 0, revShare: 0 };
      if (f.from === a) p.fwd += f.ton;
      else p.rev += f.ton;
      merged.set(key, p);
    }
    const pairs = [...merged.values()].map((p) => {
      const [hi, lo] = p.fwd >= p.rev ? [p.fwd, p.rev] : [p.rev, p.fwd];
      return { ...p, total: hi + lo, revShare: hi + lo ? (lo / (hi + lo)) * 100 : 0 };
    });

    // 실제로 그릴 역만으로 경계를 잡아 화면을 꽉 채운다
    const used = [...new Set(pairs.flatMap((p) => [p.a, p.b]))];
    const lats = used.map((s) => STATION_GEO[s][0]);
    const lons = used.map((s) => STATION_GEO[s][1]);
    const [latMin, latMax] = [Math.min(...lats), Math.max(...lats)];
    const [lonMin, lonMax] = [Math.min(...lons), Math.max(...lons)];
    // 위도 1도가 경도 1도보다 길다 — 종횡비를 유지해야 지도가 찌그러지지 않는다
    const kx = (VIEW_W - PAD * 2) / Math.max(lonMax - lonMin, 1e-6);
    const ky = (VIEW_H - PAD * 2) / Math.max(latMax - latMin, 1e-6);
    const k = Math.min(kx, ky * 0.82);
    const project = (lat: number, lon: number): [number, number] => [
      PAD + (lon - lonMin) * k + (VIEW_W - PAD * 2 - (lonMax - lonMin) * k) / 2,
      PAD + (latMax - lat) * (k / 0.82),
    ];

    // 물량 상위 역만 이름을 단다 (겹침 방지)
    const byStation = new Map<string, number>();
    for (const p of pairs) {
      byStation.set(p.a, (byStation.get(p.a) ?? 0) + p.total);
      byStation.set(p.b, (byStation.get(p.b) ?? 0) + p.total);
    }
    const hubs = new Set(
      [...byStation.entries()].sort((x, y) => y[1] - x[1]).slice(0, 11).map(([s]) => s),
    );
    return { pairs, project, hubs };
  }, [flows]);

  const max = Math.max(...pairs.map((p) => p.total), 1);
  const isActive = (p: Pair) =>
    !!active &&
    ((p.a === active.from && p.b === active.to) || (p.a === active.to && p.b === active.from));
  const hasActive = !!active && pairs.some(isActive);
  const stations = [...new Set(pairs.flatMap((p) => [p.a, p.b]))];

  // 이름표가 겹치지 않도록, 이미 라벨이 놓인 자리 근처면 건너뛴다
  const placed: [number, number][] = [];
  const canLabel = (x: number, y: number) => {
    if (placed.some(([px, py]) => Math.abs(px - x) < 34 && Math.abs(py - y) < 11)) return false;
    placed.push([x, y]);
    return true;
  };

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full" role="img" aria-label="전국 화물 흐름 개략도">
      {pairs.map((p, i) => {
        const [x1, y1] = project(...STATION_GEO[p.a]);
        const [x2, y2] = project(...STATION_GEO[p.b]);
        const on = isActive(p);
        const w = 0.7 + Math.sqrt(p.total / max) * 6;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={hasActive && !on ? "#dbe2ef" : flowColor(p.revShare)}
            strokeWidth={on ? w + 2.5 : w}
            strokeLinecap="round"
            strokeOpacity={on ? 1 : hasActive ? 0.3 : 0.62}
            className={hasActive ? "" : "cursor-pointer"}
            onClick={() => onPick(p.a, p.b)}
          >
            <title>{`${p.a} ↔ ${p.b} · ${Math.round(p.total).toLocaleString()}톤 · 역방향 ${p.revShare.toFixed(1)}%`}</title>
          </line>
        );
      })}

      {/* 활성 구간 위를 흐르는 점 — 화물이 오가는 것을 보여준다 */}
      {hasActive &&
        pairs.filter(isActive).map((p, i) => {
          const [x1, y1] = project(...STATION_GEO[p.a]);
          const [x2, y2] = project(...STATION_GEO[p.b]);
          return (
            <line
              key={`d${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#fff"
              strokeWidth={2.2}
              strokeDasharray="1 15"
              strokeLinecap="round"
              className="motion-safe:animate-[dash_1.4s_linear_infinite]"
            />
          );
        })}

      {stations.map((s) => {
        const [x, y] = project(...STATION_GEO[s]);
        const on = !!active && (s === active.from || s === active.to);
        return (
          <g key={s}>
            <circle cx={x} cy={y} r={on ? 4.5 : 2.3} fill={on ? "#112d4e" : "#8ea5c4"} />
            {(on || (hubs.has(s) && canLabel(x, y))) && (
              <text
                x={x + (on ? 7.5 : 5.5)}
                y={y + 3.2}
                fill={on ? "#112d4e" : "#7c93b3"}
                className={on ? "text-[11px] font-bold" : "text-[9.5px]"}
              >
                {s}
              </text>
            )}
          </g>
        );
      })}

      {/* 범례 */}
      <g transform={`translate(12, ${VIEW_H - 46})`}>
        <text y={0} className="text-[9px]" fill="#8ea5c4">
          선 색 = 돌아오는 화물이 있는가
        </text>
        {[
          ["#c2410c", "거의 편도"],
          ["#e08b2c", "편방향 심함"],
          ["#7ba3d0", "일부 복화"],
          ["#3f72af", "양방향"],
        ].map(([c, label], i) => (
          <g key={label} transform={`translate(0, ${12 + i * 11})`}>
            <line x1={0} y1={-3} x2={14} y2={-3} stroke={c} strokeWidth={3} strokeLinecap="round" />
            <text x={19} y={0} className="text-[8.5px]" fill="#8ea5c4">
              {label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
