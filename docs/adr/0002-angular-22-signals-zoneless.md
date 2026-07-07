# 0002. Angular 22 with signals and zoneless architecture

- Status: Accepted
- Date: 2026-06-16
- Deciders: Kntro-Soft team

## Context

The frontend needs a mature, typed, component-based framework with strong tooling and long-term
support. The options at the start of the project were Angular (v22), React 19, and Vue 3. The team
has prior Angular exposure from the university curriculum. Angular 22 introduces a stable signals
API and a production-ready zoneless mode (`provideExperimentalZonelessChangeDetection`), which
eliminates Zone.js from the runtime and aligns change detection with the browser's event loop.

## Decision

Use **Angular 22** in **zoneless** mode with **signals** (`signal()`, `computed()`, `effect()`) as
the primary reactivity primitive. `ChangeDetectionStrategy.OnPush` is mandatory on every component.
Class-based state with `BehaviorSubject`/`ReplaySubject` is avoided in new code; signals replace it.

All components, directives, and pipes are **standalone** (no NgModules). The entry point is
`bootstrapApplication` with an `ApplicationConfig`.

## Consequences

- Zoneless mode reduces bundle size (~20 KB, no Zone.js) and eliminates a frequent source of
  change-detection bugs.
- Signals provide fine-grained, synchronous reactivity without `async` pipe boilerplate for local state.
- `OnPush` everywhere means renders are explicit and predictable.
- Angular 22 tooling (esbuild build system, Vite dev server) delivers fast builds and hot reload.
- Team members must learn signals; RxJS is still used for HTTP and WebSocket (network I/O).
- Zoneless is stable in Angular 22; earlier versions required the `provideExperimentalZonelessChangeDetection` flag.
