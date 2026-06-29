import { HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';

/** Marks a request already replayed after a refresh, so it never loops. */
const RETRY_HEADER = 'X-Auth-Retry';

/**
 * Global 401 handling:
 *
 * - A 401 from any `/api/auth/*` endpoint is a real auth failure (bad
 *   credentials, expired refresh cookie, invalid token) → propagate it so the
 *   page or the bootstrap flow can react. Never try to refresh these.
 * - A 401 from any other API call → attempt a single silent refresh and replay
 *   the original request once. If the refresh fails, sign out.
 * - The replayed request carries a marker header so a second 401 cannot trigger
 *   another refresh (no infinite loop).
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const authStore = inject(AuthStore);

  return next(req).pipe(
    catchError((err) => {
      const isUnauthorized = err.status === HttpStatusCode.Unauthorized;
      const isAuthEndpoint = req.url.startsWith('/api/auth');
      const alreadyRetried = req.headers.has(RETRY_HEADER);

      if (!isUnauthorized || isAuthEndpoint || alreadyRetried) {
        return throwError(() => err);
      }

      return authService.refresh().pipe(
        switchMap(() => {
          const token = authStore.accessToken();
          return next(
            req.clone({
              setHeaders: token
                ? { Authorization: `Bearer ${token}`, [RETRY_HEADER]: '1' }
                : { [RETRY_HEADER]: '1' },
            }),
          );
        }),
        catchError((refreshErr) => {
          authService.logout();
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
