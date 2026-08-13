// D1(#39): B·C 함수를 LLM 도구로 등록. 숫자 계산은 전부 코드가 한다 — LLM은 호출 결정과 서술만.
// C1·C2 내부는 원단위 확정(#35·#37) 전까지 스텁 — 시그니처는 여기 것이 정본.
import fs from "node:fs/promises";
import path from "node:path";

type OdRow = { from: string; to: string; item: string; ton: number; tonkm: number };

let odCache: OdRow[] | null = null;
async function loadOd(): Promise<OdRow[] | null> {
  if (odCache) return odCache;
  try {
    const p = path.join(process.cwd(), "public", "data", "od.json");
    odCache = JSON.parse(await fs.readFile(p, "utf-8")) as OdRow[];
    return odCache;
  } catch {
    return null; // A3(#55) 머지 전이거나 파일 없음
  }
}

const r1 = (x: number) => Math.round(x * 10) / 10;

// B3(#29) — OD 물량·톤킬로 조회
export async function b3OdLookup(input: { from: string; to: string; item?: string }) {
  const od = await loadOd();
  if (!od) return { found: false, note: "od.json 없음 — 데이터 파이프라인(A3) 머지 전" };
  const rows = od.filter(
    (r) => r.from === input.from && r.to === input.to && (!input.item || r.item === input.item),
  );
  if (!rows.length)
    return { found: false, note: `${input.from}→${input.to} 구간은 2025 수송통계에 없음 — 모른다고 답할 것` };
  const ton = rows.reduce((s, r) => s + r.ton, 0);
  const tonkm = rows.reduce((s, r) => s + r.tonkm, 0);
  return { found: true, ton: r1(ton), tonkm: r1(tonkm), km: r1(tonkm / ton), records: rows.length };
}

// B4(#31) — 편방향 판정: 정방향 vs 역방향 톤 비교
export async function b4Directional(input: { from: string; to: string }) {
  const od = await loadOd();
  if (!od) return { found: false, note: "od.json 없음 — 데이터 파이프라인(A3) 머지 전" };
  const sum = (a: string, b: string) =>
    od.filter((r) => r.from === a && r.to === b).reduce((s, r) => s + r.ton, 0);
  const fwd = sum(input.from, input.to);
  const rev = sum(input.to, input.from);
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
        from: { type: "string", description: "출발역명 (예: 구미)" },
        to: { type: "string", description: "도착역명 (예: 부산진)" },
        item: { type: "string", description: "품목 대분류 (예: 컨테이너). 생략하면 전체" },
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
