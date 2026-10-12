import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { silentForbidden } from '../../../core/interceptors/error.interceptor';
import { OrganizationOverviewResponse, ProjectOverviewResponse } from './overview.models';

/**
 * Client for the read-only dashboards. Both are page loads, so a 403 stays out of the global
 * "no access" toast and the page shows its own error state instead.
 */
@Injectable({ providedIn: 'root' })
export class OverviewApiService {
  private readonly http = inject(HttpClient);

  getProjectOverview(projectId: string): Observable<ProjectOverviewResponse> {
    return this.http.get<ProjectOverviewResponse>(`/api/projects/${projectId}/overview`, {
      context: silentForbidden(),
    });
  }

  getOrganizationOverview(orgId: string): Observable<OrganizationOverviewResponse> {
    return this.http.get<OrganizationOverviewResponse>(`/api/organizations/${orgId}/overview`, {
      context: silentForbidden(),
    });
  }
}
