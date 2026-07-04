import { CanDeactivateFn } from '@angular/router';
import { DiscoveryChat } from '../pages/discovery-chat/discovery-chat';

/**
 * Blocks in-app navigation away from the discovery chat while a session is live
 * (RECORDING/PAUSED) until the user confirms a styled warning modal. The
 * component owns the decision (only prompts when a recording is active) and
 * resolves the returned promise; the native `beforeunload` guard still covers
 * hard reloads and tab closes, which cannot be replaced by a custom dialog.
 */
export const recordingLeaveGuard: CanDeactivateFn<DiscoveryChat> = (component) =>
  component.canLeave();
