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
// The same Spanish meeting the live-capture test plays through the fake microphone.
const MEETING_AUDIO = path.join(__dirname, 'fixtures', 'meeting-es.wav');

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/projects/);
}

/**
 * US41 — a past meeting's recording is uploaded from the capture page: it is transcribed and the AI
 * extracts its stories into the backlog. Runs against the real speech-to-text and AI of the local API.
 */
test.describe('Upload a recording', () => {
  test('an uploaded meeting becomes a session whose stories land in the backlog', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const email = uniqueEmail('upload');
    await registerReady(request, email, PASSWORD);
    const token = await apiLogin(request, email, PASSWORD);
    const orgId = await apiCreateOrganization(request, token, `Upload ${Date.now()}`);
    await apiSetActiveOrganization(request, token, orgId);
    const active = await apiRefresh(request);
    const projectId = await apiCreateProject(request, active, orgId, 'Restaurante');

    await uiLogin(page, email);
    await page.goto(`/projects/${projectId}/sessions`);
    await page.getByTestId('upload-recording-open').click();

    // A file that is not audio is refused before anything is sent.
    await page.getByTestId('upload-file').setInputFiles({
      name: 'acta.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });
    await expect(page.getByTestId('upload-problem')).toBeVisible();
    await expect(page.getByTestId('upload-submit')).toBeDisabled();

    await page.getByTestId('upload-file').setInputFiles(MEETING_AUDIO);
    await expect(page.getByTestId('upload-title')).toHaveValue('meeting es');
    await page.getByTestId('upload-title').fill('Kickoff con el restaurante');
    await page.getByTestId('upload-submit').click();
    await expect(page.getByTestId('upload-progress')).toBeVisible();

    await expect(page.getByTestId('toast')).toContainText('Grabación procesada', {
      timeout: 120_000,
    });
    await expect(page.getByTestId('feed-story').first()).toBeVisible();

    await page.goto(`/projects/${projectId}/stories`);
    await expect(page.getByTestId('status-badge').filter({ visible: true }).first()).toHaveText(
      'Borrador',
    );
  });
});
