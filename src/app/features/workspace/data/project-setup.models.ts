/**
 * Mirrors the project setup contract (`GET /api/projects/{projectId}/setup`): the Jira and GitHub
 * sources a project was created with, set up in the background, and the optional `sources` the create
 * request carries.
 */

/** The steps of a project's setup, in the order the bar shows them. */
export type SetupStepKey = 'JIRA_LINK' | 'JIRA_IMPORT' | 'GITHUB_REPOS';

export type SetupStepStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';

/** One step of the setup. */
export interface SetupStepResponse {
  key: SetupStepKey;
  status: SetupStepStatus;
  /** Items finished so far (modules indexed, issues imported). */
  done: number;
  /** Items to do; 0 while unknown. */
  total: number;
  /**
   * A short note: error codes (`CODE`, or `owner/name: CODE` per repository, joined by `; `) when a
   * step failed, or `PARTIAL:<n>` when an import finished with n issues that failed.
   */
  detail: string | null;
}

/** The technology found in the project's indexed repositories. */
export interface DetectedStackResponse {
  languages: string[];
  frameworks: string[];
  databases: string[];
  platforms: string[];
}

/** Where a project's setup stands (also the payload pushed on `projects/{id}/setup`). */
export interface ProjectSetupResponse {
  projectId: string;
  /** True while any step still has work ahead. */
  active: boolean;
  steps: SetupStepResponse[];
  detectedStack: DetectedStackResponse | null;
}

/** The Jira project to link, as `CreateProjectRequest.sources.jira` takes it. */
export interface JiraSourceRequest {
  /** The organization's Jira connection; the server uses its active one when omitted. */
  connectionId?: string;
  projectKey: string;
  issueTypeName: string;
  importStories: boolean;
}

/** A repository to connect and index, as `CreateProjectRequest.sources.github` takes it. */
export interface GitHubSourceRequest {
  repository: string;
  branch?: string;
  installationId?: number;
}

/** External sources of a new project. */
export interface ProjectSourcesRequest {
  jira?: JiraSourceRequest;
  github?: GitHubSourceRequest[];
}
