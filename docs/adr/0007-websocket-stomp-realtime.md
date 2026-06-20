# 0007. Real-time via WebSocket/STOMP

- Status: Accepted
- Date: 2026-06-16
- Deciders: Kntro-Soft team

## Context

The `discovery` feature requires real-time updates: live session status changes, streaming AI
responses pushed from the server, and multi-user collaboration signals. The backend exposes a
STOMP-over-WebSocket endpoint at `/ws`.

Options: native WebSocket, STOMP (via `@stomp/stompjs`), Socket.IO. Since the backend uses STOMP,
the frontend must speak the same protocol.

## Decision

Use **`@stomp/stompjs`** (the official STOMP client for JavaScript). The `RealtimeService` in
`core/realtime/` wraps the STOMP client and exposes typed observables for each topic.

```
core/realtime/
└── realtime.service.ts   # connect(), subscribe(topic), publish(topic, body), disconnect()
```

- Connection URL: `/ws` (proxied to `ws://localhost:8080` in dev via `proxy.conf.json`).
- Authentication: the JWT access token is sent as a STOMP connect header
  (`{ Authorization: 'Bearer <token>' }`).
- Subscriptions are managed per-component; the service exposes an `Observable<T>` per topic.
  Components unsubscribe in `ngOnDestroy` (or use `takeUntilDestroyed()`).
- Reconnect: `@stomp/stompjs` handles automatic reconnection with exponential backoff.

## Consequences

- STOMP gives topic-based pub/sub semantics without re-implementing message routing.
- The proxy config already routes `/ws` in development; production uses the real API domain.
- The team must add `@stomp/stompjs` as a dependency (not yet in `package.json` — to be added
  when the realtime feature is implemented).
- Components that subscribe to STOMP topics must properly unsubscribe to avoid memory leaks.
