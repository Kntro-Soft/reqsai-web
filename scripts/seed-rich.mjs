// Seeds a rich demo (users, multiple orgs, active members, projects, manual
// user stories, sessions) then captures every flow into one dark contact sheet.
// Usage: node scripts/seed-rich.mjs   (dev server + backend up)
import { chromium, request as pwRequest } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const MP = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const PASSWORD = 'Passw0rd!23';
const V1 = { 'Api-Version': '1' };
const OUT = 'shots/rich';
mkdirSync(OUT, { recursive: true });

const api = await pwRequest.newContext({ baseURL: BASE });
const auth = (t) => ({ headers: { ...V1, Authorization: `Bearer ${t}` } });
const uniq = Date.now().toString(36);
const slug = (name, i) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${uniq}${i}`;

async function user(prefix, first, last) {
  const email = `${prefix}.${uniq}@reqsai.test`;
  await api.post('/api/auth/register', {
    headers: V1,
    data: { email, password: PASSWORD, firstName: first, lastName: last },
  });
  let token = null;
  for (let i = 0; i < 20 && !token; i++) {
    const data = await (await api.get(`${MP}/api/v1/messages?limit=80`)).json();
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
  await api.post('/api/auth/verify-email', { headers: V1, data: { token } });
  const res = await (
    await api.post('/api/auth/login', { headers: V1, data: { email, password: PASSWORD } })
  ).json();
  await api.post('/api/users/me/terms', {
    ...auth(res.accessToken),
    data: { termsVersion: '2026-01' },
  });
  return { email, token: res.accessToken, id: res.user.id };
}
async function createOrg(token, name, i) {
  return (
    await (
      await api.post('/api/organizations', { ...auth(token), data: { name, slug: slug(name, i) } })
    ).json()
  ).id;
}
async function activate(u, orgId) {
  // Re-login (not the shared rt cookie) so the new token is for the right user.
  await api.patch('/api/users/me/preferences', {
    ...auth(u.token),
    data: { lastVisitedOrgId: orgId },
  });
  const res = await (
    await api.post('/api/auth/login', { headers: V1, data: { email: u.email, password: PASSWORD } })
  ).json();
  return res.accessToken;
}
async function createProject(token, orgId, spec) {
  return (
    await (
      await api.post(`/api/organizations/${orgId}/projects`, { ...auth(token), data: spec })
    ).json()
  ).id;
}
async function createStory(token, projectId, s) {
  await api.post(`/api/projects/${projectId}/stories`, { ...auth(token), data: s });
}
async function createSession(token, projectId, title, steps) {
  const id = (
    await (
      await api.post(`/api/projects/${projectId}/sessions`, {
        ...auth(token),
        data: { title, language: 'es-PE' },
      })
    ).json()
  ).id;
  for (const step of steps)
    await api.post(`/api/projects/${projectId}/sessions/${id}/${step}`, auth(token));
}
async function invite(token, orgId, u, role) {
  await api.post(`/api/organizations/${orgId}/members`, {
    ...auth(token),
    data: { userId: u.id, email: u.email, displayName: `${u.first} ${u.last}`, role },
  });
}

const PROJECTS = [
  {
    name: 'Plataforma de Pagos',
    programmingLanguages: ['Java'],
    frameworks: ['Spring Boot'],
    clientPlatforms: ['Web'],
    databases: ['PostgreSQL'],
    architecture: 'Hexagonal',
    domain: 'Fintech',
  },
  {
    name: 'App Móvil Banca',
    programmingLanguages: ['Kotlin'],
    frameworks: ['Android'],
    clientPlatforms: ['Mobile'],
    databases: ['SQLite'],
    architecture: 'MVVM',
    domain: 'Fintech',
  },
  {
    name: 'Portal de Clientes',
    programmingLanguages: ['TypeScript'],
    frameworks: ['Angular'],
    clientPlatforms: ['Web'],
    databases: ['PostgreSQL'],
    architecture: 'Hexagonal',
    domain: 'SaaS',
  },
  {
    name: 'Motor de Riesgos',
    programmingLanguages: ['Python'],
    frameworks: ['FastAPI'],
    clientPlatforms: ['API'],
    databases: ['Redis'],
    architecture: 'Event-Driven',
    domain: 'Riesgos',
  },
  {
    name: 'Data Pipeline',
    programmingLanguages: ['Scala'],
    frameworks: ['Spark'],
    clientPlatforms: ['Batch'],
    databases: ['Kafka'],
    architecture: 'Streaming',
    domain: 'Datos',
  },
];
const STORIES = [
  {
    title: 'Gestionar tarjetas guardadas',
    role: 'cliente',
    action: 'guardar varias tarjetas y reutilizar la última',
    benefit: 'pagar más rápido',
    priority: 'HIGH',
    storyPoints: 3,
  },
  {
    title: 'Notificaciones de pago',
    role: 'cliente',
    action: 'recibir un aviso cuando se procese un pago',
    benefit: 'estar al tanto en tiempo real',
    priority: 'MEDIUM',
    storyPoints: 2,
  },
  {
    title: 'Reembolsos parciales',
    role: 'operador',
    action: 'emitir reembolsos parciales',
    benefit: 'corregir cobros erróneos',
    priority: 'HIGH',
    storyPoints: 5,
  },
  {
    title: 'Panel de conciliación',
    role: 'contador',
    action: 'ver una conciliación diaria',
    benefit: 'cuadrar las cuentas',
    priority: 'MEDIUM',
    storyPoints: 8,
  },
  {
    title: 'Pago en cuotas',
    role: 'cliente',
    action: 'pagar en cuotas',
    benefit: 'distribuir el gasto',
    priority: 'LOW',
    storyPoints: 5,
  },
  {
    title: 'Detección de fraude',
    role: 'sistema',
    action: 'marcar transacciones sospechosas',
    benefit: 'reducir el fraude',
    priority: 'HIGH',
    storyPoints: 13,
  },
];
const SESSIONS = [
  ['Kickoff con stakeholders', ['start', 'stop']],
  ['Refinamiento de backlog', ['start', 'pause']],
  ['Entrevista usuario piloto', ['start']],
  ['Descubrimiento inicial', []],
];

console.log('Seeding users…');
const sara = await user('sara', 'Sara', 'Núñez');
const marco = { ...(await user('marco', 'Marco', 'Díaz')), first: 'Marco', last: 'Díaz' };
const lucia = { ...(await user('lucia', 'Lucía', 'Rojas')), first: 'Lucía', last: 'Rojas' };
const diego = { ...(await user('diego', 'Diego', 'Soto')), first: 'Diego', last: 'Soto' };

console.log('Seeding orgs + data…');
let t = sara.token;
const acme = await createOrg(t, 'Acme Studio', 0);
const globex = await createOrg(t, 'Globex Corp', 1);
await createOrg(t, 'Initech Labs', 2);

t = await activate(sara, acme);
await invite(t, acme, marco, 'ADMIN');
await invite(t, acme, lucia, 'MEMBER');
await invite(t, acme, diego, 'MEMBER');
const acmeProjects = [];
for (const spec of PROJECTS) acmeProjects.push(await createProject(t, acme, spec));
for (const s of STORIES) await createStory(t, acmeProjects[0], s);
for (const [title, steps] of SESSIONS) await createSession(t, acmeProjects[0], title, steps);

t = await activate(sara, globex);
const gp = await createProject(t, globex, PROJECTS[2]);
for (const s of STORIES.slice(0, 3)) await createStory(t, gp, s);
await activate(sara, acme); // land Sara on the rich org

console.log('\nDemo accounts (password ' + PASSWORD + '):');
console.log('  Sara (3 orgs, dueña):', sara.email);
console.log('  Marco (miembro de Acme):', marco.email);

// ---- Capture every flow (dark, desktop) ----
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE' });
await ctx.addInitScript(() => localStorage.setItem('theme', 'dark'));
const page = await ctx.newPage();
const shots = [];
const shot = async (name, full = true) => {
  await page.waitForTimeout(500);
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: full });
  shots.push([name, path]);
  console.log('shot', name);
};
async function login(email) {
  await ctx.clearCookies();
  await page.goto(`${BASE}/auth/sign-in`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

await page.goto(`${BASE}/auth/sign-in`);
await page.waitForLoadState('networkidle');
await shot('01-login');

await login(sara.email);
await page.waitForURL(/\/projects/);
// tour Acme Studio (the rich org)
await page.getByTestId('org-switcher').click();
await page.getByTestId('org-option').filter({ hasText: 'Acme Studio' }).click();
await page.waitForURL(/\/projects/);
await page.waitForTimeout(700);
await shot('02-org-proyectos');
await page.getByTestId('org-switcher').click();
await shot('03-org-switcher', false);
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

// Marco: a member (not owner) of Acme Studio sees it
await login(marco.email);
await page.waitForURL(/\/(projects|onboarding)/);
await shot('11-miembro-acme');

await ctx.close();

// Contact sheet
const sheet = await browser.newContext({ viewport: { width: 1180, height: 1000 } });
const sp = await sheet.newPage();
const cells = shots
  .map(([name, path]) => {
    const b64 = readFileSync(path).toString('base64');
    return `<figure><figcaption>${name}</figcaption><img src="data:image/png;base64,${b64}"/></figure>`;
  })
  .join('');
await sp.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><style>
   *{box-sizing:border-box;margin:0;padding:0}
   body{background:#050d1a;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;padding:28px}
   h1{font-size:20px;margin-bottom:18px}
   .grid{column-count:2;column-gap:16px}
   figure{break-inside:avoid;margin:0 0 16px;border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden}
   figcaption{font-size:12px;font-weight:600;color:#94a3b8;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.12)}
   img{display:block;width:100%;height:auto}
   </style></head><body><h1>Reqs-AI · Flujos (datos poblados) — DARK</h1><div class="grid">${cells}</div></body></html>`,
  { waitUntil: 'load' },
);
await sp.waitForTimeout(300);
await sp.screenshot({ path: `${OUT}/contact-rich-dark.png`, fullPage: true });
await sheet.close();
await browser.close();
await api.dispose();
console.log('done');
