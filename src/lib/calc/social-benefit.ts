export type SocialBenefitInput = {
  railTon: number;
  distanceKm: number;
  truckPayloadTon: number;
  accidentCostPerVehicleKm: number;
  congestionCostPerVehicleKm: number;
  unitCostSource: string;
};

export type SocialBenefitSummary = {
  truckTrips: number;
  avoidedTruckVehicleKm: number;
  avoidedAccidentCost: number;
  avoidedCongestionCost: number;
  totalSocialBenefit: number;
  basis: {
    truckPayloadTon: number;
    accidentCostPerVehicleKm: number;
    congestionCostPerVehicleKm: number;
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
  requireNonNegative("railTon", input.railTon);
  requireNonNegative("distanceKm", input.distanceKm);
  requireNonNegative("accidentCostPerVehicleKm", input.accidentCostPerVehicleKm);
  requireNonNegative("congestionCostPerVehicleKm", input.congestionCostPerVehicleKm);

  if (!Number.isFinite(input.truckPayloadTon) || input.truckPayloadTon <= 0) {
    throw new RangeError("truckPayloadTon must be a finite positive number");
  }
  if (!input.unitCostSource.trim()) {
    throw new RangeError("unitCostSource must not be empty");
  }

  const truckTrips = input.railTon / input.truckPayloadTon;
  const avoidedTruckVehicleKm = truckTrips * input.distanceKm;
  const avoidedAccidentCost = avoidedTruckVehicleKm * input.accidentCostPerVehicleKm;
  const avoidedCongestionCost = avoidedTruckVehicleKm * input.congestionCostPerVehicleKm;

  return {
    truckTrips,
    avoidedTruckVehicleKm,
    avoidedAccidentCost,
    avoidedCongestionCost,
    totalSocialBenefit: avoidedAccidentCost + avoidedCongestionCost,
    basis: {
      truckPayloadTon: input.truckPayloadTon,
      accidentCostPerVehicleKm: input.accidentCostPerVehicleKm,
      congestionCostPerVehicleKm: input.congestionCostPerVehicleKm,
      unitCostSource: input.unitCostSource,
      formula: "railTon / truckPayloadTon * distanceKm * unitCostPerVehicleKm",
    },
  };
}
