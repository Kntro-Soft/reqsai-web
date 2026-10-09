import { AudioSource } from '../../../core/audio/audio-source';

/**
 * Per-user audio-source preference (in person vs. virtual meeting), persisted
 * in localStorage so the analyst's last choice survives reloads. Pure helpers
 * so the fallback rule stays unit-testable.
 */

const KEY_PREFIX = 'reqsai.discovery.audioSource.';

/** The localStorage key holding one user's last audio-source choice. */
export function audioSourceStorageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/**
 * Resolves the source picker's initial value: a stored `meeting` choice wins
 * only where this browser can capture meeting audio; anything else is `mic`.
 */
export function resolveAudioSource(
  stored: string | null | undefined,
  meetingSupported: boolean,
): AudioSource {
  return stored === 'meeting' && meetingSupported ? 'meeting' : 'mic';
}

const MEETING_TIPS_PREFIX = 'reqsai.discovery.meetingTipsHidden.';

/**
 * The localStorage key recording that one user hid the virtual-meeting tips (share the tab's
 * audio, wear headphones). Once read, the tips are noise before every recording.
 */
export function meetingTipsStorageKey(userId: string): string {
  return `${MEETING_TIPS_PREFIX}${userId}`;
}
