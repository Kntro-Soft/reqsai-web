import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../auth/auth.store';

/**
 * Allows the route only for an anonymous visitor. An already-authenticated user is bounced to
 * `/launch` — so the sign-in, sign-up, and password-reset pages are unreachable once logged in.
 */
export const guestGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  return !store.isAuthenticated() || inject(Router).createUrlTree(['/launch']);
};
