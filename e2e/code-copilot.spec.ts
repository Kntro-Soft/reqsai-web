import { APIRequestContext, expect, Page, test } from '@playwright/test';
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

/**
 * The code-aware copilot against the local stack: the API's GitHub base URL points at the fixture
 * GitHub that serves `acme/reservas` (a bookings app whose rule is "cancel up to 2 hours before"),
 * and the real AI configured in the local API. The analyst connects the repository, waits for the
 * index, finds the rule in the module map, then asks for a 24-hour cancellation in the assistant
 * chat and gets a suggestion flagged as contradicting the code.
 */
async function seed(request: APIRequestContext) {
  const email = uniqueEmail('code');
  await registerReady(request, email, PASSWORD);
  const token = await apiLogin(request, email, PASSWORD);
  const orgId = await apiCreateOrganization(request, token, `Code ${Date.now()}`);
  await apiSetActiveOrganization(request, token, orgId);
  const active = await apiRefresh(request);
  const projectId = await apiCreateProject(request, active, orgId, 'Restaurante La Tradición');
  return { email, projectId };
}

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/projects/);
}

async function ask(page: Page, text: string): Promise<void> {
  const answers = page.getByTestId('chat-answer');
  const before = await answers.count();
  await page.getByTestId('composer-input').fill(text);
  await page.getByTestId('composer-input').press('Enter');
  await expect(page.getByTestId('chat-thinking')).toBeVisible();
  await expect(answers).toHaveCount(before + 1, { timeout: 90_000 });
}

test.describe('Code-aware copilot', () => {
  test('connects a repository, maps its rules and flags a request that contradicts the code', async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000);
    const { email, projectId } = await seed(request);
    await uiLogin(page, email);

    // Connect the repository from the empty state.
    await page.goto(`/projects/${projectId}/code`);
    await expect(page.getByTestId('code-empty')).toBeVisible();
    await page.getByTestId('code-repo-input').fill('acme/reservas');
    await page.getByTestId('code-connect-submit').click();

    // Indexing runs in the background; the page polls until the repository is ready.
    const repo = page.getByTestId('code-repo').filter({ hasText: 'acme/reservas' });
    await expect(repo).toBeVisible();
    await expect(repo).toHaveAttribute('data-status', 'READY', { timeout: 120_000 });
    await expect(repo.getByTestId('code-repo-status')).toContainText('Listo');

    // The detected profile names the stack.
    await expect(
      page.getByTestId('code-profile-chip').filter({ hasText: 'TypeScript' }).first(),
    ).toBeVisible();

    // The module map has the bookings module, and opening it shows the 2-hour cancellation rule.
    const bookings = page
      .getByTestId('code-module')
      .filter({ has: page.getByTestId('code-module-name').filter({ hasText: /reserva/i }) })
      .first();
    await expect(bookings).toBeVisible();
    await bookings.getByTestId('code-module-toggle').click();
    await expect(
      bookings
        .getByTestId('code-module-rule')
        .filter({ hasText: /2 horas/i })
        .first(),
    ).toBeVisible();

    // In capture, a 24-hour cancellation request contradicts the code.
    await page.goto(`/projects/${projectId}/sessions`);
    await ask(page, 'Quiero que el comensal pueda cancelar su reserva hasta 24 horas antes');
    const answer = page.getByTestId('chat-answer').last();
    const card = answer
      .getByTestId('chat-suggestion')
      .filter({ has: page.getByTestId('suggestion-code-conflict') })
      .first();
    await expect(card).toBeVisible();
    const conflict = card.getByTestId('suggestion-code-conflict');
    await expect(conflict.getByTestId('suggestion-code-note')).not.toBeEmpty();
    await expect(
      conflict
        .getByTestId('suggestion-code-ref')
        .filter({ hasText: /reserva/i })
        .first(),
    ).toBeVisible();
  });
});
