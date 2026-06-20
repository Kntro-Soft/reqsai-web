import { expect, Page, test } from '@playwright/test';
import { registerVerified, uniqueEmail } from './helpers/auth';
import {
  apiCreateOrganization,
  apiCreateProject,
  apiLogin,
  apiRefresh,
  apiSetActiveOrganization,
} from './helpers/workspace';

const PASSWORD = 'Passw0rd!23';

async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('Discovery realtime', () => {
  test('live session streams lifecycle events over STOMP', async ({ page, request }) => {
    // Seed an active org with a project to host the session.
    const email = uniqueEmail('disc');
    await registerVerified(request, email, PASSWORD);
    const token = await apiLogin(request, email, PASSWORD);
    const orgId = await apiCreateOrganization(request, token, `Disc ${Date.now()}`);
    await apiSetActiveOrganization(request, token, orgId);
    const activeToken = await apiRefresh(request); // now carries orgId → tenant resolves
    const projectId = await apiCreateProject(request, activeToken, orgId);

    await uiLogin(page, email, PASSWORD);
    // Wait for the post-login navigation (cookie set, session active) before deep-linking.
    await expect(page).toHaveURL(/\/projects/);

    // Create a session and land on its live page.
    await page.goto(`/projects/${projectId}/sessions`);
    await page.getByRole('button', { name: 'Nueva sesión' }).click();
    await page.getByLabel('Título').fill('Sesión E2E');
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+/i);

    // Wait for the STOMP connection before triggering broadcasts.
    await expect(page.getByTestId('live-indicator')).toContainText('En vivo');

    // start → backend broadcasts RECORDING_STARTED on the session topic.
    await page.getByRole('button', { name: 'Iniciar grabación' }).click();
    await expect(page.getByTestId('session-status')).toHaveText('RECORDING');
    await expect(
      page.getByTestId('live-event').filter({ hasText: 'Grabación iniciada' }),
    ).toBeVisible();

    // pause → RECORDING_PAUSED
    await page.getByRole('button', { name: 'Pausar' }).click();
    await expect(page.getByTestId('session-status')).toHaveText('PAUSED');
    await expect(
      page.getByTestId('live-event').filter({ hasText: 'Grabación pausada' }),
    ).toBeVisible();

    // stop → RECORDING_STOPPED
    await page.getByRole('button', { name: 'Detener' }).click();
    await expect(page.getByTestId('session-status')).toHaveText('STOPPED');
    await expect(
      page.getByTestId('live-event').filter({ hasText: 'Grabación detenida' }),
    ).toBeVisible();
  });
});
