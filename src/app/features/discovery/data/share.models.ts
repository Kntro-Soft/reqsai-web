import { AcceptanceCriterionResponse, StoryPriority } from './discovery.models';

/** A link a client opens without an account to review the project's stories (US50). */
export interface ShareLinkResponse {
  id: string;
  projectId: string;
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
