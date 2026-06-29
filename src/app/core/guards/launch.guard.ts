import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import { WorkspaceStore } from '../../features/workspace/data/workspace.store';

/**
 * Post-login dispatcher. Routes by how many organizations the user belongs to:
 * none → onboarding, exactly one → straight into its workspace (activating it
 * if needed), several → the organization picker. Always resolves to a redirect.
 */
export const launchGuard: CanActivateFn = () => {
  const workspace = inject(WorkspaceStore);
  const auth = inject(AuthService);
  const store = inject(AuthStore);
  const router = inject(Router);

  return workspace.loadOrganizations$().pipe(
    switchMap((orgs) => {
      if (orgs.length === 0) return of(router.createUrlTree(['/onboarding']));
      // Railway/Vercel style: straight into the active (last-visited) org's
      // workspace. Switching orgs happens from the header dropdown, not a gate.
      const activeId = store.organizationId();
      if (activeId && orgs.some((o) => o.id === activeId)) {
        return of(router.createUrlTree(['/projects']));
      }
      return auth
        .switchOrganization(orgs[0].id)
        .pipe(map(() => router.createUrlTree(['/projects'])));
    }),
  );
};
