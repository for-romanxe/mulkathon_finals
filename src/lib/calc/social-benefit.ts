export type SocialBenefitInput = {
  tonkm: number;
  roadCostPerTonKm: number;
  railCostPerTonKm: number;
  unitCostSource: string;
};

export type SocialBenefitSummary = {
  roadSocialCost: number;
  railSocialCost: number;
  totalSocialBenefit: number;
  basis: {
    roadCostPerTonKm: number;
    railCostPerTonKm: number;
    unitCostSource: string;
    formula: string;
  };
};

function requireNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
}

/** Convert shifted rail volume to avoided truck traffic and social costs. */
export function calculateSocialBenefit(input: SocialBenefitInput): SocialBenefitSummary {
  requireNonNegative("tonkm", input.tonkm);
  requireNonNegative("roadCostPerTonKm", input.roadCostPerTonKm);
  requireNonNegative("railCostPerTonKm", input.railCostPerTonKm);
  if (!input.unitCostSource.trim()) {
    throw new RangeError("unitCostSource must not be empty");
  }

  const roadSocialCost = input.tonkm * input.roadCostPerTonKm;
  const railSocialCost = input.tonkm * input.railCostPerTonKm;

  return {
    roadSocialCost,
    railSocialCost,
    totalSocialBenefit: roadSocialCost - railSocialCost,
    basis: {
      roadCostPerTonKm: input.roadCostPerTonKm,
      railCostPerTonKm: input.railCostPerTonKm,
      unitCostSource: input.unitCostSource,
      formula: "운송량 × 거리에 도로·철도 각각의 국토교통부 공식 기준값을 곱해 그 차액을 냅니다",
    },
  };
}
