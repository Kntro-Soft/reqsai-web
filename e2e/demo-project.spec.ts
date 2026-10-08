import { expect, Page, test } from '@playwright/test';
import { uniqueEmail } from './helpers/auth';
import { registerReady } from './helpers/workspace';

const PASSWORD = 'Passw0rd!23';
const DEMO_NAME = /Restaurante La Tradición/;
const DELETED_STORY = 'Registrar un no-show';

/**
 * US28 — every new organization comes with a demo project full of sample data (a finished session,
 * stories, glossary, constraints) so the user explores ReqsAI without starting from scratch, and the
 * sample data can be restored after playing with it.
 */
async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('Demo project', () => {
  test('a new organization gets a demo project whose sample data can be restored', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('demo');
    await registerReady(request, email, PASSWORD);

    // Onboarding announces the demo, then creating the organization seeds it.
    await uiLogin(page, email);
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByTestId('create-org-demo-hint')).toBeVisible();
    await page.getByLabel('Nombre de la organización').fill(`Demo ${Date.now()}`);
    await page.getByRole('button', { name: 'Crear y continuar' }).click();
    await expect(page).toHaveURL(/\/projects/);

    // The demo project is listed, marked with the Demo badge.
    const card = page.getByTestId('project-card').filter({ hasText: DEMO_NAME });
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('demo-badge')).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/overview/);
    const projectId = /\/projects\/([0-9a-f-]+)\//.exec(page.url())?.[1] ?? '';
    expect(projectId).not.toBe('');
    await expect(page.getByTestId('demo-badge')).toBeVisible();
    await expect(page.getByTestId('demo-banner')).toBeVisible();

    // Its backlog already holds the sample stories.
    const rows = page.getByTestId('story-row');
    const deleted = page.getByTestId('story-link').filter({ hasText: DELETED_STORY });
    await page.goto(`/projects/${projectId}/stories`);
    await expect(rows).toHaveCount(6);

    // Play with it: delete one of the stories.
    await deleted.click();
    await page.getByTestId('story-delete').click();
    await page.getByTestId('story-delete-confirm').click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/stories`));
    await expect(rows).toHaveCount(5);
    await expect(deleted).toHaveCount(0);

    // Restore the sample data from the overview, after confirming.
    await page.goto(`/projects/${projectId}/overview`);
    await page.getByTestId('demo-restore').click();
    await page.getByTestId('demo-restore-confirm').click();
    await expect(page.getByText('Datos de prueba restaurados')).toBeVisible();

    // The deleted story is back with the rest of the original backlog.
    await page.goto(`/projects/${projectId}/stories`);
    await expect(rows).toHaveCount(6);
    await expect(deleted).toHaveCount(1);
  });
});
