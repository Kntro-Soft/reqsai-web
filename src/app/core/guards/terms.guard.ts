import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CURRENT_TERMS_VERSION } from '../auth/terms';

/** Sends users who have not accepted the current terms to the acceptance gate. */
export const termsGuard: CanActivateFn = () => {
  const tenant = inject(TenantContextService);
  return (
    tenant.termsVersion() === CURRENT_TERMS_VERSION || inject(Router).createUrlTree(['/terms'])
  );
};

/** Keeps users who already accepted the current terms out of the gate. */
export const termsAcceptedGuard: CanActivateFn = () => {
  const tenant = inject(TenantContextService);
  return tenant.termsVersion() !== CURRENT_TERMS_VERSION || inject(Router).createUrlTree(['/']);
};
