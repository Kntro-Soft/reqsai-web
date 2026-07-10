import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

/**
 * Cache-buster stamped once when the app loads. Appended to the translation URL so a
 * fresh page load — including after a rebuild or deploy — always fetches the current
 * `{lang}.json` instead of a stale browser-cached copy (which rendered raw keys for
 * translations added since the cached file). A running SPA session reuses the same
 * stamp, so switching languages back and forth still hits the browser cache.
 */
const CACHE_BUST = Date.now().toString(36);

/** Fetches a language's translation JSON from `public/i18n/{lang}.json`. */
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`/i18n/${lang}.json?v=${CACHE_BUST}`);
  }
}
