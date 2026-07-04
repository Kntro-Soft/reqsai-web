# Changelog — Reqs-AI Web (Frontend)

All notable changes to this frontend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versioning
follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

_Feature module implementation (iam, billing, workspace, discovery) in progress._

### Added

- **Workspace — project access control UI** (`feature/project-admin-ui`): split project settings into a
  **Roles** page and a dedicated **create/edit role** page whose permission editor is a searchable,
  collapsible matrix (groups collapsed by default with expand-all/collapse-all, tri-state select-all per
  group, and an inline description under every permission and group so users know what each grants). The
  project **Members** page merges "assign existing" and "invite new" into one combobox form — pick an
  active org member (with avatar) or type an unknown email to invite them as new — dispatching to the
  assign and batch-invite endpoints. Adds a project **danger zone** (archive / restore / delete with
  type-to-confirm) and the models/API for project invitations and archive/restore/delete.
- **UI — select dropdown & alignment fixes** (`feature/project-admin-ui`): the shared `app-select`
  dropdown now matches its trigger width, plus roles-table name alignment, permission-group count
  alignment, org-members search icon, a self-invite guard, and inline-entity vertical centering.
- **UI — Vercel/Geist redesign & design system** (`feature/ui-redesign`): dark-first navy theme with a
  single red accent, reduced global radius (`--radius: 0.375rem`), circular logos across the app,
  avatar monogram fallback, an interactive animated backdrop (cursor-following red light + idle drift),
  a faint brand-tinted dot grid, reduced-motion-safe route view transitions and micro-interactions, and
  shared building blocks: `app-modal`, toast notifications, skeleton loaders, `chip-input`,
  `inline-entity` (small logo + name inline) and a shared chrome-less `create-page-header`.
- **UI — global command palette (⌘K)** (`feature/ui-redesign`): fuzzy search with grouped results and
  recents, extracted into a reusable `CommandRegistry`, wired to the backend global search
  (`GET /api/search`) surfacing project, organization, member, glossary-term and document hits.
- **Workspace — contextual app shell** (`feature/ui-redesign`): sidebar + top bar with contextual
  sub-navigations (org settings / project settings / account), a split organization switcher and a
  project switcher showing real logos, a dynamic clickable breadcrumb, an OS-aware ⌘K/Ctrl-K shortcut,
  and nested `settings/*` · `account/*` · `projects/:id/settings/*` routes.
- **Workspace — members management** (`feature/ui-redesign`): always-visible invite card with batch
  invite, Active/Pending/Inactive tabs, member avatars, resend-invitation, deactivate/reactivate and
  inline role change. Regular members get a read-only roster (role-gated), the organization owner is
  shown to everyone, and destructive actions use confirmation modals (deactivate/reactivate;
  type-to-confirm remove) with the member's logo inline.
- **Workspace — organization & project settings** (`feature/ui-redesign`): per-field save cards backed
  by PATCH (Save disabled until the field changes), a danger zone (transfer / delete / leave) rendered
  as modals — searchable transfer picker with avatars and a double type-to-confirm delete — plus chip
  inputs and logo upload.
- **Workspace — projects dashboard** (`feature/ui-redesign`): grid/list view toggle, a dedicated
  chrome-less new-project page, richer project cards (architecture + full tech stack) and a full-height
  empty state.
- **Account settings** (`feature/ui-redesign`): profile, password and appearance, styled to match
  organization settings.
- **Invitations** (`feature/ui-redesign`): invitation API client + models and a chrome-less
  accept-invitation page (`/invitations/accept`) with sign-in redirect and sign-up email prefill.
- **UI — Lucide icon library** (`feature/ui-icon-library`): replaced hand-pasted inline SVG icon
  paths with [`@ng-icons/lucide`](https://github.com/ng-icons/ng-icons), wrapped in a vendored
  `HlmIcon` (`shared/ui/icon`, Spartan-style, `cn`-based, `currentColor`). `NavIcon` becomes a thin
  semantic wrapper (`projects → lucideFolder`, …) so the shells are untouched; icons are registered
  per component with `provideIcons(...)` and are tree-shaken. Migrated: nav-icon, theme-toggle,
  user-menu, org-switcher, project-shell, sessions, projects, organizations, create-organization,
  members, terms. The recorder's filled record/stop/play controls and `hlm-spinner` are kept as
  bespoke SVG (Lucide equivalents are outline-only). See
  [ADR-0014](docs/ADR/0014-icon-library-ng-icons-lucide.md).
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

### Changed

- **UI — Vercel/Geist visual overhaul of existing pages** (`feature/ui-redesign`): redesigned the
  organization members list into a compact table with a styled role select, organization settings into
  per-field cards, the terms & privacy gate into a full-page scroll-to-accept flow, and
  unified/centered the headers of the create-organization and new-project pages. i18n kept at strict
  EN/ES key parity (CI gate); removed `transloco-keys-manager` and silenced startup
  "Missing translation" warnings.

---

## [0.0.1] — 2026-06-16

_Initial project scaffolding (`feature/project-foundation` branch)._
