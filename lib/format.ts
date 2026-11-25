/**
 * Display formatting shared across cards, the detail modal and person pages.
 *
 * TMDB dates are calendar dates ("2026-11-17") or sometimes just a year
 * ("2011"). `new Date("2026-11-17")` parses as UTC midnight, which renders as
 * the *previous day* anywhere west of Greenwich — and a bare year becomes
 * "Dec 31" of the year before. Parse calendar dates as local dates instead.
 */

const YEAR_ONLY = /^\d{4}$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a TMDB-style date string as a local calendar date. */
export function parseCalendarDate(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (YEAR_ONLY.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * "Nov 17, 2026". A bare year is returned as-is ("2011").
 * Returns `fallback` (default null) when the value can't be displayed.
 */
export function formatDisplayDate<T extends string | null = null>(
  value?: string | null,
  fallback: T = null as T
): string | T {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (YEAR_ONLY.test(trimmed)) return trimmed;
  const date = parseCalendarDate(trimmed);
  return date ? dateFormatter.format(date) : fallback;
}

/** "2h 39m" / "45m". */
export function formatRuntime(minutes?: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

/** Whole years between a birth date and today (or a death date). */
export function ageFrom(birthday?: string | null, until?: string | null): number | null {
  const birth = parseCalendarDate(birthday);
  if (!birth) return null;
  const end = parseCalendarDate(until) ?? new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    end.getMonth() < birth.getMonth() || (end.getMonth() === birth.getMonth() && end.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}
