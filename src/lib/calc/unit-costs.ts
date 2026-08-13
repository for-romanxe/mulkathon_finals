// C2-1(#86): 사회 편익 원단위. `social-benefit.ts` 가 하드코딩을 거부하고 주입받도록
// 만들어졌으므로(#83), 주입할 값을 한곳에 모아둔다.
//
// 🔴 지침 원문에서 직접 확인한 값만 넣는다. 추정치를 넣으면 이 프로젝트가 무너진다 —
//    "숫자는 코드가, 모르는 건 모른다고"가 전부이기 때문이다.
//    값이 없는 동안 앱은 금액을 말하지 않고 무엇이 없는지 말한다.

export type SocialUnitCosts = {
  /** 화물차 1대 평균 적재량 (톤/대) */
  truckPayloadTon: number | null;
  /** 도로 교통사고비용 원단위 (원/대·km) */
  accidentCostPerVehicleKm: number | null;
  /** 도로 혼잡비용 원단위 (원/대·km) */
  congestionCostPerVehicleKm: number | null;
  /** 고시 번호·표 번호까지 적는다. 출처 없는 값은 값이 아니다. */
  source: string | null;
};

export const SOCIAL_UNIT_COSTS: SocialUnitCosts = {
  truckPayloadTon: null,
  accidentCostPerVehicleKm: null,
  congestionCostPerVehicleKm: null,
  source: null,
};

/** 아직 채워지지 않은 항목 이름. 비어 있으면 계산 가능하다. */
export function missingUnitCosts(u: SocialUnitCosts = SOCIAL_UNIT_COSTS): string[] {
  const missing: string[] = [];
  if (u.truckPayloadTon === null) missing.push("화물차 평균 적재량(톤/대)");
  if (u.accidentCostPerVehicleKm === null) missing.push("교통사고비용 원단위(원/대·km)");
  if (u.congestionCostPerVehicleKm === null) missing.push("도로혼잡비용 원단위(원/대·km)");
  if (!u.source) missing.push("원단위 출처(고시 번호·표 번호)");
  return missing;
}

// C1(#35) — 환경 편익 원단위. 같은 규칙: 지침 원문에서 확인한 값만 넣는다.
//
// ⚠️ IDEA.md 표현 금지 목록: 탄소 수치는 "1/26" 또는 "국토부 4%" 중 **하나만** 쓴다.
//    여기 들어가는 건 그 서술용 수치가 아니라 계산용 원단위(g/톤·km)다 — 섞지 말 것.

export type EnvUnitCosts = {
  /**
   * 철도 탄소 배출량이 도로의 몇 분의 1인가. **비율만 알아도 감축률은 답할 수 있다.**
   * 절대 원단위가 없으면 배출 톤수는 못 내지만, "도로 대비 몇 % 줄어드는가"는 낼 수 있다 —
   * 그게 지어내지 않고 답하는 최대치다.
   */
  railToRoadCo2Ratio: number | null;
  /** 철도 탄소 배출 원단위 (g CO2eq / 톤·km). 있으면 절대 배출 톤수까지 낸다. */
  railCo2GPerTonKm: number | null;
  /** 도로 탄소 배출 원단위 (g CO2eq / 톤·km) */
  roadCo2GPerTonKm: number | null;
  /** 철도 대기오염 비용 원단위 (원 / 톤·km) */
  railAirCostPerTonKm: number | null;
  /** 도로 대기오염 비용 원단위 (원 / 톤·km) */
  roadAirCostPerTonKm: number | null;
  source: string | null;
};

export const ENV_UNIT_COSTS: EnvUnitCosts = {
  // 주최측(코레일) 멘토링 자료 수치. 팀 확정 인용 1순위이고, HANDOFF 공식 수치 목록에 있다.
  // ⚠️ 표현 금지 목록: 탄소 수치는 "1/26"과 "국토부 4%" 중 하나만 쓴다 — 여기서는 1/26을 쓴다.
  railToRoadCo2Ratio: 1 / 26,
  // 절대 원단위는 슬라이드에 없다. 있으면 채워 넣으면 배출 톤수까지 나온다(#92).
  railCo2GPerTonKm: null,
  roadCo2GPerTonKm: null,
  railAirCostPerTonKm: null,
  roadAirCostPerTonKm: null,
  source: "코레일 멘토링 자료 — 화물수송 온실가스 배출 철도:도로 = 1:26",
};

/** 아직 채워지지 않은 환경 원단위 항목. 비어 있으면 계산 가능하다. */
export function missingEnvUnitCosts(u: EnvUnitCosts = ENV_UNIT_COSTS): string[] {
  const missing: string[] = [];
  if (u.railCo2GPerTonKm === null) missing.push("철도 탄소 절대 원단위(g/톤·km)");
  if (u.roadCo2GPerTonKm === null) missing.push("도로 탄소 절대 원단위(g/톤·km)");
  if (u.railAirCostPerTonKm === null) missing.push("철도 대기오염 비용 원단위(원/톤·km)");
  if (u.roadAirCostPerTonKm === null) missing.push("도로 대기오염 비용 원단위(원/톤·km)");
  if (!u.source) missing.push("원단위 출처(고시 번호·표 번호)");
  return missing;
}

/** 절대 원단위 없이 비율만 아는 경우의 탄소 감축률(%). 비율이 없으면 null. */
export function co2ReductionPct(u: EnvUnitCosts = ENV_UNIT_COSTS): number | null {
  if (u.railToRoadCo2Ratio === null) return null;
  return Math.round((1 - u.railToRoadCo2Ratio) * 1000) / 10;
}
