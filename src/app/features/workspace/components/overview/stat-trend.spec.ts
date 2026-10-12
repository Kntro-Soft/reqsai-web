import { describe, expect, it } from 'vitest';
import { formatCount, statTrend } from './stat-trend';

const translate = (key: string, params?: Record<string, unknown>) => `${key}:${params?.['n']}`;

describe('statTrend', () => {
  it('tints growth as good news and states the size of the change', () => {
    expect(statTrend({ recent: 8, previous: 4, delta: 4, direction: 'up' }, translate)).toEqual({
      direction: 'up',
      tone: 'good',
      text: 'overview.trend.up:4',
    });
  });

  it('does not treat a quieter period as bad news, and shows the change unsigned', () => {
    expect(statTrend({ recent: 1, previous: 4, delta: -3, direction: 'down' }, translate)).toEqual({
      direction: 'down',
      tone: 'neutral',
      text: 'overview.trend.down:3',
    });
  });

  it('has no line when there is nothing to compare', () => {
    expect(statTrend(null, translate)).toBeNull();
  });
});

describe('formatCount', () => {
  it('groups thousands for the locale', () => {
    expect(formatCount(1234, 'en')).toBe('1,234');
  });
});
