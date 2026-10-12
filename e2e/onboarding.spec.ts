import { expect, Page, test } from '@playwright/test';
import { uniqueEmail } from './helpers/auth';
import { registerReady } from './helpers/workspace';

const PASSWORD = 'Passw0rd!23';

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('First steps', () => {
  test('a new organization offers the demo, a new project and the integrations, until dismissed', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('welcome');
    await registerReady(request, email, PASSWORD);
    await uiLogin(page, email);
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel('Nombre de la organización').fill(`Bienvenida ${Date.now()}`);
    await page.getByRole('button', { name: 'Crear y continuar' }).click();
    await expect(page).toHaveURL(/\/projects/);

    const panel = page.getByTestId('welcome-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('welcome-demo')).toBeVisible();
    await expect(page.getByTestId('welcome-create')).toBeVisible();
    await expect(page.getByTestId('welcome-connect')).toBeVisible();

    await page.getByTestId('welcome-tour').click();
    const next = page.locator('.driver-popover-next-btn');
    await expect(page.locator('.driver-popover')).toBeVisible();
    for (let i = 0; i < 5; i++) await next.click();
    await expect(page.locator('.driver-popover')).toHaveCount(0);

    await page.getByTestId('welcome-demo').click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/i);

    await page.goto('/projects');
    await page.getByTestId('welcome-dismiss').click();
    await expect(panel).toBeHidden();
    await page.reload();
    await expect(page.getByTestId('project-card')).toBeVisible();
    await expect(panel).toBeHidden();
  });
});
