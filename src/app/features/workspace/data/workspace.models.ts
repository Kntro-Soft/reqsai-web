/** Mirrors the workspace REST contract (backend feature/workspace-read-endpoints). */

export interface OrganizationResponse {
  id: string;
  name: string;
  slug: string;
  status: string;
  ownerId: string;
  meetingLanguage: string;
  audioRetentionDays: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  programmingLanguages: string[];
  frameworks: string[];
  clientPlatforms: string[];
  databases: string[];
  architecture: string;
  domain: string;
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

export interface UpdateOrganizationRequest {
  name: string;
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
