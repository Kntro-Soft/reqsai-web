// Captures the session chat showing the 4 AI suggestion cards, dark + light.
// Requires :8081 (suggestion branch) seeded with pending suggestions on the
// "Kickoff con stakeholders" session of Acme Studio · Plataforma de Pagos.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const EMAIL = process.env.SARA ?? 'sara.mqnamw4p@reqsai.test';
const PASS = 'Passw0rd!23';
const OUT = 'shots/suggestions';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function capture(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/auth/sign-in`);
  await page.getByLabel('Correo electrónico').fill(EMAIL);
  await page.getByLabel('Contraseña').fill(PASS);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/projects/);

  await page.getByTestId('org-switcher').click();
  await page.getByTestId('org-option').filter({ hasText: 'Acme Studio' }).click();
  await page.waitForURL(/\/projects/);
  await page.waitForTimeout(500);

  await page.getByTestId('project-row').filter({ hasText: 'Plataforma de Pagos' }).click();
  await page.waitForURL(/\/sessions/);
  await page.getByTestId('session-row').filter({ hasText: 'Kickoff' }).click();
  await page.waitForURL(/\/sessions\/.+/);
  await page.getByTestId('suggestion-card').first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/chat-${theme}.png`, fullPage: true });
  console.log(theme, 'chat', await page.getByTestId('suggestion-card').count(), 'cards');

  // Open the inline editor on the first (NEW_STORY) card for an "editing" shot.
  const first = page.getByTestId('suggestion-card').first();
  await first.getByRole('button', { name: 'Editar' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/chat-editing-${theme}.png`, fullPage: true });
  console.log(theme, 'editing');

  await ctx.close();
}

await capture('dark');
await capture('light');

// side-by-side sheet
const rows = ['chat', 'chat-editing']
  .map((p) => {
    const dark = readFileSync(`${OUT}/${p}-dark.png`).toString('base64');
    const light = readFileSync(`${OUT}/${p}-light.png`).toString('base64');
    return `<section><h2>${p}</h2><div class="pair">
      <figure><figcaption>dark</figcaption><img src="data:image/png;base64,${dark}"/></figure>
      <figure><figcaption>light</figcaption><img src="data:image/png;base64,${light}"/></figure>
    </div></section>`;
  })
  .join('');
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
  </style></head><body><h1>Reqs-AI · Sugerencias de IA en el chat (dark | light)</h1>${rows}</body></html>`,
  { waitUntil: 'load' },
);
await sp.waitForTimeout(300);
await sp.screenshot({ path: `${OUT}/contact.png`, fullPage: true });
await sheet.close();
await browser.close();
console.log('done');
