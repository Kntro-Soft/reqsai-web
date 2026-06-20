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
