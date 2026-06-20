import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, map, share, tap } from 'rxjs';
import { AuthStore } from './auth.store';
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
  private readonly router = inject(Router);

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
        tap((res) => this.store.setSession(res)),
        map((): void => void 0),
        share({ resetOnComplete: true, resetOnError: true, resetOnRefCountZero: true }),
      );

    // Clear the slot once the shared stream settles, regardless of outcome.
    this.pendingRefresh$.subscribe({
      complete: () => (this.pendingRefresh$ = null),
      error: () => (this.pendingRefresh$ = null),
    });

    return this.pendingRefresh$;
  }

  logout(): void {
    // Fire-and-forget: the local session is cleared regardless of the response.
    this.http
      .post<void>(`${BASE}/logout`, {}, { withCredentials: true })
      .subscribe({ error: () => void 0 });
    this.store.clear();
    void this.router.navigate(['/auth/sign-in']);
  }
}
