import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import {
  CreateOrganizationRequest,
  CreateProjectRequest,
  OrganizationResponse,
  PageResponse,
  ProjectResponse,
} from './workspace.models';

/** Thin HTTP client for the workspace endpoints. The active tenant is resolved
 * by the backend from the JWT, so project calls only need the org id in the path. */
@Injectable({ providedIn: 'root' })
export class WorkspaceApiService {
  private readonly http = inject(HttpClient);

  listOrganizations(): Observable<OrganizationResponse[]> {
    return this.http.get<OrganizationResponse[]>('/api/organizations');
  }

  createOrganization(request: CreateOrganizationRequest): Observable<OrganizationResponse> {
    return this.http.post<OrganizationResponse>('/api/organizations', request);
  }

  listProjects(orgId: string): Observable<ProjectResponse[]> {
    // The workspace list endpoint is paginated (Spring Page); unwrap to the rows.
    return this.http
      .get<PageResponse<ProjectResponse>>(`/api/organizations/${orgId}/projects`)
      .pipe(map((page) => page.content));
  }

  createProject(orgId: string, request: CreateProjectRequest): Observable<ProjectResponse> {
    return this.http.post<ProjectResponse>(`/api/organizations/${orgId}/projects`, request);
  }
}
