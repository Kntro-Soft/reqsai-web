import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { silentForbidden } from '../../../core/interceptors/error.interceptor';
import { ProjectSetupResponse, SetupStepKey } from './project-setup.models';

/**
 * Client for the setup of a new project: the Jira and GitHub sources it was created with, set up in
 * the background. The read is a poll (and a page-load recovery), so a 403 stays out of the global toast.
 */
@Injectable({ providedIn: 'root' })
export class ProjectSetupApiService {
  private readonly http = inject(HttpClient);

  private base(projectId: string): string {
    return `/api/projects/${projectId}/setup`;
  }

  get(projectId: string): Observable<ProjectSetupResponse> {
    return this.http.get<ProjectSetupResponse>(this.base(projectId), {
      context: silentForbidden(),
    });
  }

  skip(projectId: string, step: SetupStepKey): Observable<ProjectSetupResponse> {
    return this.http.post<ProjectSetupResponse>(`${this.base(projectId)}/steps/${step}/skip`, {});
  }

  retry(projectId: string, step: SetupStepKey): Observable<ProjectSetupResponse> {
    return this.http.post<ProjectSetupResponse>(`${this.base(projectId)}/steps/${step}/retry`, {});
  }
}
