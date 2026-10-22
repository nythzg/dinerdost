export type NamedTax = { name: string; rateBps: number };

/** Largest remainders keep named components nonnegative and exactly equal to the quoted tax. */
export function taxBreakdown(amount: number, components: NamedTax[] | null | undefined) {
  if (!components?.length) return [];
  const rate = components.reduce((total, tax) => total + tax.rateBps, 0);
  if (!rate) return components.map(tax => ({ ...tax, amount: 0 }));
  const rows = components.map((tax, index) => ({ ...tax, index, amount: Math.floor(amount * tax.rateBps / rate), remainder: (amount * tax.rateBps) % rate }));
  const remaining = amount - rows.reduce((total, tax) => total + tax.amount, 0);
  const ranked = [...rows].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < remaining; i++) ranked[i].amount++;
  return rows.map(({ name, rateBps, amount }) => ({ name, rateBps, amount }));
}
