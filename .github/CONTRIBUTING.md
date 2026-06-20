# Contributing Guide — Kntro-Soft / reqsai-web

Thanks for contributing to the **Reqs-AI** frontend. This guide describes the workflow the team
follows to keep the repository organized, the history clean, and the build green.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Build, Run and Test](#build-run-and-test)
- [Project Structure](#project-structure)
- [Branch Structure](#branch-structure)
- [Commit Convention](#commit-convention)
- [Workflow](#workflow)
- [Pull Requests](#pull-requests)
- [Updating the CHANGELOG](#updating-the-changelog)

---

## Prerequisites

- **Bun 1.3+** (`curl -fsSL https://bun.sh/install | bash`)
- **Node 22+** (required by some Angular CLI tooling)
- **Docker** + Docker Compose (optional — to run the full stack locally)
- Access to the `Kntro-Soft/reqsai-web` repository

The backend lives in [`reqsai-api`](../reqsai-api). You do not need it running to develop UI
components, but you need it for integration work (authentication, real API calls).

## Local Setup

```bash
# 1. Install dependencies
bun install

# 2. Start the dev server (proxies /api and /ws to localhost:8080)
bun run start
# → http://localhost:4200
```

If you need the full stack (backend + DB):

```bash
# In reqsai-api/
docker compose --profile core up -d   # PostgresSQL + MailKit
./gradlew bootRun                      # API at localhost:8080
```

## Build, Run and Test

```bash
bun run start        # dev server with hot reload — http://localhost:4200
bun run build        # production build → dist/reqsai-web/browser/
bun run test         # unit tests (Vitest, watch mode)
bun run lint         # ESLint + angular-eslint
bun run format       # Prettier write
bun run knip         # dead-code detection
bun run e2e          # Playwright end-to-end tests (requires dev server running)
```

The `bun run build` command must pass with **zero TypeScript errors** and **no budget exceeded**
before a PR can be merged. The CI workflow runs lint → test → build in sequence.

## Project Structure

The frontend mirrors the backend bounded contexts:

```
src/app/
├── core/            # Singletons: auth store, interceptors, guards, realtime, tenant context, AI
├── features/        # Lazy-loaded bounded contexts
│   ├── iam/         # Login, register, profile (mirrors backend iam/)
│   ├── billing/     # Subscription plans (mirrors backend billing/)
│   ├── workspace/   # Organizations & projects (mirrors backend workspace/)
│   └── discovery/   # Capture sessions, AI pipeline (mirrors backend discovery/)
├── shared/          # Stateless, reusable: directives, pipes, models, Spartan UI components
└── layout/          # Shell, navbar, sidebar (structural only, no business logic)
```

### Angular conventions

- **Components:** `ChangeDetectionStrategy.OnPush` is mandatory. Use **signals** (`signal()`,
  `computed()`, `effect()`) for local state. Avoid `BehaviorSubject`/`ReplaySubject` for new code.
- **Standalone components:** all components, directives, and pipes are standalone (no NgModules).
- **Routing:** features are lazy-loaded. Each feature folder has its own `*.routes.ts`.
- **HTTP:** use `HttpClient` with typed responses. Interceptors live in `core/interceptors/`.
- **Auth guard:** protect routes with the `authGuard` from `core/guards/`. Do not inline auth
  logic in components.
- **Prefix:** component selector prefix is `app-`, directive prefix is `app`.

### Error handling

Components must not `console.error` directly. Propagate errors via the `ErrorHandler` or through
observables/signals so the global error boundary can handle them consistently.

### Styling

- Use **Tailwind CSS v4** utility classes; avoid custom CSS unless Tailwind cannot achieve the
  result.
- Use **Spartan UI** helm components from `src/app/shared/ui/` for all UI primitives (button,
  input, dialog, etc.).
- Dark mode is theme-aware via CSS custom properties defined in `src/styles.css`.

---

## Branch Structure

We follow **Gitflow**:

| Branch                  | Purpose                                                                   |
|-------------------------|---------------------------------------------------------------------------|
| `main`                  | Production-ready. Only merged from `develop` (tagged releases).           |
| `develop`               | Integration branch. All features merge here first.                        |
| `feature/<description>` | New feature, component, or capability.                                    |
| `bugfix/<description>`  | Fix for a bug found during development.                                   |
| `hotfix/<description>`  | Urgent fix branched from `main` (then merged back to `main` + `develop`). |
| `release/<version>`     | Stabilization before a release (branched from `develop`).                 |

**Branch name examples:**
```
feature/iam-login-page
feature/workspace-project-list
feature/discovery-capture-session-ui
bugfix/auth-token-refresh-loop
```

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <short description in lowercase>
```

| Type       | When to use                                               |
|------------|-----------------------------------------------------------|
| `feat`     | New feature or UI component                               |
| `fix`      | Bug fix                                                   |
| `refactor` | Code change without behavior change                       |
| `test`     | Adding or fixing tests                                    |
| `docs`     | Documentation only (README, CHANGELOG, docs/, ADRs)       |
| `build`    | Build system or dependencies (`package.json`, `bun.lock`) |
| `ci`       | CI/CD configuration (GitHub Actions, Dockerfile)          |
| `chore`    | Maintenance, config, `.gitignore`                         |
| `style`    | Formatting only (no logic change)                         |
| `perf`     | Performance improvement                                   |

**Scope** = feature module or area: `iam`, `billing`, `workspace`, `discovery`, `core`, `shared`,
`layout`, `build`, `ci`, `config`.

**Examples:**
```
feat(iam): add login form with JWT authentication
fix(discovery): correct SSE stream disconnect on component destroy
build(deps): update angular to 22.1.0
docs(adr): record state management decision
```

## Workflow

```
1. Branch from develop
   git checkout develop && git pull origin develop
   git checkout -b feature/my-feature

2. Implement, keeping the build green
   bun run build && bun run lint

3. Commit following the convention
   git add <files>
   git commit -m "feat(scope): description"

4. Update CHANGELOG.md under [Unreleased]

5. Push and open a Pull Request targeting develop
   git push origin feature/my-feature
```

## Pull Requests

- Every PR targets `develop`, never `main` directly.
- CI (lint + test + build) must pass.
- At least **1 approval** from a CODE OWNER is required.
- Fill out the PR template honestly; do not self-merge without review.
- Keep PRs scoped to one feature module / concern where possible.

## Updating the CHANGELOG

Add your change under `## [Unreleased]` in [`CHANGELOG.md`](../CHANGELOG.md) following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/):

```markdown
## [Unreleased]
### Added
- iam: login page with JWT authentication flow
### Fixed
- discovery: SSE stream not closed on component destroy
```
