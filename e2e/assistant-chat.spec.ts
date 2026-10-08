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

/**
 * The assistant chat on the capture page, with no live session, against the real AI configured in the
 * local API: a question is answered from the backlog, and a requirement comes back as a suggestion that
 * the analyst accepts into the backlog from the chat itself.
 */
async function seed(request: APIRequestContext) {
  const email = uniqueEmail('chat');
  await registerReady(request, email, PASSWORD);
  const token = await apiLogin(request, email, PASSWORD);
  const orgId = await apiCreateOrganization(request, token, `Chat ${Date.now()}`);
  await apiSetActiveOrganization(request, token, orgId);
  const active = await apiRefresh(request);
  const projectId = await apiCreateProject(request, active, orgId, 'Restaurante La Tradición');
  const story = await request.post(`/api/projects/${projectId}/stories`, {
    headers: { ...V1, Authorization: `Bearer ${active}` },
    data: {
      title: 'Reservar mesa por Internet',
      role: 'comensal',
      action: 'reservar una mesa desde la web eligiendo fecha, hora y personas',
      benefit: 'no tener que llamar al restaurante',
      priority: 'HIGH',
      storyPoints: 3,
    },
  });
  expect(story.status(), 'seed story').toBe(201);
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
  await expect(answers).toHaveCount(before + 1, { timeout: 60_000 });
}

test.describe('Assistant chat', () => {
  test('answers a question and turns a requirement into a suggestion accepted from the chat', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const { email, projectId } = await seed(request);
    await uiLogin(page, email);
    await page.goto(`/projects/${projectId}/sessions`);

    // A question is answered from the project's backlog, with no suggestion.
    await ask(page, '¿Cuántas historias hay en el backlog y cómo se llaman?');
    const firstAnswer = page.getByTestId('chat-answer').last();
    await expect(firstAnswer.getByTestId('chat-answer-text')).toContainText(/Reservar mesa/i);
    await expect(firstAnswer.getByTestId('chat-suggestion')).toHaveCount(0);

    // A requirement comes back as a suggestion card in the chat.
    await ask(
      page,
      'Quiero que el comensal pueda cancelar su reserva desde la web hasta 2 horas antes de la hora reservada',
    );
    const card = page.getByTestId('chat-answer').last().getByTestId('chat-suggestion').first();
    await expect(card).toBeVisible();
    await card.getByTestId('suggestion-accept').click();

    const decision = page.getByTestId('chat-answer').last().getByTestId('chat-decision').first();
    await expect(decision).toHaveAttribute('data-outcome', 'ACCEPTED');

    // The chat survives a reload, decision included.
    await page.reload();
    await expect(page.getByTestId('chat-question')).toHaveCount(2);
    await expect(page.getByTestId('chat-decision').first()).toHaveAttribute(
      'data-outcome',
      'ACCEPTED',
    );
  });
});
