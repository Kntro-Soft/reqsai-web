import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AcceptSuggestionRequest,
  CreateDiscoverySessionRequest,
  DiscoverySessionResponse,
  PageResponse,
  ProcessTranscriptResponse,
  SuggestionResponse,
  TranscriptResponse,
  UserStoryResponse,
} from './discovery.models';

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

  /**
   * Deletes a session. The endpoint is being added by a parallel backend branch —
   * callers must treat a 404/405 as "not supported yet" and hide the affordance.
   */
  deleteSession(projectId: string, sessionId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(projectId)}/${sessionId}`);
  }

  /** Raw transcript text of a session (null while nothing has been transcribed). */
  getTranscript(sessionId: string): Observable<TranscriptResponse> {
    return this.http.get<TranscriptResponse>(`/api/sessions/${sessionId}/transcript`);
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
   * Project-wide pending suggestions. The endpoint is being added by a parallel
   * backend branch — callers must fall back to per-session queries on error.
   */
  listProjectPendingSuggestions(projectId: string): Observable<SuggestionResponse[]> {
    const params = new HttpParams().set('status', 'PENDING');
    return this.http.get<SuggestionResponse[]>(`/api/projects/${projectId}/suggestions`, {
      params,
    });
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
