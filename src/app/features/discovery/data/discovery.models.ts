/** Mirrors the discovery REST + realtime contracts (backend discovery context). */

export type SessionStatus =
  | 'DRAFT'
  | 'RECORDING'
  | 'PAUSED'
  | 'STOPPED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export interface DiscoverySessionResponse {
  id: string;
  projectId: string;
  title: string;
  language: string;
  status: SessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  audioDurationMs: number;
  processingError: string | null;
  createdAt: string;
  updatedAt: string;
  // Per-session stats being added by a parallel backend branch — absent on older
  // deployments, so every consumer must degrade gracefully when undefined.
  storiesGeneratedCount?: number | null;
  storiesAcceptedCount?: number | null;
  pendingSuggestionsCount?: number | null;
  questionsCount?: number | null;
}

/** Raw transcript of a session (GET /sessions/{id}/transcript; large text kept off the session resource). */
export interface TranscriptResponse {
  sessionId: string;
  transcript: string | null;
}

/**
 * A persisted final transcript segment (GET /sessions/{id}/segments), used to
 * replay a historical session's conversation as timestamped bubbles. Added by a
 * parallel backend branch — consumers must degrade gracefully when the endpoint
 * is absent (404) and fall back to the joined transcript string.
 */
export interface SessionSegmentResponse {
  sequence: number;
  text: string;
  speakerLabel: string | null;
  startMs: number;
  endMs: number;
  /** Wall-clock time the segment was recorded (ISO 8601). */
  occurredAt: string;
}

/**
 * A cursor page of segments (GET /sessions/{id}/segments?beforeSequence&limit).
 * The backend shape is still settling — it may return a bare array, an object
 * with a `hasMore` flag, or a full {@link PageResponse}. Consumers normalize
 * every shape through {@link normalizeSegmentPage} in feed.ts.
 */
export interface SegmentPage {
  /** Up to `limit` final segments with sequence < beforeSequence, ascending. */
  segments: SessionSegmentResponse[];
  /** Whether older segments remain before the returned chunk. */
  hasMore: boolean;
}

export interface CreateDiscoverySessionRequest {
  title: string;
  language: string;
}

/** A generated/backlog user story (REST), normalized for display alongside live ones. */
export interface UserStoryResponse {
  id: string;
  projectId: string;
  sessionId: string | null;
  title: string;
  role: string;
  action: string;
  benefit: string;
  priority: string;
  storyPoints: number | null;
  status: string;
  /** When the story was created (ISO 8601); optional on older backends. */
  createdAt?: string | null;
}

export interface ProcessTranscriptResponse {
  session: DiscoverySessionResponse;
  stories: UserStoryResponse[];
}

/** Unified story shape the chat renders (fed by both REST and STORY_GENERATED events). */
export interface DisplayStory {
  id: string;
  title: string;
  role: string;
  action: string;
  benefit: string;
  priority: string;
  storyPoints: number | null;
  /**
   * When the story was generated (ISO 8601); used to place it chronologically in
   * the feed. Null when the source (older REST payloads) carried no timestamp.
   */
  createdAt?: string | null;
}

export interface PageResponse<T> {
  content: T[];
  page: {
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
    first: boolean;
    last: boolean;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// ---- AI suggestions (review flow) ----

export type SuggestionType = 'NEW_STORY' | 'UPDATE_STORY' | 'EDGE_CASE' | 'CLARIFYING_QUESTION';
export type SuggestionStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED';
export type SuggestionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SuggestionResponse {
  id: string;
  sessionId: string;
  projectId: string;
  type: SuggestionType;
  status: SuggestionStatus;
  draftTitle: string | null;
  draftRole: string | null;
  draftAction: string | null;
  draftBenefit: string | null;
  draftPriority: SuggestionPriority | null;
  draftStoryPoints: number | null;
  relatedTopic: string | null;
  targetStoryId: string | null;
  question: string | null;
  resolvedStoryId: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * When the suggestion was accepted/dismissed. Being added by a parallel backend
   * branch; absent on older deployments, so consumers fall back to `updatedAt`.
   */
  resolvedAt?: string | null;
  /**
   * Proposed acceptance criteria (NEW_STORY) or the scenario/criterion to add
   * (EDGE_CASE), previewed as a checklist on the card. Shape is still settling on
   * a parallel backend branch — may arrive as a string array or a single newline-
   * joined string, and is absent on older deployments. Normalize through
   * {@link suggestionCriteria} before rendering.
   */
  draftCriteria?: string[] | string | null;
}

/**
 * Normalizes a suggestion's proposed criteria into a clean string list. Accepts a
 * string array, a newline-joined string, or nothing; trims blank lines and common
 * bullet prefixes so a checklist preview renders uniformly regardless of the
 * backend's (still-settling) shape.
 */
export function suggestionCriteria(raw: string[] | string | null | undefined): string[] {
  const lines = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\r?\n/) : [];
  return lines
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 0);
}

/** Accept payload; every field optional — omitted/null keeps the original draft. */
export interface AcceptSuggestionRequest {
  editedTitle?: string;
  editedRole?: string;
  editedAction?: string;
  editedBenefit?: string;
  editedPriority?: SuggestionPriority;
  editedStoryPoints?: number;
}

// ---- Realtime (STOMP topic /topic/sessions/{id}) ----

export type SessionEventType =
  | 'RECORDING_STARTED'
  | 'RECORDING_PAUSED'
  | 'RECORDING_RESUMED'
  | 'RECORDING_STOPPED'
  | 'SESSION_RESET'
  | 'TRANSCRIPT_SEGMENT'
  | 'TRANSCRIPT_UPLOADED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'STORY_GENERATED'
  | 'SUGGESTION_GENERATED'
  | 'SUGGESTION_ACCEPTED'
  | 'SUGGESTION_DISMISSED';

interface SessionRealtimeBase {
  sessionId: string;
  type: SessionEventType;
  occurredAt: string;
}

export interface SessionTranscriptSegmentMessage extends SessionRealtimeBase {
  type: 'TRANSCRIPT_SEGMENT';
  sequence: number;
  speakerLabel: string | null;
  text: string;
  startMs: number;
  endMs: number;
  isFinal: boolean;
}

export interface SessionStoryGeneratedMessage extends SessionRealtimeBase {
  type: 'STORY_GENERATED';
  storyId: string;
  title: string;
  role: string;
  action: string;
  benefit: string;
  priority: string;
  storyPoints: number | null;
}

export interface SessionProcessingFailedMessage extends SessionRealtimeBase {
  type: 'FAILED';
  reason: string;
}

export interface SessionSuggestionMessage extends SessionRealtimeBase {
  type: 'SUGGESTION_GENERATED' | 'SUGGESTION_ACCEPTED' | 'SUGGESTION_DISMISSED';
  suggestionId: string;
  suggestionType: SuggestionType;
  status: SuggestionStatus;
  draftTitle: string | null;
  draftRole: string | null;
  draftAction: string | null;
  draftBenefit: string | null;
  draftPriority: SuggestionPriority | null;
  draftStoryPoints: number | null;
  relatedTopic: string | null;
  targetStoryId: string | null;
  question: string | null;
  resolvedStoryId: string | null;
  /** Proposed acceptance criteria/scenario; see {@link SuggestionResponse.draftCriteria}. */
  draftCriteria?: string[] | string | null;
}

export type SessionRealtimeMessage =
  | SessionRealtimeBase
  | SessionTranscriptSegmentMessage
  | SessionStoryGeneratedMessage
  | SessionProcessingFailedMessage
  | SessionSuggestionMessage;

// ---- Realtime (project-level lifecycle topic /topic/projects/{id}) ----

/**
 * A session lifecycle event broadcast on the project topic, so every project
 * member learns about sessions started/stopped by others without polling.
 * Being added by a parallel backend branch — consumers must subscribe
 * defensively: the topic may not exist yet, and any field besides `sessionId`
 * may be absent on older payloads.
 */
export interface ProjectSessionLifecycleMessage {
  sessionId: string;
  status?: SessionStatus | string | null;
  title?: string | null;
  language?: string | null;
  startedAt?: string | null;
}
