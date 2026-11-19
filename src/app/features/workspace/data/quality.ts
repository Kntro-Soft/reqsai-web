/** Days the panel covers when it opens. */
export const DEFAULT_PERIOD_DAYS = 30;
/** The quick periods offered next to the custom range. */
export const PERIOD_PRESETS = [7, 30, 90] as const;
/** The longest period the server accepts, in days. */
export const MAX_PERIOD_DAYS = 366;

export interface Period {
  /** First day, `YYYY-MM-DD` (UTC). */
  from: string;
  /** Last day, `YYYY-MM-DD` (UTC). */
  to: string;
}

const DAY_MS = 86_400_000;

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The last `days` UTC days up to and including today, the way the server reads a period. */
export function lastDays(days: number, now: Date = new Date()): Period {
  const today = Date.parse(isoDay(now.getTime()));
  return { from: isoDay(today - (days - 1) * DAY_MS), to: isoDay(today) };
}

/** A usable custom range: both days given, in order, and no longer than {@link MAX_PERIOD_DAYS}. */
export function isValidPeriod(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return false;
  return (end - start) / DAY_MS + 1 <= MAX_PERIOD_DAYS;
}

/** A share between 0 and 1 as a whole-number percentage, e.g. `0.6` → `60%`. */
export function percentText(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * A duration in seconds as a short text with the two largest units: `45 s`, `12 min`, `1 h 30 min`, `2 d 3 h`.
 * The units are the same in every locale.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days} d` : `${days} d ${restHours} h`;
}
