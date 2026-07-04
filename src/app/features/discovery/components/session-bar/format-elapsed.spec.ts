import { formatElapsed } from './session-bar';

describe('formatElapsed', () => {
  it('formats sub-minute durations as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(5_000)).toBe('0:05');
    expect(formatElapsed(65_000)).toBe('1:05');
  });

  it('pads seconds but not the leading minute below an hour', () => {
    expect(formatElapsed(9 * 60_000 + 3_000)).toBe('9:03');
    expect(formatElapsed(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('switches to h:mm:ss once an hour is reached', () => {
    expect(formatElapsed(60 * 60_000)).toBe('1:00:00');
    expect(formatElapsed(3_723_000)).toBe('1:02:03');
  });

  it('floors partial seconds', () => {
    expect(formatElapsed(1_999)).toBe('0:01');
  });
});
