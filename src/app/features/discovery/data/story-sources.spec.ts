import { describe, expect, it } from 'vitest';
import { formatMeetingMoment, fragmentMoment, fragmentSessionParams } from './story-sources';

describe('formatMeetingMoment', () => {
  it('writes the offset as m:ss', () => {
    expect(formatMeetingMoment(0)).toBe('0:00');
    expect(formatMeetingMoment(5_999)).toBe('0:05');
    expect(formatMeetingMoment(754_000)).toBe('12:34');
  });

  it('writes h:mm:ss from one hour on', () => {
    expect(formatMeetingMoment(3_600_000)).toBe('1:00:00');
    expect(formatMeetingMoment(3_723_000)).toBe('1:02:03');
  });

  it('reads a missing, negative or non-finite offset as the start', () => {
    expect(formatMeetingMoment(null)).toBe('0:00');
    expect(formatMeetingMoment(undefined)).toBe('0:00');
    expect(formatMeetingMoment(-10)).toBe('0:00');
    expect(formatMeetingMoment(Number.NaN)).toBe('0:00');
  });
});

describe('fragmentMoment', () => {
  it('writes the start and the end when the fragment lasts', () => {
    expect(fragmentMoment({ startMs: 754_000, endMs: 761_500 })).toBe('12:34 – 12:41');
  });

  it('writes a single moment when start and end fall on the same second', () => {
    expect(fragmentMoment({ startMs: 754_000, endMs: 754_400 })).toBe('12:34');
    expect(fragmentMoment({ startMs: 754_000, endMs: null })).toBe('12:34');
  });

  it('is null when the fragment was not located in the transcript', () => {
    expect(fragmentMoment({ startMs: null, endMs: null })).toBeNull();
  });
});

describe('fragmentSessionParams', () => {
  it('opens the session at the segment when it was located', () => {
    expect(fragmentSessionParams({ sessionId: 's-1', startSequence: 12 })).toEqual({
      session: 's-1',
      segment: 12,
    });
  });

  it('opens only the session when the fragment was not located', () => {
    expect(fragmentSessionParams({ sessionId: 's-1', startSequence: null })).toEqual({
      session: 's-1',
    });
  });
});
