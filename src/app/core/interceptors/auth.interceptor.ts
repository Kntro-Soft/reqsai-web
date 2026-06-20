import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthStore } from '../auth/auth.store';

/**
 * For every outgoing API request: pins the API version the client was built
 * against and attaches the in-memory access token when present.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api')) return next(req);

  const token = inject(AuthStore).accessToken();
  const setHeaders: Record<string, string> = { 'Api-Version': '1' };
  if (token) setHeaders['Authorization'] = `Bearer ${token}`;

  return next(req.clone({ setHeaders }));
};
