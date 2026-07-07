// Captures every end-to-end flow step in BOTH themes (dark/light) at desktop and
// mobile, then builds one contact sheet per theme+viewport for quick review.
// Usage: node scripts/flow-shots.mjs   (dev server + backend up)
import { chromium, request as pwRequest } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const MP = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const PASSWORD = 'Passw0rd!23';
const OUT = 'shots/flows';
mkdirSync(OUT, { recursive: true });

const THEMES = ['dark', 'light'];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, cols: 2 },
  { name: 'mobile', width: 390, height: 844, cols: 3 },
];
const STEPS = [
  ['01-signin', 'Iniciar sesión'],
  ['02-signup', 'Crear cuenta'],
  ['03-forgot', 'Recuperar contraseña'],
  ['04-terms', 'Términos y Condiciones'],
  ['05-onboarding', 'Crear organización'],
  ['06-projects-empty', 'Proyectos (vacío)'],
  ['07-projects', 'Proyectos'],
  ['08-sessions', 'Sesiones'],
  ['09-live', 'Sesión en vivo'],
];

const api = await pwRequest.newContext({ baseURL: BASE });

async function registerVerified() {
  const email = `flow.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
  await api.post('/api/auth/register', {
    headers: { 'Api-Version': '1' },
    data: { email, password: PASSWORD, firstName: 'Flow', lastName: 'User' },
  });
  let token = null;
  for (let i = 0; i < 20 && !token; i++) {
    const data = await (await api.get(`${MP}/api/v1/messages?limit=50`)).json();
    const hit = data.messages.find(
      (m) => m.Subject.includes('Verifica') && m.To.some((t) => t.Address.toLowerCase() === email),
    );
    if (hit) {
      const msg = await (await api.get(`${MP}/api/v1/message/${hit.ID}`)).json();
      const mt = `${msg.Text ?? ''} ${msg.HTML ?? ''}`.match(
        /verify-email\?token=([A-Za-z0-9._~-]+)/,
      );
      if (mt) token = mt[1];
    }
    if (!token) await new Promise((r) => setTimeout(r, 500));
  }
  await api.post('/api/auth/verify-email', { headers: { 'Api-Version': '1' }, data: { token } });
  return email;
}

const browser = await chromium.launch();

function contactSheet(theme, vp) {
  const bg = theme === 'dark' ? '#050d1a' : '#f8fafc';
  const fg = theme === 'dark' ? '#e2e8f0' : '#0f172a';
  const muted = theme === 'dark' ? '#94a3b8' : '#64748b';
  const cardBorder = theme === 'dark' ? 'rgba(255,255,255,.12)' : 'rgba(2,6,23,.10)';
  const cells = STEPS.map(([file, label]) => {
    const b64 = readFileSync(`${OUT}/${theme}-${vp.name}-${file}.png`).toString('base64');
    return `<figure>
      <figcaption>${label}</figcaption>
      <img src="data:image/png;base64,${b64}" />
    </figure>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:${bg};color:${fg};font-family:Inter,system-ui,sans-serif;padding:28px}
    h1{font-size:20px;margin-bottom:4px}
    p.sub{color:${muted};font-size:13px;margin-bottom:20px}
    .grid{column-count:${vp.cols};column-gap:16px}
    figure{break-inside:avoid;margin:0 0 16px;border:1px solid ${cardBorder};border-radius:12px;overflow:hidden;background:${bg}}
    figcaption{font-size:12px;font-weight:600;color:${muted};padding:8px 12px;border-bottom:1px solid ${cardBorder}}
    img{display:block;width:100%;height:auto}
  </style></head><body>
    <h1>Reqs-AI · Flujos end-to-end — ${theme.toUpperCase()} · ${vp.name}</h1>
    <p class="sub">Registro → verificación → términos → organización → proyectos → sesiones → en vivo</p>
    <div class="grid">${cells}</div>
  </body></html>`;
}

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'es-PE',
    });
    await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
    const page = await ctx.newPage();
    const tag = `${theme}-${vp.name}`;
    const shot = async (name) => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true });
    };

    await page.goto(`${BASE}/auth/sign-in`);
    await page.waitForLoadState('networkidle');
    await shot('01-signin');
    await page.goto(`${BASE}/auth/sign-up`);
    await shot('02-signup');
    await page.goto(`${BASE}/auth/forgot-password`);
    await shot('03-forgot');

    const email = await registerVerified();
    await page.goto(`${BASE}/auth/sign-in`);
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/terms/);
    await shot('04-terms');
    await page.getByTestId('accept-checkbox').check();
    await page.getByTestId('accept-terms').click();
    await page.waitForURL(/\/onboarding/);
    await shot('05-onboarding');
    await page.getByLabel('Nombre de la organización').fill(`Flow Org ${Date.now()}`);
    await page.getByRole('button', { name: 'Crear y continuar' }).click();
    await page.waitForURL(/\/projects/);
    await shot('06-projects-empty');
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
    await shot('07-projects');
    await page.getByTestId('project-row').first().click();
    await page.waitForURL(/\/sessions$/);
    await shot('08-sessions');
    await page.getByRole('button', { name: 'Nueva sesión' }).click();
    await page.getByLabel('Título').fill('Sesión Demo');
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await page.waitForURL(/\/sessions\/[0-9a-f-]+/i);
    await shot('09-live');
    await ctx.close();

    // Build the contact sheet for this theme + viewport.
    const sheet = await browser.newContext({
      viewport: { width: vp.cols * 560 + 80, height: 1000 },
    });
    const sheetPage = await sheet.newPage();
    await sheetPage.setContent(contactSheet(theme, vp), { waitUntil: 'load' });
    await sheetPage.waitForTimeout(300);
    await sheetPage.screenshot({ path: `${OUT}/contact-${tag}.png`, fullPage: true });
    await sheet.close();
    console.log('contact sheet:', `contact-${tag}.png`);
  }
}

await browser.close();
await api.dispose();
console.log('done');
