/** GET /projects/{projectId}/quality-metrics: the indicators that validate the pilots' success criteria. */
export interface QualityMetricsResponse {
  /** First day of the period (`YYYY-MM-DD`, UTC, inclusive). */
  from: string;
  /** Last day of the period (`YYYY-MM-DD`, UTC, inclusive). */
  to: string;
  /** False when no meeting ended and no story was decided in the period. */
  hasData: boolean;
  /** Meetings that ended in the period. */
  sessions: number;
  acceptance: QualityAcceptance;
  postProcessing: QualityPostProcessing;
  clarification: QualityClarification;
}

/** AI-generated stories decided in the period and how much of them survived the review. */
export interface QualityAcceptance {
  /** Minimum similarity (0 to 1) between the proposed and the final text to count as not rewritten. */
  similarityThreshold: number;
  decided: number;
  accepted: number;
  acceptedAsGenerated: number;
  acceptedRewritten: number;
  rejected: number;
  /** Stories decided in the period that were not AI-generated or lack the original text; not counted. */
  withoutBaseline: number;
  /** `acceptedAsGenerated / decided` (0 to 1); null while no AI story was decided. */
  rate: number | null;
}

/** Time from the end of a meeting to the last review decision on the stories it produced. */
export interface QualityPostProcessing {
  measured: number;
  /** Meetings with no finished review: stories still in draft, no story, or no recorded decision time. */
  unmeasured: number;
  averageSeconds: number | null;
  medianSeconds: number | null;
  /** The measured meetings, newest first. */
  sessions: QualitySessionReview[];
}

interface QualitySessionReview {
  sessionId: string;
  title: string;
  purpose: 'DISCOVERY' | 'CLARIFICATION';
  endedAt: string;
  seconds: number;
}

interface QualityClarification {
  /** Meetings created as clarification (follow-up) meetings. */
  meetings: number;
  /** Every meeting of the period. */
  sessions: number;
  /** `meetings / sessions` (0 to 1); null when there was no meeting. */
  share: number | null;
}
