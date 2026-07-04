import { TestBed } from '@angular/core/testing';
import { AuthStore } from './auth.store';
import { AuthResponse } from './auth.model';

function authResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    accessToken: 'jwt.token.value',
    tokenType: 'Bearer',
    expiresIn: 900,
    user: {
      id: 'u-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      fullName: 'Ada Lovelace',
      avatarUrl: null,
      preferences: { lastVisitedOrgId: null, lastVisitedProjectId: null },
    },
    organizationId: 'org-1',
    ...overrides,
  };
}

describe('AuthStore', () => {
  let store: AuthStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(AuthStore);
  });

  it('starts unauthenticated', () => {
    expect(store.isAuthenticated()).toBe(false);
    expect(store.accessToken()).toBeNull();
    expect(store.user()).toBeNull();
    expect(store.organizationId()).toBeNull();
  });

  it('stores the session from an AuthResponse', () => {
    store.setSession(authResponse());

    expect(store.isAuthenticated()).toBe(true);
    expect(store.accessToken()).toBe('jwt.token.value');
    expect(store.user()?.fullName).toBe('Ada Lovelace');
    expect(store.organizationId()).toBe('org-1');
    expect(store.needsOnboarding()).toBe(false);
  });

  it('flags onboarding when authenticated without an organization', () => {
    store.setSession(authResponse({ organizationId: null }));

    expect(store.isAuthenticated()).toBe(true);
    expect(store.needsOnboarding()).toBe(true);
  });

  it('updates the active organization', () => {
    store.setSession(authResponse({ organizationId: null }));
    store.setOrganizationId('org-2');

    expect(store.organizationId()).toBe('org-2');
    expect(store.needsOnboarding()).toBe(false);
  });

  it('clears the session', () => {
    store.setSession(authResponse());
    store.clear();

    expect(store.isAuthenticated()).toBe(false);
    expect(store.accessToken()).toBeNull();
    expect(store.user()).toBeNull();
    expect(store.organizationId()).toBeNull();
  });
});
