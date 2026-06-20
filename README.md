# reqsai-web

Frontend de **Reqs-AI** — plataforma SaaS B2B de elicitación de requisitos asistida por IA.

**Stack:** Angular 22 zoneless · TypeScript 6 · Bun 1.3 · Tailwind CSS v4 · Spartan UI
**Build:** `@angular/build:application` (esbuild · Vite dev-server)
**Tests:** Vitest 4 (unit, Chromium headless) · Playwright (e2e)

> Decisiones de arquitectura en **[`docs/adr/`](./docs/adr/)** · convenciones y flujo de trabajo en **[`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)**.

---

## Requisitos

- **Bun 1.3+** y **Node 22 o 24 LTS** (Node 25 es versión impar/no-LTS — evítala)
- Backend corriendo en `:8080` (o Docker)

## Puesta en marcha (dev)

```bash
bun install
bun start        # dev-server con HMR → http://localhost:4200
                 # proxy.conf.json redirige /api y /ws a localhost:8080
```

## Scripts

| Script            | Qué hace                                              |
|-------------------|-------------------------------------------------------|
| `bun start`       | Dev-server (Vite, HMR, proxy al backend)              |
| `bun run build`   | Build de producción (esbuild, tree-shaking, hashing)  |
| `bun test`        | Unit tests con Vitest (Chromium headless)             |
| `bun run lint`    | ESLint + angular-eslint (TS + templates)              |
| `bun run e2e`     | Tests e2e con Playwright                              |
| `bun run knip`    | Detecta exports, archivos y deps sin uso              |

## Environments

| Archivo                                | Cuándo se usa                                  |
|----------------------------------------|------------------------------------------------|
| `src/environments/environment.ts`      | Desarrollo (`bun start` / `bun run build:dev`) |
| `src/environments/environment.prod.ts` | Producción (`bun run build` — por defecto)     |

Angular sustituye `environment.ts` por `environment.prod.ts` en el build de producción
via `fileReplacements` en `angular.json`. Actualiza `wsUrl` en `environment.prod.ts`
con la URL real del WebSocket antes del primer despliegue.

```typescript
// environment.ts (dev — proxy maneja /api y /ws)
export const environment = {
  production: false,
  apiUrl: '',
  wsUrl: '',
} as const;
```

---

## Arquitectura

Patrón **feature-based** que espeja los bounded contexts del backend. Las dependencias
solo fluyen hacia adentro: `features` → `core/shared`, nunca entre features.

```
src/app/
├── core/
│   ├── auth/          ← AuthStore (signals), login, refresh, logout
│   ├── tenant/        ← TenantContext: decodifica orgId/role del JWT
│   ├── realtime/      ← RealtimeService (STOMP/rx-stomp)
│   ├── ai/            ← AiStreamService (SSE/fetch streaming)
│   ├── interceptors/  ← authInterceptor, errorInterceptor (ProblemDetail RFC 9457)
│   └── guards/        ← authGuard, roleGuard (funcionales)
├── shared/
│   ├── ui/            ← componentes Spartan/helm (copiados al repo, editables)
│   ├── directives/
│   ├── pipes/
│   └── models/        ← DTOs compartidos
├── features/
│   ├── iam/           ← login, perfil, miembros
│   ├── billing/       ← planes, suscripción
│   ├── workspace/     ← proyectos
│   └── discovery/     ← captura en vivo (WebSocket + IA)
└── layout/            ← shell, navbar, sidebar
```

**Reglas:**
- `features/*` nunca se importan entre sí — comunicación vía `core/` o eventos.
- `core/` no importa de `features/`. `shared/` no importa de `core/` ni `features/`.
- **Signals-first**: estado síncrono = `signal()`/`computed()`; estado servidor = `httpResource`; streams = RxJS solo donde aporta (WS, debounce).
- **OnPush** y standalone en todos los componentes.

## Autenticación JWT

- **Access token** → memoria (`signal`, nunca `localStorage`).
- **Refresh token** → `localStorage('rt')` (el backend lo devuelve en el body del login).
- `APP_INITIALIZER` lee `localStorage('rt')` al arrancar y hace silent refresh antes de montar la app.
- `authInterceptor` añade `Authorization: Bearer` en cada request a `/api/v1`.
- `errorInterceptor` gestiona el `401`: dispara refresh, reintenta la request original y redirige a login si el refresh falla.

## Tiempo real y streaming IA

- **WebSocket/STOMP** vía `@stomp/rx-stomp` → endpoint `/ws`, Bearer en el frame CONNECT.
- **SSE/IA streaming** vía `fetch` + `ReadableStream` (no `EventSource` — el backend requiere POST con el prompt en el body).

## Seguridad (Docker/nginx)

El contenedor de producción usa nginx con:
- SPA fallback (`try_files $uri $uri/ /index.html`)
- Assets con hash → `Cache-Control: public,immutable` (1 año)
- `index.html` → `no-cache,no-store,must-revalidate`
- Headers de seguridad: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`

```bash
docker compose --profile app build
docker compose --profile app up -d     # http://localhost:4200
```

## CI/CD

- **CI** (`.github/workflows/ci.yml`): lint + tests + build en cada PR/push.
- **CodeQL** (`.github/workflows/codeql.yml`): análisis estático de seguridad.
- **Deploy** (`.github/workflows/deploy.yml`): S3 sync + CloudFront invalidation en push a `main`.
- **Audit** (`.github/workflows/audit.yml`): escaneo CVE de dependencias npm (semanal).

Detalle en [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Documentación y governance

| Documento                                            | Propósito                                           |
|------------------------------------------------------|-----------------------------------------------------|
| [`docs/adr/`](docs/adr/)                             | Architecture Decision Records (el *por qué*)        |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)           | Docker · AWS S3 + CloudFront · variables de entorno |
| [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) | Flujo de trabajo, ramas, commits, PR                |
| [`CHANGELOG.md`](CHANGELOG.md)                       | Historial de cambios (Keep a Changelog)             |
| [`.github/SECURITY.md`](.github/SECURITY.md)         | Política de seguridad y reporte de vulnerabilidades |

## Licencia

[Apache 2.0](LICENSE).
