import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { silentForbidden } from '../../../core/interceptors/error.interceptor';
import {
  CodeModuleResponse,
  CodeRepositoryResponse,
  CompleteGitHubInstallRequest,
  ConnectCodeRepositoryRequest,
  GitHubConnectionResponse,
  GitHubInstallResultResponse,
  GitHubRepositoryResponse,
} from './codebase.models';

/**
 * Client for a project's connected code: connect a GitHub repository (indexing runs in the
 * background), list the repositories (polled while indexing), reindex, remove, and read the module
 * map; and the organization's GitHub App connection (install, link, unlink, and the repositories it
 * shares). The reads are page loads and polls, so a 403 stays out of the global "no access" toast.
 */
@Injectable({ providedIn: 'root' })
export class CodebaseApiService {
  private readonly http = inject(HttpClient);

  private base(projectId: string): string {
    return `/api/projects/${projectId}/code/repositories`;
  }

  listRepositories(projectId: string): Observable<CodeRepositoryResponse[]> {
    return this.http.get<CodeRepositoryResponse[]>(this.base(projectId), {
      context: silentForbidden(),
    });
  }

  connectRepository(
    projectId: string,
    request: ConnectCodeRepositoryRequest,
  ): Observable<CodeRepositoryResponse> {
    return this.http.post<CodeRepositoryResponse>(this.base(projectId), request);
  }

  reindexRepository(projectId: string, repositoryId: string): Observable<CodeRepositoryResponse> {
    return this.http.post<CodeRepositoryResponse>(
      `${this.base(projectId)}/${repositoryId}/reindex`,
      {},
    );
  }

  removeRepository(projectId: string, repositoryId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(projectId)}/${repositoryId}`);
  }

  listModules(projectId: string, repositoryId: string): Observable<CodeModuleResponse[]> {
    return this.http.get<CodeModuleResponse[]>(`${this.base(projectId)}/${repositoryId}/modules`, {
      context: silentForbidden(),
    });
  }

  // ---- GitHub App ----

  /** The organization's GitHub connection, as a project sees it. */
  projectGitHub(projectId: string): Observable<GitHubConnectionResponse> {
    return this.http.get<GitHubConnectionResponse>(`/api/projects/${projectId}/code/github`, {
      context: silentForbidden(),
    });
  }

  /** What the organization's installations share, to pick a repository for the project. */
  gitHubRepositories(projectId: string): Observable<GitHubRepositoryResponse[]> {
    return this.http.get<GitHubRepositoryResponse[]>(
      `/api/projects/${projectId}/code/github/repositories`,
      { context: silentForbidden() },
    );
  }

  organizationGitHub(orgId: string): Observable<GitHubConnectionResponse> {
    return this.http.get<GitHubConnectionResponse>(`/api/organizations/${orgId}/code/github`, {
      context: silentForbidden(),
    });
  }

  /** The GitHub page where the organization installs the App (carries a signed state). */
  startGitHubInstall(orgId: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`/api/organizations/${orgId}/code/github/install`, {});
  }

  completeGitHubInstall(
    orgId: string,
    request: CompleteGitHubInstallRequest,
  ): Observable<GitHubInstallResultResponse> {
    return this.http.post<GitHubInstallResultResponse>(
      `/api/organizations/${orgId}/code/github/installations`,
      request,
    );
  }

  disconnectGitHub(orgId: string, installationId: number): Observable<void> {
    return this.http.delete<void>(
      `/api/organizations/${orgId}/code/github/installations/${installationId}`,
    );
  }
}
