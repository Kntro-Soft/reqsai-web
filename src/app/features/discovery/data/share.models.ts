import {
  AcceptSuggestionRequest,
  AcceptanceCriterionResponse,
  DiscoverySessionResponse,
  SessionSegmentResponse,
  SessionSpeakersResponse,
  StoryPriority,
  StoryReviewStatus,
  SuggestionResponse,
  UserStoryResponse,
} from './discovery.models';

/** What a session link lets its visitor do: only follow along, or also decide. */
export type ShareAccess = 'VIEW' | 'REVIEW';

/** A link a client opens without an account to review the project's stories (US50) or follow a session. */
export interface ShareLinkResponse {
  id: string;
  projectId: string;
  /** The session the link follows; null when it shares the project's stories. */
  sessionId: string | null;
  access: ShareAccess;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
  /** Only present right after the link is created; the backend keeps just its hash. */
  token: string | null;
}

export type StoryFeedbackKind = 'APPROVAL' | 'COMMENT';

/** A client's approval of, or comment on, a story, left through a share link. */
export interface StoryFeedbackResponse {
  id: string;
  storyId: string;
  kind: StoryFeedbackKind;
  authorName: string;
  comment: string | null;
  createdAt: string;
}

/** A story as the client sees it through a share link. */
export interface SharedStoryResponse {
  id: string;
  title: string;
  role: string;
  action: string;
  benefit: string;
  priority: StoryPriority;
  storyPoints: number | null;
  status: string;
  acceptanceCriteria: AcceptanceCriterionResponse[];
  feedback: StoryFeedbackResponse[];
}

/** What a client sees when opening a share link. */
export interface SharedBacklogResponse {
  projectName: string;
  expiresAt: string;
  stories: SharedStoryResponse[];
}

export interface LeaveStoryFeedbackRequest {
  kind: StoryFeedbackKind;
  authorName: string;
  comment?: string | null;
}

/** What a visitor sees when opening a session link; read again every few seconds while it is live. */
export interface SharedSessionResponse {
  projectName: string;
  access: ShareAccess;
  expiresAt: string;
  session: DiscoverySessionResponse;
  /** The latest final segments, oldest first. */
  segments: SessionSegmentResponse[];
  totalSegments: number;
  speakers: SessionSpeakersResponse;
  suggestions: SuggestionResponse[];
  stories: UserStoryResponse[];
}

export interface CreateShareLinkRequest {
  days: number;
  sessionId?: string;
  access?: ShareAccess;
}

export type SharedStoryDecision = StoryReviewStatus;
export type SharedAcceptRequest = AcceptSuggestionRequest;
