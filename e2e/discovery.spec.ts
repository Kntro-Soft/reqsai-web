import * as path from 'node:path';
import { expect, Page, test } from '@playwright/test';
import { registerVerified, uniqueEmail } from './helpers/auth';
import {
  apiAcceptTerms,
  apiCreateOrganization,
  apiCreateProject,
  apiLogin,
  apiRefresh,
  apiSetActiveOrganization,
} from './helpers/workspace';

const PASSWORD = 'Passw0rd!23';

// Chromium plays this recording as the microphone: a client asking for online table bookings
// (as a guest) and a daily bookings panel (as the manager). Live transcription and the AI
// suggestions run against the real STT and LLM providers configured in the API.
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

async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/projects/);
}

test.describe('Discovery capture', () => {
  test('a recorded meeting is transcribed live and its AI suggestion becomes a backlog story', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const email = uniqueEmail('disc');
    await registerVerified(request, email, PASSWORD);
    const token = await apiLogin(request, email, PASSWORD);
    await apiAcceptTerms(request, token);
    const orgId = await apiCreateOrganization(request, token, `Disc ${Date.now()}`);
    await apiSetActiveOrganization(request, token, orgId);
    const activeToken = await apiRefresh(request);
    const projectId = await apiCreateProject(request, activeToken, orgId, 'Restaurante');

    await uiLogin(page, email, PASSWORD);
    await page.goto(`/projects/${projectId}/sessions`);
    await page.getByTestId('composer-record').click();

    // Live: the session bar shows the recording and the transcript streams in.
    await expect(page.getByTestId('session-bar')).toBeVisible();
    await expect(page.getByTestId('segment-bubble').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('discovery-feed')).toContainText(/reserv/i, { timeout: 60_000 });

    // The AI drafts a story from what it heard; accepting it adds it to the backlog.
    const card = page.getByTestId('suggestion-card').first();
    await expect(card).toBeVisible({ timeout: 120_000 });
    await card.getByTestId('suggestion-accept').click();
    await expect(page.getByTestId('decision-go-to-story').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('panel-story').first()).toContainText('Borrador');

    await page.getByTestId('session-bar-stop').click();
    await expect(page.getByTestId('session-bar')).toHaveCount(0, { timeout: 30_000 });

    await page.goto(`/projects/${projectId}/stories`);
    // The accepted suggestion is now a draft in the backlog, waiting for review.
    await expect(page.getByTestId('status-badge').filter({ visible: true }).first()).toHaveText(
      'Borrador',
    );
  });
});
