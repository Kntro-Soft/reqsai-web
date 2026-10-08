import { StoryReviewStatus } from '../../data/discovery.models';

/** Review decisions in button order: approve first, then reject, then back to draft. */
const REVIEW_ORDER: readonly StoryReviewStatus[] = ['APPROVED', 'REJECTED', 'DRAFT'];

/**
 * The review decisions offered for a story in `status`: every review status except the current
 * one, so the decision can always be revised. A missing or unknown status reads as DRAFT (like the
 * badge); a merged or exported story has left review and gets none.
 */
export function reviewTargets(status: string | null | undefined): StoryReviewStatus[] {
  const current = (status ?? 'DRAFT').toUpperCase();
  if (current === 'MERGED' || current === 'EXPORTED') return [];
  const reviewable = (REVIEW_ORDER as readonly string[]).includes(current) ? current : 'DRAFT';
  return REVIEW_ORDER.filter((target) => target !== reviewable);
}
