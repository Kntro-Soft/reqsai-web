import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { AssistantChatStore } from './assistant-chat.store';
import { VERIFY_TIMEOUT_MS } from './code-verification';
import { AssistantMessageResponse, SuggestionResponse } from './discovery.models';

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

function chatSuggestion(): SuggestionResponse {
  return {
    id: 'sug-1',
    sessionId: null,
    projectId: 'proj-1',
    type: 'NEW_STORY',
    status: 'PENDING',
    draftTitle: 'Cancelar reserva',
    draftRole: 'comensal',
    draftAction: 'cancelar',
    draftBenefit: 'no perder dinero',
    draftPriority: 'HIGH',
    draftStoryPoints: 3,
    relatedTopic: null,
    targetStoryId: null,
    question: null,
    resolvedStoryId: null,
    createdAt: '2026-10-11T10:00:00Z',
    updatedAt: '2026-10-11T10:00:00Z',
  };
}

function reply(): AssistantMessageResponse {
  return {
    id: 'm-2',
    role: 'ASSISTANT',
    content: 'Preparé una sugerencia.',
    createdAt: '2026-10-11T10:00:01Z',
    suggestions: [chatSuggestion()],
  };
}

describe('AssistantChatStore deep verification', () => {
  let store: AssistantChatStore;
  let http: HttpTestingController;
  let realtime: FakeRealtimeService;
  const VERIFY_URL = '/api/projects/proj-1/suggestions/sug-1/verify-code';

  beforeEach(() => {
    realtime = new FakeRealtimeService();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RealtimeService, useValue: realtime },
        AssistantChatStore,
      ],
    });
    store = TestBed.inject(AssistantChatStore);
    http = TestBed.inject(HttpTestingController);
    store.load('proj-1');
    http.expectOne((r) => r.url === '/api/projects/proj-1/assistant/messages').flush([reply()]);
  });

  const state = () => store.messages()[0].suggestions[0].code?.verifyState ?? null;

  it('shows the chat card as verifying, then applies the verdict from the project topic', () => {
    store.verifyCode(store.messages()[0].suggestions[0]).subscribe();
    expect(state()).toBe('VERIFYING');
    http
      .expectOne(VERIFY_URL)
      .flush(
        {
          ...chatSuggestion(),
          code: { finding: null, note: null, references: [], verifyState: 'VERIFYING' },
        },
        { status: 202, statusText: 'Accepted' },
      );

    realtime.watch('projects/proj-1/suggestions').next({
      type: 'SUGGESTION_CODE_UPDATED',
      sessionId: null,
      projectId: 'proj-1',
      suggestionId: 'sug-1',
      occurredAt: '2026-10-11T10:00:20Z',
      code: {
        finding: null,
        note: 'No aparece.',
        references: [],
        verdict: 'NOT_FOUND',
        verifyState: 'VERIFIED',
        verifiedAt: '2026-10-11T10:00:20Z',
      },
    });

    const code = store.messages()[0].suggestions[0].code!;
    expect(code.verifyState).toBe('VERIFIED');
    expect(code.verdict).toBe('NOT_FOUND');
    http.verify();
  });

  it('marks the card failed when the request is refused', () => {
    const errors: unknown[] = [];

    store
      .verifyCode(store.messages()[0].suggestions[0])
      .subscribe({ error: (e) => errors.push(e) });
    http.expectOne(VERIFY_URL).flush(null, { status: 409, statusText: 'Conflict' });

    expect(errors).toHaveLength(1);
    expect(state()).toBe('FAILED');
  });

  it('gives up on a verdict that never arrives', () => {
    vi.useFakeTimers();
    try {
      store.verifyCode(store.messages()[0].suggestions[0]).subscribe();
      http.expectOne(VERIFY_URL).flush({
        ...chatSuggestion(),
        code: { finding: null, note: null, references: [], verifyState: 'VERIFYING' },
      });

      vi.advanceTimersByTime(VERIFY_TIMEOUT_MS + 1);

      expect(state()).toBe('FAILED');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores updates for suggestions the chat does not hold, and other message types', () => {
    realtime.watch('projects/proj-1/suggestions').next({
      type: 'SUGGESTION_CODE_UPDATED',
      suggestionId: 'unknown',
      code: { finding: null, note: null, references: [], verifyState: 'VERIFIED' },
    });
    realtime
      .watch('projects/proj-1/suggestions')
      .next({ type: 'SOMETHING_ELSE', suggestionId: 'sug-1' });

    expect(state()).toBeNull();
  });
});
