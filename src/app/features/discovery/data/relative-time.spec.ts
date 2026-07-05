import { relativeTime } from './relative-time';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A fixed "now" so every case is deterministic; ages are subtracted from it. */
const NOW = Date.parse('2026-07-05T12:00:00.000Z');
/** Builds the ISO of an instant `age` ms before NOW. */
const ago = (age: number): string => new Date(NOW - age).toISOString();

describe('relativeTime', () => {
  it('under a minute is "just now" (no params)', () => {
    expect(relativeTime(ago(0), NOW)).toEqual({ kind: 'relative', key: 'discovery.time.justNow' });
    expect(relativeTime(ago(MINUTE - 1), NOW)).toEqual({
      kind: 'relative',
      key: 'discovery.time.justNow',
    });
  });

  it('at exactly 1 minute flips to minutes', () => {
    expect(relativeTime(ago(MINUTE), NOW)).toEqual({
      kind: 'relative',
      key: 'discovery.time.minutes',
      params: { n: 1 },
    });
  });

  it('floors the minute count across 1–59 minutes', () => {
    expect(relativeTime(ago(59 * MINUTE + 59 * SECOND), NOW)).toEqual({
      kind: 'relative',
      key: 'discovery.time.minutes',
      params: { n: 59 },
    });
  });

  it('at exactly 1 hour flips to hours', () => {
    expect(relativeTime(ago(HOUR), NOW)).toEqual({
      kind: 'relative',
      key: 'discovery.time.hours',
      params: { n: 1 },
    });
  });

  it('floors the hour count across 1–23 hours', () => {
    expect(relativeTime(ago(23 * HOUR + 59 * MINUTE), NOW)).toEqual({
      kind: 'relative',
      key: 'discovery.time.hours',
      params: { n: 23 },
    });
  });

  it('at exactly 24 hours is "yesterday"', () => {
    expect(relativeTime(ago(DAY), NOW)).toEqual({ kind: 'relative', key: 'discovery.time.yesterday' });
  });

  it('just under 48 hours is still "yesterday"', () => {
    expect(relativeTime(ago(2 * DAY - 1), NOW)).toEqual({
      kind: 'relative',
      key: 'discovery.time.yesterday',
    });
  });

  it('at exactly 48 hours flips to days with n=2', () => {
    expect(relativeTime(ago(2 * DAY), NOW)).toEqual({
      kind: 'relative',
      key: 'discovery.time.days',
      params: { n: 2 },
    });
  });

  it('floors the day count across 2–6 days', () => {
    expect(relativeTime(ago(6 * DAY + 23 * HOUR), NOW)).toEqual({
      kind: 'relative',
      key: 'discovery.time.days',
      params: { n: 6 },
    });
  });

  it('at exactly 7 days becomes absolute', () => {
    expect(relativeTime(ago(7 * DAY), NOW)).toEqual({ kind: 'absolute' });
  });

  it('a far-past date is absolute', () => {
    expect(relativeTime('2020-01-01T00:00:00.000Z', NOW)).toEqual({ kind: 'absolute' });
  });

  it('an unparseable timestamp degrades to "just now"', () => {
    expect(relativeTime('not-a-date', NOW)).toEqual({
      kind: 'relative',
      key: 'discovery.time.justNow',
    });
  });

  it('a future timestamp degrades to "just now" (never a negative count)', () => {
    expect(relativeTime(ago(-MINUTE), NOW)).toEqual({
      kind: 'relative',
      key: 'discovery.time.justNow',
    });
  });
});
