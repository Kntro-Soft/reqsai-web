import { QualityFindingResponse, StoryQualityResponse } from './story-quality.models';

/** How good a score reads: it picks the colour and the word next to the number. */
export type QualityLevel = 'GOOD' | 'FAIR' | 'POOR';

/** From this score a story is good to approve. */
export const GOOD_SCORE = 80;
/** From this score (and below good) a story is worth improving before approving. */
export const FAIR_SCORE = 50;

/** Reads a 0..100 score as good, fair or poor. Out-of-range values are clamped. */
export function qualityLevel(score: number): QualityLevel {
  const clamped = clampScore(score);
  if (clamped >= GOOD_SCORE) return 'GOOD';
  if (clamped >= FAIR_SCORE) return 'FAIR';
  return 'POOR';
}

/** Keeps a score inside 0..100; a non-number reads as 0. */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

/** The characteristics that still need work, in the order they were evaluated. */
export function unmetFindings(quality: StoryQualityResponse | null): QualityFindingResponse[] {
  return (quality?.characteristics ?? []).filter((finding) => !finding.met);
}

/**
 * The `stroke-dashoffset` that makes a ring of the given radius show `score` percent of its circle:
 * the full circumference when the score is 0 and nothing when it is 100.
 */
export function ringOffset(score: number, radius: number): number {
  const circumference = 2 * Math.PI * radius;
  return circumference * (1 - clampScore(score) / 100);
}
