import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  AcceptSuggestionRequest,
  CreateDiscoverySessionRequest,
  DiscoverySessionResponse,
  PageResponse,
  ProcessTranscriptResponse,
  SuggestionResponse,
  SuggestionStatus,
  TranscriptResponse,
  UserStoryResponse,
} from './discovery.models';

/** Default segment page size for the cursor-paginated segments endpoint. */
export const SEGMENT_PAGE_SIZE = 50;

/** HTTP client for discovery sessions. Tenant is resolved by the backend from the JWT. */
@Injectable({ providedIn: 'root' })
export class DiscoveryApiService {
  private readonly http = inject(HttpClient);

  private base(projectId: string): string {
    return `/api/projects/${projectId}/sessions`;
  }

  createSession(
    projectId: string,
    request: CreateDiscoverySessionRequest,
  ): Observable<DiscoverySessionResponse> {
    return this.http.post<DiscoverySessionResponse>(this.base(projectId), request);
  }

  getSession(projectId: string, sessionId: string): Observable<DiscoverySessionResponse> {
    return this.http.get<DiscoverySessionResponse>(`${this.base(projectId)}/${sessionId}`);
  }

  /** Paginated session list, newest first (the backend's default sort is createdAt DESC). */
  listSessions(
    projectId: string,
    page = 0,
    size = 20,
  ): Observable<PageResponse<DiscoverySessionResponse>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PageResponse<DiscoverySessionResponse>>(this.base(projectId), { params });
  }

  transition(
    projectId: string,
    sessionId: string,
    action: 'start' | 'pause' | 'resume' | 'stop',
  ): Observable<DiscoverySessionResponse> {
    return this.http.post<DiscoverySessionResponse>(
      `${this.base(projectId)}/${sessionId}/${action}`,
      {},
    );
  }

  /** Raw transcript text of a session (null while nothing has been transcribed). */
  getTranscript(sessionId: string): Observable<TranscriptResponse> {
    return this.http.get<TranscriptResponse>(`/api/sessions/${sessionId}/transcript`);
  }

  /**
   * A cursor page of a session's final transcript segments, ascending by
   * sequence — replays a historical session as timestamped bubbles. Pass
   * `beforeSequence` to fetch the chunk immediately older than an already-loaded
   * segment (omit for the newest chunk); `limit` caps the page size.
   *
   * Added by a parallel backend branch; callers must fall back to
   * {@link getTranscript} when it 404s. The response shape is still settling
   * (bare array / hasMore flag / PageResponse), so it is typed `unknown` and
   * normalized by `normalizeSegmentPage` in feed.ts.
   */
  listSessionSegments(
    sessionId: string,
    beforeSequence?: number,
    limit = SEGMENT_PAGE_SIZE,
  ): Observable<unknown> {
    let params = new HttpParams().set('limit', limit);
    if (beforeSequence !== undefined) {
      params = params.set('beforeSequence', beforeSequence);
    }
    return this.http.get<unknown>(`/api/sessions/${sessionId}/segments`, { params });
  }

  /** Uploads an audio file for transcription (session-scoped endpoint). */
  uploadAudio(sessionId: string, file: File): Observable<DiscoverySessionResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<DiscoverySessionResponse>(`/api/sessions/${sessionId}/upload`, form);
  }

  /** Runs AI extraction on the transcript; returns the session and generated stories. */
  process(sessionId: string): Observable<ProcessTranscriptResponse> {
    return this.http.post<ProcessTranscriptResponse>(`/api/sessions/${sessionId}/process`, {});
  }

  listSessionStories(sessionId: string): Observable<PageResponse<UserStoryResponse>> {
    return this.http.get<PageResponse<UserStoryResponse>>(`/api/sessions/${sessionId}/stories`);
  }

  /** The project's whole backlog (AI-generated across sessions + manual stories). */
  listProjectStories(projectId: string): Observable<PageResponse<UserStoryResponse>> {
    return this.http.get<PageResponse<UserStoryResponse>>(`/api/projects/${projectId}/stories`);
  }

  // ---- AI suggestion review ----

  /** Pending suggestions for a session (accepted/dismissed are not returned). */
  listSuggestions(sessionId: string): Observable<SuggestionResponse[]> {
    return this.http.get<SuggestionResponse[]>(`/api/sessions/${sessionId}/suggestions`);
  }

  /**
   * A session's suggestions filtered by status — e.g. ACCEPTED/DISMISSED to
   * reconstruct past decisions for a loaded (non-live) session. The `status`
   * query param is being added by a parallel backend branch; on an older
   * backend the param is ignored and only PENDING rows come back, so callers
   * must tolerate an unfiltered result.
   */
  listSessionSuggestions(
    sessionId: string,
    status: SuggestionStatus,
  ): Observable<SuggestionResponse[]> {
    const params = new HttpParams().set('status', status);
    return this.http.get<SuggestionResponse[]>(`/api/sessions/${sessionId}/suggestions`, {
      params,
    });
  }

  /**
   * Project-wide pending suggestions. The endpoint is being added by a parallel
   * backend branch — callers must fall back to per-session queries on error.
   */
  listProjectPendingSuggestions(projectId: string): Observable<SuggestionResponse[]> {
    const params = new HttpParams().set('status', 'PENDING');
    return this.http
      .get<PageResponse<SuggestionResponse>>(`/api/projects/${projectId}/suggestions`, { params })
      .pipe(map((page) => page.content));
  }

  acceptSuggestion(
    sessionId: string,
    suggestionId: string,
    request: AcceptSuggestionRequest,
  ): Observable<SuggestionResponse> {
    return this.http.post<SuggestionResponse>(
      `/api/sessions/${sessionId}/suggestions/${suggestionId}/accept`,
      request,
    );
  }

  dismissSuggestion(sessionId: string, suggestionId: string): Observable<SuggestionResponse> {
    return this.http.post<SuggestionResponse>(
      `/api/sessions/${sessionId}/suggestions/${suggestionId}/dismiss`,
      {},
    );
  }
}
