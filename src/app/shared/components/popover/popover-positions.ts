import { ConnectedPosition } from '@angular/cdk/overlay';

/**
 * Shared CDK connected-overlay positions for the app's popovers (org/project
 * switchers, user menu). Each preset lists a primary placement plus fallbacks
 * the overlay flips to when there isn't room, so a panel near a screen edge
 * stays on screen.
 */

const GAP = 6;

/** Panel below the trigger, left-aligned (e.g. the top-bar project switcher). */
export const BELOW_START: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: GAP },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -GAP },
];

/** Panel above the trigger, left-aligned (e.g. the user menu at the sidebar foot). */
export const ABOVE_START: ConnectedPosition[] = [
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -GAP },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: GAP },
];

/** Panel below the trigger, right-aligned (a toolbar button at the end of a header). */
export const BELOW_END: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: GAP },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -GAP },
];

/** Panel above the trigger, right-aligned (a composer button at the end of a bottom bar). */
export const ABOVE_END: ConnectedPosition[] = [
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -GAP },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: GAP },
];
