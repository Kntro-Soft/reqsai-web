// Validates the shell UX (user menu, nav) in BOTH themes across viewports.
// Usage: node scripts/ux-check.mjs   (dev server + backend up; demo account seeded)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@reqsai.test';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo1234!';
const OUT = 'shots/ux';
mkdirSync(OUT, { recursive: true });

const THEMES = ['dark', 'light'];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch();

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'es-PE',
    });
    await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
    const page = await ctx.newPage();
    const tag = `${theme}-${vp.name}`;
    const shot = async (name, full = true) => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: full });
      console.log(tag, name);
    };

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
      await page.getByLabel('Nombre de la organización').fill(`Demo ${Date.now()}`);
      await page.getByRole('button', { name: 'Crear y continuar' }).click();
      await page.waitForURL(/\/projects/);
    }

    await shot('01-projects');
    // Open the user menu to verify sign-out lives under the avatar.
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await shot('02-usermenu', false);
    await page.keyboard.press('Escape');
    await ctx.close();
  }
}

await browser.close();
console.log('done');
