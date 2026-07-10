import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AuthorizeUrlResponse,
  CreateJiraConnectionRequest,
  IntegrationConnectionResponse,
  IntegrationJobResponse,
  JiraImportPreviewResponse,
  JiraImportRequest,
  JiraImportResponse,
  JiraIssueTypeResponse,
  JiraOAuthCallbackRequest,
  JiraProjectResponse,
  JiraPushAllResponse,
  JiraPushResultResponse,
  OAuthCallbackResult,
  ProjectJiraTargetResponse,
  TestConnectionResponse,
  UpsertProjectJiraTargetRequest,
} from './integrations.models';

/**
 * Builds the query params for the Jira issue-types lookup. Exported as a pure
 * helper so the (trivial but load-bearing) trimming/omission rules are unit-tested
 * without the HTTP layer: a blank project key emits no param at all.
 */
export function buildIssueTypesParams(projectKey: string | undefined): HttpParams {
  let params = new HttpParams();
  const trimmed = projectKey?.trim();
  if (trimmed) params = params.set('projectKey', trimmed);
  return params;
}

/**
 * HTTP client for the Jira integration endpoints (locked contract, `Api-Version: 1`).
 * Split across two resource roots: organization-level *connections* (credentials +
 * Jira metadata lookups) and project-level *targets* + story *pushes*. The active
 * tenant is resolved by the backend from the JWT; the org id still travels in the
 * path for the connection endpoints.
 *
 * SECURITY: the Jira API token is only ever sent to the backend on
 * {@link createJiraConnection}. It is never returned, stored, or held in any
 * client-side state — callers must clear the token field after submit.
 */
@Injectable({ providedIn: 'root' })
export class IntegrationsApiService {
  private readonly http = inject(HttpClient);

  private orgBase(orgId: string): string {
    return `/api/organizations/${orgId}/integrations`;
  }

  private projectBase(projectId: string): string {
    return `/api/projects/${projectId}/integration/jira`;
  }

  // --- Organization-level connection ---

  /** List the organization's integration connections. */
  listConnections(orgId: string): Observable<IntegrationConnectionResponse[]> {
    return this.http.get<IntegrationConnectionResponse[]>(this.orgBase(orgId));
  }

  /** Create a Jira connection. The token is sent once and never returned. */
  createJiraConnection(
    orgId: string,
    request: CreateJiraConnectionRequest,
  ): Observable<IntegrationConnectionResponse> {
    return this.http.post<IntegrationConnectionResponse>(`${this.orgBase(orgId)}/jira`, request);
  }

  // --- Atlassian OAuth 2.0 ---

  /**
   * Get the Atlassian consent URL to redirect the browser to, plus the signed
   * anti-forgery `state`. Errors with `JIRA_OAUTH_NOT_CONFIGURED` when the server
   * has no Atlassian OAuth app configured.
   */
  getJiraAuthorizeUrl(orgId: string): Observable<AuthorizeUrlResponse> {
    return this.http.get<AuthorizeUrlResponse>(`${this.orgBase(orgId)}/jira/oauth/authorize-url`);
  }

  /**
   * Exchange the Atlassian authorization `code` (+ `state`) for a saved connection.
   * Returns either the saved {@link IntegrationConnectionResponse} or, when the
   * account has multiple sites, a `{ sites }` picker (nothing saved yet — re-call
   * with a chosen `cloudId`). No token is ever held client-side.
   */
  completeJiraOAuth(
    orgId: string,
    request: JiraOAuthCallbackRequest,
  ): Observable<OAuthCallbackResult> {
    return this.http.post<OAuthCallbackResult>(
      `${this.orgBase(orgId)}/jira/oauth/callback`,
      request,
    );
  }

  /** Verify a connection; resolves the linked Jira account name when it succeeds. */
  testConnection(orgId: string, connectionId: string): Observable<TestConnectionResponse> {
    return this.http.post<TestConnectionResponse>(
      `${this.orgBase(orgId)}/${connectionId}/test`,
      {},
    );
  }

  /** Remove a connection (and any project targets that referenced it). */
  deleteConnection(orgId: string, connectionId: string): Observable<void> {
    return this.http.delete<void>(`${this.orgBase(orgId)}/${connectionId}`);
  }

  /** List the Jira projects available on a connection's site. */
  listJiraProjects(orgId: string, connectionId: string): Observable<JiraProjectResponse[]> {
    return this.http.get<JiraProjectResponse[]>(
      `${this.orgBase(orgId)}/${connectionId}/jira/projects`,
    );
  }

  /** List the issue types available in a Jira project. */
  listJiraIssueTypes(
    orgId: string,
    connectionId: string,
    projectKey: string,
  ): Observable<JiraIssueTypeResponse[]> {
    return this.http.get<JiraIssueTypeResponse[]>(
      `${this.orgBase(orgId)}/${connectionId}/jira/issue-types`,
      { params: buildIssueTypesParams(projectKey) },
    );
  }

  // --- Project-level target + push ---

  /** The project's Jira push target, or a 404 error when none is configured. */
  getProjectTarget(projectId: string): Observable<ProjectJiraTargetResponse> {
    return this.http.get<ProjectJiraTargetResponse>(`${this.projectBase(projectId)}/target`);
  }

  /** Set or replace the project's Jira push target. */
  upsertProjectTarget(
    projectId: string,
    request: UpsertProjectJiraTargetRequest,
  ): Observable<ProjectJiraTargetResponse> {
    return this.http.put<ProjectJiraTargetResponse>(
      `${this.projectBase(projectId)}/target`,
      request,
    );
  }

  /** Clear the project's Jira push target. */
  deleteProjectTarget(projectId: string): Observable<void> {
    return this.http.delete<void>(`${this.projectBase(projectId)}/target`);
  }

  /** Push a single story to Jira, creating (or updating) its issue. */
  pushStory(projectId: string, storyId: string): Observable<JiraPushResultResponse> {
    return this.http.post<JiraPushResultResponse>(
      `${this.projectBase(projectId)}/stories/${storyId}/push`,
      {},
    );
  }

  /** Push every eligible story to Jira; returns per-story results + pushed/failed counts. */
  pushAllStories(projectId: string): Observable<JiraPushAllResponse> {
    return this.http.post<JiraPushAllResponse>(
      `${this.projectBase(projectId)}/stories/push-all`,
      {},
    );
  }

  // --- Background integration jobs ---

  /**
   * List the project's integration jobs. With `activeOnly` the backend returns only
   * RUNNING jobs — used to recover in-flight work after a page reload.
   */
  getIntegrationJobs(projectId: string, activeOnly = false): Observable<IntegrationJobResponse[]> {
    let params = new HttpParams();
    if (activeOnly) params = params.set('active', 'true');
    return this.http.get<IntegrationJobResponse[]>(`${this.projectBase(projectId)}/jobs`, {
      params,
    });
  }

  /** A single integration job snapshot — the polling fallback while the socket is down. */
  getIntegrationJob(projectId: string, jobId: string): Observable<IntegrationJobResponse> {
    return this.http.get<IntegrationJobResponse>(`${this.projectBase(projectId)}/jobs/${jobId}`);
  }

  // --- Import FROM Jira ---

  /** Preview the Jira issues available to import, flagging duplicates already mapped to stories. */
  previewJiraImport(projectId: string): Observable<JiraImportPreviewResponse> {
    return this.http.get<JiraImportPreviewResponse>(
      `${this.projectBase(projectId)}/import/preview`,
    );
  }

  /**
   * Import Jira issues as stories. Pass the chosen `issueKeys`, or an empty body
   * (omit `issueKeys`) to import every available issue.
   */
  importFromJira(
    projectId: string,
    request: JiraImportRequest = {},
  ): Observable<JiraImportResponse> {
    return this.http.post<JiraImportResponse>(`${this.projectBase(projectId)}/import`, request);
  }
}
