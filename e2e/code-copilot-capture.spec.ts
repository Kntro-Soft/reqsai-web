import * as path from 'node:path';
import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';
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
const FAKE_GITHUB = process.env['FAKE_GITHUB_URL'] ?? 'http://127.0.0.1:4545';
const MEETING_AUDIO = path.join(__dirname, 'fixtures', 'meeting-es.wav');

/**
 * The code-aware copilot during a live meeting: with the fixture GitHub's `acme/reservas` connected,
 * Chromium plays the restaurant meeting as the microphone. A live suggestion quotes what the client
 * said, the quote opens that bubble in the transcript, and the accepted story keeps the quote as its
 * origin with a link back to the moment in the session.
 *
 * Needs the fixture GitHub (`python3 e2e/fixtures/fake-github/fake_github.py 4545`) and the API
 * started with `CODEBASE_GITHUB_API_URL=http://127.0.0.1:4545`; skipped when the fixture is down.
 */
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

async function fakeGitHubUp(request: APIRequestContext): Promise<boolean> {
  try {
    return (await request.get(`${FAKE_GITHUB}/repos/acme/reservas`)).ok();
  } catch {
    return false;
  }
}

/** A project with `acme/reservas` connected and indexed. */
async function seed(request: APIRequestContext) {
  const email = uniqueEmail('codecap');
  await registerReady(request, email, PASSWORD);
  const token = await apiLogin(request, email, PASSWORD);
  const orgId = await apiCreateOrganization(request, token, `Code capture ${Date.now()}`);
  await apiSetActiveOrganization(request, token, orgId);
  const active = await apiRefresh(request);
  const projectId = await apiCreateProject(request, active, orgId, 'Restaurante La Tradición');

  const headers = { ...V1, Authorization: `Bearer ${active}` };
  const repos = `/api/projects/${projectId}/code/repositories`;
  const connected = await request.post(repos, { headers, data: { repository: 'acme/reservas' } });
  expect(connected.status(), 'connect repository').toBe(201);
  await expect
    .poll(
      async () =>
        ((await (await request.get(repos, { headers })).json()) as { status: string }[])[0]?.status,
      {
        timeout: 120_000,
        intervals: [1_000],
      },
    )
    .toBe('READY');
  return { email, projectId };
}

/**
 * The review tray shows one suggestion at a time: steps through it (new ones keep arriving while the
 * meeting plays) until the current card's quote points at a bubble of the transcript.
 */
async function quotedCard(page: Page): Promise<Locator> {
  const queue = page.getByTestId('decision-queue');
  const card = queue.getByTestId('suggestion-card');
  await expect(card).toBeVisible({ timeout: 120_000 });
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    if ((await card.locator('button[data-testid="suggestion-evidence"]').count()) > 0) return card;
    const next = queue.getByTestId('queue-next');
    if (await next.isEnabled()) await next.click();
    await page.waitForTimeout(1_500);
  }
  throw new Error('No live suggestion pointed at a bubble of the transcript');
}

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/projects/);
}

test.describe('Code-aware copilot in a live meeting', () => {
  test('a live suggestion quotes the client, opens that moment and keeps it as the story origin', async ({
    page,
    request,
  }) => {
    test.setTimeout(360_000);
    test.skip(
      !(await fakeGitHubUp(request)),
      'Start the fixture GitHub to run the code copilot E2E',
    );
    const { email, projectId } = await seed(request);
    await uiLogin(page, email);

    await page.goto(`/projects/${projectId}/sessions`);
    await page.getByTestId('composer-record').click();
    await expect(page.getByTestId('segment-bubble').first()).toBeVisible({ timeout: 60_000 });

    // A live suggestion carries the client's words; they point at a bubble of this transcript.
    const queue = page.getByTestId('decision-queue');
    const card = await quotedCard(page);
    await expect(card.getByTestId('suggestion-evidence-quote')).not.toBeEmpty();
    const evidence = card.getByTestId('suggestion-evidence');
    const key = await evidence.getAttribute('data-evidence-segment');
    expect(key, 'evidence segment').toMatch(/^[0-9a-f-]+:\d+$/);

    // Opening the quote folds the review tray, scrolls to that bubble and highlights it.
    await evidence.click();
    const quoted = page.locator(`[data-testid="segment-bubble"][data-segment="${key}"]`);
    await expect(quoted.locator('.segment-flash')).toBeVisible({ timeout: 3_000 });

    // Back in the tray, accepting that suggestion makes a story whose origin is the quote.
    await page.getByTestId('queue-badge').click();
    const same = queue.getByTestId('suggestion-card');
    await expect(same.locator(`[data-evidence-segment="${key}"]`)).toBeVisible();
    await same.getByTestId('suggestion-accept').click();
    await expect(page.getByTestId('decision-go-to-story').first()).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('session-bar-stop').click();
    await expect(page.getByTestId('session-bar')).toHaveCount(0, { timeout: 30_000 });

    // "Go to story" opens it in the side panel; from there, its page.
    await page.getByTestId('decision-go-to-story').first().click();
    await page.getByTestId('panel-story-open').first().click();
    await expect(page).toHaveURL(/\/stories\//);
    const origin = page.getByTestId('story-origin');
    await expect(origin).toBeVisible();
    await expect(origin.getByTestId('story-origin-quote')).not.toBeEmpty();

    // "View in the session" goes back to the very moment it was said.
    await origin.getByTestId('story-origin-session').click();
    await expect(page).toHaveURL(
      new RegExp(`/sessions\\?session=[0-9a-f-]+&segment=${key!.split(':')[1]}`),
    );
    await expect(
      page.locator(`[data-testid="segment-bubble"][data-segment="${key}"] .segment-flash`),
    ).toBeVisible({
      timeout: 15_000,
    });
  });
});
