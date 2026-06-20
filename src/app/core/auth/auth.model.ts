/**
 * Mirrors the IAM bounded-context REST contract (backend feature/iam-auth).
 * Base path: /api/auth/*  ·  header Api-Version: 1.
 *
 * The refresh token is an HttpOnly cookie (`rt`, Path=/api/auth) the browser
 * stores and replays automatically — it never appears in these payloads and is
 * never readable from JavaScript. Only the access token reaches the client.
 */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface VerifyEmailRequest {
  /** One-time token delivered by email (the `?token=` of the verification link). */
  token: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

interface UserPreferences {
  lastVisitedOrgId: string | null;
  lastVisitedProjectId: string | null;
}

/** Response of POST /api/auth/register and GET /api/users/me. */
export interface UserResponse {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl: string | null;
  preferences: UserPreferences;
}

/** Response of POST /api/auth/login and POST /api/auth/refresh. */
export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserResponse;
  /** Active organization resolved by the backend, or null when the user has none. */
  organizationId: string | null;
}
