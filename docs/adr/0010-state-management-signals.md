# 0010. State management with Angular signals (no NgRx)

- Status: Accepted
- Date: 2026-06-16
- Deciders: Kntro-Soft team

## Context

Angular 22 ships a stable signals API (`signal()`, `computed()`, `effect()`, `linkedSignal()`,
`resource()`). Before signals, the community standard for complex state was NgRx (Redux-inspired
store). NgRx adds significant boilerplate (actions, reducers, selectors, effects) that is difficult
to justify for a 5-person academic project at MVP stage.

## Decision

Use **Angular signals** for all state management. No NgRx, no Akita, no Elf.

- **Local component state**: `signal<T>(initialValue)` inside the component class.
- **Shared feature state**: a `*Store` service (e.g., `SessionStore`) in the feature folder,
  provided at the feature route level (`providers: [SessionStore]` in the route config). State
  is held in private `signal()`s; consumers get `readonly` computed getters.
- **Global app state** (auth, tenant, current user): services in `core/` with `providedIn: 'root'`
  and signal-based state. The `AuthStore` holds the in-memory JWT access token.
- **Server data / async**: `resource()` (Angular 19+) for simple fetches; `rxResource()` or a
  manual `effect()` calling `HttpClient` for streams. Avoid `async` pipe where signals suffice.
- **Effects**: use `effect()` for synchronization side-effects (e.g., persist a preference to
  localStorage). Do not use `effect()` for HTTP calls; use `resource()` or a service method instead.

## Consequences

- Zero NgRx boilerplate; state is colocated with the feature that owns it.
- Signals are synchronous and fine-grained; change detection fires only for the components that
  read a changed signal.
- No Redux DevTools support out of the box. Debugging relies on Angular DevTools (signal graph
  visualization introduced in Angular 19+).
- If the app grows significantly in complexity, migrating from signals to NgRx Signal Store is
  straightforward since NgRx Signal Store is built on Angular signals.
- The team must discipline `*Store` services to expose only computed read signals (not raw
  writable signals) to avoid uncontrolled mutations from consumers.
