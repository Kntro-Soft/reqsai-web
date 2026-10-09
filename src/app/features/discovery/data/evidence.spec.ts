import { describe, expect, it } from 'vitest';
import { evidenceSpeakerLabel, locateEvidence, segmentKey } from './evidence';
import { FeedItem } from './feed';
import { SpeakerView } from './speakers';

const ANA: SpeakerView = {
  label: 'A',
  index: 1,
  displayName: 'Ana',
  role: 'CLIENT',
  side: 'left',
  segmentCount: 3,
};
const SECOND: SpeakerView = {
  label: 'B',
  index: 2,
  displayName: null,
  role: null,
  side: 'right',
  segmentCount: 1,
};

function segmentItem(sequence: number, speakerLabel: string | null): FeedItem {
  return {
    kind: 'segment',
    id: `sess-1:${sequence}`,
    segment: {
      sessionId: 'sess-1',
      type: 'TRANSCRIPT_SEGMENT',
      occurredAt: `2026-10-09T10:0${sequence}:00Z`,
      sequence,
      speakerLabel,
      text: `segment ${sequence}`,
      startMs: 0,
      endMs: 1,
      isFinal: true,
    },
  };
}

const blocks = [
  {
    session: { id: 'sess-1' },
    items: [segmentItem(1, 'A'), segmentItem(2, 'B'), segmentItem(3, null)],
    speakers: new Map([
      ['A', ANA],
      ['B', SECOND],
    ]),
  },
];

describe('evidence', () => {
  it('keys a transcript bubble by session and sequence', () => {
    expect(segmentKey('sess-1', 7)).toBe('sess-1:7');
  });

  it('finds the loaded segment with its time and speaker', () => {
    expect(
      locateEvidence(blocks, { sessionId: 'sess-1', evidence: { sequence: 1, quote: 'x' } }),
    ).toEqual({
      sessionId: 'sess-1',
      sequence: 1,
      occurredAt: '2026-10-09T10:01:00Z',
      speaker: ANA,
    });
    expect(
      locateEvidence(blocks, { sessionId: 'sess-1', evidence: { sequence: 3, quote: 'x' } })
        ?.speaker,
    ).toBeNull();
  });

  it('gives up without a session, evidence, block or loaded segment', () => {
    const evidence = { sequence: 1, quote: 'x' };
    expect(locateEvidence(blocks, { sessionId: null, evidence })).toBeNull();
    expect(locateEvidence(blocks, { sessionId: 'sess-1', evidence: null })).toBeNull();
    expect(locateEvidence(blocks, { sessionId: 'sess-2', evidence })).toBeNull();
    expect(
      locateEvidence(blocks, { sessionId: 'sess-1', evidence: { sequence: 40, quote: 'x' } }),
    ).toBeNull();
  });

  it('names the speaker like the transcript bubbles, with their side', () => {
    const name = (n: number) => `Hablante ${n}`;
    const side = (s: string) => (s === 'CLIENT' ? 'Cliente' : 'Equipo');
    expect(evidenceSpeakerLabel(ANA, name, side)).toBe('Ana (Cliente)');
    expect(evidenceSpeakerLabel(SECOND, name, side)).toBe('Hablante 2');
    expect(evidenceSpeakerLabel(null, name, side)).toBeNull();
  });
});
