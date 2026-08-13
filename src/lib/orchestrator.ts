// D1(#39): B·C 함수를 LLM 도구로 등록. 숫자 계산은 전부 코드가 한다 — LLM은 호출 결정과 서술만.
// C1·C2 내부는 원단위 확정(#35·#37) 전까지 스텁 — 시그니처는 여기 것이 정본.
import fs from "node:fs/promises";
import path from "node:path";
import { lookupOd, type OdRow } from "./calc/od";

// od_stats.json(#56): 방향 있는 (from,to) 쌍으로 이미 집계된 상태
let odCache: OdRow[] | null = null;
async function loadOd(): Promise<OdRow[] | null> {
  if (odCache) return odCache;
  try {
    const p = path.join(process.cwd(), "public", "data", "od_stats.json");
    odCache = JSON.parse(await fs.readFile(p, "utf-8")) as OdRow[];
    return odCache;
  } catch {
    return null; // 데이터 파이프라인 산출물 없음
  }
}

const r1 = (x: number) => Math.round(x * 10) / 10;

// B3(#29) — OD 물량·톤킬로 조회
export async function b3OdLookup(input: { from: string; to: string; item?: string }) {
  const od = await loadOd();
  if (!od) return { found: false, note: "od_stats.json 없음 — 데이터 파이프라인 산출물 확인" };
  const result = lookupOd(od, input);
  if (!result)
    return { found: false, note: `${input.from}→${input.to} 구간은 2025 수송통계에 없음 — 모른다고 답할 것` };
  return { found: true, ...result };
}

// B4(#31) — 편방향 판정: 정방향 vs 역방향 톤 비교
export async function b4Directional(input: { from: string; to: string }) {
  const od = await loadOd();
  if (!od) return { found: false, note: "od_stats.json 없음 — 데이터 파이프라인 산출물 확인" };
  const ton = (a: string, b: string) => od.find((r) => r.from === a && r.to === b)?.ton ?? 0;
  const fwd = ton(input.from, input.to);
  const rev = ton(input.to, input.from);
  if (!fwd && !rev) return { found: false, note: "양방향 모두 수송통계에 없음" };
  return {
    found: true,
    forward_ton: r1(fwd),
    reverse_ton: r1(rev),
    reverse_share_pct: r1((rev / (fwd + rev)) * 100),
    one_way: rev === 0,
  };
}

// C1(#35)·C2(#37) — 원단위 확정 전 스텁. 수치를 지어내지 않는다.
export function c1EnvBenefit(input: { tonkm: number }) {
  return { stub: true, need: "탄소·대기오염 원단위(원/톤킬로) — 국토부 투자평가지침에서 확정(#35)", tonkm: input.tonkm };
}
export function c2SocialBenefit(input: { tonkm: number }) {
  return { stub: true, need: "교통사고·도로혼잡 원단위(원/톤킬로) — 확정 전(#37)", tonkm: input.tonkm };
}

export const TOOLS = [
  {
    name: "b3_od_lookup",
    description: "구간(출발역→도착역)의 2025 수송통계 물량을 조회한다: 톤, 톤킬로, 평균거리(km). 편익 계산 전 반드시 먼저 호출.",
    input_schema: {
      type: "object" as const,
      properties: {
        item: { type: "string", description: "Optional cargo item name" },
        from: { type: "string", description: "출발역명 (예: 구미)" },
        to: { type: "string", description: "도착역명 (예: 부산진)" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "c1_env_benefit",
    description: "도로 대비 철도 전환의 환경 편익(탄소·대기오염)을 톤킬로 기준으로 계산한다.",
    input_schema: {
      type: "object" as const,
      properties: { tonkm: { type: "number", description: "B3가 반환한 톤킬로" } },
      required: ["tonkm"],
    },
  },
  {
    name: "c2_social_benefit",
    description: "도로 대비 철도 전환의 사회 편익(교통사고·도로혼잡)을 톤킬로 기준으로 계산한다.",
    input_schema: {
      type: "object" as const,
      properties: { tonkm: { type: "number", description: "B3가 반환한 톤킬로" } },
      required: ["tonkm"],
    },
  },
  {
    name: "b4_directional",
    description: "구간의 편방향 여부를 판정한다(정방향·역방향 톤, 역방향 비중). 복화 가능성 언급 전 반드시 호출.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: { type: "string", description: "출발역명" },
        to: { type: "string", description: "도착역명" },
      },
      required: ["from", "to"],
    },
  },
];

// C1·C2는 B3가 실제로 반환한 톤킬로만 받는다. 이 검사가 없으면 LLM이 지어낸 톤킬로로
// 편익이 계산되고, 그건 "숫자 계산을 LLM에 시키지 않는다"(#39)가 깨진 것이다.
// 반환값이 null이 아니면 도구를 실행하지 않고 이 값을 그대로 도구 결과로 돌려준다.
// 완료 조건(#39)이 요구하는 호출 순서는 B3 → C1 → C2 → B4 다. 도구 설명만으로는
// 안 지켜졌다 — 라이브 검증에서 모델이 B3→B4→C1→C2 로 불렀다. trace 상태로 강제한다.
// 막힌 호출은 실행하지 않고 note만 돌려주며, route.ts가 trace에 남기지 않는다.
export function gateTool(
  name: string,
  input: Record<string, unknown>,
  trace: { tool: string; output: unknown }[],
): { blocked: true; note: string } | null {
  const ran = (tool: string) => trace.some((t) => t.tool === tool);
  // B3가 실제로 돌려준 톤킬로. 편익은 이 값으로만 계산한다 — 모델이 지어낸 수치 차단.
  const fromB3 = trace
    .filter((t) => t.tool === "b3_od_lookup")
    .map((t) => (t.output as { tonkm?: number }).tonkm)
    .filter((v): v is number => typeof v === "number");

  if (name === "c1_env_benefit" || name === "c2_social_benefit") {
    if (!fromB3.length)
      return { blocked: true, note: "b3_od_lookup을 먼저 호출할 것 — 편익은 B3가 반환한 톤킬로로만 계산한다" };
    if (typeof input.tonkm !== "number" || !fromB3.includes(input.tonkm))
      return { blocked: true, note: `tonkm이 B3 반환값과 다르다 (B3가 준 값: ${fromB3.join(", ")}) — 그 값을 그대로 넣을 것` };
    if (name === "c2_social_benefit" && !ran("c1_env_benefit"))
      return { blocked: true, note: "c1_env_benefit을 먼저 호출할 것 — 편익은 환경(C1) 다음 사회(C2) 순으로 서술한다" };
  }

  // B4는 마지막이다. 다만 B3가 톤킬로를 못 준 구간이면 C1·C2가 성립하지 않으므로
  // 무한 대기 대신 바로 통과시킨다 (데이터에 없는 구간을 "모른다"고 답하는 경로).
  if (name === "b4_directional" && fromB3.length && !(ran("c1_env_benefit") && ran("c2_social_benefit")))
    return { blocked: true, note: "c1_env_benefit·c2_social_benefit을 먼저 호출할 것 — 복화 판정은 편익 서술 뒤에 온다" };

  return null;
}

export async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "b3_od_lookup":
      return b3OdLookup(input as { from: string; to: string; item?: string });
    case "b4_directional":
      return b4Directional(input as { from: string; to: string });
    case "c1_env_benefit":
      return c1EnvBenefit(input as { tonkm: number });
    case "c2_social_benefit":
      return c2SocialBenefit(input as { tonkm: number });
    default:
      return { error: `알 수 없는 도구: ${name}` };
  }
}
