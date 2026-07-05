import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PageResponse } from './discovery.models';

/** Optional server-side page/search options for the paginated context lists. */
export interface ContextListOptions {
  page?: number;
  size?: number;
  search?: string;
}

/**
 * Builds page/size/search query params for the paginated glossary/constraints
 * list endpoints. Only set keys are emitted (blank search dropped). Exported as a
 * pure helper for unit tests.
 */
export function buildContextListParams(options: ContextListOptions): HttpParams {
  let params = new HttpParams();
  if (options.page !== undefined && options.page !== null)
    params = params.set('page', options.page);
  if (options.size !== undefined && options.size !== null)
    params = params.set('size', options.size);
  const search = options.search?.trim();
  if (search) params = params.set('search', search);
  return params;
}

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

  /**
   * A page of the project glossary (default sort: term asc), with optional
   * server-side substring search over term + definition. Returns a PageResponse —
   * the backend list shape is paginated, not a flat array.
   */
  listGlossaryTerms(
    orgId: string,
    projectId: string,
    options: ContextListOptions = {},
  ): Observable<PageResponse<GlossaryTermResponse>> {
    return this.http.get<PageResponse<GlossaryTermResponse>>(this.glossaryBase(orgId, projectId), {
      params: buildContextListParams(options),
    });
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

  /**
   * A page of the project constraints (default sort: newest first), with optional
   * server-side substring search over the description. Returns a PageResponse —
   * the backend list shape is paginated, not a flat array.
   */
  listConstraints(
    orgId: string,
    projectId: string,
    options: ContextListOptions = {},
  ): Observable<PageResponse<ProjectConstraintResponse>> {
    return this.http.get<PageResponse<ProjectConstraintResponse>>(
      this.constraintsBase(orgId, projectId),
      { params: buildContextListParams(options) },
    );
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
