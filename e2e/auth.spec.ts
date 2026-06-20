import { expect, test } from '@playwright/test';
import { getVerificationToken } from './helpers/mailpit';

const PASSWORD = 'Passw0rd!23';

function uniqueEmail(): string {
  // Date.now() + random keeps parallel workers from colliding.
  return `e2e.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

test.describe('IAM authentication flow', () => {
  test('redirects an anonymous visitor to sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('register → verify email → sign in', async ({ page, request }) => {
    const email = uniqueEmail();

    // 1. Register a new account.
    await page.goto('/auth/sign-up');
    await page.getByLabel('Nombre').fill('E2E');
    await page.getByLabel('Apellido').fill('Tester');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    // Lands on the "check your inbox" screen.
    await expect(page).toHaveURL(/\/auth\/verify-email/);

    // 2. Pull the verification token from the email and open the link.
    const token = await getVerificationToken(request, email);
    await page.goto(`/auth/verify-email?token=${token}`);
    await expect(page.getByTestId('verify-success')).toBeVisible();

    // 3. Sign in with the now-active account.
    await page.goto('/auth/sign-in');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByRole('heading', { name: /Hola, E2E/ })).toBeVisible();
  });

  test('rejects sign-in with wrong credentials', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await page.getByLabel('Correo electrónico').fill('nobody@example.com');
    await page.getByLabel('Contraseña').fill('wrong-password');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByTestId('form-error')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });
});
