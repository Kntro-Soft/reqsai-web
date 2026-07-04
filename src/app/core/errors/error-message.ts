import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/**
 * The HTTP statuses we author a generic "tier" message for under `errors.http.<status>`.
 * Any other status falls through to `errors.generic`.
 */
const AUTHORED_STATUSES = new Set([400, 401, 403, 404, 409, 410, 422, 429, 500, 503]);

/**
 * Returns the translation for `key`, or `null` when it is missing. Transloco's
 * `translate` echoes the key back when it has no entry, so key === result means missing.
 */
function translateOrNull(transloco: TranslocoService, key: string): string | null {
  const value = transloco.translate(key);
  return value === key ? null : value;
}

/**
 * Maps any HTTP (or unknown) error to a translated, user-friendly message via a
 * fallback chain, keyed on the backend's machine-readable error `code`:
 *
 *  1. `HttpErrorResponse` carrying `err.error.code` and a matching `errors.<code>` → that message.
 *  2. Network / offline (status 0, or no response body) → `errors.network`.
 *  3. An authored generic tier for the status (`errors.http.<status>`) → that message.
 *  4. Otherwise → `errors.generic`.
 *
 * Pure and framework-light: it only reads translations, so it is trivially unit-testable.
 * Prefer the injectable {@link ErrorMessage} convenience in components so callers pass only the error.
 */
export function messageForError(err: unknown, transloco: TranslocoService): string {
  if (err instanceof HttpErrorResponse) {
    // 1. Per-code message when the backend sent a known code we translate.
    const code = (err.error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && code) {
      const byCode = translateOrNull(transloco, `errors.${code}`);
      if (byCode !== null) return byCode;
    }

    // 2. Network / offline: no HTTP response reached us.
    if (err.status === 0) {
      return transloco.translate('errors.network');
    }

    // 3. Authored generic tier for this status.
    if (AUTHORED_STATUSES.has(err.status)) {
      const byStatus = translateOrNull(transloco, `errors.http.${err.status}`);
      if (byStatus !== null) return byStatus;
    }

    // 4. Fallback.
    return transloco.translate('errors.generic');
  }

  // Non-HTTP errors (thrown JS errors, offline before a request, etc.).
  return transloco.translate('errors.generic');
}

/**
 * Thin injectable wrapper around {@link messageForError} so components only pass the error:
 * `this.errors.of(err)`. Injects the active {@link TranslocoService}.
 */
@Injectable({ providedIn: 'root' })
export class ErrorMessage {
  private readonly transloco = inject(TranslocoService);

  /** Translate an error to a user-facing message using the shared fallback chain. */
  of(err: unknown): string {
    return messageForError(err, this.transloco);
  }
}
