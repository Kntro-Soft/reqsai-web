# Changelog — Reqs-AI Web (Frontend)

All notable changes to this frontend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versioning
follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

_Feature module implementation (iam, billing, workspace, discovery) in progress._

### Added

- **IAM — HttpOnly cookie auth** (`feature/iam-cookie-auth`): `AuthService` stores the access
  token in a memory signal only; the refresh token is an `HttpOnly` cookie set by the server.
  `withCredentials: true` on all auth requests. No `localStorage` usage anywhere in the auth flow.
  Supersedes the initial localStorage design (see ADR-0012).
- **IAM — silent refresh** (`feature/iam-cookie-auth`): `SilentRefreshService` registered as
  `APP_INITIALIZER`; on every page load it calls `POST /api/authentication/refresh` — if the
  HttpOnly cookie is present the browser sends it automatically. A 401 response redirects to
  `/auth/sign-in`; success restores the session without user interaction.
- **IAM — onboarding routing via organizationId** (`feature/iam-cookie-auth`): sign-in and refresh
  responses include `organizationId` (nullable). If `null`, the auth guard routes to
  `/onboarding/create-org`; if set, to `/dashboard`.
- **IAM — sign-up + verify-email pages** (`feature/iam-signup-flow`): registration form posting to
  `POST /api/authentication/sign-up`; verify-email page reading the `?token=` query param and
  calling `POST /api/authentication/verify-email`.
- **Core infrastructure** (`feature/core-infrastructure`): `AuthStore` (signals, no NgRx),
  `AuthInterceptor` (injects `Authorization: Bearer`), error interceptor (handles 401 with silent
  refresh + retry), auth and onboarding route guards, realtime WebSocket/STOMP service, tenant
  context service.
- **ADR-0012 updated**: documents the cookie-based auth contract, full endpoint map, email
  verification flow, `organizationId` routing, and header-based API versioning (`Api-Version: 1`).
- **Project foundation**: Angular 22 application scaffolded with zoneless architecture,
  signals-first approach, and `ChangeDetectionStrategy.OnPush` as the team default.
- **Tailwind CSS v4** integration via `@tailwindcss/postcss`; custom OKLCh color theme
  (`theme-reqsai`) defined in `src/styles.css` for light and dark modes.
- **Spartan UI** (`@spartan-ng/brain`) as the headless UI component library.
- **Vitest 4** for unit testing via `@angular/build:unit-test` with Chromium/jsdom target.
- **Playwright** for end-to-end testing across Chromium, Firefox, and WebKit.
- **ESLint** (flat config) with `angular-eslint` and `typescript-eslint`; template accessibility
  rules enabled.
- **Prettier** with Angular HTML parser override.
- **Lefthook** git hooks: `pre-commit` (lint + format staged files), `commit-msg` (commitlint).
- **Commitlint** enforcing Conventional Commits (`@commitlint/config-conventional`).
- **Knip** for dead-code and unused-dependency detection.
- **Dev-server proxy** (`proxy.conf.json`) routing `/api` and `/ws` to `localhost:8080`.
- **`.github/` governance**: CODEOWNERS, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY,
  PULL_REQUEST_TEMPLATE, Dependabot, issue templates, CI/CodeQL/Deploy workflows.
- **Architecture Decision Records** (ADRs 0001–0013) in `docs/adr/`.
- **Dependency security audit** (`bun audit --audit-level=critical`) via weekly GitHub Actions
  workflow; blocks on Critical CVEs, reports lower severities.
- **Docker** multi-stage `Dockerfile` (Bun build → nginx Alpine) and `compose.yaml`.

---

## [0.0.1] — 2026-06-16

_Initial project scaffolding (`feature/project-foundation` branch)._
