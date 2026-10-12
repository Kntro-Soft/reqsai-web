import { FeatureUsage } from './billing.models';
import { audioMinutes, cachedShare, featureRows, meetingTime, projectRows } from './usage-insights';

const feature = (name: string, tokens: number, input = 0, cached = 0): FeatureUsage => ({
  feature: name,
  tokens,
  inputTokens: input,
  outputTokens: 0,
  cachedInputTokens: cached,
  calls: 1,
});

describe('featureRows', () => {
  it('sorts by tokens, drops unused features and shares the total', () => {
    const rows = featureRows(
      [feature('CHAT', 250), feature('EMBEDDINGS', 0), feature('LIVE_SUGGESTIONS', 750)],
      1000,
      (f) => f.toLowerCase(),
    );
    expect(rows.map((r) => r.id)).toEqual(['LIVE_SUGGESTIONS', 'CHAT']);
    expect(rows[0].percent).toBe(75);
    expect(rows[1].label).toBe('chat');
  });

  it('shows no share when nothing was used', () => {
    expect(featureRows([feature('CHAT', 10)], 0, (f) => f)[0].percent).toBe(0);
  });
});

describe('projectRows', () => {
  it('names the projects it can and labels the rest', () => {
    const rows = projectRows(
      [
        { projectId: 'a', tokens: 300 },
        { projectId: 'b', tokens: 700 },
      ],
      1000,
      (id) => (id === 'a' ? 'Restaurante' : null),
      'Otro proyecto',
    );
    expect(rows.map((r) => r.label)).toEqual(['Otro proyecto', 'Restaurante']);
    expect(rows[0].percent).toBe(70);
  });
});

describe('meetingTime', () => {
  it('stays in minutes under two hours and switches to hours after', () => {
    expect(meetingTime(0)).toEqual({ unit: 'minutes', value: 0 });
    expect(meetingTime(37.9)).toEqual({ unit: 'minutes', value: 37 });
    expect(meetingTime(119)).toEqual({ unit: 'minutes', value: 119 });
    expect(meetingTime(150)).toEqual({ unit: 'hours', value: 2.5 });
  });

  it('never goes negative', () => {
    expect(meetingTime(-5)).toEqual({ unit: 'minutes', value: 0 });
  });
});

describe('cachedShare / audioMinutes', () => {
  it('reports the cached part of the input', () => {
    expect(cachedShare([feature('A', 0, 1000, 600), feature('B', 0, 1000, 200)])).toBe(40);
    expect(cachedShare([])).toBe(0);
  });

  it('rounds audio up to whole minutes', () => {
    expect(audioMinutes(0)).toBe(0);
    expect(audioMinutes(1)).toBe(1);
    expect(audioMinutes(61)).toBe(2);
  });
});
