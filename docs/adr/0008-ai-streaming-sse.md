# 0008. AI response streaming via Server-Sent Events

- Status: Accepted
- Date: 2026-06-16
- Deciders: Kntro-Soft team

## Context

The `discovery` feature streams AI-generated user story content from the backend in real time. The
backend uses **Spring AI** and can deliver responses as a stream of tokens. Two transport options:
WebSocket (bidirectional, already decided for session collaboration) and Server-Sent Events (SSE)
(unidirectional, HTTP/2 compatible, browser-native).

For AI content streaming specifically, the data flow is strictly server-to-client (the browser
sends a trigger request, then receives the token stream). SSE is simpler than WebSocket for this
use case and requires no extra library.

## Decision

Use **native `EventSource`** (browser SSE API) for AI content streaming endpoints. The `AiService`
in `core/ai/` wraps `EventSource` and returns an `Observable<string>` that emits each token chunk.

```
core/ai/
└── ai.service.ts   # stream(endpoint): Observable<string>
```

- The backend streams `text/event-stream` responses for AI generation endpoints
  (e.g., `GET /api/sessions/{id}/stories/stream`).
- The `AiService` opens an `EventSource`, converts `message` events to RxJS `Observable`, and
  closes the source on `error` or component destruction.
- The JWT token is passed as a query parameter (`?token=...`) since `EventSource` does not support
  custom headers. The backend must validate the token from the query string for SSE endpoints.
- Accumulated tokens are stored in a signal in the component; the UI renders them incrementally.

## Consequences

- SSE requires no extra library; `EventSource` is available in all modern browsers.
- Passing the JWT as a query parameter is a minor security trade-off (it appears in server logs);
  short-lived, single-use SSE tokens are the ideal mitigation for production.
- STOMP (ADR-0008) is used for session-level collaboration; SSE is used only for AI content streams.
  The two transports coexist.
- If the AI endpoint is behind a proxy/load balancer, the proxy must be configured to disable
  buffering (nginx: `proxy_buffering off; proxy_cache off`).
