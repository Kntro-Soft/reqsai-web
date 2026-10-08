import * as path from 'node:path';
import { expect, Page, test } from '@playwright/test';
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
const MEETING_AUDIO = path.join(__dirname, 'fixtures', 'meeting-es.wav');

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${MEETING_AUDIO}`,
    ],
  },
});

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/projects/);
}

/**
 * US46 — in manual mode the AI stays quiet while the meeting is transcribed, and analyzes only when
 * the analyst presses "Analizar ahora". Real speech-to-text and AI of the local API.
 */
test.describe('Analyze on demand', () => {
  test('manual mode raises no suggestion until "Analizar ahora"', async ({ page, request }) => {
    test.setTimeout(240_000);
    const email = uniqueEmail('manual');
    await registerReady(request, email, PASSWORD);
    const token = await apiLogin(request, email, PASSWORD);
    const orgId = await apiCreateOrganization(request, token, `Manual ${Date.now()}`);
    await apiSetActiveOrganization(request, token, orgId);
    const active = await apiRefresh(request);
    const projectId = await apiCreateProject(request, active, orgId, 'Restaurante');

    await uiLogin(page, email);
    await page.goto(`/projects/${projectId}/sessions`);
    await page.getByTestId('composer-record').click();
    await expect(page.getByTestId('session-bar')).toBeVisible();

    const mode = page.getByTestId('session-bar-ai-mode');
    await mode.click();
    await expect(mode).toHaveAttribute('data-mode', 'MANUAL');
    await expect(page.getByTestId('ai-activity')).toHaveAttribute('data-state', 'manual');

    // The whole meeting is transcribed, yet the AI raises nothing on its own.
    await expect(page.getByTestId('discovery-feed')).toContainText(/administrador/i, {
      timeout: 60_000,
    });
    await page.waitForTimeout(25_000);
    await expect(page.getByTestId('suggestion-card')).toHaveCount(0);

    await page.getByTestId('session-bar-analyze').click();
    await expect(page.getByTestId('toast')).toContainText('La IA analizó la conversación', {
      timeout: 90_000,
    });
    await expect(page.getByTestId('suggestion-card').first()).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('session-bar-stop').click();
    await expect(page.getByTestId('session-bar')).toHaveCount(0, { timeout: 30_000 });
  });
});
