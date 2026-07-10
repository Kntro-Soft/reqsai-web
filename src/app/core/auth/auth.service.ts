import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, map, of, share, switchMap, tap } from 'rxjs';
import { AuthStore } from './auth.store';
import { PermissionsStore } from '../authz/permissions.store';
import { RealtimeService } from '../realtime/realtime.service';
import {
  AuthResponse,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResendVerificationRequest,
  ResetPasswordRequest,
  UserResponse,
  VerifyEmailRequest,
} from './auth.model';

const BASE = '/api/auth';

/**
 * Talks to the IAM REST API. The refresh token is an HttpOnly cookie, so the
 * session-bearing calls (login/refresh/logout) must send credentials; the
 * browser attaches and rotates the cookie on its own.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);
  private readonly realtime = inject(RealtimeService);

  // Shared so several concurrent 401s collapse into a single refresh HTTP call.
  private pendingRefresh$: Observable<void> | null = null;

  /** Creates an account (PENDING_VERIFICATION). Does not start a session. */
  register(payload: RegisterRequest): Observable<UserResponse> {
    return this.http.post<UserResponse>(`${BASE}/register`, payload);
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${BASE}/login`, credentials, { withCredentials: true })
      .pipe(tap((res) => this.store.setSession(res)));
  }

  verifyEmail(payload: VerifyEmailRequest): Observable<void> {
    return this.http.post<void>(`${BASE}/verify-email`, payload);
  }

  resendVerification(payload: ResendVerificationRequest): Observable<void> {
    return this.http.post<void>(`${BASE}/resend-verification`, payload);
  }

  forgotPassword(payload: ForgotPasswordRequest): Observable<void> {
    return this.http.post<void>(`${BASE}/forgot-password`, payload);
  }

  resetPassword(payload: ResetPasswordRequest): Observable<void> {
    return this.http.post<void>(`${BASE}/reset-password`, payload);
  }

  /**
   * Rotates the session from the HttpOnly refresh cookie. Concurrent callers
   * share one in-flight request (share()); the slot is freed on completion.
   */
  refresh(): Observable<void> {
    if (this.pendingRefresh$) return this.pendingRefresh$;

    this.pendingRefresh$ = this.http
      .post<AuthResponse>(`${BASE}/refresh`, {}, { withCredentials: true })
      .pipe(
        switchMap((res) => {
          this.store.setSession(res);
          // The refresh response carries no user profile, so reload it to keep
          // the in-memory session whole across page reloads.
          return res.user ? of(void 0) : this.loadCurrentUser();
        }),
        share({ resetOnComplete: true, resetOnError: true, resetOnRefCountZero: true }),
      );

    // Clear the slot once the shared stream settles, regardless of outcome.
    this.pendingRefresh$.subscribe({
      complete: () => (this.pendingRefresh$ = null),
      error: () => (this.pendingRefresh$ = null),
    });

    return this.pendingRefresh$;
  }

  /** Loads the current user profile (GET /api/users/me) into the store. */
  loadCurrentUser(): Observable<void> {
    return this.http.get<UserResponse>('/api/users/me').pipe(
      tap((user) => this.store.setUser(user)),
      map((): void => void 0),
    );
  }

  /** Partial profile update (name) — PATCH /api/users/me; refreshes the stored user. */
  updateProfile(firstName: string, lastName: string): Observable<UserResponse> {
    return this.http
      .patch<UserResponse>('/api/users/me', { firstName, lastName })
      .pipe(tap((user) => this.store.setUser(user)));
  }

  /** Changes the password — PUT /api/users/me/password (204). */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.put<void>('/api/users/me/password', { currentPassword, newPassword });
  }

  /** Uploads a new avatar image (multipart) — PUT /api/users/me/avatar; refreshes the stored user. */
  uploadAvatar(file: File): Observable<UserResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http
      .put<UserResponse>('/api/users/me/avatar', form)
      .pipe(tap((user) => this.store.setUser(user)));
  }

  /**
   * Activates an organization: persists it as the user's preference, then
   * rotates the session so the new orgId is embedded in the access token and
   * the backend resolves its tenant schema. There is no dedicated switch
   * endpoint — this is the supported flow.
   */
  switchOrganization(orgId: string): Observable<void> {
    // The active org is changing: drop the cached RBAC context so the new org's
    // role/permissions are re-fetched fresh (a member in one org may be an owner in another).
    this.permissions.reset();
    return this.http
      .patch<void>('/api/users/me/preferences', { lastVisitedOrgId: orgId })
      .pipe(switchMap(() => this.refresh()));
  }

  /**
   * Records acceptance of the given terms version, then rotates the session so
   * the new `termsVersion` claim lands in the access token.
   */
  acceptTerms(version: string): Observable<void> {
    return this.http
      .post<void>('/api/users/me/terms', { termsVersion: version })
      .pipe(switchMap(() => this.refresh()));
  }

  logout(): void {
    // Fire-and-forget: the local session is cleared regardless of the response.
    this.http
      .post<void>(`${BASE}/logout`, {}, { withCredentials: true })
      .subscribe({ error: () => void 0 });
    this.realtime.disconnect();
    this.store.clear();
    this.permissions.reset();
    void this.router.navigate(['/auth/sign-in']);
  }
}
