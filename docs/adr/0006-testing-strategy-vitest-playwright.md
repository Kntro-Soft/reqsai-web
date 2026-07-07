# 0006. Testing strategy: Vitest (unit) + Playwright (e2e)

- Status: Accepted
- Date: 2026-06-16
- Deciders: Kntro-Soft team

## Context

Angular historically used Karma + Jasmine for unit tests and Protractor for e2e. Karma is
deprecated; Protractor was removed. Angular 17+ supports Vitest via `@angular/build:unit-test`.
The team needs a modern, fast test stack compatible with Angular 22's zoneless/signals model.

## Decision

**Unit tests — Vitest 4** via `@angular/build:unit-test`.

- Test files: `src/**/*.spec.ts`.
- Runner: Chromium headless (real DOM, not jsdom) for accurate Angular rendering.
- `CI=true` triggers non-watch mode (`--run`) for pipeline execution.
- Coverage thresholds are not enforced in CI yet (MVP phase); the team tracks coverage manually.

**End-to-end tests — Playwright 1.60**.

- Test dir: `e2e/`.
- Browsers: Chromium (primary), Firefox, WebKit (optional for CI).
- Base URL: `http://localhost:4200` (`PLAYWRIGHT_TEST_BASE_URL` env for overrides).
- Retries: 2 on CI, 0 locally.
- Trace: `on-first-retry`.

**Testing pyramid**:

1. **Unit** — signal-based services, pure pipes, component logic with `TestBed`.
2. **Component** — Angular `TestBed` + `ComponentFixture`, no real HTTP (use `provideHttpClientTesting`).
3. **e2e** — real browser against the running Angular dev server (with backend mocked or real).

## Consequences

- Vitest is significantly faster than Karma for watch-mode development.
- Playwright provides cross-browser e2e coverage including mobile viewports (Safari/WebKit).
- The team must learn Playwright's `page` API; Protractor/Selenium experience does not transfer.
- e2e tests require the Angular dev server (`ng serve`) to be running; CI must start it as a
  background process (`webServer` option in `playwright.config.ts`).
