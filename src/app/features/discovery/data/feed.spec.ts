import {
  DecisionEntry,
  addToQueue,
  buildSessionItems,
  clampQueueIndex,
  lastSequence,
  removeFromQueue,
  toDecisionEntry,
  transcriptToItems,
  upsertSegment,
} from './feed';
import { SessionTranscriptSegmentMessage, SuggestionResponse } from './discovery.models';

function segment(
  sequence: number,
  overrides: Partial<SessionTranscriptSegmentMessage> = {},
): SessionTranscriptSegmentMessage {
  return {
    sessionId: 'sess-1',
    type: 'TRANSCRIPT_SEGMENT',
    occurredAt: '2026-07-04T12:00:00Z',
    sequence,
    speakerLabel: null,
    text: `segment ${sequence}`,
    startMs: sequence * 1000,
    endMs: sequence * 1000 + 900,
    isFinal: true,
    ...overrides,
  };
}

function suggestion(overrides: Partial<SuggestionResponse> = {}): SuggestionResponse {
  return {
    id: 'sug-1',
    sessionId: 'sess-1',
    projectId: 'proj-1',
    type: 'NEW_STORY',
    status: 'PENDING',
    draftTitle: 'Export invoices',
    draftRole: 'accountant',
    draftAction: 'export invoices as PDF',
    draftBenefit: 'share them with clients',
    draftPriority: 'MEDIUM',
    draftStoryPoints: 3,
    relatedTopic: null,
    targetStoryId: null,
    question: null,
    resolvedStoryId: null,
    createdAt: '2026-07-04T12:00:00Z',
    updatedAt: '2026-07-04T12:00:00Z',
    ...overrides,
  };
}

function decision(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: 'sug-1',
    outcome: 'ACCEPTED',
    type: 'NEW_STORY',
    label: 'Export invoices',
    storyId: 'story-1',
    occurredAt: '2026-07-04T12:00:05Z',
    anchorSequence: -1,
    ...overrides,
  };
}

describe('transcriptToItems', () => {
  it('returns nothing for a null or empty transcript', () => {
    expect(transcriptToItems('s', null)).toEqual([]);
    expect(transcriptToItems('s', '')).toEqual([]);
  });

  it('splits the transcript into trimmed, non-empty paragraphs', () => {
    const items = transcriptToItems('s', 'Hello there.\n\n  Second paragraph. \n\n\n');
    expect(items.map((i) => i.kind)).toEqual(['paragraph', 'paragraph']);
    expect(items.map((i) => (i.kind === 'paragraph' ? i.text : ''))).toEqual([
      'Hello there.',
      'Second paragraph.',
    ]);
  });

  it('gives each paragraph a stable, session-scoped id', () => {
    const items = transcriptToItems('sess-9', 'a\nb');
    expect(items.map((i) => i.id)).toEqual(['sess-9:p0', 'sess-9:p1']);
  });
});

describe('upsertSegment', () => {
  it('replaces a hypothesis with its final by sequence', () => {
    const list = upsertSegment(
      [segment(1, { isFinal: false, text: 'draft' })],
      segment(1, { text: 'final' }),
    );
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('final');
    expect(list[0].isFinal).toBe(true);
  });

  it('keeps segments sorted by sequence when they arrive out of order', () => {
    let list = upsertSegment([], segment(2));
    list = upsertSegment(list, segment(1));
    expect(list.map((s) => s.sequence)).toEqual([1, 2]);
  });
});

describe('lastSequence', () => {
  it('is -1 with no segments', () => {
    expect(lastSequence([])).toBe(-1);
  });

  it('is the highest sequence present', () => {
    expect(lastSequence([segment(3), segment(7), segment(5)])).toBe(7);
  });
});

describe('toDecisionEntry', () => {
  it('labels story suggestions with the draft title', () => {
    const entry = toDecisionEntry(suggestion(), 'ACCEPTED', 4, '2026-07-04T12:01:00Z');
    expect(entry.label).toBe('Export invoices');
    expect(entry.anchorSequence).toBe(4);
    expect(entry.outcome).toBe('ACCEPTED');
  });

  it('labels clarifying questions with the question text', () => {
    const entry = toDecisionEntry(
      suggestion({ type: 'CLARIFYING_QUESTION', question: 'Which currencies?', draftTitle: null }),
      'ACCEPTED',
      -1,
    );
    expect(entry.label).toBe('Which currencies?');
  });

  it('prefers the resolved story id over the target story id', () => {
    const entry = toDecisionEntry(
      suggestion({ type: 'UPDATE_STORY', targetStoryId: 'story-t', resolvedStoryId: 'story-r' }),
      'ACCEPTED',
      0,
    );
    expect(entry.storyId).toBe('story-r');
  });
});

describe('buildSessionItems', () => {
  const session = { id: 'sess-1' };

  it('orders paragraphs, then segments with decisions after their anchor, then stories', () => {
    const items = buildSessionItems({
      session,
      transcript: 'Earlier recording.',
      segments: [segment(0), segment(1)],
      decisions: [decision({ anchorSequence: 0 })],
      stories: [
        {
          id: 'story-2',
          title: 'Other',
          role: 'user',
          action: 'act',
          benefit: 'win',
          priority: 'LOW',
          storyPoints: null,
        },
      ],
    });
    expect(items.map((i) => i.kind)).toEqual([
      'paragraph',
      'segment',
      'decision',
      'segment',
      'story',
    ]);
  });

  it('renders decisions anchored before any segment first', () => {
    const items = buildSessionItems({
      session,
      transcript: null,
      segments: [segment(0)],
      decisions: [decision({ anchorSequence: -1 })],
      stories: [],
    });
    expect(items.map((i) => i.kind)).toEqual(['decision', 'segment']);
  });

  it('appends decisions whose anchor segment is missing (historical sessions)', () => {
    const items = buildSessionItems({
      session,
      transcript: 'text',
      segments: [],
      decisions: [decision({ anchorSequence: 42 })],
      stories: [],
    });
    expect(items.map((i) => i.kind)).toEqual(['paragraph', 'decision']);
  });

  it('does not repeat a story already shown as an accepted decision', () => {
    const items = buildSessionItems({
      session,
      transcript: null,
      segments: [],
      decisions: [decision({ storyId: 'story-1' })],
      stories: [
        {
          id: 'story-1',
          title: 'Covered',
          role: 'r',
          action: 'a',
          benefit: 'b',
          priority: 'HIGH',
          storyPoints: 5,
        },
      ],
    });
    expect(items.filter((i) => i.kind === 'story')).toHaveLength(0);
  });

  it('keeps stories referenced only by dismissed decisions', () => {
    const items = buildSessionItems({
      session,
      transcript: null,
      segments: [],
      decisions: [decision({ outcome: 'DISMISSED', storyId: 'story-1' })],
      stories: [
        {
          id: 'story-1',
          title: 'Kept',
          role: 'r',
          action: 'a',
          benefit: 'b',
          priority: 'HIGH',
          storyPoints: 5,
        },
      ],
    });
    expect(items.filter((i) => i.kind === 'story')).toHaveLength(1);
  });
});

describe('decision queue helpers', () => {
  it('addToQueue appends and de-duplicates by id', () => {
    const one = addToQueue([], suggestion());
    const twice = addToQueue(one, suggestion());
    expect(twice).toHaveLength(1);
    const two = addToQueue(one, suggestion({ id: 'sug-2' }));
    expect(two.map((s) => s.id)).toEqual(['sug-1', 'sug-2']);
  });

  it('removeFromQueue drops the matching suggestion only', () => {
    const queue = [suggestion(), suggestion({ id: 'sug-2' })];
    expect(removeFromQueue(queue, 'sug-1').map((s) => s.id)).toEqual(['sug-2']);
    expect(removeFromQueue(queue, 'nope')).toHaveLength(2);
  });

  it('clampQueueIndex keeps the carousel index inside the queue', () => {
    expect(clampQueueIndex(0, 0)).toBe(0);
    expect(clampQueueIndex(2, 2)).toBe(1);
    expect(clampQueueIndex(-1, 3)).toBe(0);
    expect(clampQueueIndex(1, 3)).toBe(1);
  });
});
