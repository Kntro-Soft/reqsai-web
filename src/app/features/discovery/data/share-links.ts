import { ShareLinkResponse } from './share.models';

/** Validity choices offered when creating a link, in days. The backend accepts 1 to 90. */
export const SHARE_LINK_DAYS = [7, 14, 30, 90] as const;

export const DEFAULT_SHARE_LINK_DAYS = 14;

/** Where a link stands for the team: still open, revoked by someone, or past its expiry. */
export type ShareLinkState = 'active' | 'revoked' | 'expired';

export function shareLinkState(link: ShareLinkResponse, now = Date.now()): ShareLinkState {
  if (link.revokedAt) return 'revoked';
  return Date.parse(link.expiresAt) > now ? 'active' : 'expired';
}

/** The public page a client opens for the given token. */
export function shareUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}/share/${token}`;
}

/** Name the client signed with last time on this device, so it is not typed on every story. */
export const SHARE_AUTHOR_KEY = 'reqsai.share.author';

export function readSavedAuthor(): string {
  try {
    return localStorage.getItem(SHARE_AUTHOR_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveAuthor(name: string): void {
  try {
    localStorage.setItem(SHARE_AUTHOR_KEY, name.trim());
  } catch {
    // Storage may be unavailable (private mode); the name is then asked again next time.
  }
}
