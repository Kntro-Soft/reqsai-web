import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** A business term of the project's domain glossary (workspace context REST). */
export interface GlossaryTermResponse {
  id: string;
  term: string;
  definition: string;
  addedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** A recorded project constraint (workspace context REST). */
export interface ProjectConstraintResponse {
  id: string;
  description: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Read-only client for the project-context resources the discovery side panel
 * shows (glossary, constraints). Both live under the org-scoped workspace API.
 */
@Injectable({ providedIn: 'root' })
export class ProjectContextApiService {
  private readonly http = inject(HttpClient);

  listGlossaryTerms(orgId: string, projectId: string): Observable<GlossaryTermResponse[]> {
    return this.http.get<GlossaryTermResponse[]>(
      `/api/organizations/${orgId}/projects/${projectId}/glossary`,
    );
  }

  listConstraints(orgId: string, projectId: string): Observable<ProjectConstraintResponse[]> {
    return this.http.get<ProjectConstraintResponse[]>(
      `/api/organizations/${orgId}/projects/${projectId}/constraints`,
    );
  }
}
