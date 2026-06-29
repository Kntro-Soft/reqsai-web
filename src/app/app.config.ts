import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { SilentRefreshService } from './core/auth/silent-refresh.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // 'always' so a project's child routes inherit :projectId for input binding.
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),
    // Order matters: authInterceptor stamps the version/token on the way out;
    // errorInterceptor catches 401s on the way back and replays once.
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    // Recover an existing session from the HttpOnly refresh cookie before the
    // first route renders, so guards see the right auth state.
    provideAppInitializer(() => inject(SilentRefreshService).initialize()),
  ],
};
