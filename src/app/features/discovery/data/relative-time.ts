/**
 * Pure relative-time labelling for the discovery feed. Kept Angular-free (and
 * clock-free — `now` is always passed in) so the hybrid absolute/relative rule
 * is exhaustively unit-testable at every boundary.
 */

/**
 * A render-ready relative-time label:
 * - `relative` — a Transloco `key` (plus optional `{n}` param) the caller renders.
 * - `absolute` — the item is old enough that the caller should fall back to the
 *   Angular `date` pipe (an exact calendar date) instead of a relative phrase.
 */
export type RelativeTime =
  | { kind: 'relative'; key: string; params?: { n: number } }
  | { kind: 'absolute' };

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Maps an ISO timestamp to a {@link RelativeTime} relative to `now` (epoch ms):
 *
 * - `< 60s` → `discovery.time.justNow`
 * - `1–59 min` → `discovery.time.minutes` `{n}`
 * - `1–23 h` → `discovery.time.hours` `{n}`
 * - exactly 1 day (`24h ≤ age < 48h`) → `discovery.time.yesterday`
 * - `2–6 days` → `discovery.time.days` `{n}`
 * - `≥ 7 days` → `absolute` (caller renders the `date` pipe)
 *
 * Unparseable or future timestamps degrade to `justNow` (never negative counts).
 */
export function relativeTime(iso: string, now: number): RelativeTime {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return { kind: 'relative', key: 'discovery.time.justNow' };

  const age = now - then;
  if (age < MINUTE) return { kind: 'relative', key: 'discovery.time.justNow' };
  if (age < HOUR) {
    return { kind: 'relative', key: 'discovery.time.minutes', params: { n: Math.floor(age / MINUTE) } };
  }
  if (age < DAY) {
    return { kind: 'relative', key: 'discovery.time.hours', params: { n: Math.floor(age / HOUR) } };
  }
  if (age < 2 * DAY) return { kind: 'relative', key: 'discovery.time.yesterday' };
  if (age < 7 * DAY) {
    return { kind: 'relative', key: 'discovery.time.days', params: { n: Math.floor(age / DAY) } };
  }
  return { kind: 'absolute' };
}
