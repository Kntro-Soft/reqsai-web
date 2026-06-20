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
  | 'STORY_GENERATED';

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

export type SessionRealtimeMessage =
  | SessionRealtimeBase
  | SessionTranscriptSegmentMessage
  | SessionStoryGeneratedMessage
  | SessionProcessingFailedMessage;
