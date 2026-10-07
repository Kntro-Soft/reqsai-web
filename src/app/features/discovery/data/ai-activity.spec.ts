import { aiActivityFor } from './ai-activity';
import { SessionStatus } from './discovery.models';

const NOW = Date.parse('2026-10-07T15:00:00Z');
const session = (status: SessionStatus, processingError: string | null = null) => ({
  status,
  processingError,
});

describe('aiActivityFor', () => {
  it('reports the AI as listening while recording, without a last suggestion when none is pending', () => {
    expect(aiActivityFor(session('RECORDING'), [], NOW)).toEqual({
      state: 'listening',
      detail: null,
      last: null,
    });
  });

  it('dates "last suggestion" from the newest pending suggestion of the session', () => {
    const activity = aiActivityFor(
      session('RECORDING'),
      [{ createdAt: '2026-10-07T14:50:00Z' }, { createdAt: '2026-10-07T14:57:00Z' }],
      NOW,
    );

    expect(activity?.last).toEqual({
      kind: 'relative',
      key: 'discovery.time.minutes',
      params: { n: 3 },
    });
  });

  it('ignores unparseable timestamps when picking the newest suggestion', () => {
    const activity = aiActivityFor(session('RECORDING'), [{ createdAt: 'not-a-date' }], NOW);

    expect(activity?.last).toBeNull();
  });

  it('is paused while the recording is paused', () => {
    expect(
      aiActivityFor(session('PAUSED'), [{ createdAt: '2026-10-07T14:57:00Z' }], NOW)?.state,
    ).toBe('paused');
  });

  it('is processing between Stop and the final stories (STOPPED and PROCESSING)', () => {
    expect(aiActivityFor(session('STOPPED'), [], NOW)?.state).toBe('processing');
    expect(aiActivityFor(session('PROCESSING'), [], NOW)?.state).toBe('processing');
  });

  it('surfaces the backend reason when processing failed', () => {
    expect(aiActivityFor(session('FAILED', '  Transcript too short  '), [], NOW)).toEqual({
      state: 'failed',
      detail: 'Transcript too short',
      last: null,
    });
    expect(aiActivityFor(session('FAILED', '   '), [], NOW)?.detail).toBeNull();
  });

  it('shows nothing for settled or not-yet-started sessions', () => {
    expect(aiActivityFor(session('COMPLETED'), [], NOW)).toBeNull();
    expect(aiActivityFor(session('DRAFT'), [], NOW)).toBeNull();
  });
});
