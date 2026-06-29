import { Injectable, inject } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';

/**
 * Runs once at app bootstrap (APP_INITIALIZER). Attempts a silent refresh so a
 * returning user with a valid HttpOnly refresh cookie stays signed in across
 * reloads. Because the cookie is not readable from JS, we always try and treat
 * a 401 (no/expired cookie) as simply "not signed in". See ADR-0007.
 */
@Injectable({ providedIn: 'root' })
export class SilentRefreshService {
  private readonly authService = inject(AuthService);

  initialize(): Promise<void> {
    return firstValueFrom(this.authService.refresh().pipe(catchError(() => of(void 0))));
  }
}
