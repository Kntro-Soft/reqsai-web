import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import {
  AssignProjectMemberRequest,
  CreateMemberRequest,
  CreateOrganizationRequest,
  CreateProjectRequest,
  MemberResponse,
  OrganizationResponse,
  PageResponse,
  ProjectMemberResponse,
  ProjectResponse,
  ProjectRoleRequest,
  ProjectRoleResponse,
  UpdateOrganizationRequest,
  UpdateProjectMemberRoleRequest,
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

  updateProject(
    orgId: string,
    projectId: string,
    request: CreateProjectRequest,
  ): Observable<ProjectResponse> {
    return this.http.put<ProjectResponse>(
      `/api/organizations/${orgId}/projects/${projectId}`,
      request,
    );
  }

  listProjectMembers(orgId: string, projectId: string): Observable<ProjectMemberResponse[]> {
    return this.http.get<ProjectMemberResponse[]>(
      `/api/organizations/${orgId}/projects/${projectId}/members`,
    );
  }

  // --- Project roles (dynamic, per-project permission bundles) ---

  listProjectRoles(orgId: string, projectId: string): Observable<ProjectRoleResponse[]> {
    return this.http.get<ProjectRoleResponse[]>(
      `/api/organizations/${orgId}/projects/${projectId}/roles`,
    );
  }

  createProjectRole(
    orgId: string,
    projectId: string,
    request: ProjectRoleRequest,
  ): Observable<ProjectRoleResponse> {
    return this.http.post<ProjectRoleResponse>(
      `/api/organizations/${orgId}/projects/${projectId}/roles`,
      request,
    );
  }

  updateProjectRole(
    orgId: string,
    projectId: string,
    roleId: string,
    request: ProjectRoleRequest,
  ): Observable<ProjectRoleResponse> {
    return this.http.put<ProjectRoleResponse>(
      `/api/organizations/${orgId}/projects/${projectId}/roles/${roleId}`,
      request,
    );
  }

  deleteProjectRole(orgId: string, projectId: string, roleId: string): Observable<void> {
    return this.http.delete<void>(
      `/api/organizations/${orgId}/projects/${projectId}/roles/${roleId}`,
    );
  }

  // --- Project member assignments ---

  assignProjectMember(
    orgId: string,
    projectId: string,
    request: AssignProjectMemberRequest,
  ): Observable<ProjectMemberResponse> {
    return this.http.post<ProjectMemberResponse>(
      `/api/organizations/${orgId}/projects/${projectId}/members`,
      request,
    );
  }

  updateProjectMemberRole(
    orgId: string,
    projectId: string,
    assignmentId: string,
    request: UpdateProjectMemberRoleRequest,
  ): Observable<ProjectMemberResponse> {
    return this.http.put<ProjectMemberResponse>(
      `/api/organizations/${orgId}/projects/${projectId}/members/${assignmentId}`,
      request,
    );
  }

  removeProjectMember(
    orgId: string,
    projectId: string,
    assignmentId: string,
  ): Observable<void> {
    return this.http.delete<void>(
      `/api/organizations/${orgId}/projects/${projectId}/members/${assignmentId}`,
    );
  }

  getOrganization(orgId: string): Observable<OrganizationResponse> {
    return this.http.get<OrganizationResponse>(`/api/organizations/${orgId}`);
  }

  updateOrganization(
    orgId: string,
    request: UpdateOrganizationRequest,
  ): Observable<OrganizationResponse> {
    return this.http.patch<OrganizationResponse>(`/api/organizations/${orgId}`, request);
  }

  listMembers(orgId: string): Observable<MemberResponse[]> {
    return this.http.get<MemberResponse[]>(`/api/organizations/${orgId}/members`);
  }

  inviteMember(orgId: string, request: CreateMemberRequest): Observable<MemberResponse> {
    return this.http.post<MemberResponse>(`/api/organizations/${orgId}/members`, request);
  }

  batchInviteMembers(
    orgId: string,
    invitations: CreateMemberRequest[],
  ): Observable<MemberResponse[]> {
    return this.http.post<MemberResponse[]>(`/api/organizations/${orgId}/members/batch`, {
      invitations,
    });
  }

  changeMemberRole(
    orgId: string,
    memberId: string,
    role: 'ADMIN' | 'MEMBER',
  ): Observable<MemberResponse> {
    return this.http.patch<MemberResponse>(`/api/organizations/${orgId}/members/${memberId}`, {
      role,
    });
  }

  removeMember(orgId: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`/api/organizations/${orgId}/members/${memberId}`);
  }

  uploadOrganizationAvatar(orgId: string, file: File): Observable<OrganizationResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.put<OrganizationResponse>(`/api/organizations/${orgId}/avatar`, form);
  }

  uploadProjectAvatar(orgId: string, projectId: string, file: File): Observable<ProjectResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.put<ProjectResponse>(
      `/api/organizations/${orgId}/projects/${projectId}/avatar`,
      form,
    );
  }
}
