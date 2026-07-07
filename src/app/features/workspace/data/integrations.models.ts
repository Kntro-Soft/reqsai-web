/**
 * DTOs for the Jira integration API (locked backend contract, `Api-Version: 1`).
 *
 * An integration lives at two levels: an ORGANIZATION-level *connection* (the Jira
 * site credentials, encrypted server-side — the token is never returned), and a
 * PROJECT-level *target* that maps one project to a Jira project + issue type so
 * stories can be pushed as issues.
 */

/** The integration provider. Only Jira is supported for now. */
export type IntegrationProvider = 'JIRA';

/** Connection health, set by the backend from the last verification. */
export type IntegrationStatus = 'CONNECTED' | 'ERROR';

/**
 * An organization-level integration connection. Never carries the API token — it
 * is encrypted server-side and only ever sent TO the backend on create.
 */
export interface IntegrationConnectionResponse {
  id: string;
  organizationId: string;
  provider: IntegrationProvider;
  siteUrl: string;
  email: string;
  status: IntegrationStatus;
  /** ISO instant of the last successful verification, or null if never verified. */
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body for creating a Jira connection. The token is write-only (never returned). */
export interface CreateJiraConnectionRequest {
  siteUrl: string;
  email: string;
  apiToken: string;
}

/** Result of testing a connection: whether it verified and the resolved account name. */
export interface TestConnectionResponse {
  ok: boolean;
  accountName?: string;
}

/** A Jira project available on a connection's site. */
export interface JiraProjectResponse {
  key: string;
  name: string;
}

/** A Jira issue type available in a project. */
export interface JiraIssueTypeResponse {
  id: string;
  name: string;
}

/** The project → Jira mapping used when pushing stories. 404 from the backend when unset. */
export interface ProjectJiraTargetResponse {
  id: string;
  projectId: string;
  connectionId: string;
  jiraProjectKey: string;
  issueTypeName: string;
  createdAt: string;
  updatedAt: string;
}

/** Body for setting/updating a project's Jira push target. */
export interface UpsertProjectJiraTargetRequest {
  connectionId: string;
  jiraProjectKey: string;
  issueTypeName: string;
}

/** The outcome of pushing a single story: the created/updated Jira issue key + URL. */
export interface JiraPushResultResponse {
  storyId: string;
  jiraIssueKey: string;
  jiraIssueUrl: string;
}

/** Aggregate outcome of a push-all: per-story results plus pushed/failed counts. */
export interface JiraPushAllResponse {
  results: JiraPushResultResponse[];
  pushed: number;
  failed: number;
}
