import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  AcceptSuggestionRequest,
  AcceptanceCriterionRequest,
  AcceptanceCriterionResponse,
  AnalyzeSessionResponse,
  AssistantExchangeResponse,
  AssistantMessageResponse,
  BatchDeleteStoriesRequest,
  BatchDeleteStoriesResult,
  ChangeStoryStatusRequest,
  CreateDiscoverySessionRequest,
  CreateUserStoryRequest,
  DiscoverySessionResponse,
  PageResponse,
  ProcessTranscriptResponse,
  StoryListFilters,
  SuggestionMode,
  StoryReviewStatus,
  SuggestionResponse,
  SuggestionStatus,
  TranscriptResponse,
  UpdateUserStoryRequest,
  UserStoryResponse,
} from './discovery.models';

/**
 * Builds the query params for the project backlog list endpoint from the optional
 * filters. Only set keys are emitted, so an unset filter falls back to the backend
 * default (newest first, unrestricted). Exported as a pure helper for unit tests.
 */
export function buildStoryListParams(filters: StoryListFilters): HttpParams {
  let params = new HttpParams();
  const setNum = (key: string, value: number | undefined): void => {
    if (value !== undefined && value !== null) params = params.set(key, value);
  };
  const setStr = (key: string, value: string | undefined): void => {
    const trimmed = value?.trim();
    if (trimmed) params = params.set(key, trimmed);
  };
  setNum('page', filters.page);
  setNum('size', filters.size);
  setStr('sortBy', filters.sortBy);
  setStr('sortDirection', filters.sortDirection);
  setStr('search', filters.search);
  setStr('status', filters.status);
  setStr('priority', filters.priority);
  setStr('createdAfter', filters.createdAfter);
  setStr('createdBefore', filters.createdBefore);
  return params;
}

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

  /** Chooses when the assistant analyzes a session: on its own (AUTO) or only on demand (MANUAL). */
  changeSuggestionMode(
    projectId: string,
    sessionId: string,
    mode: SuggestionMode,
  ): Observable<DiscoverySessionResponse> {
    return this.http.patch<DiscoverySessionResponse>(
      `${this.base(projectId)}/${sessionId}/suggestion-mode`,
      { mode },
    );
  }

  /** "Analizar ahora": analyzes the live session's recent conversation right away. */
  analyzeSession(projectId: string, sessionId: string): Observable<AnalyzeSessionResponse> {
    return this.http.post<AnalyzeSessionResponse>(
      `${this.base(projectId)}/${sessionId}/analyze`,
      {},
    );
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

  /**
   * The project's whole backlog (AI-generated across sessions + manual stories),
   * paginated. All filtering/sorting/pagination runs server-side: sort fields
   * createdAt | title | priority | status (direction ASC | DESC), plus optional
   * text search, status/priority filters and a createdAt range. Omitted filters
   * fall back to the backend defaults (newest first, unrestricted).
   */
  listProjectStories(
    projectId: string,
    filters: StoryListFilters = {},
  ): Observable<PageResponse<UserStoryResponse>> {
    return this.http.get<PageResponse<UserStoryResponse>>(`/api/projects/${projectId}/stories`, {
      params: buildStoryListParams(filters),
    });
  }

  /** A single story by id, including its acceptance criteria (GET /stories/{id}). */
  getStory(projectId: string, storyId: string): Observable<UserStoryResponse> {
    return this.http.get<UserStoryResponse>(`/api/projects/${projectId}/stories/${storyId}`);
  }

  /**
   * Manually creates a user story in the project backlog (POST
   * /projects/{projectId}/stories), saved as a DRAFT. On a near-duplicate the
   * backend responds 409 with a DUPLICATE_USER_STORY ProblemDetail whose
   * `detail` carries the similarity score.
   */
  createStory(projectId: string, request: CreateUserStoryRequest): Observable<UserStoryResponse> {
    return this.http.post<UserStoryResponse>(`/api/projects/${projectId}/stories`, request);
  }

  /**
   * Edits a story's core fields (PUT /projects/{projectId}/stories/{storyId}).
   * A straight field update — it does not re-run duplicate detection. 404 if the
   * story does not exist in the tenant/project.
   */
  updateStory(
    projectId: string,
    storyId: string,
    request: UpdateUserStoryRequest,
  ): Observable<UserStoryResponse> {
    return this.http.put<UserStoryResponse>(
      `/api/projects/${projectId}/stories/${storyId}`,
      request,
    );
  }

  /**
   * Records the review decision on a story (PATCH /projects/{projectId}/stories/{storyId}/status):
   * approve, reject or send it back to draft. Needs STORY_APPROVE; a merged or exported story
   * answers 422 INVALID_STORY_STATUS.
   */
  changeStoryStatus(
    projectId: string,
    storyId: string,
    status: StoryReviewStatus,
  ): Observable<UserStoryResponse> {
    return this.http.patch<UserStoryResponse>(
      `/api/projects/${projectId}/stories/${storyId}/status`,
      { status } satisfies ChangeStoryStatusRequest,
    );
  }

  /**
   * Permanently deletes a single story (DELETE /projects/{projectId}/stories/{storyId}).
   * Resolves on the 204; 404 if the story does not exist in the tenant/project.
   */
  deleteStory(projectId: string, storyId: string): Observable<void> {
    return this.http.delete<void>(`/api/projects/${projectId}/stories/${storyId}`);
  }

  /**
   * Deletes several stories at once (POST /projects/{projectId}/stories/batch-delete),
   * returning how many were actually removed. Unknown ids are simply not counted.
   */
  batchDeleteStories(projectId: string, storyIds: string[]): Observable<BatchDeleteStoriesResult> {
    return this.http.post<BatchDeleteStoriesResult>(
      `/api/projects/${projectId}/stories/batch-delete`,
      { storyIds } satisfies BatchDeleteStoriesRequest,
    );
  }

  // ---- Acceptance criteria (story detail/edit) ----

  private criteriaBase(projectId: string, storyId: string): string {
    return `/api/projects/${projectId}/stories/${storyId}/criteria`;
  }

  /** Adds a Given/When/Then criterion to a story (POST .../criteria). */
  addCriterion(
    projectId: string,
    storyId: string,
    request: AcceptanceCriterionRequest,
  ): Observable<AcceptanceCriterionResponse> {
    return this.http.post<AcceptanceCriterionResponse>(
      this.criteriaBase(projectId, storyId),
      request,
    );
  }

  /** Replaces all fields of an existing criterion (PUT .../criteria/{criterionId}). */
  updateCriterion(
    projectId: string,
    storyId: string,
    criterionId: string,
    request: AcceptanceCriterionRequest,
  ): Observable<AcceptanceCriterionResponse> {
    return this.http.put<AcceptanceCriterionResponse>(
      `${this.criteriaBase(projectId, storyId)}/${criterionId}`,
      request,
    );
  }

  /** Permanently removes a criterion from a story (DELETE .../criteria/{criterionId}). */
  deleteCriterion(projectId: string, storyId: string, criterionId: string): Observable<void> {
    return this.http.delete<void>(`${this.criteriaBase(projectId, storyId)}/${criterionId}`);
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

  /**
   * Accepts any suggestion of the project by id — the route for suggestions raised from the
   * assistant chat, which belong to no session.
   */
  acceptProjectSuggestion(
    projectId: string,
    suggestionId: string,
    request: AcceptSuggestionRequest,
  ): Observable<SuggestionResponse> {
    return this.http.post<SuggestionResponse>(
      `/api/projects/${projectId}/suggestions/${suggestionId}/accept`,
      request,
    );
  }

  /** Dismisses any suggestion of the project by id (assistant-chat suggestions have no session). */
  dismissProjectSuggestion(
    projectId: string,
    suggestionId: string,
  ): Observable<SuggestionResponse> {
    return this.http.post<SuggestionResponse>(
      `/api/projects/${projectId}/suggestions/${suggestionId}/dismiss`,
      {},
    );
  }

  // ---- Assistant chat ----

  /** The newest messages of the project's assistant chat, oldest first. */
  listAssistantMessages(projectId: string, limit = 50): Observable<AssistantMessageResponse[]> {
    return this.http.get<AssistantMessageResponse[]>(
      `/api/projects/${projectId}/assistant/messages`,
      { params: new HttpParams().set('limit', limit) },
    );
  }

  /**
   * Sends a message to ReqsAI: a question is answered from the project, a requirement comes back as
   * suggestions in the reply.
   */
  sendAssistantMessage(projectId: string, content: string): Observable<AssistantExchangeResponse> {
    return this.http.post<AssistantExchangeResponse>(
      `/api/projects/${projectId}/assistant/messages`,
      { content },
    );
  }
}
