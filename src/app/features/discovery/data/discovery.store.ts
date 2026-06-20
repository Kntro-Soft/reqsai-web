import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { DiscoveryApiService } from './discovery-api.service';
import {
  CreateDiscoverySessionRequest,
  DiscoverySessionResponse,
  SessionEventType,
  SessionProcessingFailedMessage,
  SessionRealtimeMessage,
  SessionStatus,
  SessionStoryGeneratedMessage,
  SessionTranscriptSegmentMessage,
} from './discovery.models';

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
  private readonly _stories = signal<SessionStoryGeneratedMessage[]>([]);

  readonly sessions = this._sessions.asReadonly();
  readonly sessionsState = this._sessionsState.asReadonly();
  readonly current = this._current.asReadonly();
  readonly events = this._events.asReadonly();
  readonly transcript = this._transcript.asReadonly();
  readonly stories = this._stories.asReadonly();

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
  }

  /** Applies an incoming realtime message to the live signals. */
  applyRealtime(message: SessionRealtimeMessage): void {
    this._events.update((events) => [
      ...events,
      { type: message.type, occurredAt: message.occurredAt },
    ]);

    if (message.type === 'TRANSCRIPT_SEGMENT') {
      this._transcript.update((t) => [...t, message as SessionTranscriptSegmentMessage]);
      return;
    }
    if (message.type === 'STORY_GENERATED') {
      this._stories.update((s) => [...s, message as SessionStoryGeneratedMessage]);
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
}
