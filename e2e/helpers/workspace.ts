import { APIRequestContext, expect } from '@playwright/test';

const V1 = { 'Api-Version': '1' };

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
