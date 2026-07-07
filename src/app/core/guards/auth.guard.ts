import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../auth/auth.store';

/** Allows the route only for an authenticated session; otherwise → sign-in. */
export const authGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  return store.isAuthenticated() || inject(Router).createUrlTree(['/auth/sign-in']);
};
