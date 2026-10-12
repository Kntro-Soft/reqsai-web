import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthStore } from '../auth/auth.store';
import { OnboardingStore } from './onboarding.store';

describe('OnboardingStore', () => {
  let auth: AuthStore;
  let store: OnboardingStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    auth = TestBed.inject(AuthStore);
    store = TestBed.inject(OnboardingStore);
    auth.setUser({ id: 'u1' } as never);
    auth.setOrganizationId('o1');
  });

  it('shows the welcome until it is dismissed', () => {
    expect(store.welcomeDismissed()).toBe(false);
    store.dismissWelcome();
    expect(store.welcomeDismissed()).toBe(true);
  });

  it('remembers the welcome per organization', () => {
    store.dismissWelcome();
    auth.setOrganizationId('o2');
    expect(store.welcomeDismissed()).toBe(false);
  });

  it('remembers the tour per user', () => {
    expect(store.tourDone()).toBe(false);
    store.markTourDone();
    expect(store.tourDone()).toBe(true);
    auth.setUser({ id: 'u2' } as never);
    expect(store.tourDone()).toBe(false);
  });

  it('stays quiet when nobody is signed in', () => {
    auth.clear();
    expect(store.welcomeDismissed()).toBe(true);
    expect(store.tourDone()).toBe(true);
  });
});
