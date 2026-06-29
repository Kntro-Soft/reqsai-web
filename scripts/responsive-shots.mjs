// Comprehensive responsive capture of every onboarding step across viewports.
// Usage: node scripts/responsive-shots.mjs   (dev server + backend must be up)
import { chromium, request as pwRequest } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const MP = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const PASSWORD = 'Passw0rd!23';
const OUT = 'shots/responsive';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop-xl', width: 2560, height: 1440 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

const api = await pwRequest.newContext({ baseURL: BASE });

async function registerVerified() {
  const email = `cap.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
  await api.post('/api/auth/register', {
    headers: { 'Api-Version': '1' },
    data: { email, password: PASSWORD, firstName: 'Cap', lastName: 'User' },
  });
  let token = null;
  for (let i = 0; i < 20 && !token; i++) {
    const data = await (await api.get(`${MP}/api/v1/messages?limit=50`)).json();
    const hit = data.messages.find(
      (m) =>
        m.Subject.includes('Verifica') && m.To.some((t) => t.Address.toLowerCase() === email),
    );
    if (hit) {
      const msg = await (await api.get(`${MP}/api/v1/message/${hit.ID}`)).json();
      const mt = `${msg.Text ?? ''} ${msg.HTML ?? ''}`.match(/verify-email\?token=([A-Za-z0-9._~-]+)/);
      if (mt) token = mt[1];
    }
    if (!token) await new Promise((r) => setTimeout(r, 500));
  }
  await api.post('/api/auth/verify-email', { headers: { 'Api-Version': '1' }, data: { token } });
  return email;
}

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const shot = async (name) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/${vp.name}-${name}.png`, fullPage: true });
    console.log(vp.name, name);
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
  await page.getByLabel('Nombre de la organización').fill(`Cap Org ${Date.now()}`);
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
}

await browser.close();
await api.dispose();
console.log('done');
