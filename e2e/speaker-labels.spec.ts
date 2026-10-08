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
const V1 = { 'Api-Version': '1' };
// The Spanish meeting the other discovery specs use: uploaded, it is diarized by the speech-to-text.
const MEETING_AUDIO = path.join(__dirname, 'fixtures', 'meeting-es.wav');

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/projects/);
}

/**
 * US40 — the analyst identifies the speakers of a meeting so the AI prioritizes the client's needs:
 * the transcript of an uploaded meeting shows its diarized voices as "Hablante N", the analyst names
 * one and marks them as the client, and every segment of that voice is relabelled, also after a
 * reload and when the session is opened from the history. Runs against the real speech-to-text and
 * AI of the local API.
 */
test.describe('Speaker labels', () => {
  test('the analyst names a diarized speaker, marks them as the client and the transcript follows', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const email = uniqueEmail('speakers');
    await registerReady(request, email, PASSWORD);
    const token = await apiLogin(request, email, PASSWORD);
    const orgId = await apiCreateOrganization(request, token, `Speakers ${Date.now()}`);
    await apiSetActiveOrganization(request, token, orgId);
    const active = await apiRefresh(request);
    const projectId = await apiCreateProject(request, active, orgId, 'Restaurante');

    await uiLogin(page, email);
    await page.goto(`/projects/${projectId}/sessions`);
    await page.getByTestId('upload-recording-open').click();
    await page.getByTestId('upload-file').setInputFiles(MEETING_AUDIO);
    await page.getByTestId('upload-title').fill('Kickoff con el restaurante');
    await page.getByTestId('upload-submit').click();
    await expect(page.getByTestId('toast')).toContainText('Grabación procesada', {
      timeout: 120_000,
    });

    // The diarized voices appear as "Hablante N", numbered by first appearance.
    const firstSpeaker = page.getByTestId('segment-speaker').first();
    await expect(firstSpeaker).toHaveText('Hablante 1', { timeout: 30_000 });
    const label = await firstSpeaker.getAttribute('data-speaker-label');
    expect(label).toBeTruthy();
    await expect(page.getByTestId('session-speakers')).toBeVisible();
    await expect(page.getByTestId('speaker-chip').first()).toContainText('Hablante 1');

    // Name the first voice and mark them as the client.
    await page.getByTestId('speakers-edit').first().click();
    const panel = page.getByTestId('speakers-panel');
    await expect(panel).toBeVisible();
    const row = panel.locator(`[data-testid="speaker-row"][data-speaker-label="${label}"]`);
    await row.getByTestId('speaker-name-input').fill('Ana Torres');
    await row.getByTestId('speaker-side-client').click();
    await expect(row.getByTestId('speaker-side-client')).toHaveAttribute('aria-pressed', 'true');
    await row.getByTestId('speaker-save').click();
    await expect(page.getByTestId('toast').last()).toContainText('Ana Torres');
    await page.getByTestId('speakers-close').click();

    // Every segment of that voice is relabelled, with the client tag.
    const anaSegments = page.locator(
      `[data-testid="segment-speaker"][data-speaker-label="${label}"]`,
    );
    await expect(anaSegments.first()).toHaveText('Ana Torres');
    const count = await anaSegments.count();
    for (let i = 0; i < count; i++) {
      await expect(anaSegments.nth(i)).toHaveText('Ana Torres');
    }
    await expect(page.getByTestId('segment-speaker-side').first()).toHaveText('Cliente');
    await expect(page.getByTestId('speaker-chip').first()).toContainText('Ana Torres');
    await expect(page.getByTestId('speaker-chip').first()).toContainText('Cliente');

    // The API keeps the name and side for the AI, with the overlapping-speech report.
    const sessions = await request.get(`/api/projects/${projectId}/sessions`, {
      headers: { ...V1, Authorization: `Bearer ${active}` },
    });
    expect(sessions.status()).toBe(200);
    const sessionId = (await sessions.json()).content[0].id as string;
    const speakers = await request.get(
      `/api/projects/${projectId}/sessions/${sessionId}/speakers`,
      {
        headers: { ...V1, Authorization: `Bearer ${active}` },
      },
    );
    expect(speakers.status()).toBe(200);
    const body = await speakers.json();
    const ana = body.speakers.find((s: { label: string }) => s.label === label);
    expect(ana).toMatchObject({ index: 1, displayName: 'Ana Torres', side: 'CLIENT' });
    expect(typeof body.overlaps.count).toBe('number');
    if (body.overlaps.count > 0) {
      await expect(page.getByTestId('speakers-overlap-warning')).toContainText(
        'voces superpuestas',
      );
    } else {
      await expect(page.getByTestId('speakers-overlap-warning')).toHaveCount(0);
    }

    // The names survive a reload and show when the session is opened from the history.
    await page.goto(`/projects/${projectId}/sessions/history`);
    await page.getByTestId('history-row').first().click();
    await expect(
      page.locator(`[data-testid="segment-speaker"][data-speaker-label="${label}"]`).first(),
    ).toHaveText('Ana Torres', { timeout: 30_000 });
  });
});
