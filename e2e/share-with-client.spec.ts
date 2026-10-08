import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { uniqueEmail } from './helpers/auth';
import {
  apiCreateOrganization,
  apiCreateProject,
  apiLogin,
  apiRefresh,
  apiSetActiveOrganization,
  registerReady,
} from './helpers/workspace';

const PASSWORD = 'Passw0rd!23';
const V1 = { 'Api-Version': '1' };

/**
 * US50: the analyst shares the backlog through a link, a client without an account opens it in a
 * fresh browser context, approves one story and comments on another, the team reads that feedback
 * on the story, and revoking the link closes it for the client.
 */
async function seed(request: APIRequestContext) {
  const email = uniqueEmail('share');
  await registerReady(request, email, PASSWORD);
  const token = await apiLogin(request, email, PASSWORD);
  const orgId = await apiCreateOrganization(request, token, `Share ${Date.now()}`);
  await apiSetActiveOrganization(request, token, orgId);
  const active = await apiRefresh(request);
  const projectId = await apiCreateProject(request, active, orgId, 'Restaurante La Tradición');
  const ids: string[] = [];
  for (const [title, action] of [
    [
      'Reservar mesa por Internet',
      'reservar una mesa desde la web eligiendo fecha, hora y personas',
    ],
    ['Cancelar reserva', 'cancelar mi reserva desde la web'],
  ]) {
    const story = await request.post(`/api/projects/${projectId}/stories`, {
      headers: { ...V1, Authorization: `Bearer ${active}` },
      data: { title, role: 'comensal', action, benefit: 'no tener que llamar', priority: 'HIGH' },
    });
    expect(story.status(), 'seed story').toBe(201);
    ids.push((await story.json()).id);
  }
  return { email, projectId, storyIds: ids };
}

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/projects/);
}

test.describe('Share stories with the client', () => {
  test('the client approves and comments through the link; the team reads it; revoking closes it', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const { email, projectId, storyIds } = await seed(request);
    await uiLogin(page, email);

    // The analyst creates a 7-day link from the backlog and copies the URL shown once.
    await page.goto(`/projects/${projectId}/stories`);
    await page.getByTestId('stories-share').click();
    await expect(page.getByTestId('share-none')).toBeVisible();
    await page.getByTestId('share-days').selectOption('7');
    await page.getByTestId('share-create').click();
    const url = await page.getByTestId('share-url').inputValue();
    expect(url).toMatch(/\/share\/[0-9a-f]{64}$/);
    await expect(page.getByTestId('share-link-row')).toHaveCount(1);
    await expect(page.getByTestId('share-link-state')).toHaveAttribute('data-state', 'active');

    // A client with no session opens it in a separate browser context.
    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(url);
    await expect(client.getByTestId('shared-project')).toHaveText('Restaurante La Tradición');
    await expect(client.getByTestId('shared-story')).toHaveCount(2);

    // Approving without a name is refused; with a name it is recorded.
    const first = client.locator(`[data-story-id="${storyIds[0]}"]`);
    await first.getByTestId('shared-approve').click();
    await expect(first.getByTestId('shared-error')).toContainText('nombre');
    await client.getByTestId('shared-author').fill('María Quispe');
    await first.getByTestId('shared-approve').click();
    await expect(first.getByTestId('shared-approved-by-me')).toBeVisible();
    await expect(first.getByTestId('shared-feedback')).toHaveCount(1);

    const second = client.locator(`[data-story-id="${storyIds[1]}"]`);
    await second.getByTestId('shared-comment').click();
    await second
      .getByTestId('shared-comment-input')
      .fill('Debería poder cancelar hasta 24 horas antes');
    await second.getByTestId('shared-comment-send').click();
    await expect(second.getByTestId('shared-feedback')).toContainText('24 horas antes');

    // The feedback survives a reload, and the name is remembered on this device.
    await client.reload();
    await expect(client.getByTestId('shared-author')).toHaveValue('María Quispe');
    await expect(client.getByTestId('shared-feedback')).toHaveCount(2);

    // The team reads it on the story; the story stays a draft.
    await page.goto(`/projects/${projectId}/stories/${storyIds[1]}`);
    const feedback = page.getByTestId('client-feedback-entry');
    await expect(feedback).toHaveCount(1);
    await expect(feedback).toHaveAttribute('data-kind', 'COMMENT');
    await expect(feedback).toContainText('María Quispe');

    // Revoking closes the link for the client.
    await page.goto(`/projects/${projectId}/stories`);
    await page.getByTestId('stories-share').click();
    await page.getByTestId('share-revoke').click();
    await expect(page.getByTestId('share-link-state')).toHaveAttribute('data-state', 'revoked');
    await client.reload();
    await expect(client.getByTestId('shared-unavailable')).toBeVisible();
    await clientContext.close();
  });
});
