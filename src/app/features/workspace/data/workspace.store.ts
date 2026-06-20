import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { WorkspaceApiService } from './workspace-api.service';
import {
  CreateOrganizationRequest,
  CreateProjectRequest,
  OrganizationResponse,
  ProjectResponse,
} from './workspace.models';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/** Signal store for organizations and the active org's projects. Mutations
 * return the observable so pages own navigation and per-action error handling. */
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly api = inject(WorkspaceApiService);

  private readonly _organizations = signal<OrganizationResponse[]>([]);
  private readonly _projects = signal<ProjectResponse[]>([]);
  private readonly _orgsState = signal<LoadState>('idle');
  private readonly _projectsState = signal<LoadState>('idle');

  readonly organizations = this._organizations.asReadonly();
  readonly projects = this._projects.asReadonly();
  readonly orgsState = this._orgsState.asReadonly();
  readonly projectsState = this._projectsState.asReadonly();
  readonly hasMultipleOrgs = computed(() => this._organizations().length > 1);

  loadOrganizations(): void {
    this._orgsState.set('loading');
    this.api.listOrganizations().subscribe({
      next: (orgs) => {
        this._organizations.set(orgs);
        this._orgsState.set('ready');
      },
      error: () => this._orgsState.set('error'),
    });
  }

  createOrganization(request: CreateOrganizationRequest): Observable<OrganizationResponse> {
    return this.api
      .createOrganization(request)
      .pipe(tap((org) => this._organizations.update((list) => [org, ...list])));
  }

  loadProjects(orgId: string): void {
    this._projectsState.set('loading');
    this.api.listProjects(orgId).subscribe({
      next: (projects) => {
        this._projects.set(projects);
        this._projectsState.set('ready');
      },
      error: () => this._projectsState.set('error'),
    });
  }

  createProject(orgId: string, request: CreateProjectRequest): Observable<ProjectResponse> {
    return this.api
      .createProject(orgId, request)
      .pipe(tap((project) => this._projects.update((list) => [project, ...list])));
  }

  reset(): void {
    this._organizations.set([]);
    this._projects.set([]);
    this._orgsState.set('idle');
    this._projectsState.set('idle');
  }
}
