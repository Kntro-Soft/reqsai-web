/** Mirrors the story quality REST contract (backend discovery context, US68). */

/** The characteristics every story is evaluated against. */
type QualityCharacteristic = 'AMBIGUITY' | 'ATOMICITY' | 'VERIFIABILITY' | 'COMPLETENESS';

/** How a story fares on one characteristic. */
export interface QualityFindingResponse {
  characteristic: QualityCharacteristic;
  /** 0 (not met at all) to 100 (fully met). */
  score: number;
  /** True when nothing is left to fix (score 100). */
  met: boolean;
  /** What the evaluation found, written in the language of the story. */
  observation: string;
  /** How to fix it before approving; null when the characteristic is met. */
  suggestion: string | null;
}

/** Latest quality assessment of a story: GET/POST /projects/{projectId}/stories/{storyId}/quality. */
export interface StoryQualityResponse {
  storyId: string;
  /** Overall score, 0 to 100. */
  score: number;
  characteristics: QualityFindingResponse[];
  /** When the story was evaluated (ISO 8601). */
  evaluatedAt: string;
}
