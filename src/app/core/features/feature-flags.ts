import { Injectable, InjectionToken, Provider, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * The product areas that can be switched off per build. A disabled feature disappears from the
 * UI — nav entries, command-palette actions, buttons and CTAs — and its routes stop matching, so
 * its URLs behave like unknown paths. The code and the backend stay in place: turning a flag back
 * on in the environment files needs no other change. See docs/FEATURE-FLAGS.md.
 */
export type FeatureKey =
  'billing' | 'usage' | 'integrations' | 'members' | 'customRoles' | 'notifications' | 'tokens';

/** One on/off switch per {@link FeatureKey}: the shape every environment file must provide. */
export type FeatureFlagMap = Readonly<Record<FeatureKey, boolean>>;

/** The active flag map: the build's environment by default (see {@link provideFeatureFlags}). */
const FEATURE_FLAGS = new InjectionToken<FeatureFlagMap>('FEATURE_FLAGS', {
  providedIn: 'root',
  factory: () => environment.features,
});

/**
 * Overrides individual flags on top of the environment's map, e.g.
 * `provideFeatureFlags({ members: true })` in a test's providers.
 */
export function provideFeatureFlags(overrides: Partial<FeatureFlagMap>): Provider {
  return { provide: FEATURE_FLAGS, useValue: { ...environment.features, ...overrides } };
}

/**
 * Read-only access to the build's feature flags. The map is static for the lifetime of the
 * app (it comes from the environment file), so callers can read a flag once into a field.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlags {
  private readonly flags = inject(FEATURE_FLAGS);

  /** True when `feature` is switched on for this build. */
  isEnabled(feature: FeatureKey): boolean {
    return this.flags[feature];
  }
}
