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

/** Request body to create/replace a glossary term. */
export interface GlossaryTermRequest {
  term: string;
  definition: string;
}

/** Request body to create/replace a project constraint. */
export interface ProjectConstraintRequest {
  description: string;
}

/**
 * Client for the project-context resources (glossary, constraints) the discovery
 * side panel shows and the standalone Glosario/Restricciones pages manage. Both
 * live under the org-scoped workspace API. A create/replace with a duplicate
 * value fails 409 (GLOSSARY_TERM_ALREADY_EXISTS / PROJECT_CONSTRAINT_ALREADY_EXISTS).
 */
@Injectable({ providedIn: 'root' })
export class ProjectContextApiService {
  private readonly http = inject(HttpClient);

  private glossaryBase(orgId: string, projectId: string): string {
    return `/api/organizations/${orgId}/projects/${projectId}/glossary`;
  }

  private constraintsBase(orgId: string, projectId: string): string {
    return `/api/organizations/${orgId}/projects/${projectId}/constraints`;
  }

  // ---- Glossary ----

  listGlossaryTerms(orgId: string, projectId: string): Observable<GlossaryTermResponse[]> {
    return this.http.get<GlossaryTermResponse[]>(this.glossaryBase(orgId, projectId));
  }

  createGlossaryTerm(
    orgId: string,
    projectId: string,
    request: GlossaryTermRequest,
  ): Observable<GlossaryTermResponse> {
    return this.http.post<GlossaryTermResponse>(this.glossaryBase(orgId, projectId), request);
  }

  updateGlossaryTerm(
    orgId: string,
    projectId: string,
    termId: string,
    request: GlossaryTermRequest,
  ): Observable<GlossaryTermResponse> {
    return this.http.put<GlossaryTermResponse>(
      `${this.glossaryBase(orgId, projectId)}/${termId}`,
      request,
    );
  }

  deleteGlossaryTerm(orgId: string, projectId: string, termId: string): Observable<void> {
    return this.http.delete<void>(`${this.glossaryBase(orgId, projectId)}/${termId}`);
  }

  // ---- Constraints ----

  listConstraints(orgId: string, projectId: string): Observable<ProjectConstraintResponse[]> {
    return this.http.get<ProjectConstraintResponse[]>(this.constraintsBase(orgId, projectId));
  }

  createConstraint(
    orgId: string,
    projectId: string,
    request: ProjectConstraintRequest,
  ): Observable<ProjectConstraintResponse> {
    return this.http.post<ProjectConstraintResponse>(
      this.constraintsBase(orgId, projectId),
      request,
    );
  }

  updateConstraint(
    orgId: string,
    projectId: string,
    constraintId: string,
    request: ProjectConstraintRequest,
  ): Observable<ProjectConstraintResponse> {
    return this.http.put<ProjectConstraintResponse>(
      `${this.constraintsBase(orgId, projectId)}/${constraintId}`,
      request,
    );
  }

  deleteConstraint(orgId: string, projectId: string, constraintId: string): Observable<void> {
    return this.http.delete<void>(`${this.constraintsBase(orgId, projectId)}/${constraintId}`);
  }
}
