import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { DECIDE_RETRY_DELAY_MS, DiscoveryChatStore } from './discovery-chat.store';
import {
  DiscoverySessionResponse,
  PageResponse,
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
        (r) => r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
      )
      .flush([suggestion()]);
    http
      .expectOne(
        (r) =>
          r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'DISMISSED',
      )
      .flush([
        suggestion({ id: 'sug-2', status: 'DISMISSED', draftTitle: 'Out of scope', type: 'EDGE_CASE' }),
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

    // Live block: transcript + stories + resolved decisions (no segments endpoint).
    http.expectOne('/api/sessions/sess-1/transcript').flush({
      sessionId: 'sess-1',
      transcript: 'We need invoice export.',
    });
    http.expectOne('/api/sessions/sess-1/stories').flush(page([story()]));
    http
      .expectOne(
        (r) => r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
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
    http.expectOne('/api/sessions/sess-1/transcript').flush({ sessionId: 'sess-1', transcript: null });
    http.expectOne('/api/sessions/sess-1/stories').flush(page<UserStoryResponse>([]));
    http
      .expectOne(
        (r) => r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
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
    http.expectOne('/api/sessions/sess-1/transcript').flush({ sessionId: 'sess-1', transcript: null });
    http.expectOne('/api/sessions/sess-1/stories').flush(page<UserStoryResponse>([]));
    http
      .expectOne(
        (r) => r.url === '/api/sessions/sess-1/suggestions' && r.params.get('status') === 'ACCEPTED',
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

    realtime.watch('projects/proj-1').next({
      sessionId: 'live-1',
      status: 'RECORDING',
      title: 'Weekly sync',
      language: 'en-US',
      startedAt: '2026-07-04T15:00:00Z',
    });

    // The synthesized block loads like any live block.
    http.expectOne('/api/sessions/live-1/transcript').flush({ sessionId: 'live-1', transcript: null });
    http.expectOne('/api/sessions/live-1/stories').flush(page<UserStoryResponse>([]));
    http
      .expectOne(
        (r) => r.url === '/api/sessions/live-1/suggestions' && r.params.get('status') === 'ACCEPTED',
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
    realtime.watch('projects/proj-1').next({ sessionId: 'live-1', status: 'STOPPED' });
    expect(store.liveSession()).toBeNull();
    expect(store.blocks().find((b) => b.session.id === 'live-1')?.session.status).toBe('STOPPED');
  });

  it('tolerates malformed or unknown project lifecycle payloads', () => {
    flushInit([]);
    http
      .expectOne((r) => r.url === '/api/projects/proj-1/suggestions')
      .flush(page<SuggestionResponse>([]));

    realtime.watch('projects/proj-1').next({} as never);
    realtime.watch('projects/proj-1').next({ sessionId: 'live-9', status: 'SOMETHING_NEW' });

    http.verify();
    expect(store.liveSession()).toBeNull();
    expect(store.blocks()).toHaveLength(0);
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
});
