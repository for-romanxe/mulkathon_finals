import { reconstructTrainSequences, type Train } from "./dwell";

export type XFactorSummary = {
  totalSpanMin: number;
  totalDwellMin: number;
  pureRunningMin: number;
  xFactor: number;
};

const SECONDS_PER_DAY = 86_400;

function elapsedSeconds(start: number, end: number): number {
  return (end - start + SECONDS_PER_DAY) % SECONDS_PER_DAY;
}

/** Calculate total elapsed time divided by running time excluding dwell. */
export function calculateXFactor(trains: readonly Train[]): XFactorSummary {
  const orderedTrains = reconstructTrainSequences(trains);
  let totalSpanSeconds = 0;
  let totalDwellSeconds = 0;

  for (const train of orderedTrains) {
    if (train.stops.length < 2) continue;

    const first = train.stops[0];
    const last = train.stops[train.stops.length - 1];
    totalSpanSeconds += elapsedSeconds(first.dep, last.arr);

    for (const stop of train.stops) {
      totalDwellSeconds += elapsedSeconds(stop.arr, stop.dep);
    }
  }

  const pureRunningSeconds = totalSpanSeconds - totalDwellSeconds;
  if (pureRunningSeconds <= 0) {
    throw new RangeError("Pure running time must be greater than zero");
  }

  return {
    totalSpanMin: totalSpanSeconds / 60,
    totalDwellMin: totalDwellSeconds / 60,
    pureRunningMin: pureRunningSeconds / 60,
    xFactor: totalSpanSeconds / pureRunningSeconds,
  };
}
