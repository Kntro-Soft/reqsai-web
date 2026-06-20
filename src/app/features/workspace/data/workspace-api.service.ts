import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateOrganizationRequest,
  CreateProjectRequest,
  OrganizationResponse,
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
    return this.http.get<ProjectResponse[]>(`/api/organizations/${orgId}/projects`);
  }

  createProject(orgId: string, request: CreateProjectRequest): Observable<ProjectResponse> {
    return this.http.post<ProjectResponse>(`/api/organizations/${orgId}/projects`, request);
  }
}
