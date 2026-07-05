import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { DiscoveryChatStore } from './discovery-chat.store';
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
});
