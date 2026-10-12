import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { uniqueEmail } from './helpers/auth';
import {
  apiCreateOrganization,
  apiLogin,
  apiSetActiveOrganization,
  registerReady,
} from './helpers/workspace';

const PASSWORD = 'Passw0rd!23';
const FAKE_GITHUB = process.env['FAKE_GITHUB_URL'] ?? 'http://127.0.0.1:4545';

/**
 * Creating a project with a GitHub repository from the wizard, against the fixture GitHub: the
 * organization has no GitHub yet, so the sources step offers to connect it, the trip to GitHub and
 * back keeps what was typed, the picked repository is connected and indexed in the background while
 * the project is already open, the "Configurando tu proyecto" bar follows it, and the detected stack
 * is one click away.
 *
 * Needs the fixture GitHub (`python3 e2e/fixtures/fake-github/fake_github.py 4545`, with
 * FAKE_GITHUB_SETUP_URL pointing at the web under test) and the API started with the settings in its
 * README; skipped when the fixture is down.
 */
async function fakeGitHubUp(request: APIRequestContext): Promise<boolean> {
  try {
    return (await request.get(`${FAKE_GITHUB}/repos/acme/reservas`)).ok();
  } catch {
    return false;
  }
}

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/projects/);
}

test.describe('Project created with sources', () => {
  test('connects GitHub from the wizard, opens at once and follows the indexing in the bar', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    test.skip(!(await fakeGitHubUp(request)), 'Start the fixture GitHub to run this E2E');

    const email = uniqueEmail('setup');
    await registerReady(request, email, PASSWORD);
    const token = await apiLogin(request, email, PASSWORD);
    const orgId = await apiCreateOrganization(request, token, `Setup ${email.split('@')[0]}`);
    await apiSetActiveOrganization(request, token, orgId);
    await uiLogin(page, email);

    // Step 1: the basics.
    await page.goto('/projects/new');
    await page.getByLabel('Nombre', { exact: true }).fill('Reservas conectado');
    await page.getByTestId('project-create-next').click();

    // Step 2: GitHub is not connected yet; Jira neither, and says so.
    await expect(page.getByTestId('sources-jira-connect')).toBeVisible();
    await expect(page.getByTestId('sources-github-connect')).toBeVisible();

    // Connecting GitHub goes out and comes back to the wizard, still on step 2 with the name kept.
    await page.getByTestId('sources-github-connect-button').click();
    await expect(page).toHaveURL(/\/projects\/new/);
    await expect(page.getByTestId('project-create-sources')).toBeVisible();
    const row = page.locator('[data-testid="repo-picker-row"][data-full-name="acme/reservas"]');
    await expect(row).toBeVisible();
    await row.locator('input[type="checkbox"]').check();
    await expect(page.getByTestId('repo-picker-count')).toContainText('1 de 3');

    // Step 3: the summary, then create. The project opens right away.
    await page.getByTestId('project-create-review').click();
    await expect(page.getByTestId('project-create-summary-github')).toContainText('acme/reservas');
    await page.getByTestId('project-create-confirm-submit').click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/overview$/i);

    // The bar follows the indexing while the user is on the project.
    const bar = page.getByTestId('project-setup-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('Configurando tu proyecto');
    const step = page.getByTestId('setup-step-GITHUB_REPOS');
    await expect(step).toHaveAttribute('data-status', 'DONE', { timeout: 150_000 });
    await expect(bar).toContainText('Tu código está listo');

    // The detected stack is one click away, and it is not applied on its own.
    const apply = page.getByTestId('setup-stack-apply');
    await expect(apply).toBeVisible();
    await apply.click();
    await expect(page.getByTestId('setup-stack-offer')).toHaveCount(0);

    // Closing it is remembered: it stays away after a reload.
    await page.getByTestId('project-setup-dismiss').click();
    await expect(bar).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('project-setup-bar')).toHaveCount(0);
  });
});
