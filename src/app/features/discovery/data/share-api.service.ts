import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SuggestionResponse, UserStoryResponse } from './discovery.models';
import {
  CreateShareLinkRequest,
  LeaveStoryFeedbackRequest,
  ShareAccess,
  ShareLinkResponse,
  SharedAcceptRequest,
  SharedBacklogResponse,
  SharedSessionResponse,
  SharedStoryDecision,
  StoryFeedbackResponse,
} from './share.models';

/**
 * HTTP client for sharing stories with a client (US50). The team side is tenant-scoped through the
 * JWT; the client side (`/api/share/{token}`) is public and the token names the project.
 */
@Injectable({ providedIn: 'root' })
export class ShareApiService {
  private readonly http = inject(HttpClient);

  /** Creates a link valid for `days` days; the response is the only one that carries the token. */
  createLink(projectId: string, days: number): Observable<ShareLinkResponse> {
    return this.http.post<ShareLinkResponse>(`/api/projects/${projectId}/share-links`, { days });
  }

  /** Creates a link that follows one session, as a spectator (`VIEW`) or a reviewer (`REVIEW`). */
  createSessionLink(
    projectId: string,
    sessionId: string,
    days: number,
    access: ShareAccess,
  ): Observable<ShareLinkResponse> {
    const body: CreateShareLinkRequest = { days, sessionId, access };
    return this.http.post<ShareLinkResponse>(`/api/projects/${projectId}/share-links`, body);
  }

  /** The project's links, newest first, without their tokens. */
  listLinks(projectId: string): Observable<ShareLinkResponse[]> {
    return this.http.get<ShareLinkResponse[]>(`/api/projects/${projectId}/share-links`);
  }

  revokeLink(projectId: string, linkId: string): Observable<ShareLinkResponse> {
    return this.http.delete<ShareLinkResponse>(`/api/projects/${projectId}/share-links/${linkId}`);
  }

  /** What clients said about a story through share links, oldest first. */
  storyFeedback(projectId: string, storyId: string): Observable<StoryFeedbackResponse[]> {
    return this.http.get<StoryFeedbackResponse[]>(
      `/api/projects/${projectId}/stories/${storyId}/client-feedback`,
    );
  }

  /** Public: the shared backlog. `404 SHARE_LINK_UNAVAILABLE` when unknown, revoked or expired. */
  openShared(token: string): Observable<SharedBacklogResponse> {
    return this.http.get<SharedBacklogResponse>(`/api/share/${encodeURIComponent(token)}`);
  }

  /** Public: the client approves or comments on a shared story. */
  leaveFeedback(
    token: string,
    storyId: string,
    request: LeaveStoryFeedbackRequest,
  ): Observable<StoryFeedbackResponse> {
    return this.http.post<StoryFeedbackResponse>(
      `/api/share/${encodeURIComponent(token)}/stories/${storyId}/feedback`,
      request,
    );
  }

  /** Public: the shared session, as it stands now. */
  openSharedSession(token: string): Observable<SharedSessionResponse> {
    return this.http.get<SharedSessionResponse>(`${this.sessionBase(token)}`);
  }

  /** Public, reviewer links only: accepts a suggestion, optionally editing the draft or approving. */
  acceptSharedSuggestion(
    token: string,
    suggestionId: string,
    request: SharedAcceptRequest = {},
  ): Observable<SuggestionResponse> {
    return this.http.post<SuggestionResponse>(
      `${this.sessionBase(token)}/suggestions/${suggestionId}/accept`,
      request,
    );
  }

  /** Public, reviewer links only: dismisses a suggestion. */
  dismissSharedSuggestion(token: string, suggestionId: string): Observable<SuggestionResponse> {
    return this.http.post<SuggestionResponse>(
      `${this.sessionBase(token)}/suggestions/${suggestionId}/dismiss`,
      {},
    );
  }

  /** Public, reviewer links only: approves, rejects or sends back to draft a story of the session. */
  changeSharedStoryStatus(
    token: string,
    storyId: string,
    status: SharedStoryDecision,
  ): Observable<UserStoryResponse> {
    return this.http.post<UserStoryResponse>(
      `${this.sessionBase(token)}/stories/${storyId}/status`,
      { status },
    );
  }

  private sessionBase(token: string): string {
    return `/api/share/session/${encodeURIComponent(token)}`;
  }
}
