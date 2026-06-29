import { APIRequestContext, expect } from '@playwright/test';
import { getVerificationToken } from './mailpit';

const V1 = { 'Api-Version': '1' };

export function uniqueEmail(prefix = 'e2e'): string {
  // timestamp + random keeps parallel workers from colliding.
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Creates an account via the API (PENDING_VERIFICATION). Faster than the UI. */
export async function registerAccount(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const res = await request.post('/api/auth/register', {
    headers: V1,
    data: { email, password, firstName: 'E2E', lastName: 'Tester' },
  });
  expect(res.status(), 'register').toBe(201);
}

/** Creates an account and activates it through the email verification token. */
export async function registerVerified(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  await registerAccount(request, email, password);
  const token = await getVerificationToken(request, email);
  const res = await request.post('/api/auth/verify-email', { headers: V1, data: { token } });
  expect(res.status(), 'verify-email').toBe(204);
}
