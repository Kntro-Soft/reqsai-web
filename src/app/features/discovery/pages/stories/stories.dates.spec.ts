import { toInstant } from './stories';

describe('toInstant', () => {
  it('returns undefined for a blank value', () => {
    expect(toInstant('', false)).toBeUndefined();
    expect(toInstant('', true)).toBeUndefined();
  });

  it('returns undefined for an invalid date', () => {
    expect(toInstant('not-a-date', false)).toBeUndefined();
  });

  it('maps the lower bound to the start of the selected day (UTC)', () => {
    expect(toInstant('2026-06-01', false)).toBe('2026-06-01T00:00:00.000Z');
  });

  it('maps the upper bound to the start of the NEXT day so the range is inclusive', () => {
    expect(toInstant('2026-06-30', true)).toBe('2026-07-01T00:00:00.000Z');
  });
});
