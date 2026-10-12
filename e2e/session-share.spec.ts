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

/** Shares the demo project's finished session from the capture page and returns the link. */
async function shareSession(page: Page, access: 'VIEW' | 'REVIEW'): Promise<string> {
  await page.getByTestId('capture-menu').click();
  await page.getByTestId('share-session-open').click();
  await page.getByTestId(`share-access-${access}`).check();
  await page.getByTestId('share-create').click();
  return page.getByTestId('share-url').inputValue();
}

async function closeShare(page: Page): Promise<void> {
  await page
    .locator('app-share-links button[aria-label="Cancelar"]')
    .click({ position: { x: 5, y: 5 } });
}

test.describe('Share a session', () => {
  test('a spectator follows the demo session; a reviewer also decides', async ({
    page,
    request,
    browser,
  }) => {
    const email = uniqueEmail('sess');
    await registerReady(request, email, PASSWORD);
    await uiLogin(page, email);
    await page.getByLabel('Nombre de la organización').fill(`Sesión ${Date.now()}`);
    await page.getByRole('button', { name: 'Crear y continuar' }).click();
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/overview/);
    await page.goto(page.url().replace('/overview', '/sessions'));
    await expect(page.getByTestId('capture-menu')).toBeVisible();

    const spectatorUrl = await shareSession(page, 'VIEW');
    expect(spectatorUrl).toMatch(/\/share\/session\/[0-9a-f]{64}$/);
    await closeShare(page);
    const reviewerUrl = await shareSession(page, 'REVIEW');
    expect(reviewerUrl).not.toBe(spectatorUrl);

    // The visitor has no account: a fresh context.
    const visitor = await browser.newContext({ locale: 'es-PE' });
    const spectator = await visitor.newPage();
    await spectator.goto(spectatorUrl);
    await expect(spectator.getByTestId('shared-session-title')).toBeVisible();
    await expect(spectator.getByTestId('shared-session-access')).toContainText('Espectador');
    await expect(spectator.getByTestId('shared-segment').first()).toBeVisible();
    await expect(spectator.getByTestId('shared-session-story').first()).toBeVisible();
    await expect(spectator.getByTestId('shared-story-approve')).toHaveCount(0);
    await expect(spectator.getByTestId('shared-dismiss')).toHaveCount(0);

    const reviewer = await visitor.newPage();
    await reviewer.goto(reviewerUrl);
    await expect(reviewer.getByTestId('shared-session-access')).toContainText('Revisor');
    const draft = reviewer.getByTestId('shared-session-story').filter({
      has: reviewer.getByTestId('shared-story-approve'),
    });
    await expect(draft.first()).toBeVisible();
    const storyId = await draft.first().getAttribute('data-story-id');
    const decided = reviewer.locator(`[data-story-id="${storyId}"]`);
    await decided.getByTestId('shared-story-approve').click();
    await expect(decided.getByTestId('shared-story-draft')).toBeVisible();

    // The spectator's next read (it polls on its own) shows the decision.
    await expect(spectator.locator(`[data-story-id="${storyId}"]`)).toContainText(/Aprobad/, {
      timeout: 15000,
    });
    await visitor.close();

    // Revoking closes the link.
    await closeShare(page);
    await page.getByTestId('capture-menu').click();
    await page.getByTestId('share-session-open').click();
    await page.getByTestId('share-revoke').first().click();
    await expect(page.getByTestId('share-link-state').first()).toHaveAttribute(
      'data-state',
      'revoked',
    );
  });
});
