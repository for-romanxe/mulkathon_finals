export type OdRow = {
  from: string;
  to: string;
  ton: number;
  tkm: number;
  km: number | null;
  container_ton: number;
  items: Record<string, number>;
};

export type OdLookup = {
  ton: number;
  tonkm: number;
  km: number | null;
  container_ton: number;
  item?: string;
};

const r1 = (value: number) => Math.round(value * 10) / 10;

/** Look up an OD total, optionally restricted to one cargo item. */
export function lookupOd(
  rows: readonly OdRow[],
  input: { from: string; to: string; item?: string },
): OdLookup | null {
  const row = rows.find((candidate) => candidate.from === input.from && candidate.to === input.to);
  if (!row) return null;

  const ton = input.item ? row.items[input.item] ?? 0 : row.ton;
  if (!ton) return null;

  return {
    ton: r1(ton),
    tonkm: r1(input.item && row.km !== null ? ton * row.km : row.tkm),
    km: row.km,
    container_ton: r1(input.item === undefined ? row.container_ton : 0),
    ...(input.item ? { item: input.item } : {}),
  };
}
