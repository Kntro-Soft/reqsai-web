import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  LeaveStoryFeedbackRequest,
  ShareLinkResponse,
  SharedBacklogResponse,
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
}
