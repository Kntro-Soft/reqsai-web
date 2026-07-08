export const environment = {
  production: true,
  // Empty on purpose: HTTP calls use relative /api paths and the WebSocket
  // client falls back to the current origin (see audio-recorder.service.ts)
  // when this is unset. CloudFront proxies /api/* and /ws/* to the backend
  // ALB under the same origin as the frontend, so no absolute URL is needed.
  apiUrl: '',
  wsUrl: '',
} as const;
