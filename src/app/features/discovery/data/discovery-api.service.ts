import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateDiscoverySessionRequest,
  DiscoverySessionResponse,
  PageResponse,
  ProcessTranscriptResponse,
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

  listSessions(projectId: string): Observable<PageResponse<DiscoverySessionResponse>> {
    return this.http.get<PageResponse<DiscoverySessionResponse>>(this.base(projectId));
  }

  transition(
    projectId: string,
    sessionId: string,
    action: 'start' | 'pause' | 'resume' | 'stop' | 'reset',
  ): Observable<DiscoverySessionResponse> {
    return this.http.post<DiscoverySessionResponse>(
      `${this.base(projectId)}/${sessionId}/${action}`,
      {},
    );
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
}
