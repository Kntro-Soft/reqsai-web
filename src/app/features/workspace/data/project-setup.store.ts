import { Injectable, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable, Subscription, catchError, interval, switchMap, tap } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import {
  ProfileAdditions,
  additionsCount,
  mergeProfile,
  profileAdditions,
} from '../../discovery/data/codebase';
import { ProjectSetupApiService } from './project-setup-api.service';
import { ProjectSetupResponse, SetupStepKey } from './project-setup.models';
import { SETUP_POLL_MS, isDismissed, rememberDismissed, setupActive } from './project-setup';
import { WorkspaceApiService } from './workspace-api.service';
import { WorkspaceStore } from './workspace.store';
import { ProjectResponse } from './workspace.models';

/**
 * Signal store of the setup of the current project (the Jira and GitHub sources it was created
 * with): it recovers the state when a page loads, follows the project's `setup` topic, polls while a
 * step is open (the socket can be down, or a frame lost), and serves the bar's actions: skip a step,
 * retry a failed one, apply the detected stack, dismiss. The server keeps the state, so a reload or
 * another device sees the same bar; only the dismissal is remembered in the browser.
 */
@Injectable({ providedIn: 'root' })
export class ProjectSetupStore {
  private readonly api = inject(ProjectSetupApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly auth = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly workspaceApi = inject(WorkspaceApiService);

  private projectId: string | null = null;
  private topicSub: Subscription | null = null;
  private pollSub: Subscription | null = null;

  private readonly _setup = signal<ProjectSetupResponse | null>(null);
  private readonly _dismissed = signal(false);

  /** The current project's setup, or null before it loaded or outside a project. */
  readonly setup = this._setup.asReadonly();
  readonly dismissed = this._dismissed.asReadonly();

  /** True while any step still has work ahead. */
  readonly active = computed(() => setupActive(this._setup()));

  /** Whether the bar shows: the project asked for sources and the bar was not dismissed. */
  readonly visible = computed(() => {
    const setup = this._setup();
    return !!setup && setup.steps.length > 0 && !this._dismissed();
  });

  /** What the detected stack would add to the project's technical profile. */
  readonly stackAdditions = computed<ProfileAdditions | null>(() => {
    const setup = this._setup();
    const project = this.workspace.projects().find((p) => p.id === this.projectId);
    if (!setup?.detectedStack || !project) return null;
    const additions = profileAdditions(project, setup.detectedStack);
    return additionsCount(additions) > 0 ? additions : null;
  });

  /**
   * Switches the tracked project (null clears everything). Reads the setup, follows its topic and polls
   * while a step is open. Idempotent for the same project.
   */
  setProject(projectId: string | null): void {
    if (this.projectId === projectId) return;
    this.teardown();
    this.projectId = projectId;
    if (!projectId) return;
    this._dismissed.set(isDismissed(projectId));

    this.topicSub = this.realtime
      .watch<ProjectSetupResponse>(`projects/${projectId}/setup`)
      .subscribe((setup) => this.apply(setup));
    this.refresh();
  }

  /** Reads the setup now. */
  refresh(): void {
    const projectId = this.projectId;
    if (!projectId) return;
    this.api.get(projectId).subscribe({
      next: (setup) => this.apply(setup),
      // Recovery is best-effort: the topic and the poll still cover it.
      error: () => undefined,
    });
  }

  /** Stops following a step; work already started keeps running on the server. */
  skip(step: SetupStepKey): Observable<ProjectSetupResponse> {
    const projectId = this.projectId;
    if (!projectId) return EMPTY;
    return this.api.skip(projectId, step).pipe(tap((setup) => this.apply(setup)));
  }

  /** Runs a failed step again. */
  retry(step: SetupStepKey): Observable<ProjectSetupResponse> {
    const projectId = this.projectId;
    if (!projectId) return EMPTY;
    return this.api.retry(projectId, step).pipe(tap((setup) => this.apply(setup)));
  }

  /** Hides the bar for this project, for good on this browser. */
  dismiss(): void {
    if (!this.projectId) return;
    rememberDismissed(this.projectId);
    this._dismissed.set(true);
  }

  /**
   * Adds the detected technology the project's profile lacks, keeping everything else of the project as
   * it is (the workspace update is a full PUT, so the current values are sent back).
   */
  applyStack(): Observable<ProjectResponse> {
    const orgId = this.auth.organizationId();
    const projectId = this.projectId;
    const additions = this.stackAdditions();
    const project = this.workspace.projects().find((p) => p.id === projectId);
    if (!orgId || !projectId || !additions || !project) return EMPTY;
    const stack = mergeProfile(project, additions);
    return this.workspaceApi
      .updateProject(orgId, projectId, {
        name: project.name,
        description: project.description || undefined,
        ...stack,
        architecture: project.architecture || undefined,
        domain: project.domain || undefined,
      })
      .pipe(tap((updated) => this.workspace.replaceProject(updated)));
  }

  /**
   * Applies a full snapshot (socket frame, poll or action result). A snapshot of another project is
   * ignored, and polling follows whether a step is open.
   */
  apply(setup: ProjectSetupResponse): void {
    if (setup.projectId !== this.projectId) return;
    this._setup.set(setup);
    if (setupActive(setup)) this.ensurePolling();
    else this.stopPolling();
  }

  private ensurePolling(): void {
    if (this.pollSub) return;
    this.pollSub = interval(SETUP_POLL_MS)
      .pipe(
        switchMap(() => {
          const projectId = this.projectId;
          return projectId ? this.api.get(projectId).pipe(catchError(() => EMPTY)) : EMPTY;
        }),
      )
      .subscribe({
        next: (setup) => this.apply(setup),
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
    this._setup.set(null);
    this._dismissed.set(false);
    this.projectId = null;
  }
}
