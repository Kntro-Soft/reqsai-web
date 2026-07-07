import { APIRequestContext, expect } from '@playwright/test';
import { registerVerified } from './auth';

const V1 = { 'Api-Version': '1' };

/** Records terms acceptance for the token's user (skips the T&C gate). */
export async function apiAcceptTerms(
  request: APIRequestContext,
  token: string,
  version = '2026-01',
): Promise<void> {
  const res = await request.post('/api/users/me/terms', {
    headers: { ...V1, Authorization: `Bearer ${token}` },
    data: { termsVersion: version },
  });
  expect(res.status(), 'api accept terms').toBe(204);
}

/** Verified account that has already accepted the current terms — fully past
 * the auth/terms gates, ready to sign in straight into the app. */
export async function registerReady(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  await registerVerified(request, email, password);
  const token = await apiLogin(request, email, password);
  await apiAcceptTerms(request, token);
}

/** Signs in via the API and returns the access token (for seeding fixtures). */
export async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post('/api/auth/login', { headers: V1, data: { email, password } });
  expect(res.status(), 'api login').toBe(200);
  return (await res.json()).accessToken as string;
}

export async function apiCreateOrganization(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<string> {
  const res = await request.post('/api/organizations', {
    headers: { ...V1, Authorization: `Bearer ${token}` },
    data: { name },
  });
  expect(res.status(), 'api create org').toBe(201);
  return (await res.json()).id as string;
}

export async function apiSetActiveOrganization(
  request: APIRequestContext,
  token: string,
  orgId: string,
): Promise<void> {
  const res = await request.patch('/api/users/me/preferences', {
    headers: { ...V1, Authorization: `Bearer ${token}` },
    data: { lastVisitedOrgId: orgId },
  });
  expect(res.status(), 'api set active org').toBe(200);
}

/** Rotates the session (uses the rt cookie held by the request context). */
export async function apiRefresh(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/auth/refresh', { headers: V1 });
  expect(res.status(), 'api refresh').toBe(200);
  return (await res.json()).accessToken as string;
}

/** Creates a project under the active org. The token must already carry the orgId. */
export async function apiCreateProject(
  request: APIRequestContext,
  token: string,
  orgId: string,
  name = `Proj ${Date.now()}`,
): Promise<string> {
  const res = await request.post(`/api/organizations/${orgId}/projects`, {
    headers: { ...V1, Authorization: `Bearer ${token}` },
    data: {
      name,
      programmingLanguages: ['Java'],
      frameworks: ['Spring'],
      clientPlatforms: ['Web'],
      databases: ['PostgreSQL'],
      architecture: 'Hexagonal',
      domain: 'Test',
    },
  });
  expect(res.status(), 'api create project').toBe(201);
  return (await res.json()).id as string;
}
