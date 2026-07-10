import {
  HttpContext,
  HttpContextToken,
  HttpInterceptorFn,
  HttpStatusCode,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import { ToastService } from '../../shared/toast/toast.service';

/** Marks a request already replayed after a refresh, so it never loops. */
const RETRY_HEADER = 'X-Auth-Retry';

/**
 * Opt a request out of the global 403 "no access" toast. Background and eager loads
 * (a project's job banner, an overview's name fetch, sidebar summaries) fire on entry
 * regardless of the caller's grants, so a 403 there is expected — not an action the
 * user took — and must stay silent. The request still fails; only the toast is skipped.
 * User-initiated calls leave this unset so a denied action still surfaces a message.
 *
 * Usage: `this.http.get(url, { context: silentForbidden() })`.
 */
export const SILENCE_FORBIDDEN_TOAST = new HttpContextToken<boolean>(() => false);

/** Convenience: an {@link HttpContext} that opts the request out of the 403 toast. */
export function silentForbidden(): HttpContext {
  return new HttpContext().set(SILENCE_FORBIDDEN_TOAST, true);
}

/**
 * De-dupe window (ms) for the 403 "no access" toast. A single denied navigation often
 * fans out into several parallel 403s (the page's data loads) plus the guard's own
 * toast — collapse them so the user sees one message, not a stack.
 */
const FORBIDDEN_TOAST_DEBOUNCE_MS = 1500;
let lastForbiddenToastAt = 0;

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
 *
 * Global 403 handling (RBAC): the backend is the source of truth and returns 403 for
 * any action the caller may not perform. The route guards catch most of these before
 * a request even fires, but this is the safety net — it swaps the generic red error for
 * a clear "no access" toast on any path the guards miss. Debounced so one denied page
 * doesn't stack several identical toasts.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const authStore = inject(AuthStore);
  const toast = inject(ToastService);
  const transloco = inject(TranslocoService);

  return next(req).pipe(
    catchError((err) => {
      const isForbidden = err.status === HttpStatusCode.Forbidden;
      if (isForbidden) {
        if (req.context.get(SILENCE_FORBIDDEN_TOAST)) {
          return throwError(() => err);
        }
        const now = Date.now();
        if (now - lastForbiddenToastAt > FORBIDDEN_TOAST_DEBOUNCE_MS) {
          lastForbiddenToastAt = now;
          toast.error(transloco.translate('authz.noAccess'));
        }
        return throwError(() => err);
      }

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
