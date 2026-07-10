import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { DECIDE_RETRY_DELAY_MS, DiscoveryChatStore } from './discovery-chat.store';
import {
  DiscoverySessionResponse,
  PageResponse,
  SessionSegmentResponse,
  SuggestionResponse,
  UserStoryResponse,
} from './discovery.models';

/** In-memory RealtimeService: one Subject per logical topic, no WebSocket. */
class FakeRealtimeService {
  readonly topics = new Map<string, Subject<unknown>>();

  watch<T>(topic: string): Subject<T> {
    let subject = this.topics.get(topic);
    if (!subject) {
      subject = new Subject<unknown>();
      this.topics.set(topic, subject);
    }
    return subject as Subject<T>;
  }
}

function session(overrides: Partial<DiscoverySessionResponse> = {}): DiscoverySessionResponse {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    title: 'Kickoff',
    language: 'es-PE',
    status: 'COMPLETED',
    startedAt: '2026-07-04T12:00:00Z',
    endedAt: '2026-07-04T13:00:00Z',
    audioDurationMs: 3_600_000,
    processingError: null,
    createdAt: '2026-07-04T11:59:00Z',
    updatedAt: '2026-07-04T13:05:00Z',
    ...overrides,
  };
}

function page<T>(content: T[]): PageResponse<T> {
  return {
    content,
    page: {
      number: 0,
      size: 10,
      totalElements: content.length,
      totalPages: 1,
      first: true,
      last: true,
      hasNext: false,
      hasPrevious: false,
    },
  };
}

function suggestion(overrides: Partial<SuggestionResponse> = {}): SuggestionResponse {
  return {
    id: 'sug-1',
    sessionId: 'sess-1',
    projectId: 'proj-1',
    type: 'NEW_STORY',
    status: 'ACCEPTED',
    draftTitle: 'Export invoices',
    draftRole: 'accountant',
    draftAction: 'export invoices as PDF',
    draftBenefit: 'share them with clients',
    draftPriority: 'MEDIUM',
    draftStoryPoints: 3,
    relatedTopic: null,
    targetStoryId: null,
    question: null,
    resolvedStoryId: 'story-1',
    createdAt: '2026-07-04T12:10:00Z',
    updatedAt: '2026-07-04T12:15:00Z',
    ...overrides,
  };
}

function story(overrides: Partial<UserStoryResponse> = {}): UserStoryResponse {
  return {
    id: 'story-1',
    projectId: 'proj-1',
    sessionId: 'sess-1',
    title: 'Export invoices',
    role: 'accountant',
    action: 'export invoices',
    benefit: 'share them',
    priority: 'MEDIUM',
    storyPoints: 3,
    status: 'BACKLOG',
    createdAt: '2026-07-04T12:15:01Z',
    ...overrides,
  };
}

describe('DiscoveryChatStore', () => {
  let store: DiscoveryChatStore;
  let http: HttpTestingController;
  let realtime: FakeRealtimeService;

  beforeEach(() => {
    realtime = new FakeRealtimeService();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RealtimeService, useValue: realtime },
      ],
    });
    store = TestBed.inject(DiscoveryChatStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    store.reset();
  });

  /** Flushes the init round: session list, project stories/backlog and pending checks. */
  function flushInit(sessions: DiscoverySessionResponse[]): void {
    store.init('proj-1');
    http.expectOne((r) => r.url === '/api/projects/proj-1/sessions').flush(page(sessions));
    http.expectOne('/api/projects/proj-1/stories').flush(page<UserStoryResponse>([]));
  }

  it('renders resolved decisions in the historical block after reload', () => {
    flushInit([session()]);

    // Historical block loads: segments, transcript, session stories, resolved decisions.
    http
      .expectOne((r) => r.url === '/api/sessions/sess-1/segments')
      .flush([
        {
          sequence: 0,
          text: 'We need invoice export.',
          speakerLabel: null,
          startMs: 0,
          endMs: 900,
          occurredAt: '2026-07-04T12:05:00Z',
        },
      ]);
    http.expectOne('/api/sessions/sess-1/transcript').flush({
      sessionId: 'sess-1',
      transcript: 'We need invoice export.',
    });
    http.expectOne('/api/sessions/sess-1/stories').flush(page([story()]));
    http
      .expectOne(
        (r) =>
          r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
      )
      .flush([suggestion()]);
    http
      .expectOne(
        (r) =>
          r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'DISMISSED',
      )
      .flush([
        suggestion({
          id: 'sug-2',
          status: 'DISMISSED',
          draftTitle: 'Out of scope',
          type: 'EDGE_CASE',
        }),
      ]);
    // Newest block also pulls its pending suggestions into the queue.
    http
      .expectOne((r) => r.url === '/api/sessions/sess-1/suggestions' && !r.params.has('status'))
      .flush([]);
    // Pending-from-previous check.
    http
      .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
      .flush(page<SuggestionResponse>([]));

    http.verify();

    const block = store.blocks()[0];
    expect(block).toBeDefined();
    expect(block.loaded).toBe(true);
    const kinds = block.items.map((i) => i.kind);
    expect(kinds).toContain('segment');
    const decisions = block.items.filter((i) => i.kind === 'decision');
    expect(decisions).toHaveLength(2);
  });

  it('loads resolved decisions for a still-settling session (reload while STOPPED)', () => {
    flushInit([session({ status: 'STOPPED' })]);

    // Live block also fetches its structured segments (empty here → string fallback).
    http.expectOne((r) => r.url === '/api/sessions/sess-1/segments').flush([]);
    // Live block: transcript + stories + resolved decisions.
    http.expectOne('/api/sessions/sess-1/transcript').flush({
      sessionId: 'sess-1',
      transcript: 'We need invoice export.',
    });
    http.expectOne('/api/sessions/sess-1/stories').flush(page([story()]));
    http
      .expectOne(
        (r) =>
          r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
      )
      .flush([suggestion()]);
    http
      .expectOne(
        (r) =>
          r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'DISMISSED',
      )
      .flush([suggestion({ id: 'sug-2', status: 'DISMISSED', type: 'CLARIFYING_QUESTION' })]);
    http
      .expectOne((r) => r.url === '/api/sessions/sess-1/suggestions' && !r.params.has('status'))
      .flush([]);
    http
      .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
      .flush(page<SuggestionResponse>([]));

    http.verify();

    const decisions = store.blocks()[0].items.filter((i) => i.kind === 'decision');
    expect(decisions).toHaveLength(2);
  });

  it('upgrades a live block to the historical timeline when the session completes', () => {
    flushInit([session({ status: 'PROCESSING' })]);

    // Live block load, nothing resolved yet.
    http.expectOne((r) => r.url === '/api/sessions/sess-1/segments').flush([]);
    http
      .expectOne('/api/sessions/sess-1/transcript')
      .flush({ sessionId: 'sess-1', transcript: null });
    http.expectOne('/api/sessions/sess-1/stories').flush(page<UserStoryResponse>([]));
    http
      .expectOne(
        (r) =>
          r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
      )
      .flush([]);
    http
      .expectOne(
        (r) =>
          r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'DISMISSED',
      )
      .flush([]);
    http
      .expectOne((r) => r.url === '/api/sessions/sess-1/suggestions' && !r.params.has('status'))
      .flush([]);
    http
      .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
      .flush(page<SuggestionResponse>([]));

    // The COMPLETED event arrives over the session topic the store subscribed to.
    realtime
      .watch('sessions/sess-1')
      .next({ sessionId: 'sess-1', type: 'COMPLETED', occurredAt: '2026-07-04T13:05:00Z' });

    // The block re-loads as a historical timeline, decisions included.
    http
      .expectOne((r) => r.url === '/api/sessions/sess-1/segments')
      .flush([
        {
          sequence: 0,
          text: 'We need invoice export.',
          speakerLabel: null,
          startMs: 0,
          endMs: 900,
          occurredAt: '2026-07-04T12:05:00Z',
        },
      ]);
    http
      .expectOne('/api/sessions/sess-1/transcript')
      .flush({ sessionId: 'sess-1', transcript: null });
    http.expectOne('/api/sessions/sess-1/stories').flush(page<UserStoryResponse>([]));
    http
      .expectOne(
        (r) =>
          r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
      )
      .flush([suggestion()]);
    http
      .expectOne(
        (r) =>
          r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'DISMISSED',
      )
      .flush([]);

    http.verify();

    const block = store.blocks()[0];
    expect(block.session.status).toBe('COMPLETED');
    // Chronological: the 12:05 segment renders before the 12:15 decision.
    expect(block.items.map((i) => i.kind)).toEqual(['segment', 'decision']);
  });

  it('adds a block and tracks the live session from a project lifecycle broadcast', () => {
    flushInit([]);
    http
      .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
      .flush(page<SuggestionResponse>([]));

    realtime.watch('projects/proj-1/sessions').next({
      sessionId: 'live-1',
      status: 'RECORDING',
      title: 'Weekly sync',
      language: 'en-US',
      startedAt: '2026-07-04T15:00:00Z',
    });

    // The synthesized block loads like any live block (segments first, empty here).
    http.expectOne((r) => r.url === '/api/sessions/live-1/segments').flush([]);
    http
      .expectOne('/api/sessions/live-1/transcript')
      .flush({ sessionId: 'live-1', transcript: null });
    http.expectOne('/api/sessions/live-1/stories').flush(page<UserStoryResponse>([]));
    http
      .expectOne(
        (r) =>
          r.url === '/api/sessions/live-1/suggestions' && r.params.get('status') === 'ACCEPTED',
      )
      .flush([]);
    http
      .expectOne(
        (r) =>
          r.url === '/api/sessions/live-1/suggestions' && r.params.get('status') === 'DISMISSED',
      )
      .flush([]);
    http
      .expectOne((r) => r.url === '/api/sessions/live-1/suggestions' && !r.params.has('status'))
      .flush([]);
    http.verify();

    expect(store.liveSession()?.id).toBe('live-1');
    expect(store.liveSession()?.language).toBe('en-US');
    expect(store.blocks().some((b) => b.session.id === 'live-1')).toBe(true);
    // The per-session topic was wired for follow-up events.
    expect(realtime.topics.has('sessions/live-1')).toBe(true);

    // Stop: the live flag clears and the block status refreshes.
    realtime.watch('projects/proj-1/sessions').next({ sessionId: 'live-1', status: 'STOPPED' });
    expect(store.liveSession()).toBeNull();
    expect(store.blocks().find((b) => b.session.id === 'live-1')?.session.status).toBe('STOPPED');
  });

  it('tolerates malformed or unknown project lifecycle payloads', () => {
    flushInit([]);
    http
      .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
      .flush(page<SuggestionResponse>([]));

    realtime.watch('projects/proj-1/sessions').next({} as never);
    realtime
      .watch('projects/proj-1/sessions')
      .next({ sessionId: 'live-9', status: 'SOMETHING_NEW' });

    http.verify();
    expect(store.liveSession()).toBeNull();
    expect(store.blocks()).toHaveLength(0);
  });

  it('warns and ignores an unknown realtime message type instead of failing silently', () => {
    flushInit([session()]);
    http
      .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
      .flush(page<SuggestionResponse>([]));
    http.match(() => true).forEach((r) => r.flush(page<never>([])));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    store.applyRealtime({
      sessionId: 's-1',
      type: 'BRAND_NEW_EVENT',
      occurredAt: new Date().toISOString(),
    } as never);

    expect(warnSpy).toHaveBeenCalledWith(
      '[discovery] Unhandled realtime message type:',
      'BRAND_NEW_EVENT',
    );
    warnSpy.mockRestore();
  });

  describe('decide', () => {
    /** Boots one completed session whose queue holds a single pending suggestion. */
    function setupWithPending(): SuggestionResponse {
      const pending = suggestion({ status: 'PENDING' });
      flushInit([session()]);
      http.expectOne((r) => r.url === '/api/sessions/sess-1/segments').flush([]);
      http.expectOne('/api/sessions/sess-1/transcript').flush({
        sessionId: 'sess-1',
        transcript: null,
      });
      http.expectOne('/api/sessions/sess-1/stories').flush(page<UserStoryResponse>([]));
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
        )
        .flush([]);
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'DISMISSED',
        )
        .flush([]);
      http
        .expectOne((r) => r.url === '/api/sessions/sess-1/suggestions' && !r.params.has('status'))
        .flush([pending]);
      http
        .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
        .flush(page<SuggestionResponse>([]));
      return pending;
    }

    const ACCEPT_URL = '/api/sessions/sess-1/suggestions/sug-1/accept';
    const DISMISS_URL = '/api/sessions/sess-1/suggestions/sug-1/dismiss';

    it('applies the side effects even when the caller never subscribes', () => {
      const pending = setupWithPending();
      expect(store.queue().map((s) => s.id)).toEqual(['sug-1']);

      store.decide(pending, 'ACCEPTED');
      expect(store.deciding()).toContain('sug-1');

      http.expectOne(ACCEPT_URL).flush(suggestion({ status: 'ACCEPTED' }));
      http.expectOne('/api/projects/proj-1/stories').flush(page<UserStoryResponse>([]));
      http.verify();

      expect(store.queue()).toHaveLength(0);
      expect(store.deciding()).toHaveLength(0);
      const decisions = store.blocks()[0].items.filter((i) => i.kind === 'decision');
      expect(decisions).toHaveLength(1);
    });

    it('treats a 409 as an already-applied decision and converges the feed', () => {
      const pending = setupWithPending();
      const errors: unknown[] = [];

      store.decide(pending, 'DISMISSED').subscribe({ error: (e) => errors.push(e) });
      http
        .expectOne(DISMISS_URL)
        .flush({ code: 'SUGGESTION_ALREADY_RESOLVED' }, { status: 409, statusText: 'Conflict' });
      http.verify();

      // The caller still hears about it (info toast), but the UI has converged.
      expect(errors).toHaveLength(1);
      expect(store.queue()).toHaveLength(0);
      expect(store.deciding()).toHaveLength(0);
      const decisions = store.blocks()[0].items.filter((i) => i.kind === 'decision');
      expect(decisions).toHaveLength(1);
      expect(decisions[0].kind === 'decision' && decisions[0].decision.outcome).toBe('DISMISSED');
    });

    it('retries once after a transient failure', async () => {
      const pending = setupWithPending();
      const results: SuggestionResponse[] = [];

      store.decide(pending, 'ACCEPTED').subscribe({
        next: (r) => results.push(r),
        error: () => undefined,
      });
      http.expectOne(ACCEPT_URL).flush(null, { status: 500, statusText: 'Server Error' });

      // Not surfaced yet: the retry is pending and the spinner keeps running.
      expect(store.deciding()).toContain('sug-1');
      http.expectNone(ACCEPT_URL);

      await new Promise((resolve) => setTimeout(resolve, DECIDE_RETRY_DELAY_MS + 100));

      http.expectOne(ACCEPT_URL).flush(suggestion({ status: 'ACCEPTED' }));
      http.expectOne('/api/projects/proj-1/stories').flush(page<UserStoryResponse>([]));
      http.verify();

      expect(results[0]?.status).toBe('ACCEPTED');
      expect(store.queue()).toHaveLength(0);
      expect(store.deciding()).toHaveLength(0);
    });

    it('does not retry non-transient failures', () => {
      const pending = setupWithPending();
      const errors: unknown[] = [];

      store.decide(pending, 'ACCEPTED').subscribe({ error: (e) => errors.push(e) });
      http.expectOne(ACCEPT_URL).flush(null, { status: 400, statusText: 'Bad Request' });
      http.verify();

      expect(errors).toHaveLength(1);
      expect(store.deciding()).toHaveLength(0);
      // The card stays queued so the user can decide again.
      expect(store.queue().map((s) => s.id)).toEqual(['sug-1']);
    });
  });

  describe('live-block decision anchoring (task 2c)', () => {
    /** Boots one RECORDING session whose live block finished loading (no segments yet). */
    function bootLive(): void {
      flushInit([session({ status: 'RECORDING', endedAt: null })]);
      http.expectOne((r) => r.url === '/api/sessions/sess-1/segments').flush([]);
      http
        .expectOne('/api/sessions/sess-1/transcript')
        .flush({ sessionId: 'sess-1', transcript: null });
      http.expectOne('/api/sessions/sess-1/stories').flush(page<UserStoryResponse>([]));
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
        )
        .flush([]);
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'DISMISSED',
        )
        .flush([]);
      http
        .expectOne((r) => r.url === '/api/sessions/sess-1/suggestions' && !r.params.has('status'))
        .flush([]);
      http
        .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
        .flush(page<SuggestionResponse>([]));
    }

    function liveSegment(sequence: number, occurredAt: string) {
      return {
        sessionId: 'sess-1',
        type: 'TRANSCRIPT_SEGMENT' as const,
        occurredAt,
        sequence,
        speakerLabel: null,
        text: `segment ${sequence}`,
        startMs: sequence * 1000,
        endMs: sequence * 1000 + 900,
        isFinal: true,
      };
    }

    it('orders an accepted decision by its suggestion time, not accept time', () => {
      bootLive();
      const topic = realtime.watch('sessions/sess-1');

      // Two live segments arrive, then a third much later.
      topic.next(liveSegment(0, '2026-07-04T12:00:00Z'));
      topic.next(liveSegment(1, '2026-07-04T12:00:30Z'));

      // A suggestion proposed at 12:00:40 (between seq 1 and a future seq 2),
      // delivered over the realtime topic so it lands in the decision queue.
      store.applyRealtime({
        type: 'SUGGESTION_GENERATED',
        sessionId: 'sess-1',
        occurredAt: '2026-07-04T12:00:40Z',
        suggestionId: 'sug-1',
        suggestionType: 'NEW_STORY',
        status: 'PENDING',
        draftTitle: null,
        draftRole: null,
        draftAction: null,
        draftBenefit: null,
        draftPriority: null,
        draftStoryPoints: null,
        relatedTopic: null,
        targetStoryId: null,
        question: null,
        resolvedStoryId: null,
        draftAcceptanceCriteria: null,
      });
      const pending = store.queue()[0];

      // A later segment lands BEFORE we accept — the old code would anchor here.
      topic.next(liveSegment(2, '2026-07-04T12:05:00Z'));

      store.decide(pending, 'ACCEPTED');
      http
        .expectOne('/api/sessions/sess-1/suggestions/sug-1/accept')
        .flush(suggestion({ status: 'ACCEPTED', createdAt: '2026-07-04T12:00:40Z' }));
      http.expectOne('/api/projects/proj-1/stories').flush(page<UserStoryResponse>([]));
      http.verify();

      // The decision sits after seq 1 and before seq 2 — at the suggestion's
      // moment — rather than being pushed to the bottom after seq 2.
      const kinds = store.blocks()[0].items.map((i) => i.kind);
      expect(kinds).toEqual(['segment', 'segment', 'decision', 'segment']);
    });

    it('stamps a live segment lacking occurredAt so its bubble still has a time', () => {
      bootLive();
      const topic = realtime.watch('sessions/sess-1');
      topic.next(liveSegment(0, ''));

      const segments = store.blocks()[0].items.filter((i) => i.kind === 'segment');
      expect(segments).toHaveLength(1);
      const stamped = segments[0].kind === 'segment' ? segments[0].segment.occurredAt : '';
      expect(stamped).toBeTruthy();
      expect(Number.isNaN(Date.parse(stamped))).toBe(false);
    });
  });

  describe('live-block recorded segments (task A)', () => {
    /**
     * Flushes the init + live-block round for a RECORDING session, letting the
     * caller decide how the `/segments` and `/transcript` endpoints answer.
     */
    function flushLiveBlock(opts: {
      segments: SessionSegmentResponse[];
      segmentsStatus?: number;
      transcript: string | null;
    }): void {
      flushInit([session({ status: 'RECORDING', endedAt: null })]);
      const segReq = http.expectOne((r) => r.url === '/api/sessions/sess-1/segments');
      if (opts.segmentsStatus) {
        segReq.flush(null, { status: opts.segmentsStatus, statusText: 'Not Found' });
      } else {
        segReq.flush(opts.segments);
      }
      http
        .expectOne('/api/sessions/sess-1/transcript')
        .flush({ sessionId: 'sess-1', transcript: opts.transcript });
      http.expectOne('/api/sessions/sess-1/stories').flush(page<UserStoryResponse>([]));
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
        )
        .flush([]);
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'DISMISSED',
        )
        .flush([]);
      http
        .expectOne((r) => r.url === '/api/sessions/sess-1/suggestions' && !r.params.has('status'))
        .flush([]);
      http
        .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
        .flush(page<SuggestionResponse>([]));
    }

    const recorded = [
      {
        sequence: 0,
        text: 'We need invoice export.',
        speakerLabel: 'A',
        startMs: 0,
        endMs: 900,
        occurredAt: '2026-07-04T12:05:00Z',
      },
      {
        sequence: 1,
        text: 'And a PDF format.',
        speakerLabel: 'B',
        startMs: 1000,
        endMs: 1900,
        occurredAt: '2026-07-04T12:05:30Z',
      },
    ];

    it('renders the recorded transcript as timed segment bubbles and nulls the string', () => {
      flushLiveBlock({
        segments: recorded,
        transcript: 'We need invoice export.\nAnd a PDF format.',
      });
      http.verify();

      const items = store.blocks()[0].items;
      const segments = items.filter((i) => i.kind === 'segment');
      expect(segments).toHaveLength(2);
      // Every recorded bubble carries its real occurredAt (drives HH:mm display).
      const times = segments.map((i) => (i.kind === 'segment' ? i.segment.occurredAt : ''));
      expect(times).toEqual(['2026-07-04T12:05:00Z', '2026-07-04T12:05:30Z']);
      // The joined string fallback must NOT also render (no duplicated paragraphs).
      expect(items.some((i) => i.kind === 'paragraph')).toBe(false);
    });

    it('falls back to the joined transcript string when /segments 404s (older backend)', () => {
      flushLiveBlock({ segments: [], segmentsStatus: 404, transcript: 'Persisted line one.' });
      http.verify();

      const items = store.blocks()[0].items;
      expect(items.some((i) => i.kind === 'segment')).toBe(false);
      const paragraphs = items.filter((i) => i.kind === 'paragraph');
      expect(paragraphs).toHaveLength(1);
      expect(paragraphs[0].kind === 'paragraph' && paragraphs[0].text).toBe('Persisted line one.');
    });

    it('falls back to the string when /segments returns an empty page', () => {
      flushLiveBlock({ segments: [], transcript: 'Only the string exists.' });
      http.verify();

      const items = store.blocks()[0].items;
      expect(items.some((i) => i.kind === 'segment')).toBe(false);
      expect(items.filter((i) => i.kind === 'paragraph')).toHaveLength(1);
    });

    it('a live WS segment at an existing sequence replaces the historical one (no duplication)', () => {
      // A live segment for seq 1 arrives BEFORE the /segments response is flushed.
      flushInit([session({ status: 'RECORDING', endedAt: null })]);
      const topic = realtime.watch('sessions/sess-1');
      topic.next({
        sessionId: 'sess-1',
        type: 'TRANSCRIPT_SEGMENT',
        occurredAt: '2026-07-04T12:06:00Z',
        sequence: 1,
        speakerLabel: 'B',
        text: 'live final for seq 1',
        startMs: 1000,
        endMs: 1900,
        isFinal: true,
      });

      // Now the recorded segments (incl. its own seq 1) arrive.
      http.expectOne((r) => r.url === '/api/sessions/sess-1/segments').flush(recorded);
      http
        .expectOne('/api/sessions/sess-1/transcript')
        .flush({ sessionId: 'sess-1', transcript: 'joined string' });
      http.expectOne('/api/sessions/sess-1/stories').flush(page<UserStoryResponse>([]));
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
        )
        .flush([]);
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'DISMISSED',
        )
        .flush([]);
      http
        .expectOne((r) => r.url === '/api/sessions/sess-1/suggestions' && !r.params.has('status'))
        .flush([]);
      http
        .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
        .flush(page<SuggestionResponse>([]));
      http.verify();

      const segments = store.blocks()[0].items.filter((i) => i.kind === 'segment');
      // Exactly one bubble per sequence — no duplicate at seq 1.
      expect(segments).toHaveLength(2);
      const seqOne = segments.find((i) => i.kind === 'segment' && i.segment.sequence === 1);
      // The LIVE final text wins over the historical one at the same sequence.
      expect(seqOne?.kind === 'segment' && seqOne.segment.text).toBe('live final for seq 1');
    });
  });

  describe('stopped-block global chronological ordering', () => {
    it('interleaves segments and decisions by absolute time (not grouped)', () => {
      // Real case: a STOPPED session with recorded segments spoken 21:18–21:20
      // and decisions resolved 21:19–21:22. They must weave by time, not render
      // as "all decisions, then all segments".
      flushInit([session({ status: 'STOPPED' })]);
      http
        .expectOne((r) => r.url === '/api/sessions/sess-1/segments')
        .flush([
          {
            sequence: 0,
            text: 's@21:18',
            speakerLabel: 'A',
            startMs: 0,
            endMs: 900,
            occurredAt: '2026-07-04T21:18:00Z',
          },
          {
            sequence: 1,
            text: 's@21:19',
            speakerLabel: 'A',
            startMs: 1000,
            endMs: 1900,
            occurredAt: '2026-07-04T21:19:30Z',
          },
          {
            sequence: 2,
            text: 's@21:20',
            speakerLabel: 'A',
            startMs: 2000,
            endMs: 2900,
            occurredAt: '2026-07-04T21:20:00Z',
          },
        ]);
      http
        .expectOne('/api/sessions/sess-1/transcript')
        .flush({ sessionId: 'sess-1', transcript: 'joined' });
      http.expectOne('/api/sessions/sess-1/stories').flush(page<UserStoryResponse>([]));
      // Two accepted decisions, resolved between/after the segments.
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
        )
        .flush([
          suggestion({
            id: 'd-1',
            status: 'ACCEPTED',
            resolvedStoryId: null,
            resolvedAt: '2026-07-04T21:19:00Z',
          }),
          suggestion({
            id: 'd-2',
            status: 'ACCEPTED',
            resolvedStoryId: null,
            resolvedAt: '2026-07-04T21:22:00Z',
          }),
        ]);
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'DISMISSED',
        )
        .flush([]);
      http
        .expectOne((r) => r.url === '/api/sessions/sess-1/suggestions' && !r.params.has('status'))
        .flush([]);
      http
        .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
        .flush(page<SuggestionResponse>([]));
      http.verify();

      const items = store.blocks()[0].items;
      // Global time order: s@21:18, d@21:19, s@21:19:30, s@21:20, d@21:22.
      // Crucially a decision resolved 21:19 lands BETWEEN the 21:18 and 21:19:30
      // segments rather than being grouped ahead of every segment.
      expect(items.map((i) => i.kind)).toEqual([
        'segment',
        'decision',
        'segment',
        'segment',
        'decision',
      ]);
      // No timeless paragraph fallback leaks in (structured segments were used).
      expect(items.some((i) => i.kind === 'paragraph')).toBe(false);
    });

    it('keeps the anchored/paragraph path for the string fallback (no segments)', () => {
      // A STOPPED session on an older backend: /segments 404s → joined string.
      flushInit([session({ status: 'STOPPED' })]);
      http
        .expectOne((r) => r.url === '/api/sessions/sess-1/segments')
        .flush(null, { status: 404, statusText: 'Not Found' });
      http
        .expectOne('/api/sessions/sess-1/transcript')
        .flush({ sessionId: 'sess-1', transcript: 'line one\nline two' });
      http.expectOne('/api/sessions/sess-1/stories').flush(page<UserStoryResponse>([]));
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
        )
        .flush([]);
      http
        .expectOne(
          (r) =>
            r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'DISMISSED',
        )
        .flush([]);
      http
        .expectOne((r) => r.url === '/api/sessions/sess-1/suggestions' && !r.params.has('status'))
        .flush([]);
      http
        .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
        .flush(page<SuggestionResponse>([]));
      http.verify();

      const items = store.blocks()[0].items;
      // The string still renders as paragraphs (no structured segments to sort).
      expect(items.filter((i) => i.kind === 'paragraph')).toHaveLength(2);
      expect(items.some((i) => i.kind === 'segment')).toBe(false);
    });
  });

  describe('presence', () => {
    const at = '2026-07-04T12:00:00Z';

    function goLive(sessionId: string): void {
      store.applyRealtime({ sessionId, type: 'RECORDING_STARTED', occurredAt: at });
    }

    it('surfaces the roster for the live session', () => {
      flushInit([]);
      goLive('sess-1');

      store.applyRealtime({
        sessionId: 'sess-1',
        type: 'PRESENCE_STATE',
        occurredAt: at,
        count: 2,
        participants: [
          { userId: 'u1', displayName: 'Ana', avatarUrl: '/api/users/u1/avatar' },
          { userId: 'u2', displayName: 'Beto', avatarUrl: '/api/users/u2/avatar' },
        ],
      });

      expect(store.activeParticipantCount()).toBe(2);
      expect(store.activeParticipants().map((p) => p.displayName)).toEqual(['Ana', 'Beto']);
    });

    it('does not surface presence for a session that is not the live one', () => {
      flushInit([]);
      goLive('sess-1');

      store.applyRealtime({
        sessionId: 'other',
        type: 'PRESENCE_STATE',
        occurredAt: at,
        count: 1,
        participants: [{ userId: 'u9', displayName: 'Ghost', avatarUrl: '/api/users/u9/avatar' }],
      });

      expect(store.activeParticipants()).toEqual([]);
    });

    it('clears presence on reset', () => {
      flushInit([]);
      goLive('sess-1');
      store.applyRealtime({
        sessionId: 'sess-1',
        type: 'PRESENCE_STATE',
        occurredAt: at,
        count: 1,
        participants: [{ userId: 'u1', displayName: 'Ana', avatarUrl: '/api/users/u1/avatar' }],
      });
      expect(store.activeParticipantCount()).toBe(1);

      store.reset();

      expect(store.activeParticipants()).toEqual([]);
    });
  });
});
