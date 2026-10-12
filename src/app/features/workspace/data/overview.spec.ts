import { describe, expect, it } from 'vitest';
import { WeekCount } from './overview.models';
import { isSilent, niceMax, percent, sumCounts, trendOf } from './overview';

const weeks = (...counts: number[]): WeekCount[] =>
  counts.map((count, i) => ({ weekStart: `2026-01-${String(i + 1).padStart(2, '0')}`, count }));

describe('overview helpers', () => {
  it('sums a weekly series', () => {
    expect(sumCounts(weeks(1, 2, 3))).toBe(6);
    expect(sumCounts([])).toBe(0);
  });

  it('rounds a percentage and survives an empty whole', () => {
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBe(0);
    expect(percent(5, 0)).toBe(0);
  });

  describe('trendOf', () => {
    it('compares the latest four weeks with the four before', () => {
      expect(trendOf(weeks(0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2))).toEqual({
        recent: 8,
        previous: 4,
        delta: 4,
        direction: 'up',
      });
      expect(trendOf(weeks(9, 9, 9, 9, 3, 3, 3, 3))?.direction).toBe('down');
      expect(trendOf(weeks(1, 1, 1, 1, 1, 1, 1, 1))?.direction).toBe('flat');
    });

    it('has nothing to say about an empty or too short series', () => {
      expect(trendOf(weeks(0, 0, 0, 0, 0, 0, 0, 0))).toBeNull();
      expect(trendOf(weeks(5, 5, 5))).toBeNull();
    });
  });

  it('knows when every series is silent', () => {
    expect(isSilent(weeks(0, 0), weeks(0))).toBe(true);
    expect(isSilent(weeks(0, 0), weeks(1))).toBe(false);
  });

  it('rounds an axis ceiling up to a nice number', () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(5)).toBe(5);
    expect(niceMax(6)).toBe(10);
    expect(niceMax(11)).toBe(20);
    expect(niceMax(23)).toBe(40);
    expect(niceMax(41)).toBe(50);
    expect(niceMax(101)).toBe(200);
  });
});
