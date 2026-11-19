import { UserStoryResponse } from './discovery.models';
import { StoryQualityResponse } from './story-quality.models';

/** Mirrors the "improve a story with AI" REST contract (backend discovery context, US73). */

/** One Given/When/Then criterion of the proposed story. */
export interface ImprovementCriterion {
  /** Optional heading of the scenario; null or blank when it has none. */
  scenario: string | null;
  given: string;
  when: string;
  then: string;
}

/** The improved version of the story the AI proposes. Nothing changes until the analyst applies it. */
export interface StoryImprovementProposal {
  title: string;
  role: string;
  action: string;
  benefit: string;
  acceptanceCriteria: ImprovementCriterion[];
}

/** A value the AI could not know: a `[[...]]` placeholder in the proposal text the analyst must replace. */
export interface PendingValue {
  /** The literal placeholder, brackets included (e.g. `[[tiempo máximo de respuesta]]`). */
  token: string;
  /** What to ask the client to fill it in. */
  hint: string;
}

/** POST /projects/{projectId}/stories/{storyId}/quality/improvement. */
export interface StoryImprovementResponse {
  storyId: string;
  proposal: StoryImprovementProposal;
  pendingValues: PendingValue[];
  /** What was fixed, one sentence each. */
  fixes: string[];
  /** The quality the story would have once the proposal is applied. */
  expectedQuality: StoryQualityResponse;
}

/** POST .../quality/improvement/apply: the story as it was saved and its refreshed quality. */
export interface ApplyStoryImprovementResponse {
  story: UserStoryResponse;
  quality: StoryQualityResponse;
}
