// Seeds two demo users — one with a single (populated) organization, one with
// several — then captures the org flows in both themes.
// Usage: node scripts/seed-shots.mjs   (dev server + backend up)
import { chromium, request as pwRequest } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const MP = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const PASSWORD = 'Passw0rd!23';
const V1 = { 'Api-Version': '1' };
const OUT = 'shots/org';
mkdirSync(OUT, { recursive: true });

const api = await pwRequest.newContext({ baseURL: BASE });
const auth = (token) => ({ headers: { ...V1, Authorization: `Bearer ${token}` } });

async function registerVerified(prefix) {
  const email = `${prefix}.${Date.now()}@reqsai.test`;
  await api.post('/api/auth/register', {
    headers: V1,
    data: { email, password: PASSWORD, firstName: prefix === 'solo' ? 'Sara' : 'Marco', lastName: 'Demo' },
  });
  let token = null;
  for (let i = 0; i < 20 && !token; i++) {
    const data = await (await api.get(`${MP}/api/v1/messages?limit=50`)).json();
    const hit = data.messages.find(
      (m) => m.Subject.includes('Verifica') && m.To.some((t) => t.Address.toLowerCase() === email),
    );
    if (hit) {
      const msg = await (await api.get(`${MP}/api/v1/message/${hit.ID}`)).json();
      const mt = `${msg.Text ?? ''} ${msg.HTML ?? ''}`.match(/verify-email\?token=([A-Za-z0-9._~-]+)/);
      if (mt) token = mt[1];
    }
    if (!token) await new Promise((r) => setTimeout(r, 500));
  }
  await api.post('/api/auth/verify-email', { headers: V1, data: { token } });
  return email;
}

async function login(email) {
  const res = await api.post('/api/auth/login', { headers: V1, data: { email, password: PASSWORD } });
  return (await res.json()).accessToken;
}
async function acceptTerms(token) {
  await api.post('/api/users/me/terms', { ...auth(token), data: { termsVersion: '2026-01' } });
}
const uniq = Date.now().toString(36);
const slugify = (name, i) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${uniq}${i}`;
async function createOrg(token, name, i) {
  const res = await api.post('/api/organizations', {
    ...auth(token),
    data: { name, slug: slugify(name, i) },
  });
  return (await res.json()).id;
}
async function setActive(token, orgId) {
  await api.patch('/api/users/me/preferences', { ...auth(token), data: { lastVisitedOrgId: orgId } });
}
async function refresh() {
  const res = await api.post('/api/auth/refresh', { headers: V1 });
  return (await res.json()).accessToken;
}
async function createProject(token, orgId, spec) {
  const res = await api.post(`/api/organizations/${orgId}/projects`, { ...auth(token), data: spec });
  return (await res.json()).id;
}
async function createSession(token, projectId, title) {
  const res = await api.post(`/api/projects/${projectId}/sessions`, {
    ...auth(token),
    data: { title, language: 'es-PE' },
  });
  return (await res.json()).id;
}
async function transition(token, projectId, sessionId, action) {
  await api.post(`/api/projects/${projectId}/sessions/${sessionId}/${action}`, auth(token));
}

const PROJECTS = [
  { name: 'Plataforma de Pagos', programmingLanguages: ['Java'], frameworks: ['Spring Boot'], clientPlatforms: ['Web'], databases: ['PostgreSQL'], architecture: 'Hexagonal', domain: 'Fintech' },
  { name: 'App Móvil Banca', programmingLanguages: ['Kotlin'], frameworks: ['Android'], clientPlatforms: ['Mobile'], databases: ['SQLite'], architecture: 'MVVM', domain: 'Fintech' },
  { name: 'Portal de Clientes', programmingLanguages: ['TypeScript'], frameworks: ['Angular'], clientPlatforms: ['Web'], databases: ['PostgreSQL'], architecture: 'Hexagonal', domain: 'SaaS' },
  { name: 'Motor de Riesgos', programmingLanguages: ['Python'], frameworks: ['FastAPI'], clientPlatforms: ['API'], databases: ['Redis'], architecture: 'Event-Driven', domain: 'Riesgos' },
  { name: 'Data Pipeline', programmingLanguages: ['Scala'], frameworks: ['Spark'], clientPlatforms: ['Batch'], databases: ['Kafka'], architecture: 'Streaming', domain: 'Datos' },
  { name: 'API Gateway', programmingLanguages: ['Go'], frameworks: ['gRPC'], clientPlatforms: ['API'], databases: ['etcd'], architecture: 'Microservicios', domain: 'Infraestructura' },
];

const SESSIONS = [
  { title: 'Kickoff con stakeholders', steps: ['start', 'stop'] },
  { title: 'Refinamiento de backlog', steps: ['start', 'pause'] },
  { title: 'Entrevista usuario piloto', steps: ['start'] },
  { title: 'Descubrimiento inicial', steps: [] },
];

console.log('Seeding solo user…');
const soloEmail = await registerVerified('solo');
let st = await login(soloEmail);
await acceptTerms(st);
const soloOrg = await createOrg(st, 'Northwind Labs', 0);
await setActive(st, soloOrg);
st = await refresh();
const projectIds = [];
for (const spec of PROJECTS) projectIds.push(await createProject(st, soloOrg, spec));
// Populate sessions (varied statuses) in the first project.
for (const s of SESSIONS) {
  const sid = await createSession(st, projectIds[0], s.title);
  for (const step of s.steps) await transition(st, projectIds[0], sid, step);
}

console.log('Seeding multi user…');
const multiEmail = await registerVerified('multi');
let mt = await login(multiEmail);
await acceptTerms(mt);
const multiNames = ['Umbrella Co', 'Tyrell Corp', 'Cyberdyne Systems'];
const multiOrgs = [];
for (let i = 0; i < multiNames.length; i++) multiOrgs.push(await createOrg(mt, multiNames[i], i));
for (const orgId of multiOrgs) {
  await setActive(mt, orgId);
  mt = await refresh();
  await createProject(mt, orgId, PROJECTS[0]);
}

console.log('\nDemo accounts (password ' + PASSWORD + '):');
console.log('  1 org  →', soloEmail);
console.log('  3 orgs →', multiEmail);

// ---- Capture both cases in dark + light ----
const browser = await chromium.launch();
const VP = { width: 1440, height: 900 };

async function uiLogin(page, email) {
  await page.goto(`${BASE}/auth/sign-in`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: VP });
  await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
  const page = await ctx.newPage();
  const shot = async (name, full = true) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: full });
    console.log(theme, name);
  };

  // Solo: 1 org → straight to projects (populated).
  await uiLogin(page, soloEmail);
  await page.waitForURL(/\/projects/);
  await shot('solo-01-projects');
  await page.getByTestId('org-switcher').click();
  await shot('solo-02-switcher', false);
  await page.keyboard.press('Escape');
  await page.getByTestId('project-row').first().click();
  await page.waitForURL(/\/sessions$/);
  await shot('solo-03-sessions');

  // Multi: 3 orgs → picker.
  await ctx.clearCookies();
  await uiLogin(page, multiEmail);
  await page.waitForURL(/\/organizations/);
  await shot('multi-01-picker');
  await ctx.close();
}

await browser.close();
await api.dispose();
console.log('done');
