import type { OdRow } from "./od";

export type DirectionalResult = {
  from: string;
  to: string;
  one_way: boolean;
  reverse_ton: number | null;
};

export type DirectionalSummary = {
  total_pairs: number;
  one_way_pairs: number;
  one_way_pct: number;
};

const key = (from: string, to: string) => `${from}\u0000${to}`;
const r1 = (value: number) => Math.round(value * 10) / 10;

/** Classify an OD record by whether the reverse-direction record exists. */
export function classifyDirectional(
  rows: readonly OdRow[],
  input: { from: string; to: string },
): DirectionalResult | null {
  const routes = new Map(rows.map((row) => [key(row.from, row.to), row]));
  if (!routes.has(key(input.from, input.to))) return null;

  const reverse = routes.get(key(input.to, input.from));
  return {
    from: input.from,
    to: input.to,
    one_way: reverse === undefined,
    reverse_ton: reverse?.ton ?? null,
  };
}

/** Summarize directed OD records using the same definition as classification. */
export function summarizeDirectional(rows: readonly OdRow[]): DirectionalSummary {
  const routes = new Set(rows.map((row) => key(row.from, row.to)));
  const oneWay = rows.filter((row) => !routes.has(key(row.to, row.from))).length;

  return {
    total_pairs: rows.length,
    one_way_pairs: oneWay,
    one_way_pct: rows.length ? r1((oneWay / rows.length) * 100) : 0,
  };
}
