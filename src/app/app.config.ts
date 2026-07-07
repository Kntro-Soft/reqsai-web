import {
  ApplicationConfig,
  ErrorHandler,
  LOCALE_ID,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsPe from '@angular/common/locales/es-PE';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withRouterConfig,
  withViewTransitions,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideTransloco } from '@jsverse/transloco';
import { provideTranslocoLocale } from '@jsverse/transloco-locale';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { SilentRefreshService } from './core/auth/silent-refresh.service';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { TranslocoTitleStrategy } from './core/i18n/transloco-title.strategy';
import {
  DEFAULT_LANG,
  LANG_TO_LOCALE,
  SUPPORTED_LANGS,
  resolveInitialLang,
} from './core/i18n/language';

// Resolve the UI language once (saved choice → browser → English default) so the first
// render is already in the right language. Register es-PE so Angular built-ins can format it
// (en-US ships by default); date/number localization is driven at runtime by transloco-locale.
const initialLang = resolveInitialLang();
registerLocaleData(localeEsPe);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: LANG_TO_LOCALE[initialLang] },
    provideTransloco({
      config: {
        availableLangs: [...SUPPORTED_LANGS],
        defaultLang: initialLang,
        fallbackLang: DEFAULT_LANG,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: {
          logMissingKey: !isDevMode() ? false : true,
          useFallbackTranslation: true,
        },
      },
      loader: TranslocoHttpLoader,
    }),
    provideTranslocoLocale({ langToLocaleMapping: LANG_TO_LOCALE }),
    // Translate route titles (browser tab) from a key and follow the active language.
    { provide: TitleStrategy, useClass: TranslocoTitleStrategy },
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // 'always' so a project's child routes inherit :projectId for input binding.
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      // Cross-fade route content on navigation (Chromium View Transitions API); a
      // no-op elsewhere. Skip the very first paint so the app doesn't fade in on load.
      withViewTransitions({ skipInitialTransition: true }),
    ),
    // Order matters: authInterceptor stamps the version/token on the way out;
    // errorInterceptor catches 401s on the way back and replays once.
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    // Recover an existing session from the HttpOnly refresh cookie before the
    // first route renders, so guards see the right auth state.
    provideAppInitializer(() => inject(SilentRefreshService).initialize()),
  ],
};
