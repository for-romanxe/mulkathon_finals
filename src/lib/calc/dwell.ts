export type TrainStop = {
  seq: number;
  station: string;
  arr: number;
  dep: number;
  reason: string;
};

export type Train = {
  no: string;
  stops: readonly TrainStop[];
};

export type DwellSummary = {
  trains: Train[];
  dwellMinByReason: Record<string, number>;
  totalDwellMin: number;
};

const SECONDS_PER_DAY = 86_400;

function dwellSeconds(stop: TrainStop): number {
  return (stop.dep - stop.arr + SECONDS_PER_DAY) % SECONDS_PER_DAY;
}

/** Rebuild each stop sequence without mutating the normalized input. */
export function reconstructTrainSequences(trains: readonly Train[]): Train[] {
  return trains
    .map((train) => ({
      ...train,
      stops: [...train.stops].sort((a, b) => a.seq - b.seq),
    }))
    .sort((a, b) => a.no.localeCompare(b.no, undefined, { numeric: true }));
}

/** Aggregate in seconds so half-minute stops are preserved until conversion. */
export function summarizeDwell(trains: readonly Train[]): DwellSummary {
  const orderedTrains = reconstructTrainSequences(trains);
  const secondsByReason: Record<string, number> = {};

  for (const train of orderedTrains) {
    for (const stop of train.stops) {
      secondsByReason[stop.reason] =
        (secondsByReason[stop.reason] ?? 0) + dwellSeconds(stop);
    }
  }

  const dwellMinByReason = Object.fromEntries(
    Object.entries(secondsByReason).map(([reason, seconds]) => [reason, seconds / 60]),
  );

  return {
    trains: orderedTrains,
    dwellMinByReason,
    totalDwellMin: Object.values(secondsByReason).reduce((sum, seconds) => sum + seconds, 0) / 60,
  };
}
