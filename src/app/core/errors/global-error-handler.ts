import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Catches uncaught JavaScript errors (null refs, template errors, etc.) that
 * Angular's default handler would only dump to the console.
 *
 * ErrorHandler is instantiated before most DI providers, so avoid injecting
 * services that depend on HttpClient here (circular-dependency risk). For user
 * notifications, use a lightweight signal-based store rather than pulling in the
 * HTTP tree.
 *
 * Production integration: forward `err` to Sentry/your APM here.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[GlobalErrorHandler]', err.message, err);
  }
}
