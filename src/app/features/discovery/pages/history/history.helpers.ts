import { formatElapsed } from '../../components/session-bar/session-bar';
import { DiscoverySessionResponse } from '../../data/discovery.models';

/**
 * Duration cell of the history table: the API's `durationSeconds` (audio length of an upload, start to
 * stop of a live session), else the uploaded audio length for older deployments, else a dash.
 */
export function sessionDuration(
  session: Pick<DiscoverySessionResponse, 'durationSeconds' | 'audioDurationMs'>,
): string {
  if (session.durationSeconds !== null && session.durationSeconds !== undefined) {
    return formatElapsed(session.durationSeconds * 1000);
  }
  return session.audioDurationMs > 0 ? formatElapsed(session.audioDurationMs) : '—';
}

/** True when at least one session carries the per-session stats, so the stats columns are shown. */
export function hasSessionStats(
  sessions: readonly Pick<DiscoverySessionResponse, 'storiesGenerated'>[],
): boolean {
  return sessions.some((s) => s.storiesGenerated !== null && s.storiesGenerated !== undefined);
}
