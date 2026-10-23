import { ensure } from "./errors";

export function wholeUnit(unit: string) {
  return unit === "portion" || unit === "piece" || unit === "peg";
}

export function integer(
  value: unknown,
  field: string,
  min = 0,
  max = 1_000_000_000,
): number {
  ensure(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max,
    "INVALID_NUMBER",
    `${field} must be a whole number between ${min} and ${max}.`,
  );
  return value;
}
export function quantityMilli(value: unknown): number {
  ensure(
    typeof value === "string" || typeof value === "number",
    "INVALID_QUANTITY",
    "Enter a valid quantity.",
  );
  const text = String(value);
  ensure(
    /^\d+(\.\d{1,3})?$/.test(text),
    "INVALID_QUANTITY",
    "Quantities support up to three decimal places.",
  );
  return integer(Math.round(Number(text) * 1000), "Quantity", 1, 10_000_000);
}
export function amountPaise(value: unknown): number {
  ensure(
    typeof value === "string" || typeof value === "number",
    "INVALID_AMOUNT",
    "Enter a valid amount.",
  );
  const text = String(value);
  ensure(
    /^\d+(\.\d{1,2})?$/.test(text),
    "INVALID_AMOUNT",
    "Amounts support two decimal places.",
  );
  return integer(Math.round(Number(text) * 100), "Amount");
}
export function roundRatio(numerator: number, denominator: number): number {
  ensure(
    Number.isSafeInteger(numerator) && denominator > 0,
    "AMOUNT_OVERFLOW",
    "Amount is too large.",
  );
  return Math.floor((numerator + denominator / 2) / denominator);
}
export function quote(
  items: { unit_price: number; quantity_milli: number; tax_bps: number }[],
  discount = 0,
) {
  const subtotal = items.reduce(
    (sum, item) =>
      sum + roundRatio(item.unit_price * item.quantity_milli, 1000),
    0,
  );
  integer(discount, "Discount", 0, subtotal);
  const shares = items.map((item) =>
    roundRatio(item.unit_price * item.quantity_milli, 1000),
  );
  integer(subtotal, "Order subtotal");
  // Largest-remainder allocation keeps every line nonnegative and preserves the exact discount.
  const allocations = shares.map((value) =>
    subtotal
      ? Number((BigInt(discount) * BigInt(value)) / BigInt(subtotal))
      : 0,
  );
  const priority = shares
    .map((value, index) => ({
      index,
      remainder: subtotal
        ? (BigInt(discount) * BigInt(value)) % BigInt(subtotal)
        : 0n,
    }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  let remaining = discount - allocations.reduce((sum, value) => sum + value, 0);
  for (const line of priority) {
    if (!remaining) break;
    if (allocations[line.index] < shares[line.index]) {
      allocations[line.index]++;
      remaining--;
    }
  }
  ensure(
    remaining === 0,
    "INVALID_DISCOUNT",
    "The discount cannot be allocated.",
  );
  const tax = items.reduce(
    (sum, item, index) =>
      sum +
      roundRatio((shares[index] - allocations[index]) * item.tax_bps, 10000),
    0,
  );
  return { subtotal, discount, tax, payable: subtotal - discount + tax };
}
export function currency(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format((paise + 0) / 100);
}

export function roundAdjustment(
  payable: number,
  enabled: boolean,
  mode: "NEAREST" | "DOWN" | "UP" = "NEAREST",
) {
  integer(payable, "Payable amount");
  return enabled
    ? (mode === "DOWN"
        ? Math.floor(payable / 100)
        : mode === "UP" ? Math.ceil(payable / 100) : Math.round(payable / 100)) *
        100 -
        payable
    : 0;
}
