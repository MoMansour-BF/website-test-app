/**
 * Shared date utilities for the date range picker and other date handling.
 * All dates are in local time; no timezone conversion.
 */

/** Format a Date as YYYY-MM-DD for inputs and URL params. */
export function formatDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD string to Date at start of day (local). Returns null if invalid. */
export function parseYYYYMMDD(s: string): Date | null {
  if (!s || s.length < 10) return null;
  const y = parseInt(s.slice(0, 4), 10);
  const m = parseInt(s.slice(5, 7), 10) - 1;
  const d = parseInt(s.slice(8, 10), 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

/** True if the given date is strictly before today (by calendar day). */
export function isPastDay(date: Date, today: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return d < t;
}

/** Human-readable month and year, e.g. "February 2026". */
export function getMonthYearLabel(date: Date, locale?: string): string {
  return date.toLocaleDateString(locale ?? "en-US", { month: "long", year: "numeric" });
}

/** Number of days in the given month (1-based month: 1 = January). */
export function getDaysInMonth(year: number, month: number): number {
  const month0 = month - 1; // 1-based to 0-based for JS Date
  return new Date(year, month0 + 1, 0).getDate(); // day 0 = last day of previous month
}

/** Day of week for the first day of the month (0 = Sunday, 1 = Monday, ...). */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/** Short day names for calendar header, e.g. ["S", "M", "T", "W", "T", "F", "S"]. */
export function getDayNamesShort(locale?: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale ?? "en-US", { weekday: "short" });
  return [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const d = new Date(2024, 0, 7 + i); // Sun 7, Mon 8, ...
    return formatter.format(d).slice(0, 1).toUpperCase();
  });
}

/** Add days to a date (returns new Date). */
export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/** Compare two dates by calendar day (returns -1, 0, or 1). */
export function compareDay(a: Date, b: Date): number {
  const ta = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const tb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return 0;
}

/** True if the two dates are the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return compareDay(a, b) === 0;
}

/** True if `date` is in the range [start, end] (inclusive). */
export function isInRange(date: Date, start: Date, end: Date): boolean {
  const c = compareDay(date, start);
  const d = compareDay(date, end);
  return c >= 0 && d <= 0;
}

/** Number of calendar days from start to end (inclusive). So same day = 1, next day = 2. */
export function getDaysBetween(start: Date, end: Date): number {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

/** Short range label for trigger, e.g. "Feb 6 – 12" or "Feb 6 – Mar 2". */
export function formatRangeShort(start: Date, end: Date, locale?: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = start.toLocaleDateString(locale ?? "en-US", opts);
  const e = end.toLocaleDateString(locale ?? "en-US", opts);
  return `${s} – ${e}`;
}
