import { StorySourceFragmentResponse } from './story-sources.models';

/**
 * Pure rules for showing where a story comes from (US72): how the moment of the meeting is written and
 * where a fragment links to in the session. Kept free of Angular so they are unit-testable.
 */

/**
 * A recording offset as a clock: `m:ss`, or `h:mm:ss` from one hour. A missing, negative or non-finite
 * offset reads as `0:00`.
 */
export function formatMeetingMoment(ms: number | null | undefined): string {
  const total = ms != null && Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}

/**
 * The moment of the meeting a fragment was said, as `m:ss` or `m:ss – m:ss` when it runs for at least
 * a second. Null when the fragment was not located in the transcript.
 */
export function fragmentMoment(
  fragment: Pick<StorySourceFragmentResponse, 'startMs' | 'endMs'>,
): string | null {
  if (fragment.startMs == null) return null;
  const start = formatMeetingMoment(fragment.startMs);
  const end = fragment.endMs != null ? formatMeetingMoment(fragment.endMs) : start;
  return end === start ? start : `${start} – ${end}`;
}

/** The query params that open the fragment's session at its segment (`segment` only when located). */
export function fragmentSessionParams(
  fragment: Pick<StorySourceFragmentResponse, 'sessionId' | 'startSequence'>,
): { session: string; segment?: number } {
  return fragment.startSequence != null
    ? { session: fragment.sessionId, segment: fragment.startSequence }
    : { session: fragment.sessionId };
}
