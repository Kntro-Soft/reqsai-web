import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { DiscoveryApiService } from './discovery-api.service';
import {
  SessionSpeakerResponse,
  SessionSpeakerUpdatedMessage,
  SpeakerOverlapsResponse,
  UpdateSessionSpeakerRequest,
} from './discovery.models';
import { applySpeakerUpdate } from './speakers';

/** What the feed knows about one session's speakers. */
export interface SessionSpeakersState {
  speakers: SessionSpeakerResponse[];
  overlaps: SpeakerOverlapsResponse | null;
}

/**
 * The diarized speakers of the sessions shown in the feed (US40), keyed by session id: loaded on
 * demand from the speakers endpoint, renamed through it, and kept in sync with SPEAKER_UPDATED
 * events. Separate from the chat store so the feed's own loading stays untouched.
 */
@Injectable({ providedIn: 'root' })
export class SessionSpeakersStore {
  private readonly api = inject(DiscoveryApiService);

  private readonly _bySession = signal<Record<string, SessionSpeakersState>>({});
  /** Sessions with a speakers request in flight, so overlapping triggers share it. */
  private readonly loading = new Set<string>();
  /** Last load key per session (see {@link ensure}). */
  private readonly loadedKeys = new Map<string, string>();

  readonly bySession = this._bySession.asReadonly();

  /** The session's speakers, or undefined until they are loaded. */
  forSession(sessionId: string): SessionSpeakersState | undefined {
    return this._bySession()[sessionId];
  }

  /**
   * Loads the session's speakers unless the same `key` was already loaded. The caller derives the key
   * from what changes the answer (the session status and the labels in its segments), so a new
   * speaker or the end of the meeting refreshes the names and the overlap report.
   */
  ensure(projectId: string, sessionId: string, key: string): void {
    if (this.loadedKeys.get(sessionId) === key || this.loading.has(sessionId)) return;
    this.loading.add(sessionId);
    this.api.listSpeakers(projectId, sessionId).subscribe({
      next: (response) => {
        this.loading.delete(sessionId);
        this.loadedKeys.set(sessionId, key);
        this._bySession.update((all) => ({
          ...all,
          [sessionId]: { speakers: response.speakers ?? [], overlaps: response.overlaps ?? null },
        }));
      },
      error: () => {
        // The feed keeps its default "Hablante N" labels; the next key change retries.
        this.loading.delete(sessionId);
        this.loadedKeys.set(sessionId, key);
      },
    });
  }

  /** Renames a speaker and/or sets their side; the store reflects it once the API confirms. */
  update(
    projectId: string,
    sessionId: string,
    label: string,
    request: UpdateSessionSpeakerRequest,
  ): Observable<SessionSpeakerResponse> {
    return this.api.updateSpeaker(projectId, sessionId, label, request).pipe(
      tap((speaker) =>
        this.apply(sessionId, {
          speakerLabel: speaker.label,
          displayName: speaker.displayName,
          side: speaker.side,
        }),
      ),
    );
  }

  /** Applies a SPEAKER_UPDATED event pushed by someone else (or by us) on the session topic. */
  applyRealtime(message: SessionSpeakerUpdatedMessage): void {
    if (!message?.sessionId || !message.speakerLabel) return;
    this.apply(message.sessionId, message);
  }

  /** Forgets everything (project switch). */
  reset(): void {
    this._bySession.set({});
    this.loading.clear();
    this.loadedKeys.clear();
  }

  private apply(
    sessionId: string,
    update: Pick<SessionSpeakerUpdatedMessage, 'speakerLabel' | 'displayName' | 'side'>,
  ): void {
    this._bySession.update((all) => {
      const current = all[sessionId] ?? { speakers: [], overlaps: null };
      return {
        ...all,
        [sessionId]: { ...current, speakers: applySpeakerUpdate(current.speakers, update) },
      };
    });
  }
}
