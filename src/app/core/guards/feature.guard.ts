import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { FeatureFlags, FeatureKey } from '../features/feature-flags';

/**
 * `CanMatch` guard factory for a feature-flagged route. While `feature` is off the route
 * simply does not match: the router keeps looking, so the URL falls through to the wildcard
 * fallback exactly like an unknown path — no blank page, no "no access" toast, and the lazy
 * chunk is never fetched. While it is on, the route matches as usual, or `next` decides.
 *
 * Pass the route's own `CanMatch` guard (e.g. `requirePermissionMatch`) as `next` instead of
 * listing it beside this one: Angular runs every guard of a `canMatch` array eagerly, so a
 * sibling permission guard would still fetch permissions — and toast a denial — for a route
 * that is switched off.
 *
 * Usage: `canMatch: [featureGuard('billing')]`, or
 * `canMatch: [featureGuard('members', requirePermissionMatch('MEMBER_READ'))]`.
 */
export function featureGuard(feature: FeatureKey, next?: CanMatchFn): CanMatchFn {
  return (route, segments, currentSnapshot) => {
    if (!inject(FeatureFlags).isEnabled(feature)) return false;
    return next ? next(route, segments, currentSnapshot) : true;
  };
}
