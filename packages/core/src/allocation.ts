import { ensure } from "./errors";
/** Largest remainder allocation; stable input order resolves equal remainders exactly. */
export function splitExact(total: number, weights: (number | bigint)[]) {
  ensure(
    Number.isSafeInteger(total) && total >= 0,
    "INVALID_ALLOCATION",
    "Use a non-negative integer allocation.",
  );
  const values = weights.map(BigInt),
    sum = values.reduce((n, w) => n + w, 0n);
  ensure(
    values.every((w) => w >= 0n) && (sum > 0n || total === 0),
    "INVALID_ALLOCATION",
    "Allocation weights must cover the total.",
  );
  if (!sum) return weights.map(() => 0);
  const shares = values.map((w, index) => ({
    index,
    amount: Number((BigInt(total) * w) / sum),
    remainder: (BigInt(total) * w) % sum,
  }));
  let left = total - shares.reduce((n, s) => n + s.amount, 0);
  for (const s of [...shares].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (!left) break;
    s.amount++;
    left--;
  }
  return shares.map((s) => s.amount);
}
