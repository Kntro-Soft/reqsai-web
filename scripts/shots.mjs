// Quick visual capture of the running app (http://localhost:4200) for review.
// Usage: node scripts/shots.mjs   (dev server + backend must be up)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const EMAIL = 'demo@reqsai.test';
const PASSWORD = 'Demo1234!';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

async function shot(name) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('saved', name);
}

await page.goto(`${BASE}/auth/sign-in`);
await page.waitForLoadState('networkidle');
await shot('01-signin');

await page.goto(`${BASE}/auth/sign-up`);
await shot('02-signup');

// Log in with the demo account.
await page.goto(`${BASE}/auth/sign-in`);
await page.getByLabel('Correo electrónico').fill(EMAIL);
await page.getByLabel('Contraseña').fill(PASSWORD);
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL(/\/(onboarding|home|projects)/);
await shot('03-after-login');

// If onboarding, create an organization to reach projects.
if (page.url().includes('/onboarding')) {
  await page.getByLabel('Nombre de la organización').fill(`Demo Org ${Date.now()}`);
  await page.getByRole('button', { name: 'Crear y continuar' }).click();
  await page.waitForURL(/\/projects/);
}
await shot('04-projects');

// Mobile viewport of sign-in for responsiveness check.
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${BASE}/auth/sign-in`);
await mobile.waitForLoadState('networkidle');
await mobile.waitForTimeout(600);
await mobile.screenshot({ path: `${OUT}/05-signin-mobile.png`, fullPage: true });
console.log('saved 05-signin-mobile');

await browser.close();
console.log('done');
