import { WeekCount } from './overview.models';

/** Weeks compared against the weeks before them when a KPI shows a trend. */
export const TREND_WEEKS = 4;

export const STORY_STATUS_ORDER = ['DRAFT', 'APPROVED', 'EXPORTED', 'MERGED', 'REJECTED'] as const;
export const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export function sumCounts(weeks: readonly WeekCount[]): number {
  return weeks.reduce((total, week) => total + week.count, 0);
}

/** Whole-number percentage of `part` in `whole`; 0 when there is no whole. */
export function percent(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 100);
}

export interface Trend {
  /** Rows in the latest {@link TREND_WEEKS} weeks. */
  recent: number;
  /** Rows in the {@link TREND_WEEKS} weeks before them. */
  previous: number;
  /** `recent - previous`. */
  delta: number;
  direction: 'up' | 'down' | 'flat';
}

/**
 * Compares the latest {@link TREND_WEEKS} weeks with the {@link TREND_WEEKS} before them. Null when the
 * series is shorter than two periods or both periods are empty (a delta of nothing against nothing is noise).
 */
export function trendOf(weeks: readonly WeekCount[]): Trend | null {
  if (weeks.length < TREND_WEEKS * 2) return null;
  const recent = sumCounts(weeks.slice(-TREND_WEEKS));
  const previous = sumCounts(weeks.slice(-TREND_WEEKS * 2, -TREND_WEEKS));
  if (recent === 0 && previous === 0) return null;
  const delta = recent - previous;
  return { recent, previous, delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
}

/** True when no week of the series has any row. */
export function isSilent(...series: readonly (readonly WeekCount[])[]): boolean {
  return series.every((weeks) => sumCounts(weeks) === 0);
}

/** A "nice" axis ceiling (1, 2, 5 × 10^n) at or above `max`, never below `minimum`. */
export function niceMax(max: number, minimum = 4): number {
  const target = Math.max(max, minimum);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  for (const step of [1, 2, 4, 5, 10]) {
    if (step * magnitude >= target) return step * magnitude;
  }
  return 10 * magnitude;
}
