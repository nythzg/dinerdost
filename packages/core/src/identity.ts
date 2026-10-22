import { ensure } from "./errors";
export function normalizePhone(raw: unknown): string {
  ensure(
    typeof raw === "string",
    "INVALID_PHONE",
    "Enter a valid Indian mobile number.",
  );
  let digits = raw.replace(/[\s()-]/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) digits = "+91" + digits;
  else if (/^91[6-9]\d{9}$/.test(digits)) digits = "+" + digits;
  ensure(
    /^\+91[6-9]\d{9}$/.test(digits),
    "INVALID_PHONE",
    "Enter a valid 10-digit Indian mobile number.",
  );
  return digits;
}
export function customerName(raw: unknown): string {
  ensure(
    typeof raw === "string" &&
      raw.trim().length >= 2 &&
      raw.trim().length <= 120,
    "INVALID_NAME",
    "Customer name must contain 2–120 characters.",
  );
  return raw.trim().replace(/\s+/g, " ");
}
