import type { FeatureFlagMap } from '../app/core/features/feature-flags';

export const environment = {
  production: true,
  // Empty on purpose: HTTP calls use relative /api paths and the WebSocket
  // client falls back to the current origin (see audio-recorder.service.ts)
  // when this is unset. CloudFront proxies /api/* and /ws/* to the backend
  // ALB under the same origin as the frontend, so no absolute URL is needed.
  apiUrl: '',
  wsUrl: '',
  // MVP scope: every non-MVP area is hidden. Set a flag to true to bring that area back
  // (see docs/FEATURE-FLAGS.md); keep environment.ts in sync.
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
