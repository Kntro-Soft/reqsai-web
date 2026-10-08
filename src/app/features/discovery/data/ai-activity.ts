import { DiscoverySessionResponse, SuggestionResponse } from './discovery.models';
import { RelativeTime, relativeTime } from './relative-time';

/** What the AI is doing for a session, as shown at the live edge of its feed block. */
type AiActivityState = 'listening' | 'manual' | 'paused' | 'processing' | 'failed';

export interface AiActivity {
  state: AiActivityState;
  /** Extra line that replaces the default hint (the processing failure reason). */
  detail: string | null;
  /** When the newest still-pending suggestion of this session was proposed (listening only). */
  last: Extract<RelativeTime, { kind: 'relative' }> | null;
}

/**
 * Maps a session's lifecycle to the AI status line of its feed block, or null once
 * the session has settled (COMPLETED) or never started (DRAFT):
 *
 * - RECORDING → listening (real-time suggestions are being produced), plus how long
 *   ago the newest pending suggestion arrived, when there is one;
 * - PAUSED → paused (no audio, so no analysis until resumed);
 * - STOPPED / PROCESSING → processing (the final stories are being generated);
 * - FAILED → failed, carrying the backend's reason when it sent one.
 */
export function aiActivityFor(
  session: Pick<DiscoverySessionResponse, 'status' | 'processingError' | 'suggestionMode'>,
  pending: readonly Pick<SuggestionResponse, 'createdAt'>[],
  now: number,
): AiActivity | null {
  switch (session.status) {
    case 'RECORDING':
      // In manual mode the AI waits for "Analizar ahora" instead of listening on its own (US46).
      return {
        state: session.suggestionMode === 'MANUAL' ? 'manual' : 'listening',
        detail: null,
        last: newestPending(pending, now),
      };
    case 'PAUSED':
      return { state: 'paused', detail: null, last: null };
    case 'STOPPED':
    case 'PROCESSING':
      return { state: 'processing', detail: null, last: null };
    case 'FAILED':
      return { state: 'failed', detail: session.processingError?.trim() || null, last: null };
    default:
      return null;
  }
}

function newestPending(
  pending: readonly Pick<SuggestionResponse, 'createdAt'>[],
  now: number,
): AiActivity['last'] {
  const newest = pending
    .map((s) => Date.parse(s.createdAt))
    .filter((t) => !Number.isNaN(t))
    .reduce<number | null>((max, t) => (max === null || t > max ? t : max), null);
  if (newest === null) return null;
  const label = relativeTime(new Date(newest).toISOString(), now);
  return label.kind === 'relative' ? label : null;
}
