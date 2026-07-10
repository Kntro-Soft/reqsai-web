/**
 * Contracts for the RBAC authorization endpoints (locked backend contract,
 * `Api-Version: 1`). These power the permission-aware UX (guards, menu/button
 * gating, graceful 403s). The backend stays the source of truth — the client
 * mirror is ergonomics only.
 */

/** A member's organization-level role. Owner/admin implicitly hold every project permission. */
export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';

/**
 * The GitHub-style baseline every member gets on every project. `NONE` grants
 * nothing by default; `READ` grants the read permissions everywhere. Project
 * roles add more on top.
 */
export type BasePermission = 'NONE' | 'READ';

/** `GET /api/organizations/{orgId}/me/authorization` — the caller's org-level authorization. */
export interface OrgAuthorizationResponse {
  orgRole: OrgRole;
  memberBasePermission: BasePermission;
}

/** `GET /api/projects/{projectId}/me/permissions` — the caller's effective project permissions. */
export interface ProjectPermissionsResponse {
  /** The backend `Permission` enum values (e.g. `STORY_READ`, `DOCUMENT_CREATE`). */
  permissions: string[];
}

/** `GET`/`PUT /api/organizations/{orgId}/base-permission` — the org's member base permission. */
export interface BasePermissionResponse {
  basePermission: BasePermission;
}

/** `PUT` body for the base-permission setting (owner/admin only). */
export interface UpdateBasePermissionRequest {
  basePermission: BasePermission;
}
