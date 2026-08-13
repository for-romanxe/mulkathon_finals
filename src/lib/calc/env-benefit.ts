// C1(#35) — 환경 편익: 도로 대신 철도로 옮겼을 때 줄어드는 탄소·대기오염.
//
// `social-benefit.ts`(#83)와 같은 규칙을 따른다 — **원단위를 하드코딩하지 않고 주입받는다.**
// 출처 없는 계수를 코드에 박으면 그 순간 "숫자는 코드가"가 거짓말이 된다.

export type EnvBenefitInput = {
  /** B3가 반환한 톤킬로 */
  tonkm: number;
  /** 철도 탄소 배출 원단위 (g CO2eq / 톤·km) */
  railCo2GPerTonKm: number;
  /** 도로 탄소 배출 원단위 (g CO2eq / 톤·km) */
  roadCo2GPerTonKm: number;
  /** 철도 대기오염 비용 원단위 (원 / 톤·km) */
  railAirCostPerTonKm: number;
  /** 도로 대기오염 비용 원단위 (원 / 톤·km) */
  roadAirCostPerTonKm: number;
  /** 고시 번호·표 번호까지. 출처 없는 값은 값이 아니다. */
  unitCostSource: string;
};

export type EnvBenefitSummary = {
  avoidedCo2Ton: number;
  avoidedAirPollutionCost: number;
  basis: {
    railCo2GPerTonKm: number;
    roadCo2GPerTonKm: number;
    railAirCostPerTonKm: number;
    roadAirCostPerTonKm: number;
    unitCostSource: string;
    formula: string;
  };
};

function requireNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name}는 유한한 0 이상의 수여야 한다`);
  }
}

/** 도로 대비 철도 전환의 환경 편익. 차이가 음수면(철도가 더 나쁨) 그대로 음수로 낸다. */
export function calculateEnvBenefit(input: EnvBenefitInput): EnvBenefitSummary {
  requireNonNegative("tonkm", input.tonkm);
  requireNonNegative("railCo2GPerTonKm", input.railCo2GPerTonKm);
  requireNonNegative("roadCo2GPerTonKm", input.roadCo2GPerTonKm);
  requireNonNegative("railAirCostPerTonKm", input.railAirCostPerTonKm);
  requireNonNegative("roadAirCostPerTonKm", input.roadAirCostPerTonKm);
  if (!input.unitCostSource.trim()) {
    throw new RangeError("unitCostSource는 비어 있으면 안 된다 — 출처 없는 원단위는 쓰지 않는다");
  }

  // g → 톤 (1,000,000g = 1t)
  const avoidedCo2Ton = (input.tonkm * (input.roadCo2GPerTonKm - input.railCo2GPerTonKm)) / 1_000_000;
  const avoidedAirPollutionCost = input.tonkm * (input.roadAirCostPerTonKm - input.railAirCostPerTonKm);

  return {
    avoidedCo2Ton,
    avoidedAirPollutionCost,
    basis: {
      railCo2GPerTonKm: input.railCo2GPerTonKm,
      roadCo2GPerTonKm: input.roadCo2GPerTonKm,
      railAirCostPerTonKm: input.railAirCostPerTonKm,
      roadAirCostPerTonKm: input.roadAirCostPerTonKm,
      unitCostSource: input.unitCostSource,
      formula: "탄소 = 톤킬로 × (도로 − 철도 원단위) ÷ 1,000,000 · 대기오염 = 톤킬로 × (도로 − 철도 비용원단위)",
    },
  };
}
