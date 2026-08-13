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
  tonkm?: number;
  km: number | null;
  container_ton?: number;
  item?: string;
  available_items?: string[];
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
  if (!ton) {
    if (!input.item) return null;
    return {
      ton: 0,
      km: row.km,
      item: input.item,
      available_items: Object.keys(row.items),
    };
  }

  return {
    ton: r1(ton),
    tonkm: r1(input.item && row.km !== null ? ton * row.km : row.tkm),
    km: row.km,
    ...(input.item === undefined ? { container_ton: r1(row.container_ton) } : {}),
    ...(input.item ? { item: input.item } : {}),
  };
}
