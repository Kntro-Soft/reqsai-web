import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERIOD_DAYS,
  MAX_PERIOD_DAYS,
  formatDuration,
  isValidPeriod,
  lastDays,
  percentText,
} from './quality';

describe('lastDays', () => {
  const now = new Date('2026-11-18T15:30:00Z');

  it('covers the days up to and including today, as UTC days', () => {
    expect(lastDays(30, now)).toEqual({ from: '2026-10-20', to: '2026-11-18' });
    expect(lastDays(7, now)).toEqual({ from: '2026-11-12', to: '2026-11-18' });
    expect(lastDays(1, now)).toEqual({ from: '2026-11-18', to: '2026-11-18' });
  });

  it('reads the day in UTC, not in the local zone', () => {
    expect(lastDays(1, new Date('2026-11-18T23:59:59Z')).to).toBe('2026-11-18');
    expect(lastDays(1, new Date('2026-11-19T00:00:00Z')).to).toBe('2026-11-19');
  });

  it('opens on the last 30 days', () => {
    expect(DEFAULT_PERIOD_DAYS).toBe(30);
  });
});

describe('isValidPeriod', () => {
  it('accepts a day, an ordered range and the longest allowed range', () => {
    expect(isValidPeriod('2026-11-18', '2026-11-18')).toBe(true);
    expect(isValidPeriod('2026-10-01', '2026-11-18')).toBe(true);
    expect(isValidPeriod('2025-11-18', '2026-11-18')).toBe(MAX_PERIOD_DAYS >= 366);
  });

  it('rejects missing, inverted, malformed and too long ranges', () => {
    expect(isValidPeriod('', '2026-11-18')).toBe(false);
    expect(isValidPeriod('2026-11-18', '')).toBe(false);
    expect(isValidPeriod('2026-11-19', '2026-11-18')).toBe(false);
    expect(isValidPeriod('18/11/2026', '2026-11-18')).toBe(false);
    expect(isValidPeriod('2026-13-45', '2026-11-18')).toBe(false);
    expect(isValidPeriod('2025-11-17', '2026-11-18')).toBe(false);
  });
});

describe('percentText', () => {
  it('rounds a share to a whole percentage', () => {
    expect(percentText(0)).toBe('0%');
    expect(percentText(0.6)).toBe('60%');
    expect(percentText(2 / 3)).toBe('67%');
    expect(percentText(1)).toBe('100%');
  });
});

describe('formatDuration', () => {
  it('uses seconds under a minute', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(45)).toBe('45 s');
  });

  it('uses minutes under an hour', () => {
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(1800)).toBe('30 min');
  });

  it('uses hours and the minutes left', () => {
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(5400)).toBe('1 h 30 min');
    expect(formatDuration(3599)).toBe('1 h');
  });

  it('uses days and the hours left', () => {
    expect(formatDuration(86_400)).toBe('1 d');
    expect(formatDuration(86_400 + 3 * 3600)).toBe('1 d 3 h');
  });

  it('never shows a negative or fractional time', () => {
    expect(formatDuration(-5)).toBe('0 s');
    expect(formatDuration(59.6)).toBe('1 min');
  });
});
