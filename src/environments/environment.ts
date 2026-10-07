import type { FeatureFlagMap } from '../app/core/features/feature-flags';

export const environment = {
  production: false,
  apiUrl: '', // proxy.conf.json forwards /api → localhost:8080
  wsUrl: '', // proxy.conf.json forwards /ws  → ws://localhost:8080
  // MVP scope: every non-MVP area is hidden. Set a flag to true to bring that area back
  // (see docs/FEATURE-FLAGS.md); keep environment.prod.ts in sync.
  features: {
    billing: false,
    usage: false,
    integrations: false,
    members: false,
    customRoles: false,
    notifications: false,
    tokens: false,
  } satisfies FeatureFlagMap,
} as const;
