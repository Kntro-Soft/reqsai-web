import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { silentForbidden } from '../../../core/interceptors/error.interceptor';
import {
  CodeModuleResponse,
  CodeRepositoryResponse,
  ConnectCodeRepositoryRequest,
} from './codebase.models';

/**
 * Client for a project's connected code: connect a GitHub repository (indexing runs in the
 * background), list the repositories (polled while indexing), reindex, remove, and read the module
 * map. The reads are page loads and polls, so a 403 stays out of the global "no access" toast.
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
}
