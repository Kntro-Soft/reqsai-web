import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { DiscoveryApiService } from './discovery-api.service';
import {
  AcceptSuggestionRequest,
  CreateDiscoverySessionRequest,
  DiscoverySessionResponse,
  DisplayStory,
  ProcessTranscriptResponse,
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
  };
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type SessionAction = 'start' | 'pause' | 'resume' | 'stop' | 'reset';

export interface LiveEvent {
  type: SessionEventType;
  occurredAt: string;
}

/** Maps a realtime event to the session status it implies (segment/story carry no status). */
const STATUS_BY_EVENT: Partial<Record<SessionEventType, SessionStatus>> = {
  RECORDING_STARTED: 'RECORDING',
  RECORDING_PAUSED: 'PAUSED',
  RECORDING_RESUMED: 'RECORDING',
  RECORDING_STOPPED: 'STOPPED',
  SESSION_RESET: 'DRAFT',
  TRANSCRIPT_UPLOADED: 'STOPPED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

/** Signal store for discovery sessions and the live (STOMP-fed) session view. */
@Injectable({ providedIn: 'root' })
export class DiscoveryStore {
  private readonly api = inject(DiscoveryApiService);

  private readonly _sessions = signal<DiscoverySessionResponse[]>([]);
  private readonly _sessionsState = signal<LoadState>('idle');
  private readonly _current = signal<DiscoverySessionResponse | null>(null);
  private readonly _events = signal<LiveEvent[]>([]);
  private readonly _transcript = signal<SessionTranscriptSegmentMessage[]>([]);
  private readonly _stories = signal<DisplayStory[]>([]);
  private readonly _suggestions = signal<SuggestionResponse[]>([]);
  // Whole project backlog, used to resolve a suggestion's target story for the diff view.
  private readonly _projectStories = signal<DisplayStory[]>([]);

  readonly sessions = this._sessions.asReadonly();
  readonly sessionsState = this._sessionsState.asReadonly();
  readonly current = this._current.asReadonly();
  readonly events = this._events.asReadonly();
  readonly transcript = this._transcript.asReadonly();
  readonly stories = this._stories.asReadonly();
  readonly suggestions = this._suggestions.asReadonly();

  loadSessions(projectId: string): void {
    this._sessionsState.set('loading');
    this.api.listSessions(projectId).subscribe({
      next: (page) => {
        this._sessions.set(page.content);
        this._sessionsState.set('ready');
      },
      error: () => this._sessionsState.set('error'),
    });
  }

  createSession(
    projectId: string,
    request: CreateDiscoverySessionRequest,
  ): Observable<DiscoverySessionResponse> {
    return this.api
      .createSession(projectId, request)
      .pipe(tap((session) => this._sessions.update((list) => [session, ...list])));
  }

  loadSession(projectId: string, sessionId: string): void {
    this.api.getSession(projectId, sessionId).subscribe({
      next: (session) => this._current.set(session),
      error: () => this._current.set(null),
    });
    // Stories already generated for this session (so a re-opened session isn't empty).
    this.api.listSessionStories(sessionId).subscribe({
      next: (page) => this._stories.set(page.content.map(toDisplayStory)),
    });
    // Pending AI suggestions (resilient: the endpoint may not be deployed yet).
    this.api.listSuggestions(sessionId).subscribe({
      next: (list) => this._suggestions.set(list),
      error: () => this._suggestions.set([]),
    });
    // Project backlog, so an UPDATE_STORY/EDGE_CASE target resolves for the diff.
    this.api.listProjectStories(projectId).subscribe({
      next: (page) => this._projectStories.set(page.content.map(toDisplayStory)),
      error: () => this._projectStories.set([]),
    });
  }

  /** Resolves a story by id across the session's stories and the project backlog. */
  findStory(id: string): DisplayStory | undefined {
    return (
      this._stories().find((s) => s.id === id) ?? this._projectStories().find((s) => s.id === id)
    );
  }

  acceptSuggestion(
    sessionId: string,
    suggestionId: string,
    request: AcceptSuggestionRequest,
  ): Observable<SuggestionResponse> {
    return this.api.acceptSuggestion(sessionId, suggestionId, request).pipe(
      tap(() => {
        this._suggestions.update((list) => list.filter((s) => s.id !== suggestionId));
        // The accepted suggestion created/updated a story — refresh the session stories.
        this.api.listSessionStories(sessionId).subscribe({
          next: (page) => this._stories.set(page.content.map(toDisplayStory)),
        });
      }),
    );
  }

  dismissSuggestion(sessionId: string, suggestionId: string): Observable<SuggestionResponse> {
    return this.api
      .dismissSuggestion(sessionId, suggestionId)
      .pipe(
        tap(() => this._suggestions.update((list) => list.filter((s) => s.id !== suggestionId))),
      );
  }

  /** Uploads an audio file for transcription and reflects the returned session. */
  uploadAudio(sessionId: string, file: File): Observable<DiscoverySessionResponse> {
    return this.api.uploadAudio(sessionId, file).pipe(tap((session) => this._current.set(session)));
  }

  /** Runs AI extraction; updates the session and seeds the generated stories. */
  process(sessionId: string): Observable<ProcessTranscriptResponse> {
    return this.api.process(sessionId).pipe(
      tap((result) => {
        this._current.set(result.session);
        this._stories.set(result.stories.map(toDisplayStory));
      }),
    );
  }

  /** Runs a lifecycle transition (REST) and reflects the returned session. */
  transition(
    projectId: string,
    sessionId: string,
    action: SessionAction,
  ): Observable<DiscoverySessionResponse> {
    return this.api
      .transition(projectId, sessionId, action)
      .pipe(tap((session) => this._current.set(session)));
  }

  /** Clears the live view before (re)subscribing to a session topic. */
  resetLive(): void {
    this._events.set([]);
    this._transcript.set([]);
    this._stories.set([]);
    this._suggestions.set([]);
    this._projectStories.set([]);
  }

  /** Applies an incoming realtime message to the live signals. */
  applyRealtime(message: SessionRealtimeMessage): void {
    this._events.update((events) => [
      ...events,
      { type: message.type, occurredAt: message.occurredAt },
    ]);

    if (message.type === 'TRANSCRIPT_SEGMENT') {
      const seg = message as SessionTranscriptSegmentMessage;
      // Upsert by sequence: a hypothesis (isFinal=false) is replaced by its final.
      this._transcript.update((t) =>
        [...t.filter((s) => s.sequence !== seg.sequence), seg].sort(
          (a, b) => a.sequence - b.sequence,
        ),
      );
      return;
    }
    if (
      message.type === 'SUGGESTION_GENERATED' ||
      message.type === 'SUGGESTION_ACCEPTED' ||
      message.type === 'SUGGESTION_DISMISSED'
    ) {
      const s = message as SessionSuggestionMessage;
      if (s.type === 'SUGGESTION_GENERATED') {
        this._suggestions.update((list) =>
          list.some((x) => x.id === s.suggestionId) ? list : [...list, this.fromMessage(s)],
        );
      } else {
        this._suggestions.update((list) => list.filter((x) => x.id !== s.suggestionId));
      }
      return;
    }
    if (message.type === 'STORY_GENERATED') {
      const story = message as SessionStoryGeneratedMessage;
      this._stories.update((s) => [
        ...s,
        {
          id: story.storyId,
          title: story.title,
          role: story.role,
          action: story.action,
          benefit: story.benefit,
          priority: story.priority,
          storyPoints: story.storyPoints,
        },
      ]);
      return;
    }

    const status = STATUS_BY_EVENT[message.type];
    if (status) {
      const error =
        message.type === 'FAILED' ? (message as SessionProcessingFailedMessage).reason : null;
      this._current.update((c) =>
        c ? { ...c, status, processingError: error ?? c.processingError } : c,
      );
    }
  }

  private fromMessage(m: SessionSuggestionMessage): SuggestionResponse {
    return {
      id: m.suggestionId,
      sessionId: m.sessionId,
      projectId: '',
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
