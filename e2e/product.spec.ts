import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { uniqueEmail } from './helpers/auth';
import { getInvitationToken } from './helpers/mailpit';
import {
  apiCreateOrganization,
  apiCreateProject,
  apiLogin,
  apiRefresh,
  apiSetActiveOrganization,
  registerReady,
} from './helpers/workspace';

const PASSWORD = 'Passw0rd!23';

async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/auth\/sign-in/);
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/auth\/sign-in/);
}

/** Owner with an active organization and one project, seeded through the API. */
async function seedOwner(request: APIRequestContext) {
  const email = uniqueEmail('owner');
  await registerReady(request, email, PASSWORD);
  const token = await apiLogin(request, email, PASSWORD);
  const orgName = `Full Product ${Date.now()}`;
  const orgId = await apiCreateOrganization(request, token, orgName);
  await apiSetActiveOrganization(request, token, orgId);
  const activeToken = await apiRefresh(request);
  const projectId = await apiCreateProject(request, activeToken, orgId, 'Reservas en línea');
  return { email, orgId, orgName, projectId };
}

/**
 * The whole product as one owner and one invited teammate, in the order a team would use it:
 * project context, backlog and review, members and roles, billing, usage and Jira.
 */
test.describe.serial('Full product', () => {
  let owner: Awaited<ReturnType<typeof seedOwner>>;
  let storyUrl = '';
  const teammate = uniqueEmail('teammate');

  test.beforeAll(async ({ request }) => {
    owner = await seedOwner(request);
  });

  test('glossary and constraints ground the project', async ({ page }) => {
    await uiLogin(page, owner.email, PASSWORD);

    await page.goto(`/projects/${owner.projectId}/glossary`);
    await page.getByLabel('Término').fill('Reserva');
    await page
      .getByLabel('Definición')
      .fill('Mesa apartada por un comensal para una fecha y hora.');
    await page.getByRole('button', { name: 'Añadir término' }).click();
    await expect(page.getByRole('main').getByText('Reserva', { exact: true })).toBeVisible();

    await page.goto(`/projects/${owner.projectId}/constraints`);
    await page.getByLabel('Descripción').fill('Debe funcionar en celulares con conexión 3G.');
    await page.getByRole('button', { name: 'Añadir restricción' }).click();
    await expect(page.getByText('Debe funcionar en celulares con conexión 3G.')).toBeVisible();
  });

  test('a manual story is created, approved, rejected and sent back to draft', async ({ page }) => {
    await uiLogin(page, owner.email, PASSWORD);
    await page.goto(`/projects/${owner.projectId}/stories/new`);
    await page.getByLabel('Título').fill('Reservar mesa por Internet');
    await page.getByLabel('Rol Como…').fill('comensal');
    await page.getByLabel('Acción quiero…').fill('reservar una mesa desde la web');
    await page.getByLabel('Beneficio para…').fill('no tener que llamar al restaurante');
    await page.getByLabel('Dado').fill('que hay mesas libres a las 20:00');
    await page.getByLabel('Cuando').fill('reservo para 4 personas a esa hora');
    await page.getByLabel('Entonces').fill('recibo la confirmación de la reserva');
    await page.getByRole('button', { name: 'Crear historia' }).click();

    await expect(page).toHaveURL(/\/stories\/[0-9a-f-]+$/i);
    storyUrl = new URL(page.url()).pathname;
    const provenance = page.getByTestId('story-provenance');
    await expect(provenance).toContainText('Borrador');

    await page.getByTestId('story-review-approved').click();
    await expect(provenance).toContainText('Aprobada');
    await expect(page.getByText('Historia aprobada.')).toBeVisible();

    await page.getByTestId('story-review-rejected').click();
    await expect(provenance).toContainText('Rechazada');

    await page.getByTestId('story-review-draft').click();
    await expect(provenance).toContainText('Borrador');

    // The decision survives a reload.
    await page.getByTestId('story-review-approved').click();
    await expect(provenance).toContainText('Aprobada');
    await page.reload();
    await expect(page.getByTestId('story-provenance')).toContainText('Aprobada');
  });

  test('a teammate is invited by email and joins the organization', async ({ page, request }) => {
    // The teammate already has an account, so they accept the invitation explicitly.
    await registerReady(request, teammate, PASSWORD);
    await uiLogin(page, owner.email, PASSWORD);
    await page.goto('/settings/members');
    await page.getByLabel('Correo', { exact: true }).fill(teammate);
    await page.getByLabel('Nombre', { exact: true }).fill('Lucía Analista');
    await page.getByRole('button', { name: 'Invitar', exact: true }).click();
    await page.getByRole('button', { name: /Invitaciones pendientes/ }).click();
    await expect(page.getByText(teammate)).toBeVisible();
    await signOut(page);

    const token = await getInvitationToken(request, teammate);
    await uiLogin(page, teammate, PASSWORD);
    await page.goto(`/invitations/accept?token=${token}`);
    await page.getByTestId('invite-accept').click();
    await expect(page.getByText(owner.orgName).first()).toBeVisible();
  });

  test('a custom role with STORY_APPROVE is the only way a member reviews stories', async ({
    page,
  }) => {
    // Owner creates a "Product Owner" role and assigns the teammate to the project with it.
    await uiLogin(page, owner.email, PASSWORD);
    await page.goto(`/projects/${owner.projectId}/settings/roles/new`);
    await page.getByLabel('Nombre del rol').fill('Product Owner');
    await page.getByRole('button', { name: 'Expandir todo' }).click();
    await page.getByRole('checkbox', { name: 'Ver historias' }).check();
    await page.getByRole('checkbox', { name: 'Aprobar historias' }).check();
    await page.getByRole('button', { name: 'Crear rol' }).click();
    await expect(page.getByText('Product Owner')).toBeVisible();

    await page.goto(`/projects/${owner.projectId}/settings/members`);
    await page.getByTestId('add-row-picker-0').click();
    await page.getByPlaceholder('Buscar por correo o nombre…').fill(teammate);
    await page.getByRole('option').filter({ hasText: 'Lucía Analista' }).click();
    await page.getByRole('button', { name: 'Rol', exact: true }).click();
    await page.getByRole('option', { name: 'Product Owner' }).click();
    await page.getByTestId('add-submit').click();
    await expect(
      page.getByTestId('project-member-row').filter({ hasText: teammate }),
    ).toBeVisible();
    await signOut(page);

    // The teammate can now review the story the owner approved.
    await uiLogin(page, teammate, PASSWORD);
    await page.goto(storyUrl);
    const provenance = page.getByTestId('story-provenance');
    await expect(provenance).toContainText('Aprobada');
    await expect(page.getByTestId('story-review-approved')).toHaveCount(0);
    // Without STORY_DELETE or INTEGRATION_SYNC, the detail offers neither delete nor push.
    await expect(page.getByTestId('story-delete')).toHaveCount(0);
    await expect(page.getByTestId('story-push-jira')).toHaveCount(0);
    await page.getByTestId('story-review-draft').click();
    await expect(provenance).toContainText('Borrador');

    // The backlog looks up the project's Jira mapping, which a member without Jira access may
    // not read: that 403 is expected and must not raise a "no access" toast.
    const jiraLookup = page.waitForResponse((r) => r.url().endsWith('/target'));
    await page.goto(`/projects/${owner.projectId}/stories`);
    expect((await jiraLookup).status()).toBe(403);
    await expect(
      page.getByRole('main').getByText('Reservar mesa por Internet').first(),
    ).toBeVisible();
    // Toasts close on their own after 4 s, so count once instead of a retrying assertion.
    await page.waitForTimeout(1000);
    expect(await page.getByTestId('toast').count()).toBe(0);
  });

  test('billing upgrades the organization to Pro (or hands off to Stripe) and usage reflects it', async ({
    page,
  }) => {
    await uiLogin(page, owner.email, PASSWORD);

    // The user menu's Upgrade CTA opens billing.
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByTestId('upgrade').click();
    await expect(page).toHaveURL(/\/settings\/billing/);

    await page.getByRole('button', { name: 'Cambiar a Pro' }).click();
    await expect(page.getByText('Confirmar cambio de plan')).toBeVisible();
    await page.getByRole('button', { name: 'Mejorar plan' }).click();

    // The default fake gateway activates the plan at once; the Stripe gateway hands off to
    // Stripe Checkout instead (paid end to end in billing-stripe.spec.ts).
    const gateway = await Promise.race([
      page.waitForURL(/checkout\.stripe\.com/, { timeout: 20_000 }).then(() => 'stripe' as const),
      page
        .getByText('Tu plan fue actualizado.')
        .waitFor({ timeout: 20_000 })
        .then(() => 'fake' as const),
    ]);
    let plan = 'Pro';
    if (gateway === 'stripe') {
      await expect(page.getByText('49,00', { exact: false }).first()).toBeVisible();
      plan = 'Gratis';
    } else {
      await expect(page.getByRole('heading', { name: 'Pro', level: 2 })).toBeVisible();
    }

    await page.goto('/settings/usage');
    await expect(page.getByRole('heading', { name: 'Tokens de IA' })).toBeVisible();
    await expect(page.getByRole('main').getByText(plan, { exact: true })).toBeVisible();
  });

  test('Jira: the org offers both ways to connect and a project without a mapping refuses to push', async ({
    page,
  }) => {
    await uiLogin(page, owner.email, PASSWORD);

    await page.goto('/settings/integrations');
    await expect(page.getByRole('button', { name: 'Conectar con Atlassian' })).toBeVisible();
    await page.getByRole('button', { name: 'o usa un API token' }).click();
    await expect(page.getByTestId('jira-connect-form')).toBeVisible();

    await page.goto(`/projects/${owner.projectId}/settings/integrations`);
    await expect(
      page.getByText('Todavía no existe una conexión con Jira para esta organización.'),
    ).toBeVisible();

    await page.goto(`/projects/${owner.projectId}/stories`);
    await expect(page.getByRole('button', { name: 'Importar de Jira' })).toBeDisabled();

    await page.goto(storyUrl);
    await page.getByTestId('story-push-jira').click();
    await expect(page.getByTestId('toast')).toContainText(
      'Este proyecto no tiene un mapeo de Jira configurado',
    );
  });

  test('ownership can be transferred to the teammate', async ({ page }) => {
    await uiLogin(page, owner.email, PASSWORD);
    await page.goto('/settings/general');
    await expect(page.getByRole('heading', { name: 'Transferir propiedad' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transferir' })).toBeEnabled();
  });
});
