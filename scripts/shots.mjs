// Visual capture of the running app across viewports for design review.
// Usage: node scripts/shots.mjs   (dev server + backend must be up)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const EMAIL = 'demo@reqsai.test';
const PASSWORD = 'Demo1234!';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function cap(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('saved', name);
}

async function ctxAt(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'es-PE' });
  return { ctx, page: await ctx.newPage() };
}

async function login(page) {
  await page.goto(`${BASE}/auth/sign-in`);
  await page.getByLabel('Correo electrónico').fill(EMAIL);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/(terms|projects|onboarding)/);
  if (page.url().includes('/terms')) {
    await page.getByTestId('accept-checkbox').check();
    await page.getByTestId('accept-terms').click();
    await page.waitForURL(/\/(projects|onboarding)/);
  }
  if (page.url().includes('/onboarding')) {
    await page.getByLabel('Nombre de la organización').fill(`Demo Org ${Date.now()}`);
    await page.getByRole('button', { name: 'Crear y continuar' }).click();
    await page.waitForURL(/\/projects/);
  }
}

async function ensureProject(page) {
  if ((await page.getByTestId('projects-empty').count()) > 0) {
    await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
    await page.getByLabel('Nombre', { exact: true }).fill('Proyecto Demo');
    await page.getByLabel('Lenguajes (coma)').fill('TypeScript');
    await page.getByLabel('Frameworks (coma)').fill('Angular');
    await page.getByLabel('Plataformas (coma)').fill('Web');
    await page.getByLabel('Bases de datos (coma)').fill('PostgreSQL');
    await page.getByLabel('Arquitectura').fill('Hexagonal');
    await page.getByLabel('Dominio').fill('Fintech');
    await page.getByRole('button', { name: 'Crear proyecto' }).click();
    await page.getByTestId('project-row').first().waitFor();
  }
}

// ---- Wide desktop 1920 ----
{
  const { ctx, page } = await ctxAt(1920, 1080);
  await page.goto(`${BASE}/auth/sign-in`);
  await page.waitForLoadState('networkidle');
  await cap(page, 'w-01-signin');
  await page.goto(`${BASE}/auth/sign-up`);
  await cap(page, 'w-02-signup');
  await page.goto(`${BASE}/auth/forgot-password`);
  await cap(page, 'w-03-forgot');
  await login(page);
  await cap(page, 'w-04-projects-empty-or-list');
  await ensureProject(page);
  await cap(page, 'w-05-projects-filled');
  await page.getByTestId('project-row').first().click();
  await page.waitForURL(/\/sessions$/);
  await cap(page, 'w-06-sessions');
  await page.getByRole('button', { name: 'Nueva sesión' }).click();
  await page.getByLabel('Título').fill('Sesión Demo');
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await page.waitForURL(/\/sessions\/[0-9a-f-]+/i);
  await page
    .getByTestId('live-indicator')
    .filter({ hasText: 'En vivo' })
    .waitFor({ timeout: 8000 })
    .catch(() => {});
  await page
    .getByRole('button', { name: 'Iniciar grabación' })
    .click()
    .catch(() => {});
  await page.waitForTimeout(1500);
  await cap(page, 'w-07-live-session');
  await ctx.close();
}

// ---- Ultrawide 2560 (reproduce stretching) ----
{
  const { ctx, page } = await ctxAt(2560, 1440);
  await page.goto(`${BASE}/auth/sign-in`);
  await page.waitForLoadState('networkidle');
  await cap(page, 'uw-01-signin');
  await login(page);
  await cap(page, 'uw-02-projects');
  await ctx.close();
}

// ---- Mobile 390 ----
{
  const { ctx, page } = await ctxAt(390, 844);
  await page.goto(`${BASE}/auth/sign-in`);
  await page.waitForLoadState('networkidle');
  await cap(page, 'm-01-signin');
  await login(page);
  await cap(page, 'm-02-projects');
  await ctx.close();
}

await browser.close();
console.log('done');
