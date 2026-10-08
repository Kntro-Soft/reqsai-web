import { expect, Page, test } from '@playwright/test';
import { registerVerified, uniqueEmail } from './helpers/auth';
import {
  apiAcceptTerms,
  apiCreateOrganization,
  apiLogin,
  apiSetActiveOrganization,
  registerReady,
} from './helpers/workspace';

const PASSWORD = 'Passw0rd!23';

async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('Workspace', () => {
  test('onboarding: create an organization then a project', async ({ page, request }) => {
    const email = uniqueEmail('ws');
    await registerReady(request, email, PASSWORD);

    // A brand-new user has no organization → routed to onboarding.
    await uiLogin(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/onboarding/);

    // Slug is globally unique, so vary the name per run.
    await page.getByLabel('Nombre de la organización').fill(`Acme ${Date.now()}`);
    await page.getByRole('button', { name: 'Crear y continuar' }).click();

    await expect(page).toHaveURL(/\/projects/);
    // Every new organization starts with its demo project (US28).
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await expect(page.getByTestId('demo-badge')).toBeVisible();

    // Create the first project: only the name is required.
    await page.goto('/projects/new');
    await page.getByLabel('Nombre', { exact: true }).fill('Mobile App');
    await page.getByRole('button', { name: 'Crear proyecto' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/i);

    await page.goto('/projects');
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await expect(page.getByText('Mobile App')).toBeVisible();
  });

  test('switches between organizations', async ({ page, request }) => {
    const email = uniqueEmail('ws');
    await registerVerified(request, email, PASSWORD);

    // Seed two organizations and make the first active.
    const token = await apiLogin(request, email, PASSWORD);
    await apiAcceptTerms(request, token);
    const suffix = Date.now();
    const orgOne = await apiCreateOrganization(request, token, `Org One ${suffix}`);
    await apiCreateOrganization(request, token, `Org Two ${suffix}`);
    await apiSetActiveOrganization(request, token, orgOne);

    // Two orgs → straight into the active org's workspace, no picker gate.
    await uiLogin(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/projects/);

    // The sidebar shows the active org; its chevron opens the switcher.
    await expect(page.getByRole('button', { name: /Org One/ })).toBeVisible();
    await page.getByTestId('org-switcher').click();
    await page.getByTestId('org-option').filter({ hasText: 'Org Two' }).click();
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.getByRole('button', { name: /Org Two/ })).toBeVisible();
  });
});
