import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  BasePermission,
  BasePermissionResponse,
  OrgAuthorizationResponse,
  ProjectPermissionsResponse,
} from './permissions.models';

/**
 * Thin HTTP client for the RBAC authorization endpoints (locked contract,
 * `Api-Version: 1`). Feeds the {@link PermissionsStore} so the UI can gate menu
 * items, buttons and routes to what the caller may actually do. The backend
 * remains the source of truth — these reads exist for ergonomics.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsApiService {
  private readonly http = inject(HttpClient);

  /** The caller's org-level role + base permission for the given organization. */
  getOrgAuthorization(orgId: string): Observable<OrgAuthorizationResponse> {
    return this.http.get<OrgAuthorizationResponse>(`/api/organizations/${orgId}/me/authorization`);
  }

  /** The caller's effective permissions on the given project (owner/admin get all). */
  getProjectPermissions(projectId: string): Observable<ProjectPermissionsResponse> {
    return this.http.get<ProjectPermissionsResponse>(`/api/projects/${projectId}/me/permissions`);
  }

  /** The org's member base permission (owner/admin only). */
  getBasePermission(orgId: string): Observable<BasePermissionResponse> {
    return this.http.get<BasePermissionResponse>(`/api/organizations/${orgId}/base-permission`);
  }

  /** Set the org's member base permission (owner/admin only). */
  updateBasePermission(
    orgId: string,
    basePermission: BasePermission,
  ): Observable<BasePermissionResponse> {
    return this.http.put<BasePermissionResponse>(`/api/organizations/${orgId}/base-permission`, {
      basePermission,
    });
  }
}
