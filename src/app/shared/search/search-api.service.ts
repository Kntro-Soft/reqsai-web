import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/** The kinds of entity the global-search endpoint can return. */
export type SearchHitType =
  | 'PROJECT'
  | 'USER_STORY'
  | 'ORGANIZATION'
  | 'MEMBER'
  | 'GLOSSARY_TERM'
  | 'DOCUMENT';

/** A single hit from `GET /api/search`. `projectId` is set for PROJECT/USER_STORY, else null. */
export interface SearchHitResponse {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle: string | null;
  projectId: string | null;
}

/**
 * Thin client for the backend global-search endpoint that powers the command palette. Search spans
 * every bounded context (projects, stories, organizations, members) and is authorized + tenant-scoped
 * server-side from the JWT, so the caller only sends the term.
 */
@Injectable({ providedIn: 'root' })
export class SearchApiService {
  private readonly http = inject(HttpClient);

  search(q: string, limit = 8): Observable<SearchHitResponse[]> {
    return this.http.get<SearchHitResponse[]>('/api/search', {
      params: new HttpParams().set('q', q).set('limit', limit),
    });
  }
}
