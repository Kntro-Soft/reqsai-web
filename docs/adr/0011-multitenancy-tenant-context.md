# 0011. Multitenancy via tenant context service

- Status: Accepted
- Date: 2026-06-16
- Deciders: Kntro-Soft team

## Context

The backend implements **schema-per-tenant multitenancy**: each organization has its own PostgreSQL
schema, and the correct schema is selected per-request based on the JWT claim `orgId`. The frontend
must be aware of the active tenant (organization) so it can:

1. Route correctly (e.g., `/orgs/:orgId/projects`).
2. Include the `orgId` in API requests where required.
3. Display the correct tenant name, logo, and branding.
4. Prevent users from accessing data of a different tenant.

## Decision

Introduce a **`TenantContextService`** in `core/tenant/`:

```typescript
// core/tenant/tenant-context.service.ts
@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly _org = signal<Organization | null>(null);

  readonly org = this._org.asReadonly();
  readonly orgId = computed(() => this._org()?.id ?? null);

  setOrg(org: Organization): void { this._org.set(org); }
  clear(): void { this._org.set(null); }
}
```

The `AuthInterceptor` reads `orgId` from the decoded JWT claims after login and calls
`TenantContextService.setOrg(...)`. All HTTP requests to `/api/` include `orgId` implicitly
through the JWT (the backend extracts it from the token); the frontend does **not** add a separate
tenant header — the JWT is the source of truth.

Route guards in `workspace/` and `discovery/` verify that the `orgId` in the URL matches the
active tenant before activating the route.

## Consequences

- Single source of truth for the active organization; all features read from `TenantContextService`.
- The `orgId` in the URL enables bookmarking and direct navigation to a tenant's workspace.
- On logout, `TenantContextService.clear()` is called alongside `AuthStore.clear()` to prevent
  stale tenant state.
- Multi-org support (a user belonging to multiple organizations) would require a org-switcher UI
  that calls `setOrg(...)` and triggers a navigation reset — not planned for MVP.
- The backend's schema-per-tenant isolation means a misconfigured `orgId` on the frontend only
  results in a 403/404, not a data leak across tenants.
