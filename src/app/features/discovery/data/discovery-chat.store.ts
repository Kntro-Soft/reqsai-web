import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subscription, forkJoin, of, tap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { DiscoveryApiService } from './discovery-api.service';
import { SessionRecordingService } from './session-recording.service';
import {
  AcceptSuggestionRequest,
  DiscoverySessionResponse,
  DisplayStory,
  SessionEventType,
  SessionProcessingFailedMessage,
  SessionRealtimeMessage,
  SessionStatus,
  SessionStoryGeneratedMessage,
  SessionSuggestionMessage,
  SessionTranscriptSegmentMessage,
  SuggestionResponse,
  UserStoryResponse,
} from './discovery.models';
import {
  FeedItem,
  SessionBlock,
  addToQueue,
  buildSessionItems,
  clampQueueIndex,
  historicalSegmentToMessage,
  lastSequence,
  lowestSequence,
  normalizeSegmentPage,
  removeFromQueue,
  toDecisionEntry,
  upsertSegment,
} from './feed';

/** Sessions fetched per page while scrolling back through history. */
const PAGE_SIZE = 10;

/** Statuses that can still produce realtime events worth subscribing to. */
const LIVE_STATUSES: readonly SessionStatus[] = ['DRAFT', 'RECORDING', 'PAUSED', 'STOPPED', 'PROCESSING'];

/** Maps a realtime event to the session status it implies (segment/story carry no status). */
const STATUS_BY_EVENT: Partial<Record<SessionEventType, SessionStatus>> = {
  RECORDING_STARTED: 'RECORDING',
  RECORDING_PAUSED: 'PAUSED',
  RECORDING_RESUMED: 'RECORDING',
  RECORDING_STOPPED: 'STOPPED',
  TRANSCRIPT_UPLOADED: 'STOPPED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

/** Statuses that never emit further realtime events — their content is loaded as a static timeline. */
const HISTORICAL_STATUSES: readonly SessionStatus[] = ['COMPLETED', 'FAILED'];

/** Normalizes a REST user story into the chat's display shape. */
function toDisplayStory(story: UserStoryResponse): DisplayStory {
  return {
    id: story.id,
    title: story.title,
    role: story.role,
    action: story.action,
    benefit: story.benefit,
    priority: story.priority,
    storyPoints: story.storyPoints,
    createdAt: story.createdAt ?? null,
  };
}

/** A render-ready session chunk: the session plus its assembled feed items. */
export interface RenderBlock {
  session: DiscoverySessionResponse;
  items: FeedItem[];
  loaded: boolean;
}

/**
 * Signal store for the chat-centric discovery view: session blocks loaded
 * progressively (newest first, older on demand), live realtime merging, the
 * pending-suggestion decision queue and the pending-from-previous chip.
 */
@Injectable({ providedIn: 'root' })
export class DiscoveryChatStore {
  private readonly api = inject(DiscoveryApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly recording = inject(SessionRecordingService);

  private projectId: string | null = null;
  /** All sessions fetched so far, newest first (mirror of the paginated list). */
  private sessionsCache: DiscoverySessionResponse[] = [];
  private nextPage = 0;
  private morePages = false;
  private readonly topicSubscriptions = new Map<string, Subscription>();

  // Blocks are kept oldest -> newest, matching the feed's reading order.
  private readonly _blocks = signal<SessionBlock[]>([]);
  private readonly _state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private readonly _loadingOlder = signal(false);
  private readonly _queue = signal<SuggestionResponse[]>([]);
  private readonly _queueIndex = signal(0);
  private readonly _pendingPrevious = signal<SuggestionResponse[]>([]);
  private readonly _projectStories = signal<DisplayStory[]>([]);
  private readonly _focusSessionId = signal<string | null>(null);

  readonly state = this._state.asReadonly();
  readonly queue = this._queue.asReadonly();
  readonly queueIndex = this._queueIndex.asReadonly();
  readonly pendingPrevious = this._pendingPrevious.asReadonly();
  /** Session id the feed should scroll to (set by history/409 flows). */
  readonly focusSessionId = this._focusSessionId.asReadonly();

  /** The topmost (oldest loaded) block still has older segments to page in. */
  private readonly hasOlderSegments = computed(() => {
    const top = this._blocks()[0];
    return !!top && top.hasMoreSegments;
  });

  /**
   * True while more history can be revealed by scrolling up — either older
   * segments of the topmost session, or an older session entirely.
   */
  readonly hasOlder = computed(
    () =>
      this.hasOlderSegments() ||
      this.morePagesSignal() ||
      this._blocks().length < this.cacheSizeSignal(),
  );
  // Mirrors of the private pagination fields, so hasOlder stays reactive.
  private readonly morePagesSignal = signal(false);
  private readonly cacheSizeSignal = signal(0);

  /** True while either an older session or an older segment chunk is loading. */
  readonly loadingOlder = computed(
    () => this._loadingOlder() || (this._blocks()[0]?.loadingSegments ?? false),
  );

  /** Render-ready blocks, oldest first, feed items assembled per session. */
  readonly blocks = computed<RenderBlock[]>(() =>
    this._blocks().map((block) => ({
      session: block.session,
      items: buildSessionItems(block),
      loaded: block.loaded,
    })),
  );

  /** The suggestion currently shown by the decision-queue carousel. */
  readonly currentSuggestion = computed<SuggestionResponse | null>(() => {
    const queue = this._queue();
    if (queue.length === 0) return null;
    return queue[clampQueueIndex(this._queueIndex(), queue.length)];
  });

  /** (Re)initializes the store for a project; safe to call on every page entry. */
  init(projectId: string): void {
    if (this.projectId === projectId && this._state() !== 'idle' && this._state() !== 'error') {
      return;
    }
    this.reset();
    this.projectId = projectId;
    this._state.set('loading');

    this.api.listSessions(projectId, 0, PAGE_SIZE).subscribe({
      next: (page) => {
        this.sessionsCache = page.content;
        this.cacheSizeSignal.set(this.sessionsCache.length);
        this.nextPage = 1;
        this.morePages = page.page?.hasNext ?? page.page.number + 1 < page.page.totalPages;
        this.morePagesSignal.set(this.morePages);
        const newest = this.sessionsCache[0];
        if (newest) {
          this.appendBlock(newest, 'newest');
          // A session that is still live anywhere becomes the tracked one.
          if (newest.status === 'RECORDING' || newest.status === 'PAUSED') {
            this.recording.attach(newest);
          }
        }
        this._state.set('ready');
        this.checkPendingPrevious();
      },
      error: () => this._state.set('error'),
    });

    // Project backlog, so UPDATE_STORY/EDGE_CASE targets resolve in cards and the panel.
    this.refreshProjectStories();
  }

  /** Clears all state and realtime subscriptions (project switch / re-entry). */
  reset(): void {
    for (const sub of this.topicSubscriptions.values()) sub.unsubscribe();
    this.topicSubscriptions.clear();
    this.projectId = null;
    this.sessionsCache = [];
    this.cacheSizeSignal.set(0);
    this.nextPage = 0;
    this.morePages = false;
    this.morePagesSignal.set(false);
    this._blocks.set([]);
    this._state.set('idle');
    this._loadingOlder.set(false);
    this._queue.set([]);
    this._queueIndex.set(0);
    this._pendingPrevious.set([]);
    this._projectStories.set([]);
    this._focusSessionId.set(null);
  }

  /**
   * Reveals the next older slice of history when the feed is scrolled up. Pages
   * within the topmost session first (older segments), and only once that
   * session's segments are exhausted moves on to the previous session.
   */
  loadOlder(): void {
    const projectId = this.projectId;
    if (!projectId || this._loadingOlder() || !this.hasOlder()) return;

    // Intra-session first: drain the topmost session's older segments.
    const top = this._blocks()[0];
    if (top && top.hasMoreSegments) {
      this.loadOlderSegments(top.session.id);
      return;
    }

    const nextIndex = this._blocks().length;
    const cached = this.sessionsCache[nextIndex];
    if (cached) {
      this.appendBlock(cached, 'oldest');
      return;
    }
    if (!this.morePages) return;

    this._loadingOlder.set(true);
    this.api.listSessions(projectId, this.nextPage, PAGE_SIZE).subscribe({
      next: (page) => {
        this.sessionsCache = [...this.sessionsCache, ...page.content];
        this.cacheSizeSignal.set(this.sessionsCache.length);
        this.nextPage += 1;
        this.morePages = page.page?.hasNext ?? page.page.number + 1 < page.page.totalPages;
        this.morePagesSignal.set(this.morePages);
        this._loadingOlder.set(false);
        const next = this.sessionsCache[this._blocks().length];
        if (next) this.appendBlock(next, 'oldest');
      },
      error: () => this._loadingOlder.set(false),
    });
  }

  /** Registers a session created by the record button as the newest feed block. */
  addNewSession(session: DiscoverySessionResponse): void {
    this.sessionsCache = [session, ...this.sessionsCache];
    this.cacheSizeSignal.set(this.sessionsCache.length);
    this.appendBlock(session, 'newest');
    this._focusSessionId.set(session.id);
  }

  /**
   * Makes a specific session visible in the feed (history row click, 409
   * already-active flow). Inserts the block in chronological position when it
   * was not progressively loaded yet — older gaps may remain unloaded.
   */
  showSession(sessionId: string): void {
    const existing = this._blocks().find((b) => b.session.id === sessionId);
    if (existing) {
      this._focusSessionId.set(sessionId);
      return;
    }
    const projectId = this.projectId;
    if (!projectId) return;
    this.api.getSession(projectId, sessionId).subscribe({
      next: (session) => {
        if (!this.sessionsCache.some((s) => s.id === session.id)) {
          this.sessionsCache = [...this.sessionsCache, session];
          this.cacheSizeSignal.set(this.sessionsCache.length);
        }
        this.appendBlock(session, 'sorted');
        if (session.status === 'RECORDING' || session.status === 'PAUSED') {
          this.recording.attach(session);
        }
        this._focusSessionId.set(session.id);
      },
    });
  }

  /** Clears the scroll-to request once the page has honoured it. */
  clearFocus(): void {
    this._focusSessionId.set(null);
  }

  // ---- Decision queue ----

  setQueueIndex(index: number): void {
    this._queueIndex.set(clampQueueIndex(index, this._queue().length));
  }

  /** Accepts or dismisses the suggestion; the feed gains an immutable decision entry. */
  decide(
    suggestion: SuggestionResponse,
    outcome: 'ACCEPTED' | 'DISMISSED',
    body: AcceptSuggestionRequest = {},
  ): Observable<SuggestionResponse> {
    const call =
      outcome === 'ACCEPTED'
        ? this.api.acceptSuggestion(suggestion.sessionId, suggestion.id, body)
        : this.api.dismissSuggestion(suggestion.sessionId, suggestion.id);
    return call.pipe(
      tap((resolved) => {
        this.removeQueued(suggestion.id);
        this.recordDecision(resolved.status === 'DISMISSED' ? 'DISMISSED' : 'ACCEPTED', resolved);
        if (outcome === 'ACCEPTED') this.refreshProjectStories();
      }),
    );
  }

  /** Drops a suggestion someone else already resolved (409) without feed changes. */
  removeQueued(suggestionId: string): void {
    this._queue.update((queue) => removeFromQueue(queue, suggestionId));
    this._pendingPrevious.update((list) => removeFromQueue(list, suggestionId));
    this._queueIndex.update((index) => clampQueueIndex(index, this._queue().length));
  }

  /** Moves the pending-from-previous suggestions into the decision queue. */
  openPendingPrevious(): void {
    const previous = this._pendingPrevious();
    if (previous.length === 0) return;
    this._queue.update((queue) => previous.reduce(addToQueue, [...queue]));
    this._pendingPrevious.set([]);
  }

  /** Resolves a story by id across loaded blocks and the project backlog. */
  findStory(id: string): DisplayStory | undefined {
    for (const block of this._blocks()) {
      const hit = block.stories.find((s) => s.id === id);
      if (hit) return hit;
    }
    return this._projectStories().find((s) => s.id === id);
  }

  /** The project backlog (feeds the side panel's Stories tab). */
  readonly projectStories = this._projectStories.asReadonly();

  refreshProjectStories(): void {
    const projectId = this.projectId;
    if (!projectId) return;
    this.api.listProjectStories(projectId).subscribe({
      next: (page) => this._projectStories.set(page.content.map(toDisplayStory)),
      error: () => undefined,
    });
  }

  // ---- Internals ----

  /**
   * Creates a block for the session, fetches its transcript/stories, wires the
   * realtime topic when the session can still emit events, and — for the
   * newest block — pulls its pending suggestions into the decision queue.
   */
  private appendBlock(
    session: DiscoverySessionResponse,
    position: 'newest' | 'oldest' | 'sorted',
  ): void {
    if (this._blocks().some((b) => b.session.id === session.id)) return;
    const historical = HISTORICAL_STATUSES.includes(session.status);
    const block: SessionBlock = {
      session,
      transcript: null,
      segments: [],
      decisions: [],
      stories: [],
      chronological: historical,
      hasMoreSegments: false,
      loadingSegments: false,
      loaded: false,
    };
    this._blocks.update((blocks) => {
      if (position === 'newest') return [...blocks, block];
      if (position === 'oldest') return [block, ...blocks];
      return [...blocks, block].sort(
        (a, b) => Date.parse(a.session.createdAt) - Date.parse(b.session.createdAt),
      );
    });

    if (historical) {
      this.loadHistoricalBlock(session);
    } else {
      this.loadLiveBlock(session);
    }

    if (LIVE_STATUSES.includes(session.status)) {
      this.subscribeTopic(session.id);
    }
    if (position === 'newest') {
      this.api.listSuggestions(session.id).subscribe({
        next: (pending) =>
          this._queue.update((queue) => pending.reduce(addToQueue, [...queue])),
        error: () => undefined,
      });
    }
  }

  /**
   * Live / in-progress block: the joined transcript string plus stories. Live
   * segments arrive over the realtime topic and merge by sequence. Decisions
   * already resolved on the session (e.g. the page was reloaded between STOP
   * and COMPLETED, or another user decided before we joined) are fetched too,
   * so the timeline never loses past accept/dismiss markers.
   */
  private loadLiveBlock(session: DiscoverySessionResponse): void {
    forkJoin({
      transcript: this.api.getTranscript(session.id).pipe(
        map((r) => r.transcript),
        catchError(() => of(null)),
      ),
      stories: this.api.listSessionStories(session.id).pipe(
        map((page) => page.content.map(toDisplayStory)),
        catchError(() => of([] as DisplayStory[])),
      ),
      decisions: this.loadResolvedDecisions(session.id),
    }).subscribe(({ transcript, stories, decisions }) => {
      this.updateBlock(session.id, (b) => ({
        ...b,
        transcript,
        stories,
        // Keep decisions recorded live while the fetch was in flight.
        decisions: [
          ...decisions,
          ...b.decisions.filter((d) => !decisions.some((r) => r.id === d.id)),
        ],
        loaded: true,
      }));
    });
  }

  /**
   * Historical (completed/failed) block: the latest chunk of structured
   * segments, this session's resolved decisions, and its stories — all merged
   * chronologically. Falls back to the joined transcript string when the
   * segments endpoint 404s on an older backend.
   */
  private loadHistoricalBlock(session: DiscoverySessionResponse): void {
    forkJoin({
      segmentPage: this.api.listSessionSegments(session.id).pipe(
        map(normalizeSegmentPage),
        map((page) => ({ page, ok: true as const })),
        catchError(() => of({ page: { segments: [], hasMore: false }, ok: false as const })),
      ),
      transcript: this.api.getTranscript(session.id).pipe(
        map((r) => r.transcript),
        catchError(() => of(null)),
      ),
      stories: this.api.listSessionStories(session.id).pipe(
        map((page) => page.content.map(toDisplayStory)),
        catchError(() => of([] as DisplayStory[])),
      ),
      decisions: this.loadResolvedDecisions(session.id),
    }).subscribe(({ segmentPage, transcript, stories, decisions }) => {
      const segments = segmentPage.ok
        ? segmentPage.page.segments.map((s) => historicalSegmentToMessage(session.id, s))
        : [];
      this.updateBlock(session.id, (b) => ({
        ...b,
        // Structured segments supersede the joined string; keep the string only
        // as the fallback when the segments endpoint was unavailable.
        transcript: segmentPage.ok ? null : transcript,
        segments,
        stories,
        decisions,
        hasMoreSegments: segmentPage.ok && segmentPage.page.hasMore,
        loaded: true,
      }));
    });
  }

  /**
   * Fetches a historical session's ACCEPTED + DISMISSED suggestions and turns
   * them into decision entries (resolution timestamp as `occurredAt`). Degrades
   * to an empty list on error or on an older backend that ignores the `status`
   * filter (unresolved rows are dropped by the outcome guard).
   */
  private loadResolvedDecisions(sessionId: string) {
    const decisionsFor = (status: 'ACCEPTED' | 'DISMISSED') =>
      this.api.listSessionSuggestions(sessionId, status).pipe(
        map((list) => list.filter((s) => s.status === status)),
        catchError(() => of([] as SuggestionResponse[])),
      );
    return forkJoin({
      accepted: decisionsFor('ACCEPTED'),
      dismissed: decisionsFor('DISMISSED'),
    }).pipe(
      map(({ accepted, dismissed }) =>
        [
          ...accepted.map((s) => this.toResolvedDecision(s, 'ACCEPTED')),
          ...dismissed.map((s) => this.toResolvedDecision(s, 'DISMISSED')),
        ].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)),
      ),
    );
  }

  private toResolvedDecision(suggestion: SuggestionResponse, outcome: 'ACCEPTED' | 'DISMISSED') {
    // Prefer the resolution timestamp; fall back to updatedAt on older backends.
    const occurredAt = suggestion.resolvedAt ?? suggestion.updatedAt;
    // anchorSequence is unused in chronological mode; -1 keeps it well-formed.
    return toDecisionEntry(suggestion, outcome, -1, occurredAt);
  }

  /**
   * Intra-session scroll-up pagination: loads the segment chunk immediately
   * older than the block's lowest loaded sequence, prepending in order. No-op
   * unless the block still has older segments and none are in flight.
   */
  loadOlderSegments(sessionId: string): void {
    const block = this._blocks().find((b) => b.session.id === sessionId);
    if (!block || !block.hasMoreSegments || block.loadingSegments) return;
    const cursor = lowestSequence(block.segments);
    if (cursor === null) return;

    this.updateBlock(sessionId, (b) => ({ ...b, loadingSegments: true }));
    this.api
      .listSessionSegments(sessionId, cursor)
      .pipe(
        map(normalizeSegmentPage),
        catchError(() => of({ segments: [], hasMore: false })),
      )
      .subscribe((page) => {
        const older = page.segments.map((s) => historicalSegmentToMessage(sessionId, s));
        this.updateBlock(sessionId, (b) => ({
          ...b,
          segments: older.reduce((acc, s) => upsertSegment(acc, s), b.segments),
          hasMoreSegments: page.hasMore,
          loadingSegments: false,
        }));
      });
  }

  private subscribeTopic(sessionId: string): void {
    if (this.topicSubscriptions.has(sessionId)) return;
    const sub = this.realtime
      .watch<SessionRealtimeMessage>(`sessions/${sessionId}`)
      .subscribe((message) => this.applyRealtime(message));
    this.topicSubscriptions.set(sessionId, sub);
  }

  /** Applies an incoming realtime message to the owning block / queue. */
  applyRealtime(message: SessionRealtimeMessage): void {
    const sessionId = message.sessionId;

    if (message.type === 'TRANSCRIPT_SEGMENT') {
      const segment = message as SessionTranscriptSegmentMessage;
      this.updateBlock(sessionId, (b) => ({ ...b, segments: upsertSegment(b.segments, segment) }));
      return;
    }

    if (
      message.type === 'SUGGESTION_GENERATED' ||
      message.type === 'SUGGESTION_ACCEPTED' ||
      message.type === 'SUGGESTION_DISMISSED'
    ) {
      const event = message as SessionSuggestionMessage;
      if (event.type === 'SUGGESTION_GENERATED') {
        this._queue.update((queue) => addToQueue(queue, this.suggestionFromMessage(event)));
        return;
      }
      // Resolved (possibly by someone else): out of the queue, into the feed —
      // unless we already recorded the decision locally.
      const alreadyRecorded = this._blocks().some((b) =>
        b.decisions.some((d) => d.id === event.suggestionId),
      );
      this.removeQueued(event.suggestionId);
      if (!alreadyRecorded) {
        this.recordDecision(
          event.type === 'SUGGESTION_DISMISSED' ? 'DISMISSED' : 'ACCEPTED',
          this.suggestionFromMessage(event),
          event.occurredAt,
        );
      }
      return;
    }

    if (message.type === 'STORY_GENERATED') {
      const story = message as SessionStoryGeneratedMessage;
      this.updateBlock(sessionId, (b) =>
        b.stories.some((s) => s.id === story.storyId)
          ? b
          : {
              ...b,
              stories: [
                ...b.stories,
                {
                  id: story.storyId,
                  title: story.title,
                  role: story.role,
                  action: story.action,
                  benefit: story.benefit,
                  priority: story.priority,
                  storyPoints: story.storyPoints,
                  createdAt: story.occurredAt,
                },
              ],
            },
      );
      return;
    }

    const status = STATUS_BY_EVENT[message.type];
    if (status) {
      const error =
        message.type === 'FAILED' ? (message as SessionProcessingFailedMessage).reason : null;
      this.updateBlock(sessionId, (b) => ({
        ...b,
        session: {
          ...b.session,
          status,
          processingError: error ?? b.session.processingError,
        },
      }));
      this.recording.syncStatus(sessionId, status);
      // A block created while the session was live never fetched its persisted
      // timeline. Once the session settles, reload it as a historical block so
      // segments and resolved decisions survive exactly like after a reload.
      if (HISTORICAL_STATUSES.includes(status)) this.upgradeToHistorical(sessionId);
    }
  }

  /**
   * Converts a live block into a historical (chronological) one after its
   * session reached COMPLETED/FAILED: flips the merge mode and re-fetches the
   * persisted segments, resolved decisions and stories. No-op for blocks that
   * were already loaded as historical.
   */
  private upgradeToHistorical(sessionId: string): void {
    const block = this._blocks().find((b) => b.session.id === sessionId);
    if (!block || block.chronological) return;
    this.updateBlock(sessionId, (b) => ({ ...b, chronological: true }));
    this.loadHistoricalBlock(block.session);
  }

  /** Appends an immutable decision entry to the suggestion's session block. */
  private recordDecision(
    outcome: 'ACCEPTED' | 'DISMISSED',
    suggestion: SuggestionResponse,
    occurredAt?: string,
  ): void {
    const block = this._blocks().find((b) => b.session.id === suggestion.sessionId);
    // Decisions on sessions not currently in the feed (e.g. chip items from an
    // unloaded session) simply have nowhere to render — that is fine.
    if (!block || block.decisions.some((d) => d.id === suggestion.id)) return;
    const entry = toDecisionEntry(suggestion, outcome, lastSequence(block.segments), occurredAt);
    this.updateBlock(suggestion.sessionId, (b) => ({ ...b, decisions: [...b.decisions, entry] }));
  }

  /**
   * Fills the pending-from-previous chip. Prefers the project-wide endpoint
   * (parallel backend branch); falls back to the most recent completed
   * session's pending suggestions when it is not deployed.
   */
  private checkPendingPrevious(): void {
    const projectId = this.projectId;
    if (!projectId) return;
    const newestId = this.sessionsCache[0]?.id ?? null;
    const apply = (list: SuggestionResponse[]): void => {
      const queueIds = new Set(this._queue().map((s) => s.id));
      this._pendingPrevious.set(
        list.filter((s) => s.sessionId !== newestId && !queueIds.has(s.id)),
      );
    };
    this.api.listProjectPendingSuggestions(projectId).subscribe({
      next: apply,
      error: () => {
        const fallback = this.sessionsCache.find(
          (s) => s.id !== newestId && s.status === 'COMPLETED',
        );
        if (!fallback) return;
        this.api.listSuggestions(fallback.id).subscribe({ next: apply, error: () => undefined });
      },
    });
  }

  private updateBlock(sessionId: string, fn: (block: SessionBlock) => SessionBlock): void {
    this._blocks.update((blocks) =>
      blocks.map((b) => (b.session.id === sessionId ? fn(b) : b)),
    );
  }

  private suggestionFromMessage(m: SessionSuggestionMessage): SuggestionResponse {
    return {
      id: m.suggestionId,
      sessionId: m.sessionId,
      projectId: this.projectId ?? '',
      type: m.suggestionType,
      status: m.status,
      draftTitle: m.draftTitle,
      draftRole: m.draftRole,
      draftAction: m.draftAction,
      draftBenefit: m.draftBenefit,
      draftPriority: m.draftPriority,
      draftStoryPoints: m.draftStoryPoints,
      relatedTopic: m.relatedTopic,
      targetStoryId: m.targetStoryId,
      question: m.question,
      resolvedStoryId: m.resolvedStoryId,
      createdAt: m.occurredAt,
      updatedAt: m.occurredAt,
    };
  }
}
