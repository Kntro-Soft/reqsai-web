/** Mirrors the workspace REST contract (backend feature/workspace-read-endpoints). */

export interface OrganizationResponse {
  id: string;
  name: string;
  slug: string;
  status: string;
  ownerId: string;
  meetingLanguage: string;
  audioRetentionDays: number;
  avatarUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
  meetingLanguage?: string;
}

export interface ProjectResponse {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  programmingLanguages: string[];
  frameworks: string[];
  clientPlatforms: string[];
  databases: string[];
  architecture: string;
  domain: string;
  status: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  programmingLanguages?: string[];
  frameworks?: string[];
  clientPlatforms?: string[];
  databases?: string[];
  architecture?: string;
  domain?: string;
}

/** Spring Data page envelope returned by the paginated list endpoints. */
export interface PageResponse<T> {
  content: T[];
  page: {
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

/** Partial update — only the provided fields are changed (backend PATCH). */
export interface UpdateOrganizationRequest {
  name?: string;
  meetingLanguage?: string;
  audioRetentionDays?: number;
}

type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';
type MemberStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE';

export interface MemberResponse {
  id: string;
  organizationId: string;
  userId: string | null;
  email: string;
  displayName: string;
  role: MemberRole;
  status: MemberStatus;
  invitedBy: string | null;
  invitedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Invite payload; the backend only allows ADMIN or MEMBER (OWNER is the creator). */
export interface CreateMemberRequest {
  email: string;
  displayName: string;
  role: 'ADMIN' | 'MEMBER';
}

/** Public view of an invitation, resolved from the token (GET /api/invitations/{token}). */
export interface InvitationView {
  organizationName: string;
  role: 'ADMIN' | 'MEMBER' | string;
  email: string;
  invitedByName: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' | 'SUPERSEDED' | string;
  expired: boolean;
}

/** Result of accepting an invitation (POST /api/invitations/accept). */
export interface AcceptInvitationResult {
  organizationId: string;
  organizationName: string;
  memberId: string;
  role: string;
}

/** A project ↔ member assignment (the names are resolved client-side from the org members). */
export interface ProjectMemberResponse {
  id: string;
  projectId: string;
  memberId: string;
  roleId: string;
  assignedBy: string | null;
  assignedAt: string | null;
}

/** Fine-grained capability a project role may grant. The backend enumerates exactly these. */
export type Permission =
  | 'READ_PROJECT'
  | 'WRITE_PROJECT'
  | 'MANAGE_MEMBERS'
  | 'MANAGE_ROLES'
  | 'UPLOAD_DOCUMENTS'
  | 'MANAGE_GLOSSARY'
  | 'RUN_DISCOVERY'
  | 'MANAGE_INTEGRATIONS';

/** All permissions, in display order. */
export const PERMISSIONS: readonly Permission[] = [
  'READ_PROJECT',
  'WRITE_PROJECT',
  'MANAGE_MEMBERS',
  'MANAGE_ROLES',
  'UPLOAD_DOCUMENTS',
  'MANAGE_GLOSSARY',
  'RUN_DISCOVERY',
  'MANAGE_INTEGRATIONS',
];

/** A dynamic, per-project role bundling a set of permissions. */
export interface ProjectRoleResponse {
  id: string;
  projectId: string;
  name: string;
  permissions: Permission[];
  createdAt: string | null;
  updatedAt: string | null;
}

/** Create/update payload for a project role. */
export interface ProjectRoleRequest {
  name: string;
  permissions: Permission[];
}

/** Assign an org member to a project role. */
export interface AssignProjectMemberRequest {
  memberId: string;
  roleId: string;
}

/** Change the role of an existing project member assignment. */
export interface UpdateProjectMemberRoleRequest {
  roleId: string;
}
