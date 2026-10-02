import { format, parse, addDays, isValid } from "date-fns";
import { he } from "date-fns/locale";

// Game dates are stored as "yyyy-MM-dd" strings. Always parse them as local
// dates — `new Date("2026-06-03")` is UTC midnight and shows the previous day
// in American time zones.
const DATE_KEY = "yyyy-MM-dd";

export const HE_DAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export function parseDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || "")) return null;
  const date = parse(key, DATE_KEY, new Date());
  return isValid(date) ? date : null;
}

export function toDateKey(date) {
  return format(date, DATE_KEY);
}

export function shiftDateKey(key, days) {
  return toDateKey(addDays(parseDateKey(key), days));
}

export function todayKey() {
  return toDateKey(new Date());
}

// "יום רביעי, 3 ביוני 2026"
export function formatLongDate(key) {
  return format(parseDateKey(key), "EEEE, d בMMMM yyyy", { locale: he });
}

// "3.6"
export function formatShortDate(key) {
  return format(parseDateKey(key), "d.M");
}

export function formatMonth(date) {
  return format(date, "MMMM yyyy", { locale: he });
}
