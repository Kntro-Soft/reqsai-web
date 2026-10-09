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
const FAKE_GITHUB = process.env['FAKE_GITHUB_URL'] ?? 'http://127.0.0.1:4545';

/**
 * The code-aware copilot against the local stack: the API's GitHub base URL points at the fixture
 * GitHub that serves `acme/reservas` (a bookings app whose rule is "cancel up to 2 hours before"),
 * and the real AI configured in the local API. The analyst connects the repository, waits for the
 * index, finds the rule in the module map, then asks for a 24-hour cancellation in the assistant
 * chat and gets a suggestion flagged as contradicting the code.
 *
 * Needs the fixture GitHub running (`python3 e2e/fixtures/fake-github/fake_github.py 4545`) and the
 * API started with `CODEBASE_GITHUB_API_URL=http://127.0.0.1:4545`; skipped when the fixture is down.
 */
async function fakeGitHubUp(request: APIRequestContext): Promise<boolean> {
  try {
    return (await request.get(`${FAKE_GITHUB}/repos/acme/reservas`)).ok();
  } catch {
    return false;
  }
}

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
    test.skip(
      !(await fakeGitHubUp(request)),
      'Start the fixture GitHub to run the code copilot E2E',
    );
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

    // Searching the module map for the rule finds the bookings module, and opening it shows the
    // 2-hour cancellation rule.
    await page.getByTestId('code-modules-filter').fill('2 horas');
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
  test('checks the reference, applies the detected profile, reindexes and disconnects', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    test.skip(
      !(await fakeGitHubUp(request)),
      'Start the fixture GitHub to run the code copilot E2E',
    );
    const { email, projectId } = await seed(request);
    await uiLogin(page, email);
    await page.goto(`/projects/${projectId}/code`);

    // The form rejects what is not a repository, and GitHub answers for one that does not exist.
    const input = page.getByTestId('code-repo-input');
    await input.fill('esto no es un repo');
    await input.press('Tab');
    await expect(page.getByTestId('code-connect-invalid')).toBeVisible();
    await input.fill('acme/no-existe');
    await page.getByTestId('code-connect-submit').click();
    await expect(page.getByTestId('code-connect-error')).toBeVisible();

    // A github.com URL works as well as owner/name.
    await input.fill('https://github.com/acme/reservas');
    await page.getByTestId('code-connect-submit').click();
    const repo = page.getByTestId('code-repo').filter({ hasText: 'acme/reservas' });
    await expect(repo).toHaveAttribute('data-status', 'READY', { timeout: 120_000 });

    // The stack found in the code joins the project's technical profile.
    const additions = page.getByTestId('code-profile-additions');
    await expect(additions).toContainText('TypeScript');
    await page.getByTestId('code-profile-apply').click();
    await expect(additions).toContainText('ya incluye todo');
    await expect(page.getByTestId('code-profile-apply')).toBeDisabled();

    // Reindexing the same commit ends ready again with the same module map.
    await expect(page.getByTestId('code-module').first()).toBeVisible();
    const modules = await page.getByTestId('code-module').count();
    await repo.getByTestId('code-repo-reindex').click();
    await expect(repo).toHaveAttribute('data-status', 'READY', { timeout: 120_000 });
    await expect(page.getByTestId('code-module')).toHaveCount(modules);

    // Disconnecting removes the repository and its modules.
    await repo.getByTestId('code-repo-remove').click();
    await page.getByTestId('code-remove-confirm').click();
    await expect(page.getByTestId('code-empty')).toBeVisible();
  });
});
