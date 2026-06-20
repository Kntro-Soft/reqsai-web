import { Injectable, signal, computed } from '@angular/core';
import { AuthResponse, UserResponse } from './auth.model';

/**
 * Holds the authenticated session in memory only — the access token is never
 * persisted (a page reload re-derives it via the silent refresh cookie flow,
 * see ADR-0007). The refresh token lives in an HttpOnly cookie owned by the
 * browser, so it is intentionally absent here.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<UserResponse | null>(null);
  private readonly _organizationId = signal<string | null>(null);

  readonly accessToken = this._accessToken.asReadonly();
  readonly user = this._user.asReadonly();
  readonly organizationId = this._organizationId.asReadonly();
  readonly isAuthenticated = computed(() => this._accessToken() !== null);
  /** True once authenticated but with no active organization → onboarding. */
  readonly needsOnboarding = computed(
    () => this._accessToken() !== null && this._organizationId() === null,
  );

  setSession(res: AuthResponse): void {
    this._accessToken.set(res.accessToken);
    this._user.set(res.user);
    this._organizationId.set(res.organizationId);
  }

  setUser(user: UserResponse): void {
    this._user.set(user);
  }

  setOrganizationId(orgId: string | null): void {
    this._organizationId.set(orgId);
  }

  clear(): void {
    this._accessToken.set(null);
    this._user.set(null);
    this._organizationId.set(null);
  }
}
