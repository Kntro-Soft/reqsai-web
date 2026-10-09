import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { uniqueEmail } from './helpers/auth';
import { registerReady } from './helpers/workspace';

const PASSWORD = 'Passw0rd!23';
const DEMO_NAME = /Restaurante La Tradición/;

/**
 * The capture page's side panel lets the analyst act on a story without leaving the meeting: approve
 * it and edit it inline. The virtual-meeting tips can be hidden for good, and a stopped session no
 * longer claims the AI is still "processing". Runs on the demo project every new organization gets.
 */
async function openDemoCapture(page: Page, request: APIRequestContext): Promise<string> {
  const email = uniqueEmail('panel');
  await registerReady(request, email, PASSWORD);
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Nombre de la organización').fill(`Panel ${Date.now()}`);
  await page.getByRole('button', { name: 'Crear y continuar' }).click();
  await expect(page).toHaveURL(/\/projects/);
  await page.getByTestId('project-card').filter({ hasText: DEMO_NAME }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/overview/);
  const projectId = /\/projects\/([0-9a-f-]+)\//.exec(page.url())?.[1] ?? '';
  await page.goto(`/projects/${projectId}/sessions`);
  return projectId;
}

test.describe('Capture side panel', () => {
  test('a story is approved and edited from the panel, and the meeting tips stay hidden', async ({
    page,
    request,
  }) => {
    await openDemoCapture(page, request);

    // A draft story: expand it, approve it right there.
    const drafts = page
      .getByTestId('panel-story')
      .filter({ has: page.locator('[data-testid="status-badge"][data-status="DRAFT"]') });
    const draft = drafts.first();
    const draftTitle = (await draft.getByTestId('panel-story-toggle').innerText()).split('\n')[0];
    await draft.getByTestId('panel-story-toggle').click();
    await draft.getByTestId('panel-story-review-approved').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Historia aprobada.' })).toBeVisible();
    const approved = page.getByTestId('panel-story').filter({ hasText: draftTitle });
    await expect(approved.getByTestId('status-badge')).toHaveAttribute('data-status', 'APPROVED');
    await expect(approved.getByTestId('panel-story-review-draft')).toBeVisible();

    // Edit another story inline: the card shows the new title without leaving the page.
    const other = page.getByTestId('panel-story').nth(1);
    await other.getByTestId('panel-story-toggle').click();
    await other.getByTestId('panel-story-edit').click();
    await other.getByTestId('panel-story-title-input').fill('Historia editada desde la sesión');
    await other.getByTestId('panel-story-save').click();
    await expect(
      page.getByTestId('toast').filter({ hasText: 'Historia actualizada.' }),
    ).toBeVisible();
    await expect(
      page.getByTestId('panel-story').filter({ hasText: 'Historia editada desde la sesión' }),
    ).toHaveCount(1);
    await expect(page.getByTestId('panel-story-form')).toHaveCount(0);

    // The demo's finished session claims no AI work in progress.
    await expect(page.getByText('Procesando la sesión')).toHaveCount(0);

    // Virtual meeting: the tips show once, can be hidden, and stay hidden after a reload.
    await page.getByTestId('audio-source-meeting').click();
    await expect(page.getByTestId('audio-source-hint')).toBeVisible();
    await page.getByTestId('audio-source-hint-dismiss').click();
    await expect(page.getByTestId('audio-source-hint')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('audio-source-meeting')).toBeVisible();
    await page.getByTestId('audio-source-meeting').click();
    await expect(page.getByTestId('audio-source-hint')).toHaveCount(0);
  });
});
