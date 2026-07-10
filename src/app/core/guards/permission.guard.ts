import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  CanMatchFn,
  Route,
  Router,
  UrlSegment,
  UrlTree,
} from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../auth/auth.store';
import { PermissionsStore } from '../authz/permissions.store';
import { OrgRole } from '../authz/permissions.models';
import { ToastService } from '../../shared/toast/toast.service';

/**
 * The dependencies a guard needs, resolved synchronously in the injection context —
 * an `await` in an async guard severs that context, so every `inject()` must happen
 * up front, before the first await.
 */
interface GuardDeps {
  auth: AuthStore;
  permissions: PermissionsStore;
  router: Router;
  toast: ToastService;
  transloco: TranslocoService;
}

function resolveDeps(): GuardDeps {
  return {
    auth: inject(AuthStore),
    permissions: inject(PermissionsStore),
    router: inject(Router),
    toast: inject(ToastService),
    transloco: inject(TranslocoService),
  };
}

/**
 * Reads the `projectId` route param from an activation snapshot or a `CanMatch`
 * segment list. Child routes inherit the parent's params (`paramsInheritanceStrategy:
 * 'always'`), so the activation form finds it even on nested settings pages; the
 * `CanMatch` form has no inherited params, so it scans the matched segments.
 */
function projectIdFrom(
  route: ActivatedRouteSnapshot | null,
  segments?: UrlSegment[],
): string | null {
  if (route) return route.paramMap.get('projectId');
  if (segments) {
    const idx = segments.findIndex((s) => s.path === 'projects');
    if (idx >= 0 && segments[idx + 1]) return segments[idx + 1].path;
  }
  return null;
}

/**
 * Denies access: toasts the "no access" message and returns a `UrlTree` redirect —
 * the caller's project overview when we can resolve a project, else the dashboard.
 * Returning a tree (rather than navigating imperatively) lets the router treat the
 * whole thing as a single, cancel-free navigation.
 */
function deny(deps: GuardDeps, projectId: string | null): UrlTree {
  deps.toast.error(deps.transloco.translate('authz.noAccess'));
  return projectId
    ? deps.router.createUrlTree(['/projects', projectId])
    : deps.router.createUrlTree(['/projects']);
}

/** Ensures the org authorization is loaded before a role/permission check reads it. */
async function ensureOrgLoaded(deps: GuardDeps): Promise<void> {
  const orgId = deps.auth.organizationId();
  if (orgId) await firstValueFrom(deps.permissions.loadOrgAuthorization(orgId));
}

/** Ensures the project permissions are loaded before a `has(...)` check reads them. */
async function ensureProjectLoaded(deps: GuardDeps, projectId: string | null): Promise<void> {
  if (!projectId) return;
  await firstValueFrom(deps.permissions.loadProjectPermissions(projectId));
}

/**
 * `CanActivate` guard factory: allow only when the caller holds `permission` on the
 * project in scope. Owner/admin pass implicitly. On deny, redirect (with a toast) to
 * the project overview or the dashboard.
 *
 * Usage: `canActivate: [requirePermission('DOCUMENT_READ')]` (or read `data.permission`).
 */
export function requirePermission(permission: string): CanActivateFn {
  return async (route: ActivatedRouteSnapshot) => {
    const deps = resolveDeps();
    const perm = (route.data['permission'] as string | undefined) ?? permission;
    const projectId = projectIdFrom(route);
    return checkPermission(deps, perm, projectId);
  };
}

/**
 * `CanMatch` variant of {@link requirePermission}: the same check, but it also keeps
 * the lazy chunk from loading when the caller lacks the permission. The permission is
 * read from the route's `data.permission`.
 */
export function requirePermissionMatch(permission: string): CanMatchFn {
  return async (route: Route, segments: UrlSegment[]) => {
    const deps = resolveDeps();
    const perm = (route.data?.['permission'] as string | undefined) ?? permission;
    const projectId = projectIdFrom(null, segments);
    return checkPermission(deps, perm, projectId);
  };
}

/**
 * Shared decision for the permission guards: owner/admin pass without even loading the
 * project set (they hold everything); everyone else needs their effective project
 * permissions loaded before the `has(...)` check. Returns `true` or a redirect tree.
 */
async function checkPermission(
  deps: GuardDeps,
  permission: string,
  projectId: string | null,
): Promise<boolean | UrlTree> {
  await ensureOrgLoaded(deps);
  if (deps.permissions.isOrgOwnerOrAdmin()) return true;
  await ensureProjectLoaded(deps, projectId);
  return deps.permissions.has(permission) || deny(deps, projectId);
}

/**
 * `CanActivate` guard factory for org-scoped routes: allow only owners (or owners and
 * admins). Owner-only routes (e.g. org General) pass `'OWNER'`; owner/admin routes
 * (e.g. Members, base-permission) pass `'ADMIN'`, which admits both.
 */
export function requireOrgRole(role: OrgRole): CanActivateFn {
  return async (route: ActivatedRouteSnapshot) => {
    const deps = resolveDeps();
    const required = (route.data['orgRole'] as OrgRole | undefined) ?? role;
    await ensureOrgLoaded(deps);
    const allowed =
      required === 'OWNER' ? deps.permissions.isOrgOwner() : deps.permissions.isOrgOwnerOrAdmin();
    // Org-scoped routes have no project in scope → fall back to the dashboard.
    return allowed || deny(deps, null);
  };
}
