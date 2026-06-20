# 0012. JWT RS256 authentication and token storage

- Status: Accepted
- Date: 2026-06-19
- Deciders: Kntro-Soft team
- Supersedes: initial draft (2026-06-16) that used `localStorage` for the refresh token

## Context

The backend (`reqsai-api`) issues **RS256 JWT** access tokens. The IAM bounded context defines:

- `Account` — credentials aggregate with lifecycle `PENDING_VERIFICATION → ACTIVE`. Created
  `PENDING_VERIFICATION` on register; transitions to `ACTIVE` only after email verification (US04/US05).
- `RefreshToken` — stateful aggregate (`public.refresh_tokens`) that stores only the SHA-256 hex
  digest of the raw token. Lifecycle: `ACTIVE → REVOKED` on rotation or logout.
- `EmailVerification` — one-time token aggregate (`public.email_verifications`), SHA-256 hash stored,
  24-hour expiry, single-use via `markUsed()`.
- Login and refresh endpoints set the refresh token as an **`HttpOnly` cookie** (`Secure`,
  `SameSite=Strict`, `Path=/api/authentication`) and return only `accessToken` and `organizationId`
  in the response body.
- API versioning is **header-based** (`Api-Version: 1`). Base path is `/api/authentication` — no
  version segment in the URL.

## Decision

**Access token** → stored in a **memory signal** (`core/auth/auth.store.ts`). Never persisted.
Short-lived (15 min); re-issued on every session refresh.

**Refresh token** → issued as an **`HttpOnly` cookie** by the server. Browser stores and sends it
automatically on all requests to `/api/authentication/*`. JavaScript cannot read it.
All auth requests use `withCredentials: true`.

**organizationId** → included in `AuthResponse` body (and as a JWT claim). If `null`, the user has
no organization yet — the frontend routes to `/onboarding/create-org`. If set, routes to `/dashboard`.

### Full endpoint map

```
POST /api/authentication/sign-up         Api-Version: 1
  → { firstName, lastName, email, password }
  ← 201 { id, email, firstName, lastName }
     Account created as PENDING_VERIFICATION; verification email sent.

POST /api/authentication/verify-email    Api-Version: 1
  → { token }   (raw token from the email link)
  ← 204
     Account activated (ACTIVE); token marked used.

POST /api/authentication/sign-in         Api-Version: 1
  → { email, password }
  ← Set-Cookie: rt=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/authentication; Max-Age=2592000
  ← 200 { accessToken, tokenType, expiresIn, user, organizationId }

POST /api/authentication/refresh         Api-Version: 1
  → {}   (browser sends cookie automatically via withCredentials: true)
  ← Set-Cookie: rt=<newToken>; ...  (token rotated)
  ← 200 { accessToken, tokenType, expiresIn, user: null, organizationId }

POST /api/authentication/sign-out        Api-Version: 1
  → {}   (browser sends cookie automatically)
  ← Set-Cookie: rt=; Max-Age=0  (cookie cleared)
  ← 204

GET  /api/authentication/me              Api-Version: 1
  Authorization: Bearer <accessToken>
  ← 200 { id, email, firstName, lastName }
```

### Silent refresh on page reload

```
App starts (APP_INITIALIZER → SilentRefreshService.initialize())
  └─ POST /api/authentication/refresh  {}  withCredentials: true
        │  browser sends HttpOnly cookie automatically
        ├─ 200 → store new accessToken in signal
        │        organizationId: null  → /onboarding/create-org
        │        organizationId: uuid  → /dashboard
        └─ 401  → catchError → of(void 0) → auth guard → /auth/sign-in
```

No localStorage check is needed — the browser decides whether to send the cookie.

### Authorization header

`AuthInterceptor` reads the access token from the signal and injects
`Authorization: Bearer <token>` on every outgoing request to `/api/`.

### Token rotation

The backend rotates the refresh token on every `/refresh` call atomically (in one
`@Transactional`): old token revoked, new `RefreshToken.issue()` persisted, new `Set-Cookie` issued.
The frontend receives the new access token in the body; the new cookie is set automatically.

### Sign-out

`POST /api/authentication/sign-out` with `withCredentials: true` → backend revokes the stored token
hash and clears the cookie (`Max-Age=0`). Frontend clears the access-token signal and navigates to
`/auth/sign-in`.

## Consequences

- The refresh token is **inaccessible to JavaScript** — XSS cannot steal it directly.
- `SameSite=Strict` blocks CSRF on modern browsers.
- CORS must allow credentials: backend sets `Access-Control-Allow-Credentials: true` and
  `Access-Control-Allow-Origin` to the specific frontend origin (not `*`).
- Page reloads keep the session as long as the HttpOnly cookie is valid.
- The `organizationId` in the token response eliminates a second HTTP call for onboarding routing.
- Accounts cannot sign in until email is verified (US05) — the backend enforces `account.isActive()`.

## Backend contract changes from the initial design

The initial architecture report (body-based transport, path-versioned URLs) is superseded:

| Endpoint         | Old                             | New                                                        |
|------------------|---------------------------------|------------------------------------------------------------|
| URL scheme       | `/api/v1/authentication/…`      | `/api/authentication/…` + `Api-Version: 1` header          |
| Sign-in path     | `POST /login`                   | `POST /sign-in`                                            |
| Sign-out path    | `POST /logout`                  | `POST /sign-out`                                           |
| Sign-in response | `{ accessToken, refreshToken }` | `{ accessToken, organizationId }` + `Set-Cookie`           |
| Refresh request  | `{ refreshToken }` in body      | empty body, cookie sent by browser                         |
| Sign-out request | `{ refreshToken }` in body      | empty body, cookie sent by browser                         |
| Register         | not specified                   | `POST /sign-up` → 201, account born `PENDING_VERIFICATION` |
| Email verify     | not specified                   | `POST /verify-email { token }` → 204                       |
