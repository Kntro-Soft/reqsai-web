import { Injectable, inject, computed } from '@angular/core';
import { AuthStore } from '../auth/auth.store';

interface JwtPayload {
  sub?: string;
  orgId?: string | null;
  role?: string;
  exp?: number;
}

/**
 * Derives the multitenant context from the access-token claims. The backend
 * embeds the active organization in the JWT (`orgId`) and resolves the Postgres
 * schema from it — there is no manual tenant header. This service exposes those
 * claims as signals for guards and the shell. See ADR-0011.
 */
@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly authStore = inject(AuthStore);

  private readonly payload = computed<JwtPayload | null>(() => {
    const token = this.authStore.accessToken();
    return token ? decodeJwt(token) : null;
  });

  readonly userId = computed(() => this.payload()?.sub ?? null);
  readonly orgId = computed(() => this.payload()?.orgId ?? null);
  readonly role = computed(() => this.payload()?.role ?? null);
  readonly isExpired = computed(() => {
    const exp = this.payload()?.exp;
    return exp != null && exp * 1000 <= Date.now();
  });
}

/** Decodes a JWT payload, tolerant of base64url (`-`/`_`) and missing padding. */
export function decodeJwt(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(atob(base64UrlToBase64(parts[1]))) as JwtPayload;
  } catch {
    return null;
  }
}

function base64UrlToBase64(input: string): string {
  const replaced = input.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = replaced.length % 4;
  return remainder ? replaced + '='.repeat(4 - remainder) : replaced;
}
