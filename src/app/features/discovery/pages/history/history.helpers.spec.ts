import { describe, expect, it } from 'vitest';
import { hasSessionStats, sessionDuration } from './history.helpers';

describe('sessionDuration', () => {
  it('formats the API durationSeconds of a live session', () => {
    expect(sessionDuration({ durationSeconds: 117, audioDurationMs: 0 })).toBe('1:57');
  });

  it('prefers durationSeconds over audioDurationMs', () => {
    expect(sessionDuration({ durationSeconds: 138, audioDurationMs: 138_175 })).toBe('2:18');
  });

  it('falls back to the uploaded audio length when durationSeconds is absent', () => {
    expect(sessionDuration({ audioDurationMs: 95_412 })).toBe('1:35');
  });

  it('shows a dash for a running live session', () => {
    expect(sessionDuration({ durationSeconds: null, audioDurationMs: 0 })).toBe('—');
  });
});

describe('hasSessionStats', () => {
  it('is true when a session carries storiesGenerated, even zero', () => {
    expect(hasSessionStats([{ storiesGenerated: null }, { storiesGenerated: 0 }])).toBe(true);
  });

  it('is false when no session carries stats', () => {
    expect(hasSessionStats([{}, { storiesGenerated: null }])).toBe(false);
  });
});
