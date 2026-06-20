export const environment = {
  production: false,
  apiUrl: '', // proxy.conf.json forwards /api → localhost:8080
  wsUrl: '', // proxy.conf.json forwards /ws  → ws://localhost:8080
} as const;
