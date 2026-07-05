import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { clampQueueIndex } from '../../data/feed';
import { DiscoveryChatStore } from '../../data/discovery-chat.store';
import { DisplayStory, SuggestionResponse } from '../../data/discovery.models';
import { DecisionQueue } from './decision-queue';

/**
 * A minimal in-memory stand-in for {@link DiscoveryChatStore} exposing only the
 * surface the decision queue reads. Lets the test drive the pending queue
 * directly without any HTTP/WebSocket wiring.
 */
class FakeStore {
  private readonly _queue = signal<SuggestionResponse[]>([]);
  private readonly _queueIndex = signal(0);
  private readonly _deciding = signal<readonly string[]>([]);

  readonly queue = this._queue.asReadonly();
  readonly queueIndex = this._queueIndex.asReadonly();
  readonly deciding = this._deciding.asReadonly();
  readonly currentSuggestion = computed<SuggestionResponse | null>(() => {
    const q = this._queue();
    if (q.length === 0) return null;
    return q[clampQueueIndex(this._queueIndex(), q.length)];
  });

  setQueue(list: SuggestionResponse[]): void {
    this._queue.set(list);
  }
  setQueueIndex(index: number): void {
    this._queueIndex.set(clampQueueIndex(index, this._queue().length));
  }
  findStory(): DisplayStory | undefined {
    return undefined;
  }
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
    createdAt: '2026-07-04T12:10:00Z',
    updatedAt: '2026-07-04T12:10:00Z',
    ...overrides,
  };
}

describe('DecisionQueue', () => {
  let store: FakeStore;

  beforeEach(() => {
    store = new FakeStore();
    TestBed.configureTestingModule({
      imports: [DecisionQueue, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [{ provide: DiscoveryChatStore, useValue: store }],
    });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(DecisionQueue);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows nothing while the queue is empty', () => {
    const el = render();
    expect(el.querySelector('[data-testid="decision-queue"]')).toBeNull();
  });

  it('renders the FIRST pending suggestion as a floating card immediately (no minimum count)', () => {
    store.setQueue([suggestion()]);
    const el = render();

    // The queue container and the card are both present with a single item.
    expect(el.querySelector('[data-testid="decision-queue"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="suggestion-card"]')).not.toBeNull();
    // The collapsed badge must NOT be shown for a single suggestion.
    expect(el.querySelector('[data-testid="queue-badge"]')).toBeNull();
  });

  it('keeps showing the card (not the badge) for up to three pending suggestions', () => {
    store.setQueue([suggestion({ id: 'a' }), suggestion({ id: 'b' }), suggestion({ id: 'c' })]);
    const el = render();

    expect(el.querySelector('[data-testid="suggestion-card"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="queue-badge"]')).toBeNull();
  });

  it('stays expanded when a fourth suggestion arrives (never auto-minimizes)', () => {
    store.setQueue([suggestion({ id: 'a' }), suggestion({ id: 'b' }), suggestion({ id: 'c' })]);
    const fixture = TestBed.createComponent(DecisionQueue);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    // A fourth pending suggestion arrives (3 → 4) — the overlay must NOT collapse.
    store.setQueue([
      suggestion({ id: 'a' }),
      suggestion({ id: 'b' }),
      suggestion({ id: 'c' }),
      suggestion({ id: 'd' }),
    ]);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="queue-badge"]')).toBeNull();
    expect(el.querySelector('[data-testid="suggestion-card"]')).not.toBeNull();
  });

  it('collapses to a badge with the live count only on the explicit minimize action', () => {
    store.setQueue([suggestion({ id: 'a' }), suggestion({ id: 'b' }), suggestion({ id: 'c' })]);
    const fixture = TestBed.createComponent(DecisionQueue);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    // No badge until the user clicks minimize.
    expect(el.querySelector('[data-testid="queue-badge"]')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid="queue-collapse"]')!.click();
    fixture.detectChanges();

    const badge = el.querySelector('[data-testid="queue-badge"]');
    expect(badge).not.toBeNull();
    expect(el.querySelector('[data-testid="queue-badge-count"]')?.textContent?.trim()).toBe('3');
    expect(el.querySelector('[data-testid="suggestion-card"]')).toBeNull();
  });

  it('once minimized, stays minimized while more suggestions arrive (count keeps rising)', () => {
    store.setQueue([suggestion({ id: 'a' })]);
    const fixture = TestBed.createComponent(DecisionQueue);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('[data-testid="queue-collapse"]')!.click();
    fixture.detectChanges();

    store.setQueue([suggestion({ id: 'a' }), suggestion({ id: 'b' }), suggestion({ id: 'c' })]);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="queue-badge"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="queue-badge-count"]')?.textContent?.trim()).toBe('3');
  });

  it('shows the "n de m" counter in the corner tab of the active card', () => {
    store.setQueue([suggestion({ id: 'a' }), suggestion({ id: 'b' })]);
    const el = render();

    const tab = el.querySelector('[data-testid="queue-counter"]');
    expect(tab).not.toBeNull();
    // The Transloco test module has no messages, so it echoes the key; the point
    // is the counter lives in a dedicated tab element, not overlapping the body.
    expect(tab?.classList.contains('queue-tab')).toBe(true);
  });

  it('renders no decorative stack behind a single pending card', () => {
    store.setQueue([suggestion()]);
    const el = render();
    expect(el.querySelectorAll('[data-testid="queue-stack-layer"]')).toHaveLength(0);
  });

  it('renders one stack edge per remaining pending card behind the active one', () => {
    store.setQueue([suggestion({ id: 'a' }), suggestion({ id: 'b' }), suggestion({ id: 'c' })]);
    const el = render();
    // Three pending → two edges behind the top card.
    expect(el.querySelectorAll('[data-testid="queue-stack-layer"]')).toHaveLength(2);
  });

  it('offers the top drag handle only when more than one suggestion is pending', () => {
    store.setQueue([suggestion()]);
    const el = render();
    // A lone card has nowhere to navigate — no drag handle.
    expect(el.querySelector('[data-testid="queue-drag"]')).toBeNull();

    store.setQueue([suggestion({ id: 'a' }), suggestion({ id: 'b' })]);
    const el2 = render();
    const handle = el2.querySelector('[data-testid="queue-drag"]');
    expect(handle).not.toBeNull();
    // pan-y keeps vertical page scroll working while a horizontal drag swipes.
    expect(handle?.classList.contains('touch-pan-y')).toBe(true);
  });
});
