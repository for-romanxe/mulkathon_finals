"use client";
// 전국 화물 흐름 개략도. 남한 해안선 개형 위에 O-D를 얹는다.
// 선 굵기 = 물량, 선 색 = 역방향 물량 비중(돌아오는 화물이 없을수록 붉다).
// 질문한 구간은 강조되고, 선을 클릭하면 그 구간을 묻는다.
import { useMemo, useRef, useState } from "react";
import { STATION_GEO, VIEW_W, VIEW_H, project } from "./map-data";
import { KOREA_PROVINCES } from "./korea-geo";

export type Flow = { from: string; to: string; ton: number };

type Pair = { a: string; b: string; total: number; revShare: number };

function flowColor(revShare: number) {
  if (revShare < 5) return "#c2410c";
  if (revShare < 15) return "#e08b2c";
  if (revShare < 30) return "#7ba3d0";
  return "#3f72af";
}

const LEGEND: [string, string][] = [
  ["#c2410c", "거의 편도"],
  ["#e08b2c", "돌아올 화물 적음"],
  ["#7ba3d0", "일부 복화"],
  ["#3f72af", "양방향"],
];

// 겹치는 구간이 서로 가려지지 않게 살짝 휘어 그린다.
function arc(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(len * 0.12, 26);
  return `M${x1} ${y1} Q${mx - (dy / len) * bend} ${my + (dx / len) * bend} ${x2} ${y2}`;
}

// 시도 경계 → SVG path. 생성 파일의 [lon, lat, ...] 평탄 배열을 그대로 투영한다.
const LAND = KOREA_PROVINCES.filter((p) => !p.name.startsWith("제주")).map((prov) =>
  prov.rings
    .map((ring) => {
      let d = "";
      for (let i = 0; i < ring.length; i += 2) {
        const [x, y] = project(ring[i + 1], ring[i]);
        d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return d + "Z";
    })
    .join(" "),
);

export default function FlowMap({
  flows,
  active,
  onPick,
}: {
  flows: Flow[];
  active?: { from: string; to: string } | null;
  onPick: (from: string, to: string) => void;
}) {
  const { pairs, hubs } = useMemo(() => {
    const drawn = flows.filter((f) => STATION_GEO[f.from] && STATION_GEO[f.to] && f.ton > 0);
    const merged = new Map<string, { a: string; b: string; fwd: number; rev: number }>();
    for (const f of drawn) {
      const [a, b] = [f.from, f.to].sort();
      const m = merged.get(`${a}|${b}`) ?? { a, b, fwd: 0, rev: 0 };
      if (f.from === a) m.fwd += f.ton;
      else m.rev += f.ton;
      merged.set(`${a}|${b}`, m);
    }
    const pairs: Pair[] = [...merged.values()].map((m) => {
      const total = m.fwd + m.rev;
      return { a: m.a, b: m.b, total, revShare: total ? (Math.min(m.fwd, m.rev) / total) * 100 : 0 };
    });
    const byStation = new Map<string, number>();
    for (const p of pairs) {
      byStation.set(p.a, (byStation.get(p.a) ?? 0) + p.total);
      byStation.set(p.b, (byStation.get(p.b) ?? 0) + p.total);
    }
    const hubs = new Set([...byStation.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([s]) => s));
    return { pairs, hubs };
  }, [flows]);

  const max = Math.max(...pairs.map((p) => p.total), 1);
  const isActive = (p: Pair) =>
    !!active && ((p.a === active.from && p.b === active.to) || (p.a === active.to && p.b === active.from));
  const hasActive = !!active && pairs.some(isActive);
  const stations = [...new Set(pairs.flatMap((p) => [p.a, p.b]))];

  // 확대·이동 — 지도와 선만 변형되고 범례·버튼은 화면에 고정된다.
  const [tf, setTf] = useState({ k: 1, x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number } | null>(null);

  function toViewBox(e: { clientX: number; clientY: number }) {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: VIEW_W / 2, y: VIEW_H / 2 };
    // viewBox 는 종횡비를 유지하며 가운데 맞춤되므로 실제 그려진 영역을 되짚는다
    const scale = Math.min(r.width / VIEW_W, r.height / VIEW_H);
    return {
      x: (e.clientX - r.left - (r.width - VIEW_W * scale) / 2) / scale,
      y: (e.clientY - r.top - (r.height - VIEW_H * scale) / 2) / scale,
    };
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const p = toViewBox(e);
    setTf((t) => {
      const k = Math.min(6, Math.max(1, t.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      // 커서 아래 지점이 제자리에 머물도록 이동량을 보정한다
      return { k, x: p.x - ((p.x - t.x) / t.k) * k, y: p.y - ((p.y - t.y) / t.k) * k };
    });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    drag.current = { px: e.clientX, py: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const r = svgRef.current?.getBoundingClientRect();
    const scale = r ? Math.min(r.width / VIEW_W, r.height / VIEW_H) : 1;
    const dx = (e.clientX - drag.current.px) / scale;
    const dy = (e.clientY - drag.current.py) / scale;
    drag.current = { px: e.clientX, py: e.clientY };
    setTf((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }
  function endDrag() {
    drag.current = null;
  }

  const placed: [number, number][] = [];
  const canLabel = (x: number, y: number) => {
    if (placed.some(([px, py]) => Math.abs(px - x) < 36 && Math.abs(py - y) < 12)) return false;
    placed.push([x, y]);
    return true;
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 범례는 화면에 고정 — 지도를 확대·이동해도 따라 움직이지 않는다 */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-lg bg-white/85 px-2.5 py-2 backdrop-blur-sm">
        <p className="text-[10px] font-semibold text-[#3f72af]">선 색 = 돌아오는 화물이 있는가</p>
        <ul className="mt-1 space-y-0.5">
          {LEGEND.map(([c, label]) => (
            <li key={label} className="flex items-center gap-1.5 text-[10px] text-[#112d4e]/60">
              <span className="h-[3px] w-3.5 rounded-full" style={{ background: c }} />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <div className="pointer-events-none absolute right-2 top-2 z-10 flex flex-col items-end gap-1">
        <button
          onClick={() => setTf({ k: 1, x: 0, y: 0 })}
          className="pointer-events-auto rounded-md border border-[#dbe2ef] bg-white/90 px-2 py-1 text-[10px] font-medium text-[#112d4e]/70 hover:border-[#3f72af]"
        >
          처음 크기
        </button>
        <span className="rounded bg-white/70 px-1.5 text-[9px] text-[#112d4e]/40">휠 확대 · 끌어서 이동</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className={`h-full w-full ${drag.current ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label="전국 화물 흐름 개략도"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <g transform={`translate(${tf.x} ${tf.y}) scale(${tf.k})`}>
      <g>
        {LAND.map((d, i) => (
          <path key={i} d={d} fill="#e9eef7" stroke="#c6d3e6" strokeWidth={0.5} strokeLinejoin="round" />
        ))}
      </g>

      {pairs.map((p, i) => {
        const [x1, y1] = project(...STATION_GEO[p.a]);
        const [x2, y2] = project(...STATION_GEO[p.b]);
        const on = isActive(p);
        const w = 0.6 + Math.sqrt(p.total / max) * 5.5;
        return (
          <path
            key={i}
            d={arc(x1, y1, x2, y2)}
            fill="none"
            stroke={hasActive && !on ? "#cbd7e8" : flowColor(p.revShare)}
            strokeWidth={on ? w + 2.5 : w}
            strokeLinecap="round"
            strokeOpacity={on ? 1 : hasActive ? 0.35 : 0.55}
            className={hasActive ? "" : "cursor-pointer"}
            onClick={() => onPick(p.a, p.b)}
          >
            <title>{`${p.a} ↔ ${p.b} · ${Math.round(p.total).toLocaleString()}톤 · 역방향 ${p.revShare.toFixed(1)}%`}</title>
          </path>
        );
      })}

      {hasActive &&
        pairs.filter(isActive).map((p, i) => {
          const [x1, y1] = project(...STATION_GEO[p.a]);
          const [x2, y2] = project(...STATION_GEO[p.b]);
          return (
            <path
              key={`d${i}`}
              d={arc(x1, y1, x2, y2)}
              fill="none"
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
            <circle cx={x} cy={y} r={on ? 4.5 : 2.2} fill={on ? "#112d4e" : "#8ea5c4"} />
            {(on || (hubs.has(s) && canLabel(x, y))) && (
              <text
                x={x + (on ? 7.5 : 5.5)}
                y={y + 3.2}
                fill={on ? "#112d4e" : "#6d86a8"}
                className={on ? "text-[11px] font-bold" : "text-[9.5px]"}
              >
                {s}
              </text>
            )}
          </g>
        );
      })}

        </g>
      </svg>
    </div>
  );
}
