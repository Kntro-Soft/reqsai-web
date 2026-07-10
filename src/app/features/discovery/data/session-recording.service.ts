import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, switchMap, tap } from 'rxjs';
import { AudioRecorderService } from '../../../core/audio/audio-recorder.service';
import { DiscoveryApiService } from './discovery-api.service';
import {
  CreateDiscoverySessionRequest,
  DiscoverySessionResponse,
  SessionStatus,
} from './discovery.models';

/**
 * Singleton owner of the active recording session's lifecycle, so navigating
 * away from the discovery chat never kills a recording. Pressing record
 * creates a session implicitly (create → start) and begins mic streaming;
 * pause/resume/stop drive both the REST lifecycle and the local microphone.
 *
 * `attach()` adopts a session that is already active elsewhere (409
 * SESSION_ALREADY_ACTIVE): the bar and timer work, but this tab does not
 * capture audio until the user explicitly resumes.
 *
 * A `beforeunload` guard warns while a recording is live (RECORDING/PAUSED).
 */
@Injectable({ providedIn: 'root' })
export class SessionRecordingService {
  private readonly api = inject(DiscoveryApiService);
  private readonly recorder = inject(AudioRecorderService);

  private readonly _session = signal<DiscoverySessionResponse | null>(null);
  /** The active (RECORDING/PAUSED) session this service tracks, or null. */
  readonly session = this._session.asReadonly();
  /** True while a lifecycle request is in flight (debounces the bar's buttons). */
  readonly busy = signal(false);

  readonly status = computed<SessionStatus | null>(() => this._session()?.status ?? null);
  /** True while a session is live — the bar (and the unload guard) shows. */
  readonly isActive = computed(() => {
    const status = this.status();
    return status === 'RECORDING' || status === 'PAUSED';
  });

  // ---- Elapsed timer (accumulated across pauses) ----
  private accumulatedMs = 0;
  private resumedAtEpochMs: number | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private readonly nowMs = signal(Date.now());
  /** Recorded time in ms, frozen while paused. */
  readonly elapsedMs = computed(() => {
    // Read nowMs() UNCONDITIONALLY so this computed always keeps its dependency on the tick signal.
    // If nowMs() were only read in the "running" branch, then while paused (resumedAtEpochMs === null)
    // the ternary short-circuits, the computed records ZERO signal dependencies, and it never re-runs
    // on resume — freezing the timer at the paused value until a full page reload.
    const now = this.nowMs();
    const running = this.resumedAtEpochMs === null ? 0 : now - this.resumedAtEpochMs;
    return this.accumulatedMs + Math.max(0, running);
  });

  /** True when this tab owns the microphone (false for sessions adopted via attach). */
  private hasMic = false;

  constructor() {
    window.addEventListener('beforeunload', (event) => {
      if (this.isActive()) {
        event.preventDefault();
        // Required by Chrome to actually show the confirmation dialog.
        event.returnValue = '';
      }
    });
  }

  /**
   * Implicit session start: creates the session and immediately starts it,
   * then begins mic streaming. The caller should have secured mic permission
   * first (so we never leave an orphan RECORDING session without audio).
   */
  start(
    projectId: string,
    request: CreateDiscoverySessionRequest,
  ): Observable<DiscoverySessionResponse> {
    this.busy.set(true);
    return this.api.createSession(projectId, request).pipe(
      switchMap((created) => this.api.transition(projectId, created.id, 'start')),
      tap({
        next: (session) => {
          this._session.set(session);
          this.hasMic = true;
          this.startTimer(0);
          void this.recorder.startStreaming(session.id);
          this.busy.set(false);
        },
        error: () => this.busy.set(false),
      }),
    );
  }

  /** Adopts an already-active session (started elsewhere) without capturing audio. */
  attach(session: DiscoverySessionResponse): void {
    if (this._session()?.id === session.id) return;
    this.teardown();
    this._session.set(session);
    this.hasMic = false;
    const startedAt = session.startedAt ? Date.parse(session.startedAt) : Date.now();
    if (session.status === 'RECORDING') {
      this.startTimer(Math.max(0, Date.now() - startedAt));
    } else {
      this.accumulatedMs = Math.max(0, Date.now() - startedAt);
    }
  }

  pause(): Observable<DiscoverySessionResponse> | null {
    const session = this._session();
    if (!session || this.busy()) return null;
    this.busy.set(true);
    return this.api.transition(session.projectId, session.id, 'pause').pipe(
      tap({
        next: (updated) => {
          this._session.set(updated);
          this.pauseTimer();
          this.recorder.stopStreaming();
          this.busy.set(false);
        },
        error: () => this.busy.set(false),
      }),
    );
  }

  resume(): Observable<DiscoverySessionResponse> | null {
    const session = this._session();
    if (!session || this.busy()) return null;
    this.busy.set(true);
    return this.api.transition(session.projectId, session.id, 'resume').pipe(
      tap({
        next: (updated) => {
          this._session.set(updated);
          this.resumeTimer();
          this.hasMic = true;
          void this.recorder.startStreaming(updated.id);
          this.busy.set(false);
        },
        error: () => this.busy.set(false),
      }),
    );
  }

  stop(): Observable<DiscoverySessionResponse> | null {
    const session = this._session();
    if (!session || this.busy()) return null;
    this.busy.set(true);
    return this.api.transition(session.projectId, session.id, 'stop').pipe(
      tap({
        next: () => {
          this.teardown();
          this.busy.set(false);
        },
        error: () => this.busy.set(false),
      }),
    );
  }

  /**
   * Reflects a session status change reported by realtime events (e.g. the
   * recording was paused/stopped from another tab). Tears down when the
   * session leaves the active states.
   */
  syncStatus(sessionId: string, status: SessionStatus): void {
    const session = this._session();
    if (!session || session.id !== sessionId) return;
    if (status === 'RECORDING') {
      if (session.status !== 'RECORDING') this.resumeTimer();
    } else if (status === 'PAUSED') {
      this.pauseTimer();
      if (this.hasMic) this.recorder.stopStreaming();
    } else {
      this.teardown();
      return;
    }
    this._session.set({ ...session, status });
  }

  private teardown(): void {
    if (this.hasMic) this.recorder.stopStreaming();
    this.hasMic = false;
    this._session.set(null);
    this.stopTimer();
  }

  // ---- Timer internals ----

  private startTimer(fromMs: number): void {
    this.stopTimer();
    this.accumulatedMs = fromMs;
    this.resumedAtEpochMs = Date.now();
    this.nowMs.set(Date.now());
    this.tickTimer = setInterval(() => this.nowMs.set(Date.now()), 1000);
  }

  private pauseTimer(): void {
    if (this.resumedAtEpochMs !== null) {
      this.accumulatedMs += Date.now() - this.resumedAtEpochMs;
      this.resumedAtEpochMs = null;
    }
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.nowMs.set(Date.now());
  }

  private resumeTimer(): void {
    if (this.resumedAtEpochMs === null) {
      this.resumedAtEpochMs = Date.now();
    }
    if (this.tickTimer === null) {
      this.tickTimer = setInterval(() => this.nowMs.set(Date.now()), 1000);
    }
    this.nowMs.set(Date.now());
  }

  private stopTimer(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.accumulatedMs = 0;
    this.resumedAtEpochMs = null;
    this.nowMs.set(Date.now());
  }
}
