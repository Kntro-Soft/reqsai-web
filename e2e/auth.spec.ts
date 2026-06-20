import { expect, Page, test } from '@playwright/test';
import { getResetToken, getVerificationToken } from './helpers/mailpit';
import { registerAccount, registerVerified, uniqueEmail } from './helpers/auth';

const PASSWORD = 'Passw0rd!23';

async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('IAM authentication', () => {
  test('redirects an anonymous visitor to sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('register → verify email → sign in (full UI flow)', async ({ page, request }) => {
    const email = uniqueEmail();

    await page.goto('/auth/sign-up');
    await page.getByLabel('Nombre').fill('E2E');
    await page.getByLabel('Apellido').fill('Tester');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/auth\/verify-email/);

    const token = await getVerificationToken(request, email);
    await page.goto(`/auth/verify-email?token=${token}`);
    await expect(page.getByTestId('verify-success')).toBeVisible();

    await uiLogin(page, email, PASSWORD);
    // A new account has no organization yet → onboarding.
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole('heading', { name: 'Crea tu organización' })).toBeVisible();
  });

  test('rejects sign-in with wrong credentials', async ({ page }) => {
    await uiLogin(page, 'nobody@example.com', 'wrong-password');
    await expect(page.getByTestId('form-error')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test('blocks duplicate registration', async ({ page, request }) => {
    const email = uniqueEmail();
    await registerAccount(request, email, PASSWORD);

    await page.goto('/auth/sign-up');
    await page.getByLabel('Nombre').fill('E2E');
    await page.getByLabel('Apellido').fill('Tester');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByTestId('form-error')).toContainText('Ya existe');
    await expect(page).toHaveURL(/\/auth\/sign-up/);
  });

  test('refuses sign-in before email verification', async ({ page, request }) => {
    const email = uniqueEmail();
    await registerAccount(request, email, PASSWORD);

    await uiLogin(page, email, PASSWORD);
    await expect(page.getByTestId('form-error')).toContainText('Verifica');
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test('resends the verification email', async ({ page, request }) => {
    const email = uniqueEmail();
    await registerAccount(request, email, PASSWORD);

    await page.goto(`/auth/verify-email?email=${encodeURIComponent(email)}`);
    await page.getByRole('button', { name: 'Reenviar correo' }).click();
    await expect(page.getByTestId('resend-ok')).toBeVisible();
  });

  test('signs out and returns to sign-in', async ({ page, request }) => {
    const email = uniqueEmail();
    await registerVerified(request, email, PASSWORD);

    await uiLogin(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test('keeps the session across a reload (silent refresh)', async ({ page, request }) => {
    const email = uniqueEmail();
    await registerVerified(request, email, PASSWORD);

    await uiLogin(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/onboarding/);

    await page.reload();
    // Silent refresh keeps the session; still authenticated on reload.
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole('heading', { name: 'Crea tu organización' })).toBeVisible();
  });

  test('forgot password → reset → sign in with the new password', async ({ page, request }) => {
    const email = uniqueEmail();
    await registerVerified(request, email, PASSWORD);

    // Request the reset link.
    await page.goto('/auth/forgot-password');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByTestId('forgot-sent')).toBeVisible();

    // Open the reset link and set a new password.
    const token = await getResetToken(request, email);
    const newPassword = 'NewPassw0rd!9';
    await page.goto(`/auth/reset-password?token=${token}`);
    await page.getByLabel('Contraseña', { exact: true }).fill(newPassword);
    await page.getByLabel('Repite la contraseña').fill(newPassword);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByTestId('reset-success')).toBeVisible();

    // The new password works.
    await uiLogin(page, email, newPassword);
    await expect(page).toHaveURL(/\/onboarding/);
  });
});
