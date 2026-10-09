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
- [Releases and Deployment](#releases-and-deployment)
- [Updating the CHANGELOG](#updating-the-changelog)

---

## Prerequisites

- **Bun 1.3+** (`curl -fsSL https://bun.sh/install | bash`)
- **Node 22+** (required by some Angular CLI tooling)
- **Docker** + Docker Compose (optional — to run the full stack locally)
- Access to the `Kntro-Soft/reqsai-web` repository

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

The frontend mirrors the backend-bounded contexts:

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

We follow **Gitflow**, and every branch starts from an issue on the
[ReqsAI project board](https://github.com/orgs/Kntro-Soft/projects/3):

| Branch                         | From      | Merges into         | Purpose                                                  |
|--------------------------------|-----------|---------------------|----------------------------------------------------------|
| `main`                         | —         | —                   | What runs in `produccion`. Every merge is a tagged release. |
| `develop`                      | `main`    | —                   | Integration branch. All features merge here first.       |
| `feature/<issue>-<slug>`       | `develop` | `develop`           | User story or task (`feature/123-discovery-export`).     |
| `bugfix/<issue>-<slug>`        | `develop` | `develop`           | Bug found before release (`bugfix/130-tenant-leak`).     |
| `release/X.Y.Z`                | `develop` | `main`, `develop`   | Stabilization of version X.Y.Z; it is what gets deployed. |
| `hotfix/X.Y.Z`                 | `main`    | `main`, `develop`   | Urgent fix of production (patch version).                |

`main` and `develop` are protected by rulesets: pull request with 1 approval (stale approvals are dismissed),
the CI checks must pass, no force-push or deletion, merge commits only. Pull requests into `main` also need a
successful deployment of their head commit to the `produccion` environment. Organization admins can bypass the
rules only through a pull request.

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
1. Pick an issue in Ready on the project board (or open one with the User Story / Bug / Task forms)
   and move it to In Progress.

2. Branch from develop, naming the branch after the issue
   git checkout develop && git pull origin develop
   git checkout -b feature/123-short-slug

3. Implement, keeping the build green
   bun run lint && bun run test:ci && bun run build

4. Commit following the convention (reference the issue in the body: "Refs #123")
   git commit -m "feat(scope): description"

5. Update CHANGELOG.md under [Unreleased]

6. Push and open a Pull Request to develop with "Closes #123"; the issue moves to In Review
   git push origin feature/123-short-slug
```

## Pull Requests

- Every PR targets `develop`; only `release/X.Y.Z` and `hotfix/X.Y.Z` target `main`.
- The description says `Closes #<issue>`, so merging closes the issue and links PR ↔ issue on the board.
- The CI checks required by the ruleset must pass, and at least **1 approval** is required (CODEOWNERS are
  requested automatically).
- Fill out the PR template honestly; do not self-merge without review.
- Keep PRs scoped to one concern where possible.

## Releases and Deployment

### Traceability

```
Issue #123 ──► feature/123-slug ──► commits "Refs #123" ──► PR "Closes #123" → develop
          ──► release/X.Y.Z ──► image ghcr.io/kntro-soft/reqsai-web:<sha> ──► deployment "produccion"
          ──► PR release/X.Y.Z → main ──► tag + GitHub Release vX.Y.Z (on the deployed <sha>)
```

Every hop is a link on GitHub: the issue lists its PRs, the release notes list the PRs, the tag points to the
deployed commit, the image carries that commit in its `org.opencontainers.image.revision` label, and the
`produccion` environment lists each deployment with its commit.

### Cutting a release

1. Branch `release/X.Y.Z` from `develop`, move `[Unreleased]` in `CHANGELOG.md` to `[X.Y.Z]`, push, and open the
   pull request `release/X.Y.Z → main` (it gets the normal PR checks).
2. Every push to the branch runs **Release** (`release.yml` → `delivery.yml`):

| Job | What it does |
|-----|--------------|
| `prepare` | Reads the version from the branch name, refuses an existing tag, reads the deploy switches. |
| `ci` | Runs `ci.yml` (the same checks as a PR). |
| `image` | Builds the `linux/arm64` image **once** and pushes `ghcr.io/kntro-soft/reqsai-web:<commit sha>`; if that commit already has an image, it is reused. |
| `deploy` | Environment **`produccion`: waits for approval** by `jhosepmyr`. Then asks `reqsai-infra` (`deploy-mvp.yml`, `image_source=registry`) to deploy that exact image and waits for it; fails if the infra deploy job did not succeed. |
| `release-pr` | Comments the deployed commit, image digest and infra run on the release PR and marks it ready for review (or prints the link to open it). |

3. Approve the deployment: **Actions → the Release run → Review deployments → produccion → Approve**.
   This is the only approval of the deploy: `reqsai-infra` checks it through the Deployments API and does not ask
   again.
4. Review and merge the release PR (merge commit). **Tag release** (`tag-release.yml`) checks that the PR head
   was deployed to `produccion`, creates `vX.Y.Z` on that commit with a GitHub Release, and prints the link to
   back-merge `release/X.Y.Z → develop`. Move the issues to Done.

A hotfix is the same with `hotfix/X.Y.Z` cut from `main` (**Hotfix**, `hotfix.yml`). A branch named
`hotfix/<slug>` gets the latest tag with the patch bumped.

### Redeploy or roll back

Run **Deploy** (`deploy.yml`) on a release tag: *Actions → Deploy → Run workflow → Use workflow from → Tags →
vX.Y.Z*. It deploys the image already built for that tag, behind the same `produccion` approval; nothing is
rebuilt. Pushes to `main` no longer deploy. Versions released before this pipeline have no image in GHCR; deploy
them from `reqsai-infra` (`deploy-mvp.yml` with `image_source=build`).

### Deploy switches

Each deploy channel has an on/off switch: an **organization** variable in *Kntro-Soft → Settings → Secrets and
variables → Actions → Variables*. Only the value `true` turns it on; when it is off the job is skipped and the
run summary says which variable stopped it.

| Variable | Controls |
|----------|----------|
| `ENABLE_REQSAI_WEB_IMAGE` | Job `image` (publishing to GHCR). Off also means no deploy. |
| `ENABLE_REQSAI_WEB_DEPLOY` | Job `deploy` of `delivery.yml` and `deploy.yml`. |
| `ENABLE_REQSAI_INFRA_DEPLOY` | Every deploy to the MVP host, in `reqsai-infra`. If it is off the infra run skips the deploy and the `deploy` job here fails. |

### One-time set-up

- `INFRA_DEPLOY_TOKEN`: fine-grained PAT with *Actions: read and write* on `Kntro-Soft/reqsai-infra` only.
  Prefer storing it as a secret of the `produccion` environment, so only an approved job can use it.
- GHCR: if the package `reqsai-web` already existed, grant this repository **Write** in *Package settings →
  Manage Actions access*; grant `reqsai-infra` **Read** (or make the package public).
- Staging: there is none (single EC2 host). See section 14.7 of the `reqsai-infra` deploy guide for the cost of
  adding one.

## Dependency Security

The CI pipeline includes a weekly dependency audit powered by `bun audit` (built into Bun 1.2+):

```bash
bun audit --audit-level=critical
```

- **Critical CVEs** → exit non-zero, fail the build.
- **High/Moderate/Low** → printed in output, not blocking.

If a critical CVE has no fix available yet, open an issue tracking it and unblock CI by
temporarily raising the level to `high` in the workflow — never silence it without a ticket.

Run the audit locally before opening a PR if you changed any dependency in `package.json`.

## Updating the CHANGELOG

Add your change under `## [Unreleased]` in [`CHANGELOG.md`](../CHANGELOG.md) following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/):

```markdown
## [Unreleased]
### Added
- iam: login page with JWT authentication flow
### Fixed
- discovery: SSE stream is not closed on component destruction
```
