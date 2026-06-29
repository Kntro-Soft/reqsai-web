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
    await expect(page.getByTestId('projects-empty')).toBeVisible();

    // Create the first project.
    await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
    await page.getByLabel('Nombre', { exact: true }).fill('Mobile App');
    await page.getByLabel('Lenguajes (coma)').fill('TypeScript');
    await page.getByLabel('Frameworks (coma)').fill('Angular');
    await page.getByLabel('Plataformas (coma)').fill('Web');
    await page.getByLabel('Bases de datos (coma)').fill('PostgreSQL');
    await page.getByLabel('Arquitectura').fill('Hexagonal');
    await page.getByLabel('Dominio').fill('Fintech');
    await page.getByRole('button', { name: 'Crear proyecto' }).click();

    await expect(page.getByTestId('project-row')).toHaveCount(1);
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

    // The header switcher reflects the active org and switches to the other.
    const switcher = page.getByTestId('org-switcher');
    await expect(switcher).toContainText('Org One');
    await switcher.click();
    await page.getByTestId('org-option').filter({ hasText: 'Org Two' }).click();
    await expect(page).toHaveURL(/\/projects/);
    await expect(switcher).toContainText('Org Two');
  });
});
