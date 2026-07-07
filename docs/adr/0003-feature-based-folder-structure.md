# 0003. Feature-based folder structure mirroring backend bounded contexts

- Status: Accepted
- Date: 2026-06-16
- Deciders: Kntro-Soft team

## Context

The backend is a modular monolith with five bounded contexts: `iam`, `billing`, `workspace`,
`discovery`, and `gateway`. The frontend consumes these contexts' APIs and represents their data.
A flat, type-based folder structure (`components/`, `services/`, `models/`) would scatter related
code across the project and make it hard to understand which UI belongs to which backend context.

## Decision

The `src/app/` folder is organized by **feature** (bounded context), not by type:

```
src/app/
├── core/            # Singletons loaded once: auth, interceptors, guards, realtime, tenant, AI
├── features/        # Lazy-loaded bounded contexts (one folder = one Angular route group)
│   ├── iam/
│   ├── billing/
│   ├── workspace/
│   └── discovery/
├── shared/          # Stateless, reusable: directives, pipes, models, Spartan UI helm components
└── layout/          # Structural shell, navbar, sidebar (no business logic)
```

Each `features/<context>/` folder has its own `*.routes.ts` and is lazy-loaded by the router.
`core/` items are provided at the application root; `shared/` items are imported per-component.

## Consequences

- A developer working on `discovery` touches only `features/discovery/` — minimal cognitive overhead.
- Lazy-loading per feature reduces the initial bundle; the user downloads only what they need.
- The folder structure communicates the domain: anyone familiar with the backend immediately knows
  where to find the UI for a given bounded context.
- `core/` and `shared/` discipline is required: it is tempting to dump things into `shared/`; team
  must enforce that `shared/` stays stateless and reusable.
- Feature modules may not import from each other; cross-feature communication goes through `core/`.
