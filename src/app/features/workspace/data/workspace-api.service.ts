import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import {
  CreateMemberRequest,
  CreateOrganizationRequest,
  CreateProjectRequest,
  MemberResponse,
  OrganizationResponse,
  PageResponse,
  ProjectResponse,
  UpdateOrganizationRequest,
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

  getProject(orgId: string, projectId: string): Observable<ProjectResponse> {
    return this.http.get<ProjectResponse>(`/api/organizations/${orgId}/projects/${projectId}`);
  }

  getOrganization(orgId: string): Observable<OrganizationResponse> {
    return this.http.get<OrganizationResponse>(`/api/organizations/${orgId}`);
  }

  updateOrganization(
    orgId: string,
    request: UpdateOrganizationRequest,
  ): Observable<OrganizationResponse> {
    return this.http.put<OrganizationResponse>(`/api/organizations/${orgId}`, request);
  }

  listMembers(orgId: string): Observable<MemberResponse[]> {
    return this.http.get<MemberResponse[]>(`/api/organizations/${orgId}/members`);
  }

  inviteMember(orgId: string, request: CreateMemberRequest): Observable<MemberResponse> {
    return this.http.post<MemberResponse>(`/api/organizations/${orgId}/members`, request);
  }

  removeMember(orgId: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`/api/organizations/${orgId}/members/${memberId}`);
  }
}
