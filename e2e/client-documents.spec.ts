import * as path from 'node:path';
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
const V1 = { 'Api-Version': '1' };
// A one-page, 2 KB terms of reference of the restaurant: objective, glossary and constraints.
const TERMS_OF_REFERENCE = path.join(__dirname, 'fixtures', 'terminos-de-referencia.pdf');
// The first bytes of a Windows executable.
const EXECUTABLE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(254)]);

/**
 * US22 — the analyst uploads a client document (PDF) from the project's "Documentos" page: ReqsAI
 * extracts its text and the real AI configured in the local API classifies it into glossary terms,
 * constraints and a project-context summary; the analyst reviews and applies it. Executables are refused
 * in the browser and by the API.
 */
async function seed(request: APIRequestContext) {
  const email = uniqueEmail('docs');
  await registerReady(request, email, PASSWORD);
  const token = await apiLogin(request, email, PASSWORD);
  const orgId = await apiCreateOrganization(request, token, `Docs ${Date.now()}`);
  await apiSetActiveOrganization(request, token, orgId);
  const active = await apiRefresh(request);
  const projectId = await apiCreateProject(request, active, orgId, 'Restaurante La Tradición');
  // A term the project already has: the analysis must flag it instead of adding it twice.
  const term = await request.post(`/api/organizations/${orgId}/projects/${projectId}/glossary`, {
    headers: { ...V1, Authorization: `Bearer ${active}` },
    data: { term: 'Comensal', definition: 'Cliente del restaurante.' },
  });
  expect(term.status(), 'seed glossary term').toBe(201);
  return { email, orgId, projectId, token: active };
}

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/projects/);
}

test.describe('Client documents', () => {
  test('a client PDF is classified by the AI, reviewed and applied to the project context', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const { email, projectId } = await seed(request);
    await uiLogin(page, email);
    await page.goto(`/projects/${projectId}/documents`);
    await expect(page.getByTestId('doc-empty')).toBeVisible();

    // An executable is refused before anything is sent.
    await page.getByTestId('doc-file-input').setInputFiles({
      name: 'setup.exe',
      mimeType: 'application/x-msdownload',
      buffer: EXECUTABLE,
    });
    await expect(page.getByTestId('doc-problem')).toBeVisible();
    await expect(page.getByTestId('doc-analyze')).toBeDisabled();

    // The terms of reference are uploaded, read and classified by the AI.
    await page.getByTestId('doc-file-input').setInputFiles(TERMS_OF_REFERENCE);
    await expect(page.getByTestId('doc-problem')).toHaveCount(0);
    await expect(page.getByTestId('doc-file-name')).toHaveText('terminos-de-referencia.pdf');
    await page.getByTestId('doc-analyze').click();
    await expect(page.getByTestId('doc-progress')).toBeVisible();

    const review = page.getByTestId('doc-review');
    await expect(review).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('doc-unclassified')).toHaveCount(0);
    await expect(page.getByTestId('doc-context')).not.toHaveValue('');
    await expect(page.getByTestId('doc-term').first()).toBeVisible();
    await expect(page.getByTestId('doc-constraint').first()).toBeVisible();

    // Whatever the project already has is flagged and cannot be selected again.
    const existing = page.locator('[data-testid="doc-term"][data-exists="true"]');
    for (let i = 0; i < (await existing.count()); i++) {
      await expect(existing.nth(i).getByTestId('doc-term-exists')).toBeVisible();
      await expect(existing.nth(i).getByTestId('doc-term-checkbox')).toBeDisabled();
    }

    // New terms and constraints come preselected; keep the first of each.
    const newTerm = page.locator('[data-testid="doc-term"][data-exists="false"]').first();
    await expect(newTerm.getByTestId('doc-term-checkbox')).toBeChecked();
    const termName = (await newTerm.getByTestId('doc-term-name').innerText()).trim();
    const newConstraint = page
      .locator('[data-testid="doc-constraint"][data-exists="false"]')
      .first();
    await expect(newConstraint.getByTestId('doc-constraint-checkbox')).toBeChecked();
    const constraintText = (
      await newConstraint.getByTestId('doc-constraint-text').innerText()
    ).trim();

    await page.getByTestId('doc-name').fill('Términos de referencia');
    await page.getByTestId('doc-apply').click();
    await expect(page.getByTestId('toast')).toContainText('Documento guardado');
    await expect(review).toHaveCount(0);

    const row = page.getByTestId('doc-row');
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('doc-row-name')).toHaveText('Términos de referencia');
    await expect(row.getByTestId('doc-row-summary')).not.toHaveText(/Sin resumen/);

    // The selected term and constraint now live in the glossary and the constraints.
    await page.goto(`/projects/${projectId}/glossary`);
    await expect(page.getByTestId('glossary-row').filter({ hasText: termName })).toBeVisible();
    await page.goto(`/projects/${projectId}/constraints`);
    await expect(
      page.getByTestId('constraint-row').filter({ hasText: constraintText.slice(0, 40) }),
    ).toBeVisible();

    // The document survives a reload and can be deleted.
    await page.goto(`/projects/${projectId}/documents`);
    await expect(page.getByTestId('doc-row')).toHaveCount(1);
    await page.getByTestId('doc-delete').click();
    await page.getByTestId('doc-delete-confirm').click();
    await expect(page.getByTestId('doc-empty')).toBeVisible();
  });

  test('the API refuses an executable disguised as a PDF', async ({ request }) => {
    const { orgId, projectId, token } = await seed(request);

    const res = await request.post(
      `/api/organizations/${orgId}/projects/${projectId}/documents/upload`,
      {
        headers: { ...V1, Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: 'factura.pdf', mimeType: 'application/pdf', buffer: EXECUTABLE },
        },
      },
    );

    expect(res.status()).toBe(415);
    expect((await res.json()).code).toBe('DOCUMENT_TYPE_NOT_ALLOWED');
  });
});
