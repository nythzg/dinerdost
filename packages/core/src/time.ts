import { ensure } from "./errors";
export const BUSINESS_TIME_ZONE = "Asia/Kolkata";
function parts(value: Date | string) {
  const result = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    numberingSystem: "latn",
  }).formatToParts(new Date(value));
  return Object.fromEntries(result.map((part) => [part.type, part.value]));
}
export function businessDate(value: Date | string = new Date()) {
  const p = parts(value);
  return `${p.year}-${p.month}-${p.day}`;
}
export function businessDateTime(value: Date | string) {
  const p = parts(value);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function businessLocalToISO(value: string) {
  ensure(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value),
    "INVALID_DATE",
    "Enter a valid date and time.",
  );
  const parsed = new Date(value + "+05:30");
  ensure(
    !Number.isNaN(parsed.getTime()) && businessDateTime(parsed) === value,
    "INVALID_DATE",
    "Enter a valid date and time.",
  );
  return parsed.toISOString();
}
