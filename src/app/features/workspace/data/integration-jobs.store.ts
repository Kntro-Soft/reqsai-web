import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject, Subscription, interval } from 'rxjs';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { IntegrationsApiService } from './integrations-api.service';
import { IntegrationJobResponse, IntegrationJobType, isJobTerminal } from './integrations.models';

/** How often a RUNNING job is re-fetched while the STOMP socket is down. */
export const JOB_POLL_INTERVAL_MS = 5_000;

/**
 * Signal store tracking the current project's background integration jobs (Jira
 * import / push-all) so the flows stay non-blocking:
 *
 * - {@link setProject} switches the tracked project: it subscribes the project's
 *   `integration-jobs` STOMP topic and RECOVERS in-flight work after a page reload
 *   by fetching `jobs?active=true`;
 * - {@link track} registers the job a 202 response returned;
 * - every STOMP message is a full job snapshot and is upserted; when the socket is
 *   down, a ~5s poll of `jobs/{id}` keeps each RUNNING job fresh instead;
 * - a job reaching COMPLETED/FAILED is emitted EXACTLY ONCE on {@link completed$}
 *   (toasts + list refreshes hook there) and leaves {@link jobs}, which only ever
 *   holds RUNNING jobs of the current project.
 */
@Injectable({ providedIn: 'root' })
export class IntegrationJobsStore {
  private readonly api = inject(IntegrationsApiService);
  private readonly realtime = inject(RealtimeService);

  private projectId: string | null = null;
  private topicSub: Subscription | null = null;
  private pollSub: Subscription | null = null;
  /** Ids already emitted as terminal, so late duplicate snapshots never double-toast. */
  private readonly settled = new Set<string>();

  private readonly _jobs = signal<readonly IntegrationJobResponse[]>([]);
  /** The current project's RUNNING jobs, oldest first. */
  readonly jobs = this._jobs.asReadonly();

  /** The job the global banner shows: the oldest still-running one, or null. */
  readonly current = computed<IntegrationJobResponse | null>(() => this._jobs()[0] ?? null);

  private readonly _completed = new Subject<IntegrationJobResponse>();
  /** Emits each tracked job exactly once when it reaches COMPLETED or FAILED. */
  readonly completed$: Observable<IntegrationJobResponse> = this._completed.asObservable();

  /** True while a job of this type is RUNNING (disables the matching action button). */
  runningOfType(jobType: IntegrationJobType): boolean {
    return this._jobs().some((job) => job.jobType === jobType);
  }

  /**
   * Switches the tracked project (null clears everything, e.g. outside a project).
   * Subscribes the project's STOMP topic and fetches the active jobs so work
   * started before a reload is recovered. Idempotent for the same project.
   */
  setProject(projectId: string | null): void {
    if (this.projectId === projectId) return;
    this.teardown();
    this.projectId = projectId;
    if (!projectId) return;

    this.topicSub = this.realtime
      .watch<IntegrationJobResponse>(`projects/${projectId}/integration-jobs`)
      .subscribe((job) => this.upsert(job));

    this.api.getIntegrationJobs(projectId, true).subscribe({
      next: (jobs) => {
        for (const job of jobs) this.upsert(job);
      },
      // Recovery is best-effort: realtime/polling still cover a job we missed.
      error: () => undefined,
    });
  }

  /** Registers the job returned by a 202 so the banner and buttons react at once. */
  track(job: IntegrationJobResponse): void {
    this.upsert(job);
  }

  /**
   * Applies a full job snapshot (202 body, STOMP message or poll result). Snapshots
   * for other projects or already-settled jobs are ignored; a stale RUNNING snapshot
   * (lower `processed` than what we show) never regresses the progress. A terminal
   * snapshot removes the job from the RUNNING list and emits {@link completed$}.
   */
  upsert(job: IntegrationJobResponse): void {
    if (job.projectId !== this.projectId || this.settled.has(job.id)) return;

    if (isJobTerminal(job)) {
      this.settled.add(job.id);
      this._jobs.update((list) => list.filter((j) => j.id !== job.id));
      if (this._jobs().length === 0) this.stopPolling();
      this._completed.next(job);
      return;
    }

    this._jobs.update((list) => {
      const existing = list.find((j) => j.id === job.id);
      if (!existing) return [...list, job];
      if (job.processed < existing.processed) return list; // out-of-order snapshot
      return list.map((j) => (j.id === job.id ? job : j));
    });
    this.ensurePolling();
  }

  /**
   * Fallback freshness while the socket is down: every ~5s each RUNNING job is
   * re-fetched — but only when the STOMP connection is NOT open (an open socket
   * already pushes every snapshot). Stops itself once nothing is running.
   */
  private ensurePolling(): void {
    if (this.pollSub) return;
    this.pollSub = interval(JOB_POLL_INTERVAL_MS).subscribe(() => {
      const projectId = this.projectId;
      if (!projectId || this._jobs().length === 0) {
        this.stopPolling();
        return;
      }
      if (this.realtime.connected()) return;
      for (const job of this._jobs()) {
        this.api.getIntegrationJob(projectId, job.id).subscribe({
          next: (fresh) => this.upsert(fresh),
          error: () => undefined,
        });
      }
    });
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  private teardown(): void {
    this.topicSub?.unsubscribe();
    this.topicSub = null;
    this.stopPolling();
    this.settled.clear();
    this._jobs.set([]);
    this.projectId = null;
  }
}
