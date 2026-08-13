// D1(#39): B·C 함수를 LLM 도구로 등록. 숫자 계산은 전부 코드가 한다 — LLM은 호출 결정과 서술만.
// C1·C2 내부는 원단위 확정(#35·#37) 전까지 스텁 — 시그니처는 여기 것이 정본.
import fs from "node:fs/promises";
import path from "node:path";
import { lookupOd, type OdRow } from "./calc/od";
import { summarizeDwell, type Train } from "./calc/dwell";
import { calculateXFactor } from "./calc/x-factor";
import { calculateSocialBenefit } from "./calc/social-benefit";
import { SOCIAL_UNIT_COSTS, missingUnitCosts } from "./calc/unit-costs";

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

// trains.json(#56): 열차 330편의 정차 시퀀스. B1·B2 계산 함수의 입력이다.
let trainCache: Train[] | null = null;
async function loadTrains(): Promise<Train[] | null> {
  if (trainCache) return trainCache;
  try {
    const p = path.join(process.cwd(), "public", "data", "trains.json");
    trainCache = JSON.parse(await fs.readFile(p, "utf-8")) as Train[];
    return trainCache;
  } catch {
    return null;
  }
}

const r1 = (x: number) => Math.round(x * 10) / 10;

// B1(#26) — 정차사유별 체류시간. "왜 이렇게 느린가"에 답하는 자리다.
export async function b1DwellBreakdown() {
  const trains = await loadTrains();
  if (!trains) return { found: false, note: "trains.json 없음 — 데이터 파이프라인 산출물 확인" };
  const s = summarizeDwell(trains);
  const byReason = Object.entries(s.dwellMinByReason)
    .filter(([, min]) => min > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, min]) => ({ reason, min: r1(min) }));
  return { found: true, trains: trains.length, total_dwell_min: r1(s.totalDwellMin), by_reason: byReason };
}

// B2(#28) — X-factor. 총 소요 ÷ 순수 주행.
export async function b2XFactor() {
  const trains = await loadTrains();
  if (!trains) return { found: false, note: "trains.json 없음 — 데이터 파이프라인 산출물 확인" };
  const x = calculateXFactor(trains);
  return {
    found: true,
    x_factor: Math.round(x.xFactor * 1000) / 1000,
    total_span_min: r1(x.totalSpanMin),
    total_dwell_min: r1(x.totalDwellMin),
    pure_running_min: r1(x.pureRunningMin),
    dwell_share_pct: r1((x.totalDwellMin / x.totalSpanMin) * 100),
  };
}

// B3(#29) — OD 물량·톤킬로 조회
export async function b3OdLookup(input: { from: string; to: string; item?: string }) {
  const od = await loadOd();
  if (!od) return { found: false, note: "od_stats.json 없음 — 데이터 파이프라인 산출물 확인" };
  const result = lookupOd(od, input);
  if (!result)
    return { found: false, note: `${input.from}→${input.to} 구간은 2025 수송통계에 없음 — 모른다고 답할 것` };
  if (input.item && !result.ton)
    return {
      found: false,
      ...result,
      note: `${input.from}→${input.to} 구간에 ${input.item} 품목은 없음`,
    };
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

// C1(#35) — 원단위 확정 전 스텁. 수치를 지어내지 않는다.
export function c1EnvBenefit(input: { tonkm: number }) {
  return { stub: true, need: "탄소·대기오염 원단위(원/톤킬로) — 국토부 투자평가지침에서 확정(#35)", tonkm: input.tonkm };
}

// C2(#37) — 승빈이 만든 calc/social-benefit.ts 를 실제로 연결한다.
// 원단위(#86)가 없으면 금액은 못 내지만, **무엇이 없어서 못 내는지는 말할 수 있다.**
// 스텁이 "확정 전"만 반복하던 것과 달리, 계산식과 남은 항목을 그대로 돌려준다.
export function c2SocialBenefit(input: { tonkm: number; ton: number; km: number }) {
  const missing = missingUnitCosts();
  if (missing.length)
    return {
      stub: true,
      need: `사회 편익 금액은 원단위가 확정돼야 산출된다 (#86). 남은 값: ${missing.join(" · ")}`,
      formula: "트럭대수 = 물량톤 ÷ 적재량 · 차량km = 트럭대수 × 거리 · 편익 = 차량km × 원단위",
      ton: input.ton,
      km: input.km,
      tonkm: input.tonkm,
    };

  // 원단위가 채워진 뒤에는 calculateSocialBenefit이 음수·NaN에 RangeError를 던진다.
  // route.ts에 도구 실행 try/catch가 없어 그대로 500 HTML이 나가고, 화면에는
  // "서버 응답이 JSON이 아님"만 뜬다 — 도구 결과로 돌려주는 게 맞다(#87).
  const u = SOCIAL_UNIT_COSTS;
  let s: ReturnType<typeof calculateSocialBenefit>;
  try {
    s = calculateSocialBenefit({
      railTon: input.ton,
      distanceKm: input.km,
      truckPayloadTon: u.truckPayloadTon as number,
      accidentCostPerVehicleKm: u.accidentCostPerVehicleKm as number,
      congestionCostPerVehicleKm: u.congestionCostPerVehicleKm as number,
      unitCostSource: u.source as string,
    });
  } catch (err) {
    return {
      stub: true,
      need: `사회 편익을 계산할 수 없다: ${err instanceof Error ? err.message : String(err)}`,
      ton: input.ton,
      km: input.km,
      tonkm: input.tonkm,
    };
  }
  return {
    stub: false,
    truck_trips: Math.round(s.truckTrips),
    avoided_truck_vehicle_km: r1(s.avoidedTruckVehicleKm),
    avoided_accident_cost_won: Math.round(s.avoidedAccidentCost),
    avoided_congestion_cost_won: Math.round(s.avoidedCongestionCost),
    total_social_benefit_won: Math.round(s.totalSocialBenefit),
    basis: s.basis,
  };
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
        item: {
          type: "string",
          description: "품목 대분류. 다음 9종 중 하나만: 컨테이너·시멘트·철강·사업용·일반기타·광석·석탄·유류·건설. 생략하면 전체 합계",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "c1_env_benefit",
    description:
      "도로 대비 철도 전환의 환경 편익(탄소·대기오염)을 톤킬로 기준으로 계산한다. " +
      "사용자가 편익·환경 효과·탄소를 물었을 때만 호출한다. 물량·방향·복화만 묻는 질문에는 호출하지 않는다.",
    input_schema: {
      type: "object" as const,
      properties: { tonkm: { type: "number", description: "B3가 반환한 톤킬로" } },
      required: ["tonkm"],
    },
  },
  {
    name: "c2_social_benefit",
    description:
      "도로 대비 철도 전환의 사회 편익(교통사고·도로혼잡)을 계산한다. 물량을 트럭 대수와 차량km로 환산한 뒤 원단위를 적용한다. " +
      "사용자가 편익·사회적 효과·사고·혼잡을 물었을 때만 호출한다. 물량·방향·복화만 묻는 질문에는 호출하지 않는다.",
    input_schema: {
      type: "object" as const,
      properties: {
        tonkm: { type: "number", description: "B3가 반환한 톤킬로" },
        ton: { type: "number", description: "B3가 반환한 물량(톤)" },
        km: { type: "number", description: "B3가 반환한 평균거리(km)" },
      },
      required: ["tonkm", "ton", "km"],
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
  {
    name: "b1_dwell_breakdown",
    description:
      "화물열차가 역에서 머무는 시간을 정차사유별로 집계한다(화물취급·승무원교대·동력차교체·대피·교행 등, 분 단위). " +
      "사용자가 소요시간·지연·왜 느린지·정차를 물었을 때 호출한다. 전 노선 330편 계획 시각표 기준이다.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "b2_x_factor",
    description:
      "X-factor를 산출한다 — 총 소요시간 ÷ 순수 주행시간. 1.3이면 주행만 했을 때보다 30% 더 걸린다는 뜻이다. " +
      "정차가 전체 소요의 몇 %인지도 함께 준다. 소요시간·지연·정시성을 물었을 때 호출한다.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
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
  // B3가 실제로 돌려준 출력들. 편익은 이 값으로만 계산한다 — 모델이 지어낸 수치 차단.
  const b3Outputs = trace
    .filter((t) => t.tool === "b3_od_lookup")
    .map((t) => t.output as { tonkm?: number; ton?: number; km?: number | null });
  const fromB3 = b3Outputs.map((o) => o.tonkm).filter((v): v is number => typeof v === "number");

  if (name === "c1_env_benefit" || name === "c2_social_benefit") {
    if (!fromB3.length)
      return { blocked: true, note: "b3_od_lookup을 먼저 호출할 것 — 편익은 B3가 반환한 톤킬로로만 계산한다" };
    if (typeof input.tonkm !== "number" || !fromB3.includes(input.tonkm))
      return { blocked: true, note: `tonkm이 B3 반환값과 다르다 (B3가 준 값: ${fromB3.join(", ")}) — 그 값을 그대로 넣을 것` };
    if (name === "c2_social_benefit" && !ran("c1_env_benefit"))
      return { blocked: true, note: "c1_env_benefit을 먼저 호출할 것 — 편익은 환경(C1) 다음 사회(C2) 순으로 서술한다" };

    // C2는 tonkm 말고 ton·km으로 트럭 환산을 한다(#87). 세 값이 **같은 B3 출력**에서
    // 나왔는지 본다 — 따로따로 대조하면 서로 다른 구간의 값을 섞어 넣을 수 있고,
    // 원단위(#86)가 채워지는 순간 그 조합이 "코드가 계산한" 금액이 된다(#89).
    if (name === "c2_social_benefit") {
      const match = b3Outputs.find(
        (o) => o.tonkm === input.tonkm && o.ton === input.ton && o.km === input.km,
      );
      if (!match) {
        const shown = b3Outputs
          .map((o) => `{ton: ${o.ton}, km: ${o.km}, tonkm: ${o.tonkm}}`)
          .join(" · ");
        return {
          blocked: true,
          note: `ton·km·tonkm이 한 B3 결과와 일치해야 한다 — 세 값을 같은 조회에서 그대로 가져올 것. B3가 준 것: ${shown}`,
        };
      }
    }
  }

  // B4는 편익 서술 뒤에 온다. 다만 **편익을 실제로 다루는 흐름에서만** 그렇다.
  //
  // 이전에는 B3가 톤킬로를 주기만 하면 B4를 막았는데, 그러면 방향만 묻는 질문에서도
  // 모델이 막힌 B4를 뚫으려고 C1·C2를 부르게 된다 — #78이 도구 설명을 고쳐도 안 없어진
  // 이유가 이것이다. 편익 도구가 하나라도 돌았을 때만 "둘 다 돌았는가"를 따진다.
  const benefitStarted = ran("c1_env_benefit") || ran("c2_social_benefit");
  if (name === "b4_directional" && benefitStarted && !(ran("c1_env_benefit") && ran("c2_social_benefit")))
    return { blocked: true, note: "c1_env_benefit·c2_social_benefit을 둘 다 호출할 것 — 편익은 환경·사회를 함께 서술한다" };

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
      return c2SocialBenefit(input as { tonkm: number; ton: number; km: number });
    case "b1_dwell_breakdown":
      return b1DwellBreakdown();
    case "b2_x_factor":
      return b2XFactor();
    default:
      return { error: `알 수 없는 도구: ${name}` };
  }
}
