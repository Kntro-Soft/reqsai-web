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

type SuggestionType = 'NEW_STORY' | 'UPDATE_STORY' | 'EDGE_CASE' | 'CLARIFYING_QUESTION';
type SuggestionStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED';
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
}

export type SessionRealtimeMessage =
  | SessionRealtimeBase
  | SessionTranscriptSegmentMessage
  | SessionStoryGeneratedMessage
  | SessionProcessingFailedMessage
  | SessionSuggestionMessage;
