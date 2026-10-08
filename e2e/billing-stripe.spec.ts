import { createHmac } from 'node:crypto';
import * as fs from 'node:fs';
import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { uniqueEmail } from './helpers/auth';
import {
  apiCreateOrganization,
  apiLogin,
  apiRefresh,
  apiSetActiveOrganization,
  registerReady,
} from './helpers/workspace';

/**
 * Real Stripe checkout in TEST mode against the local stack. Opt-in: point STRIPE_LOCAL_ENV at the
 * env file the local API was started with (BILLING_PAYMENT_PROVIDER=stripe, STRIPE_API_KEY=sk_test_…,
 * STRIPE_WEBHOOK_SECRET, the plan price ids). Stripe cannot reach localhost, so the test relays the
 * real checkout.session.completed event to the local webhook, signed like `stripe listen` does.
 */
const ENV_FILE = process.env['STRIPE_LOCAL_ENV'];
const PASSWORD = 'Passw0rd!23';
const TEST_CARD = '4242 4242 4242 4242';

function readEnv(file: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
  );
}

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/projects/);
}

/** The completed checkout of `orgId`, fetched from Stripe's event log. */
async function completedCheckoutEvent(
  request: APIRequestContext,
  apiKey: string,
  orgId: string,
): Promise<unknown> {
  const auth = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64');
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await request.get(
      'https://api.stripe.com/v1/events?type=checkout.session.completed&limit=20',
      { headers: { Authorization: auth } },
    );
    expect(res.ok(), 'list Stripe events').toBeTruthy();
    const { data } = (await res.json()) as {
      data: { data: { object: { client_reference_id?: string } } }[];
    };
    const event = data.find((e) => e.data.object.client_reference_id === orgId);
    if (event) return event;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No checkout.session.completed event for org ${orgId}`);
}

test.describe('Billing with Stripe (test mode)', () => {
  test.skip(!ENV_FILE, 'Set STRIPE_LOCAL_ENV to run the Stripe checkout against the local stack');

  test('an owner pays Pro through Stripe Checkout and the webhook activates the plan', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const env = readEnv(ENV_FILE!);
    expect(env['STRIPE_API_KEY'], 'a Stripe TEST key').toMatch(/^sk_test_/);

    const email = uniqueEmail('stripe');
    await registerReady(request, email, PASSWORD);
    const token = await apiLogin(request, email, PASSWORD);
    const orgId = await apiCreateOrganization(request, token, `Stripe ${Date.now()}`);
    await apiSetActiveOrganization(request, token, orgId);
    await apiRefresh(request);

    await uiLogin(page, email);
    await page.goto('/settings/billing');
    await page.getByRole('button', { name: 'Cambiar a Pro' }).click();
    await page.getByRole('button', { name: 'Mejorar plan' }).click();

    // Stripe's hosted checkout, paid with Stripe's published test card.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    await expect(page.getByText('49,00', { exact: false }).first()).toBeVisible();
    await page.locator('#email').fill(email);
    const cardTab = page.getByTestId('card-accordion-item-button');
    if (await cardTab.isVisible().catch(() => false)) await cardTab.click();
    await page.locator('#cardNumber').fill(TEST_CARD);
    await page.locator('#cardExpiry').fill('12 / 34');
    await page.locator('#cardCvc').fill('123');
    await page.locator('#billingName').fill('E2E Tester');
    const country = page.locator('#billingCountry');
    if (await country.isVisible().catch(() => false)) await country.selectOption('PE');
    await page.getByTestId('hosted-payment-submit-button').click();

    await page.waitForURL(/\/billing\/success/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Pago recibido' })).toBeVisible();

    // Relay the real event the way `stripe listen` would, signed with the local webhook secret.
    const payload = JSON.stringify(
      await completedCheckoutEvent(request, env['STRIPE_API_KEY'], orgId),
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', env['STRIPE_WEBHOOK_SECRET'])
      .update(`${timestamp}.${payload}`)
      .digest('hex');
    const webhook = await request.post('/api/billing/webhooks/stripe', {
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': `t=${timestamp},v1=${signature}`,
      },
      data: payload,
    });
    expect(webhook.status(), 'webhook accepted').toBe(200);

    await page.goto('/settings/billing');
    await expect(page.getByRole('heading', { name: 'Pro', level: 2 })).toBeVisible();
    await expect(page.getByText(/Se renueva el/)).toBeVisible();

    // Cancelling also cancels the Stripe subscription; access stays until the period ends.
    await page.getByRole('button', { name: 'Cancelar plan' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar plan' }).click();
    await expect(page.getByText('Tu suscripción fue cancelada.')).toBeVisible();
  });
});
