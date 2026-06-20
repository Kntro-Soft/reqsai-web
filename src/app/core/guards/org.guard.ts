import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../auth/auth.store';

/** Requires an active organization; sends users without one to onboarding. */
export const orgGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  return store.organizationId() !== null || inject(Router).createUrlTree(['/onboarding']);
};

/** Keeps users who already have an organization out of onboarding. */
export const onboardingGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  return store.organizationId() === null || inject(Router).createUrlTree(['/projects']);
};
