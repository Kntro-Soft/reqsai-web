// Captures every page in BOTH dark and light, then builds a per-page
// side-by-side (dark | light) sheet. Uses the existing seeded Sara account.
// Usage: SARA=email node scripts/theme-shots.mjs   (dev server + backend up)
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const EMAIL = process.env.SARA ?? 'sara.mqnamw4p@reqsai.test';
const PASS = 'Passw0rd!23';
const OUT = 'shots/themes';
mkdirSync(OUT, { recursive: true });

const PAGES = [
  '01-login',
  '02-org-proyectos',
  '03-org-switcher',
  '04-org-miembros',
  '05-org-ajustes',
  '06-proyecto-sesiones',
  '07-sesion-chat',
  '08-proyecto-historias',
  '09-proyecto-miembros',
  '10-proyecto-ajustes',
];

const browser = await chromium.launch();

async function capture(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
  const page = await ctx.newPage();
  const shot = async (name) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/${name}-${theme}.png`, fullPage: true });
    console.log(theme, name);
  };

  await page.goto(`${BASE}/auth/sign-in`);
  await page.waitForLoadState('networkidle');
  await shot('01-login');

  await page.getByLabel('Correo electrónico').fill(EMAIL);
  await page.getByLabel('Contraseña').fill(PASS);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/projects/);
  // tour Acme Studio
  await page.getByTestId('org-switcher').click();
  await page.getByTestId('org-option').filter({ hasText: 'Acme Studio' }).click();
  await page.waitForURL(/\/projects/);
  await page.waitForTimeout(700);
  await shot('02-org-proyectos');
  await page.getByTestId('org-switcher').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/03-org-switcher-${theme}.png` });
  console.log(theme, '03-org-switcher');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Miembros' }).first().click();
  await page.waitForURL(/\/members/);
  await shot('04-org-miembros');
  await page.getByRole('link', { name: 'Ajustes' }).first().click();
  await page.waitForURL(/\/settings/);
  await shot('05-org-ajustes');

  await page.getByRole('link', { name: 'Proyectos' }).first().click();
  await page.waitForURL(/\/projects/);
  await page.getByTestId('project-row').filter({ hasText: 'Plataforma de Pagos' }).click();
  await page.waitForURL(/\/sessions/);
  await shot('06-proyecto-sesiones');
  await page.getByTestId('session-row').filter({ hasText: 'Kickoff' }).click();
  await page.waitForURL(/\/sessions\/.+/);
  await shot('07-sesion-chat');
  await page.getByRole('link', { name: 'Historias' }).first().click();
  await page.waitForURL(/\/stories/);
  await shot('08-proyecto-historias');
  await page.getByRole('link', { name: 'Miembros' }).first().click();
  await page.waitForURL(/\/members/);
  await shot('09-proyecto-miembros');
  await page.getByRole('link', { name: 'Ajustes' }).first().click();
  await page.waitForURL(/\/settings/);
  await shot('10-proyecto-ajustes');
  await ctx.close();
}

await capture('dark');
await capture('light');

// Per-page side-by-side sheet
const sections = PAGES.map((p) => {
  const dark = readFileSync(`${OUT}/${p}-dark.png`).toString('base64');
  const light = readFileSync(`${OUT}/${p}-light.png`).toString('base64');
  return `<section><h2>${p}</h2><div class="pair">
    <figure><figcaption>dark</figcaption><img src="data:image/png;base64,${dark}"/></figure>
    <figure><figcaption>light</figcaption><img src="data:image/png;base64,${light}"/></figure>
  </div></section>`;
}).join('');
const sheet = await browser.newContext({ viewport: { width: 1320, height: 1000 } });
const sp = await sheet.newPage();
await sp.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><style>
   *{box-sizing:border-box;margin:0;padding:0}
   body{background:#0b1220;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;padding:24px}
   h1{font-size:20px;margin-bottom:18px}
   section{margin-bottom:22px}
   section h2{font-size:13px;color:#93c5fd;margin-bottom:8px;font-weight:600}
   .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
   figure{margin:0;border:1px solid rgba(255,255,255,.12);border-radius:10px;overflow:hidden}
   figcaption{font-size:11px;font-weight:600;color:#94a3b8;padding:5px 10px;border-bottom:1px solid rgba(255,255,255,.12)}
   img{display:block;width:100%;height:auto}
  </style></head><body><h1>Reqs-AI · Cada página en dark y light</h1>${sections}</body></html>`,
  { waitUntil: 'load' },
);
await sp.waitForTimeout(300);
await sp.screenshot({ path: `${OUT}/contact-dark-light.png`, fullPage: true });
await sheet.close();
await browser.close();
console.log('done');
