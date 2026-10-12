import { describe, expect, it } from 'vitest';
import {
  AssistantMessageResponse,
  DiscoverySessionResponse,
  SessionTranscriptSegmentMessage,
} from './discovery.models';
import { DecisionEntry, FeedItem } from './feed';
import { TimelineBlock, TimelineChat, TimelineSession, buildTimeline } from './timeline';

const at = (hhmm: string, day = '2026-10-10'): string => `${day}T${hhmm}:00Z`;

function session(
  id: string,
  startedAt: string | null,
  endedAt: string | null,
  overrides: Partial<DiscoverySessionResponse> = {},
): DiscoverySessionResponse {
  return {
    id,
    projectId: 'p1',
    title: id,
    language: 'es',
    status: endedAt ? 'COMPLETED' : 'RECORDING',
    startedAt,
    endedAt,
    audioDurationMs: 0,
    processingError: null,
    createdAt: startedAt ?? at('00:00'),
    updatedAt: startedAt ?? at('00:00'),
    ...overrides,
  };
}

function segmentItem(sessionId: string, sequence: number, occurredAt: string): FeedItem {
  const segment: SessionTranscriptSegmentMessage = {
    sessionId,
    type: 'TRANSCRIPT_SEGMENT',
    occurredAt,
    sequence,
    speakerLabel: null,
    text: `s${sequence}`,
    startMs: 0,
    endMs: 0,
    isFinal: true,
  };
  return { kind: 'segment', id: `s:${sessionId}:${sequence}`, segment };
}

function decisionItem(id: string, occurredAt: string): FeedItem {
  const decision: DecisionEntry = {
    id,
    outcome: 'ACCEPTED',
    type: 'NEW_STORY',
    label: id,
    storyId: null,
    occurredAt,
    anchorSequence: 0,
  };
  return { kind: 'decision', id: `d:${id}`, decision };
}

function block(
  s: DiscoverySessionResponse,
  items: FeedItem[] = [],
): TimelineBlock & { session: DiscoverySessionResponse } {
  return { session: s, items };
}

function message(
  id: string,
  createdAt: string,
  role: 'ANALYST' | 'ASSISTANT' = 'ANALYST',
): AssistantMessageResponse {
  return { id, role, content: id, createdAt, suggestions: [] };
}

/** A compact trace of the timeline, to read orderings at a glance. */
function trace(entries: ReturnType<typeof buildTimeline>): string[] {
  return entries.flatMap((entry) => {
    if (entry.kind === 'chat') {
      return [
        `chat[${entry.messages.map((m) => m.id).join(',')}${entry.pending !== null ? '+pending' : ''}]`,
      ];
    }
    return [
      `session:${entry.block.session.id}[${entry.block.items
        .map((item) => {
          switch (item.kind) {
            case 'segment':
              return `s${item.segment.sequence}`;
            case 'decision':
              return `d:${item.decision.id}`;
            case 'chat':
              return `c:${item.message.id}`;
            case 'chat-pending':
              return 'pending';
            default:
              return item.kind;
          }
        })
        .join(',')}]`,
    ];
  });
}

describe('buildTimeline', () => {
  it('is empty without sessions or chat', () => {
    expect(buildTimeline([], [])).toEqual([]);
  });

  it('shows only the chat when there are no sessions', () => {
    const entries = buildTimeline([], [message('a', at('09:00')), message('b', at('09:01'))]);
    expect(trace(entries)).toEqual(['chat[a,b]']);
  });

  it('shows only the sessions when there is no chat, oldest first', () => {
    const late = block(session('late', at('15:00'), at('16:00')));
    const early = block(session('early', at('09:00'), at('10:00')));
    expect(trace(buildTimeline([late, early], []))).toEqual(['session:early[]', 'session:late[]']);
  });

  it('puts chat written before a recording above it', () => {
    const rec = block(session('rec', at('10:00'), at('11:00')));
    const entries = buildTimeline([rec], [message('q', at('09:00')), message('a', at('09:01'))]);
    expect(trace(entries)).toEqual(['chat[q,a]', 'session:rec[]']);
  });

  it('puts chat written after a recording below it', () => {
    const rec = block(session('rec', at('10:00'), at('11:00')));
    const entries = buildTimeline([rec], [message('q', at('12:00')), message('a', at('12:01'))]);
    expect(trace(entries)).toEqual(['session:rec[]', 'chat[q,a]']);
  });

  it('weaves chat written during a recording between its segments', () => {
    const items = [
      segmentItem('rec', 1, at('10:05')),
      segmentItem('rec', 2, at('10:20')),
      segmentItem('rec', 3, at('10:40')),
    ];
    const rec = block(session('rec', at('10:00'), at('11:00')), items);
    const entries = buildTimeline(
      [rec],
      [message('q', at('10:25')), message('a', at('10:26'), 'ASSISTANT')],
    );
    expect(trace(entries)).toEqual(['session:rec[s1,s2,c:q,c:a,s3]']);
  });

  it('puts chat written before the first segment ahead of it, after untimed text', () => {
    const items: FeedItem[] = [
      { kind: 'paragraph', id: 'p0', text: 'old transcript' },
      segmentItem('rec', 1, at('10:30')),
    ];
    const rec = block(session('rec', at('10:00'), at('11:00')), items);
    const entries = buildTimeline([rec], [message('q', at('10:10'))]);
    expect(trace(entries)).toEqual(['session:rec[paragraph,c:q,s1]']);
  });

  it('puts chat after the last segment of a live recording', () => {
    const items = [segmentItem('live', 1, at('10:05')), segmentItem('live', 2, at('10:10'))];
    const live = block(session('live', at('10:00'), null), items);
    const entries = buildTimeline([live], [message('q', at('10:30'))]);
    expect(trace(entries)).toEqual(['session:live[s1,s2,c:q]']);
  });

  it('keeps a live block anchored by decisions: chat lands after the decisions already taken', () => {
    // Live blocks order decisions by anchor sequence, not by the time they were taken.
    const items = [
      segmentItem('live', 1, at('10:05')),
      decisionItem('d1', at('10:12')),
      segmentItem('live', 2, at('10:10')),
      segmentItem('live', 3, at('10:20')),
    ];
    const live = block(session('live', at('10:00'), null), items);
    const entries = buildTimeline([live], [message('q', at('10:15'))]);
    expect(trace(entries)).toEqual(['session:live[s1,d:d1,s2,c:q,s3]']);
  });

  it('does not slip a message above a decision taken before it', () => {
    const items = [segmentItem('live', 1, at('10:05')), decisionItem('d1', at('10:08'))];
    const live = block(session('live', at('10:00'), null), items);
    const entries = buildTimeline([live], [message('q', at('10:09'))]);
    expect(trace(entries)).toEqual(['session:live[s1,d:d1,c:q]']);
  });

  it('keeps messages sent at the same position in their original order', () => {
    const items = [segmentItem('rec', 1, at('10:05'))];
    const rec = block(session('rec', at('10:00'), at('11:00')), items);
    const entries = buildTimeline(
      [rec],
      [message('b', at('10:30')), message('a', at('10:30')), message('c', at('10:31'))],
    );
    expect(trace(entries)).toEqual(['session:rec[s1,c:b,c:a,c:c]']);
  });

  it('orders several sessions with the chat between them', () => {
    const one = block(session('one', at('09:00'), at('10:00')));
    const two = block(session('two', at('14:00'), at('15:00')));
    const three = block(session('three', at('09:00', '2026-10-11'), at('10:00', '2026-10-11')));
    const entries = buildTimeline(
      [one, two, three],
      [
        message('m0', at('08:00')),
        message('m1', at('09:30')),
        message('m2', at('12:00')),
        message('m3', at('12:01')),
        message('m4', at('18:00')),
        message('m5', at('08:00', '2026-10-12')),
      ],
    );
    expect(trace(entries)).toEqual([
      'chat[m0]',
      'session:one[c:m1]',
      'chat[m2,m3]',
      'session:two[]',
      'chat[m4]',
      'session:three[]',
      'chat[m5]',
    ]);
  });

  it('treats a processing session without an end as open-ended', () => {
    const processing = block(session('p', at('10:00'), null, { status: 'PROCESSING' }));
    const entries = buildTimeline([processing], [message('q', at('23:00'))]);
    expect(trace(entries)).toEqual(['session:p[c:q]']);
  });

  it('closes a settled session without an end at its last item', () => {
    const items = [segmentItem('done', 1, at('10:30'))];
    const done = block(session('done', at('10:00'), null, { status: 'FAILED' }), items);
    const entries = buildTimeline([done], [message('q', at('11:00'))]);
    expect(trace(entries)).toEqual(['session:done[s1]', 'chat[q]']);
  });

  it('stretches a session to a segment stamped after its end time', () => {
    const items = [segmentItem('rec', 1, at('11:10'))];
    const rec = block(session('rec', at('10:00'), at('11:00')), items);
    const entries = buildTimeline([rec], [message('q', at('11:05'))]);
    expect(trace(entries)).toEqual(['session:rec[c:q,s1]']);
  });

  it('falls back to the creation time when a session has no start', () => {
    const rec = block(session('rec', null, at('11:00'), { createdAt: at('10:00') }));
    const entries = buildTimeline(
      [rec],
      [message('before', at('09:00')), message('in', at('10:30'))],
    );
    expect(trace(entries)).toEqual(['chat[before]', 'session:rec[c:in]']);
  });

  it('puts the pending question last: inside a live session when one is running', () => {
    const items = [segmentItem('live', 1, at('10:05'))];
    const live = block(session('live', at('10:00'), null), items);
    const entries = buildTimeline([live], [message('old', at('10:02'))], {
      pending: 'what next?',
      now: Date.parse(at('10:30')),
    });
    expect(trace(entries)).toEqual(['session:live[c:old,s1,pending]']);
    const last = (entries[0] as TimelineSession<TimelineBlock>).block.items.at(-1);
    expect(last).toMatchObject({ kind: 'chat-pending', text: 'what next?' });
  });

  it('puts the pending question in a trailing chat run when nothing is live', () => {
    const done = block(session('done', at('10:00'), at('11:00')));
    const entries = buildTimeline([done], [message('old', at('12:00'))], {
      pending: 'again',
      now: Date.parse(at('12:30')),
    });
    expect(trace(entries)).toEqual(['session:done[]', 'chat[old+pending]']);
    expect((entries[1] as TimelineChat).pending).toBe('again');
  });

  it('shows a lone pending question as its own run', () => {
    const entries = buildTimeline([], [], { pending: 'first', now: Date.now() });
    expect(trace(entries)).toEqual(['chat[+pending]']);
  });

  it('leaves out chat older than the cutoff while older history is still to load', () => {
    const rec = block(session('rec', at('10:00'), at('11:00')));
    const entries = buildTimeline(
      [rec],
      [message('old', at('08:00')), message('new', at('12:00'))],
      {
        cutoff: Date.parse(at('10:00')),
      },
    );
    expect(trace(entries)).toEqual(['session:rec[]', 'chat[new]']);
  });

  it('places a message without a readable time last', () => {
    const rec = block(session('rec', at('10:00'), at('11:00')));
    const entries = buildTimeline([rec], [message('odd', 'not a date'), message('q', at('12:00'))]);
    expect(trace(entries)).toEqual(['session:rec[]', 'chat[q,odd]']);
  });

  it('returns the very same block when no chat falls inside it', () => {
    const rec = block(session('rec', at('10:00'), at('11:00')));
    const [entry] = buildTimeline([rec], [message('q', at('12:00'))]);
    expect((entry as TimelineSession<TimelineBlock>).block).toBe(rec);
  });

  it('keys entries by session and by the first message of a run', () => {
    const rec = block(session('rec', at('10:00'), at('11:00')));
    const entries = buildTimeline([rec], [message('x', at('09:00')), message('y', at('12:00'))]);
    expect(entries.map((e) => e.key)).toEqual(['chat:x', 'session:rec', 'chat:y']);
  });
});
