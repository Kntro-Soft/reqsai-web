import {
  DecisionEntry,
  addToQueue,
  buildSessionItems,
  clampQueueIndex,
  historicalSegmentToMessage,
  lastSequence,
  lowestSequence,
  normalizeSegmentPage,
  removeFromQueue,
  toDecisionEntry,
  transcriptToItems,
  upsertSegment,
} from './feed';
import {
  DisplayStory,
  SessionSegmentResponse,
  SessionTranscriptSegmentMessage,
  SuggestionResponse,
} from './discovery.models';

function displayStory(overrides: Partial<DisplayStory> = {}): DisplayStory {
  return {
    id: 'story-1',
    title: 'Export invoices',
    role: 'accountant',
    action: 'export invoices',
    benefit: 'share them',
    priority: 'MEDIUM',
    storyPoints: 3,
    createdAt: null,
    ...overrides,
  };
}

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

describe('lowestSequence', () => {
  it('is null with no segments', () => {
    expect(lowestSequence([])).toBeNull();
  });

  it('is the lowest sequence present', () => {
    expect(lowestSequence([segment(3), segment(7), segment(5)])).toBe(3);
  });
});

describe('historicalSegmentToMessage', () => {
  function raw(overrides: Partial<SessionSegmentResponse> = {}): SessionSegmentResponse {
    return {
      sequence: 4,
      text: 'persisted line',
      speakerLabel: 'A',
      startMs: 4000,
      endMs: 4900,
      occurredAt: '2026-07-04T12:03:00Z',
      ...overrides,
    };
  }

  it('adapts a persisted segment into a final transcript-segment message', () => {
    const msg = historicalSegmentToMessage('sess-9', raw());
    expect(msg.type).toBe('TRANSCRIPT_SEGMENT');
    expect(msg.sessionId).toBe('sess-9');
    expect(msg.isFinal).toBe(true);
    expect(msg.sequence).toBe(4);
    expect(msg.occurredAt).toBe('2026-07-04T12:03:00Z');
    expect(msg.text).toBe('persisted line');
  });
});

describe('normalizeSegmentPage', () => {
  const seg: SessionSegmentResponse = {
    sequence: 1,
    text: 'a',
    speakerLabel: null,
    startMs: 0,
    endMs: 500,
    occurredAt: '2026-07-04T12:00:00Z',
  };

  it('treats a bare array as a page with no more', () => {
    expect(normalizeSegmentPage([seg])).toEqual({ segments: [seg], hasMore: false });
  });

  it('reads a segments + hasMore object', () => {
    expect(normalizeSegmentPage({ segments: [seg], hasMore: true })).toEqual({
      segments: [seg],
      hasMore: true,
    });
  });

  it('reads a PageResponse (content + page.hasPrevious)', () => {
    const page = normalizeSegmentPage({
      content: [seg],
      page: { hasNext: false, hasPrevious: true },
    });
    expect(page.segments).toEqual([seg]);
    expect(page.hasMore).toBe(true);
  });

  it('degrades unknown shapes to an empty page', () => {
    expect(normalizeSegmentPage(null)).toEqual({ segments: [], hasMore: false });
    expect(normalizeSegmentPage(42)).toEqual({ segments: [], hasMore: false });
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

  describe('chronological (historical) mode', () => {
    it('interleaves segments, decisions and stories by timestamp', () => {
      const items = buildSessionItems({
        session,
        transcript: null,
        chronological: true,
        segments: [
          segment(0, { occurredAt: '2026-07-04T12:00:00Z' }),
          segment(1, { occurredAt: '2026-07-04T12:00:30Z' }),
        ],
        decisions: [
          decision({ id: 'sug-1', storyId: 'story-x', occurredAt: '2026-07-04T12:00:20Z' }),
        ],
        stories: [displayStory({ id: 'story-late', createdAt: '2026-07-04T12:01:00Z' })],
      });
      expect(items.map((i) => i.kind)).toEqual(['segment', 'decision', 'segment', 'story']);
    });

    it('ignores anchorSequence and orders purely by time', () => {
      const items = buildSessionItems({
        session,
        transcript: null,
        chronological: true,
        segments: [segment(5, { occurredAt: '2026-07-04T12:00:10Z' })],
        // A decision whose anchor (99) does not match any segment still lands by time.
        decisions: [
          decision({ anchorSequence: 99, storyId: null, occurredAt: '2026-07-04T12:00:05Z' }),
        ],
        stories: [],
      });
      expect(items.map((i) => i.kind)).toEqual(['decision', 'segment']);
    });

    it('places stories lacking a timestamp after timestamped items', () => {
      const items = buildSessionItems({
        session,
        transcript: null,
        chronological: true,
        segments: [segment(0, { occurredAt: '2026-07-04T12:00:10Z' })],
        decisions: [],
        stories: [displayStory({ id: 'story-untimed', createdAt: null })],
      });
      expect(items.map((i) => i.kind)).toEqual(['segment', 'story']);
    });

    it('still hides stories already shown as an accepted decision', () => {
      const items = buildSessionItems({
        session,
        transcript: null,
        chronological: true,
        segments: [],
        decisions: [
          decision({ outcome: 'ACCEPTED', storyId: 'story-1', occurredAt: '2026-07-04T12:00:05Z' }),
        ],
        stories: [displayStory({ id: 'story-1', createdAt: '2026-07-04T12:00:06Z' })],
      });
      expect(items.filter((i) => i.kind === 'story')).toHaveLength(0);
    });
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
