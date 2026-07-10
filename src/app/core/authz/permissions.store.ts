import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, map, of, tap } from 'rxjs';
import { PermissionsApiService } from './permissions-api.service';
import { BasePermission, OrgRole } from './permissions.models';

/**
 * Root-provided signal store for the caller's RBAC context: their org-level role
 * and base permission, plus their effective permission set on the active project.
 *
 * Defense-in-depth: the backend already enforces every rule and returns 403 when a
 * call isn't allowed. This store exists purely so the UI can be permission-aware —
 * hiding menu items and buttons the user can't use, and short-circuiting routes with
 * a friendly redirect instead of a red error. Never treat it as the security boundary.
 *
 * Owner/admin implicitly hold everything: the backend returns ALL permissions for
 * them, so the set is already complete — but {@link has} also short-circuits on role
 * as a defensive belt-and-suspenders.
 *
 * Loads are cached per id (org / project) and reset when the org changes or on logout.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsStore {
  private readonly api = inject(PermissionsApiService);

  private readonly _orgRole = signal<OrgRole | null>(null);
  private readonly _memberBasePermission = signal<BasePermission | null>(null);
  private readonly _projectPermissions = signal<ReadonlySet<string>>(new Set());
  private readonly _orgLoading = signal(false);
  private readonly _projectLoading = signal(false);

  /** The org this store's authorization currently reflects (cache key). */
  private loadedOrgId: string | null = null;
  /** The project this store's permissions currently reflect (cache key). */
  private loadedProjectId: string | null = null;

  readonly orgRole = this._orgRole.asReadonly();
  readonly memberBasePermission = this._memberBasePermission.asReadonly();
  readonly projectPermissions = this._projectPermissions.asReadonly();
  readonly orgLoading = this._orgLoading.asReadonly();
  readonly projectLoading = this._projectLoading.asReadonly();

  readonly isOrgOwner = computed(() => this._orgRole() === 'OWNER');
  readonly isOrgAdmin = computed(() => this._orgRole() === 'ADMIN');
  readonly isOrgOwnerOrAdmin = computed(() => {
    const role = this._orgRole();
    return role === 'OWNER' || role === 'ADMIN';
  });

  /**
   * Whether the caller holds `permission` on the active project. Owner/admin pass
   * implicitly (their permission set is already complete, but the role check guards
   * the window before the project set has loaded).
   */
  has(permission: string): boolean {
    if (this.isOrgOwnerOrAdmin()) return true;
    return this._projectPermissions().has(permission);
  }

  /**
   * Loads the caller's org authorization (role + base permission) and caches it by
   * org id. Returns void so callers can just subscribe; a repeat call for the same
   * org is a no-op unless {@link refresh}ed.
   */
  loadOrgAuthorization(orgId: string): Observable<void> {
    if (this.loadedOrgId === orgId) return of(void 0);
    this.loadedOrgId = orgId;
    this._orgLoading.set(true);
    return this.api.getOrgAuthorization(orgId).pipe(
      tap((res) => {
        this._orgRole.set(res.orgRole);
        this._memberBasePermission.set(res.memberBasePermission);
      }),
      map(() => void 0),
      finalize(() => this._orgLoading.set(false)),
    );
  }

  /**
   * Loads the caller's effective permissions on `projectId` and caches them. A repeat
   * call for the same project is a no-op unless {@link refresh}ed.
   */
  loadProjectPermissions(projectId: string): Observable<void> {
    if (this.loadedProjectId === projectId) return of(void 0);
    this.loadedProjectId = projectId;
    this._projectLoading.set(true);
    return this.api.getProjectPermissions(projectId).pipe(
      tap((res) => this._projectPermissions.set(new Set(res.permissions))),
      map(() => void 0),
      finalize(() => this._projectLoading.set(false)),
    );
  }

  /** Locally reflect a base-permission change saved via the settings card. */
  setMemberBasePermission(basePermission: BasePermission): void {
    this._memberBasePermission.set(basePermission);
  }

  /** Drop the org-authorization cache so the next load re-fetches (e.g. after a role change). */
  refreshOrgAuthorization(): void {
    this.loadedOrgId = null;
  }

  /** Drop the project-permission cache so the next load re-fetches. */
  refreshProjectPermissions(): void {
    this.loadedProjectId = null;
  }

  /**
   * Reset the project permission set — called when leaving a project so a member
   * entering another project never briefly sees the previous project's grants.
   */
  resetProject(): void {
    this.loadedProjectId = null;
    this._projectPermissions.set(new Set());
    this._projectLoading.set(false);
  }

  /** Full reset — called on org switch and on logout. */
  reset(): void {
    this.loadedOrgId = null;
    this.loadedProjectId = null;
    this._orgRole.set(null);
    this._memberBasePermission.set(null);
    this._projectPermissions.set(new Set());
    this._orgLoading.set(false);
    this._projectLoading.set(false);
  }
}
