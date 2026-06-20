import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../auth/auth.store';
import { AuthResponse } from '../auth/auth.model';
import { TenantContextService, decodeJwt } from './tenant-context.service';

/** Builds an unsigned JWT (base64url, no padding) with the given payload. */
function jwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

function session(accessToken: string): AuthResponse {
  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: 900,
    user: {
      id: 'u-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      fullName: 'Ada Lovelace',
      avatarUrl: null,
      preferences: { lastVisitedOrgId: null, lastVisitedProjectId: null },
    },
    organizationId: null,
  };
}

describe('decodeJwt', () => {
  it('decodes a base64url payload with stripped padding', () => {
    const token = jwt({ sub: 'user-123', orgId: 'org-9', role: 'ROLE_USER' });
    expect(decodeJwt(token)).toMatchObject({ sub: 'user-123', orgId: 'org-9', role: 'ROLE_USER' });
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull();
  });
});

describe('TenantContextService', () => {
  let store: AuthStore;
  let tenant: TenantContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(AuthStore);
    tenant = TestBed.inject(TenantContextService);
  });

  it('exposes null claims without a session', () => {
    expect(tenant.userId()).toBeNull();
    expect(tenant.orgId()).toBeNull();
    expect(tenant.role()).toBeNull();
    expect(tenant.isExpired()).toBe(false);
  });

  it('reads claims from the access token', () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    store.setSession(session(jwt({ sub: 'user-123', orgId: 'org-9', role: 'ROLE_USER', exp })));

    expect(tenant.userId()).toBe('user-123');
    expect(tenant.orgId()).toBe('org-9');
    expect(tenant.role()).toBe('ROLE_USER');
    expect(tenant.isExpired()).toBe(false);
  });

  it('flags an expired token', () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    store.setSession(session(jwt({ sub: 'user-123', exp })));

    expect(tenant.isExpired()).toBe(true);
  });
});
