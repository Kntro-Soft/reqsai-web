import { Injectable, computed, inject, signal } from '@angular/core';
import { PermissionsStore } from '../../../core/authz/permissions.store';
import { CodebaseApiService } from './codebase-api.service';

/**
 * Whether the project's connected code can be searched from the capture page: at least one
 * repository is indexed (READY) and the analyst may read integrations and decide suggestions. The
 * "Verificar en el código" action is shown only then. A repository list the analyst cannot read (403)
 * or that fails to load simply leaves the action hidden.
 */
@Injectable()
export class ProjectCodeStore {
  private readonly api = inject(CodebaseApiService);
  private readonly permissions = inject(PermissionsStore);

  private readonly _ready = signal(false);
  private loadedFor: string | null = null;

  /** The project has at least one repository that is indexed and can be searched. */
  readonly hasReadyRepository = this._ready.asReadonly();

  /** Whether the verify action is offered: a ready repository and the permissions to use it. */
  readonly canVerify = computed(
    () =>
      this._ready() &&
      this.permissions.has('INTEGRATION_READ') &&
      this.permissions.has('SESSION_DECIDE'),
  );

  /** Reads the project's repositories; call again after a failed verification to catch changes. */
  load(projectId: string): void {
    this.loadedFor = projectId;
    this.api.listRepositories(projectId).subscribe({
      next: (repos) => {
        if (this.loadedFor === projectId) {
          this._ready.set(repos.some((repo) => repo.status === 'READY'));
        }
      },
      error: () => {
        if (this.loadedFor === projectId) this._ready.set(false);
      },
    });
  }
}
