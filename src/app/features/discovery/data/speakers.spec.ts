import { describe, expect, it } from 'vitest';
import { SessionSpeakerResponse } from './discovery.models';
import {
  SPEAKER_COLORS,
  SPEAKER_NAME_MAX,
  applySpeakerUpdate,
  buildSpeakerViews,
  feedSide,
  normalizeSpeakerName,
  overlapNotice,
  speakerColor,
  speakerMap,
  speakerName,
  speakersLoadKey,
} from './speakers';

function known(overrides: Partial<SessionSpeakerResponse> = {}): SessionSpeakerResponse {
  return {
    label: '0',
    index: 1,
    displayName: null,
    name: 'Hablante 1',
    side: null,
    segmentCount: 3,
    ...overrides,
  };
}

const hablante = (n: number): string => `Hablante ${n}`;

describe('speakerName', () => {
  it('defaults to "Hablante N" by first appearance', () => {
    expect(speakerName({ displayName: null, index: 2 }, hablante)).toBe('Hablante 2');
    expect(speakerName({ displayName: '   ', index: 3 }, hablante)).toBe('Hablante 3');
  });

  it("uses the analyst's name when set", () => {
    expect(speakerName({ displayName: ' Ana ', index: 1 }, hablante)).toBe('Ana');
  });
});

describe('speakerColor', () => {
  it('gives each of the first speakers a distinct color', () => {
    const dots = SPEAKER_COLORS.map((_, i) => speakerColor(i + 1).dot);
    expect(new Set(dots).size).toBe(SPEAKER_COLORS.length);
  });

  it('cycles once the palette runs out, and tolerates odd indexes', () => {
    expect(speakerColor(SPEAKER_COLORS.length + 1)).toEqual(speakerColor(1));
    expect(speakerColor(0)).toEqual(speakerColor(1));
    expect(speakerColor(-4)).toEqual(speakerColor(1));
  });
});

describe('feedSide', () => {
  it('puts the client on the left and the team on the right', () => {
    expect(feedSide(2, 'CLIENT')).toBe('left');
    expect(feedSide(1, 'TEAM')).toBe('right');
  });

  it('alternates speakers without a side by index', () => {
    expect(feedSide(1, null)).toBe('left');
    expect(feedSide(2, null)).toBe('right');
    expect(feedSide(3, null)).toBe('left');
  });
});

describe('buildSpeakerViews', () => {
  it('is empty when nothing carries a label', () => {
    expect(buildSpeakerViews(null, [{ speakerLabel: null }, { speakerLabel: ' ' }])).toEqual([]);
  });

  it('numbers labels by first appearance when the API has not answered yet', () => {
    const views = buildSpeakerViews(null, [
      { speakerLabel: 'B' },
      { speakerLabel: 'A' },
      { speakerLabel: ' B ' },
    ]);
    expect(views.map((v) => [v.label, v.index, v.side])).toEqual([
      ['B', 1, 'left'],
      ['A', 2, 'right'],
    ]);
  });

  it("keeps the API's numbering, names and sides and appends speakers it does not know yet", () => {
    const views = buildSpeakerViews(
      [
        known({ label: '1', index: 2, displayName: 'Luis', side: 'TEAM' }),
        known({ label: '0', index: 1, displayName: 'Ana', side: 'CLIENT' }),
      ],
      [{ speakerLabel: '0' }, { speakerLabel: '2' }, { speakerLabel: '1' }],
    );
    expect(views.map((v) => [v.label, v.index, v.displayName, v.role, v.side])).toEqual([
      ['0', 1, 'Ana', 'CLIENT', 'left'],
      ['1', 2, 'Luis', 'TEAM', 'right'],
      ['2', 3, null, null, 'left'],
    ]);
    expect(speakerMap(views).get('1')?.displayName).toBe('Luis');
  });
});

describe('speakersLoadKey', () => {
  it('is null without diarization', () => {
    expect(
      speakersLoadKey('COMPLETED', [{ speakerLabel: null }, { speakerLabel: ' ' }]),
    ).toBeNull();
  });

  it('changes with a new speaker or a new status, not with segment order', () => {
    const a = speakersLoadKey('RECORDING', [{ speakerLabel: '1' }, { speakerLabel: '0' }]);
    expect(a).toBe('RECORDING|0,1');
    expect(speakersLoadKey('RECORDING', [{ speakerLabel: '0' }, { speakerLabel: '1' }])).toBe(a);
    expect(speakersLoadKey('RECORDING', [{ speakerLabel: '0' }, { speakerLabel: '2' }])).not.toBe(
      a,
    );
    expect(speakersLoadKey('COMPLETED', [{ speakerLabel: '0' }, { speakerLabel: '1' }])).not.toBe(
      a,
    );
  });
});

describe('normalizeSpeakerName', () => {
  it('collapses whitespace and trims, null when blank', () => {
    expect(normalizeSpeakerName('  Ana \n Torres ')).toBe('Ana Torres');
    expect(normalizeSpeakerName('   ')).toBeNull();
    expect(normalizeSpeakerName(null)).toBeNull();
  });

  it('caps the name at the API limit', () => {
    expect(normalizeSpeakerName('x'.repeat(SPEAKER_NAME_MAX + 10))).toHaveLength(SPEAKER_NAME_MAX);
  });
});

describe('applySpeakerUpdate', () => {
  it('renames a known speaker in place, keeping its number and count', () => {
    const list = applySpeakerUpdate([known(), known({ label: '1', index: 2 })], {
      speakerLabel: '1',
      displayName: 'Luis',
      side: 'TEAM',
    });
    expect(list[1]).toEqual({
      label: '1',
      index: 2,
      displayName: 'Luis',
      name: 'Luis',
      side: 'TEAM',
      segmentCount: 3,
    });
    expect(list[0]).toEqual(known());
  });

  it('goes back to the default name when the name is cleared', () => {
    const list = applySpeakerUpdate([known({ displayName: 'Ana', name: 'Ana' })], {
      speakerLabel: '0',
      displayName: null,
      side: null,
    });
    expect(list[0].name).toBe('Hablante 1');
  });

  it('appends a speaker the list did not have yet', () => {
    const list = applySpeakerUpdate([known()], {
      speakerLabel: '5',
      displayName: null,
      side: 'CLIENT',
    });
    expect(list[1]).toMatchObject({ label: '5', index: 2, name: 'Hablante 2', side: 'CLIENT' });
  });
});

describe('overlapNotice', () => {
  it('is null when nobody talked over each other', () => {
    expect(overlapNotice(null)).toBeNull();
    expect(overlapNotice({ count: 0, totalMs: 0, ranges: [] })).toBeNull();
  });

  it('warns with the number of overlapping stretches', () => {
    expect(
      overlapNotice({
        count: 2,
        totalMs: 1800,
        ranges: [{ startMs: 1000, endMs: 2000, speakerLabels: ['0', '1'] }],
      }),
    ).toEqual({ key: 'discovery.speakers.overlapWarning', params: { count: 2 } });
  });
});
