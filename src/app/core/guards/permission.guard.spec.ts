import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  Route,
  Router,
  RouterStateSnapshot,
  UrlSegment,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import { AuthStore } from '../auth/auth.store';
import { PermissionsStore } from '../authz/permissions.store';
import { OrgRole } from '../authz/permissions.models';
import { ToastService } from '../../shared/toast/toast.service';
import { requireOrgRole, requirePermission, requirePermissionMatch } from './permission.guard';

/** Builds an activation snapshot exposing a `projectId` param and optional route data. */
function snapshot(
  projectId: string | null,
  data: Record<string, unknown> = {},
): ActivatedRouteSnapshot {
  return {
    data,
    paramMap: { get: (k: string) => (k === 'projectId' ? projectId : null) },
  } as unknown as ActivatedRouteSnapshot;
}

function segments(paths: string[]): UrlSegment[] {
  return paths.map((p) => ({ path: p }) as UrlSegment);
}

const state = {} as RouterStateSnapshot;

describe('permission guards', () => {
  let permissions: PermissionsStore;
  let auth: AuthStore;
  let toast: ToastService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    permissions = TestBed.inject(PermissionsStore);
    auth = TestBed.inject(AuthStore);
    toast = TestBed.inject(ToastService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /**
   * Seeds the store's org role via its public API (an HTTP round-trip through the
   * testing controller), then pins the AuthStore at the SAME org id — so the guard's
   * own `loadOrgAuthorization` is a cache hit and issues no second request.
   */
  function seedRole(role: OrgRole): void {
    permissions.loadOrgAuthorization('org-seed').subscribe();
    http
      .expectOne('/api/organizations/org-seed/me/authorization')
      .flush({ orgRole: role, memberBasePermission: 'READ' });
    auth.setOrganizationId('org-seed');
  }

  /** Seeds a project's effective permission set (member — no owner/admin bypass). */
  function seedProject(projectId: string, perms: string[]): void {
    permissions.loadProjectPermissions(projectId).subscribe();
    http.expectOne(`/api/projects/${projectId}/me/permissions`).flush({ permissions: perms });
  }

  describe('requirePermission', () => {
    it('grants when the caller holds the permission', async () => {
      seedRole('MEMBER');
      seedProject('proj-1', ['STORY_READ']);

      const guard = requirePermission('STORY_READ');
      const result = await TestBed.runInInjectionContext(() => guard(snapshot('proj-1'), state));
      expect(result).toBe(true);
    });

    it('grants when the caller is an owner (implicit bypass)', async () => {
      seedRole('OWNER');
      const guard = requirePermission('STORY_READ');
      const result = await TestBed.runInInjectionContext(() => guard(snapshot('proj-1'), state));
      expect(result).toBe(true);
    });

    it('denies (UrlTree to the project) when the caller lacks it, and toasts', async () => {
      seedRole('MEMBER');
      seedProject('proj-1', []);
      const errorSpy = vi.spyOn(toast, 'error');

      const guard = requirePermission('STORY_READ');
      const result = await TestBed.runInInjectionContext(() => guard(snapshot('proj-1'), state));

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/projects/proj-1');
      expect(errorSpy).toHaveBeenCalledOnce();
    });

    it('denies to the dashboard when there is no project in scope', async () => {
      seedRole('MEMBER');
      const guard = requirePermission('DOCUMENT_READ');
      const result = await TestBed.runInInjectionContext(() => guard(snapshot(null), state));

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/projects');
    });

    it('reads the required permission from route data when present', async () => {
      seedRole('MEMBER');
      seedProject('proj-9', ['STORY_READ']);
      const guard = requirePermission('STORY_READ');
      const result = await TestBed.runInInjectionContext(() =>
        guard(snapshot('proj-9', { permission: 'DOCUMENT_READ' }), state),
      );
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/projects/proj-9');
    });
  });

  describe('requirePermissionMatch', () => {
    it('denies and redirects using the projectId parsed from the segments', async () => {
      seedRole('MEMBER');
      seedProject('proj-7', []);
      const guard = requirePermissionMatch('STORY_READ');
      const result = await TestBed.runInInjectionContext(() =>
        guard({ data: {} } as Route, segments(['projects', 'proj-7', 'stories']), {} as never),
      );
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/projects/proj-7');
    });

    it('recovers the projectId from the navigation URL when the matched segments omit it', async () => {
      // A deep child's CanMatch receives only its own segments (e.g. ['members']); the
      // projectId must come from the full in-flight URL, else the guard denies to /projects.
      seedRole('MEMBER');
      seedProject('proj-8', ['MEMBER_READ']);
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'getCurrentNavigation').mockReturnValue({
        extractedUrl: router.parseUrl('/projects/proj-8/settings/members'),
      } as never);

      const guard = requirePermissionMatch('MEMBER_READ');
      const result = await TestBed.runInInjectionContext(() =>
        guard({ data: {} } as Route, segments(['members']), {} as never),
      );
      expect(result).toBe(true);
    });
  });

  describe('requireOrgRole', () => {
    it('grants OWNER-only routes to the owner', async () => {
      seedRole('OWNER');
      const guard = requireOrgRole('OWNER');
      const result = await TestBed.runInInjectionContext(() => guard(snapshot(null), state));
      expect(result).toBe(true);
    });

    it('denies OWNER-only routes to an admin (redirect to dashboard)', async () => {
      seedRole('ADMIN');
      const guard = requireOrgRole('OWNER');
      const result = await TestBed.runInInjectionContext(() => guard(snapshot(null), state));
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/projects');
    });

    it('grants ADMIN routes to both owner and admin', async () => {
      seedRole('ADMIN');
      const guard = requireOrgRole('ADMIN');
      const result = await TestBed.runInInjectionContext(() => guard(snapshot(null), state));
      expect(result).toBe(true);
    });

    it('denies ADMIN routes to a plain member', async () => {
      seedRole('MEMBER');
      const guard = requireOrgRole('ADMIN');
      const result = await TestBed.runInInjectionContext(() => guard(snapshot(null), state));
      expect(result).toBeInstanceOf(UrlTree);
    });
  });
});
