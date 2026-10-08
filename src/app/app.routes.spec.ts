import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withRouterConfig } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { routes } from './app.routes';
import { AuthStore } from './core/auth/auth.store';
import { CURRENT_TERMS_VERSION } from './core/auth/terms';
import { PermissionsStore } from './core/authz/permissions.store';
import { TenantContextService } from './core/tenant/tenant-context.service';

/** Every product page; all of them ship (there are no feature flags). */
const PRODUCT_URLS = [
  '/projects',
  '/projects/p1/overview',
  '/projects/p1/sessions/history',
  '/projects/p1/stories',
  '/projects/p1/stories/new',
  '/projects/p1/stories/s1',
  '/projects/p1/glossary',
  '/projects/p1/constraints',
  '/projects/p1/documents',
  '/projects/p1/settings/general',
  '/projects/p1/settings/roles',
  '/projects/p1/settings/roles/new',
  '/projects/p1/settings/roles/r1/edit',
  '/projects/p1/settings/members',
  '/projects/p1/settings/integrations',
  '/projects/p1/settings/danger',
  '/settings/general',
  '/settings/members',
  '/settings/billing',
  '/settings/integrations',
  '/settings/integrations/jira/callback',
  '/settings/usage',
  '/billing/success',
  '/billing/cancel',
  '/invitations/accept',
  '/account/profile',
  '/account/security',
  '/account/appearance',
];

/**
 * Drives the REAL route table as a signed-in organization owner (stubbed auth, terms and
 * permissions, so every role/permission guard passes) and reports where each URL ends up.
 * No outlet is mounted, so the lazy pages are loaded but never rendered.
 */
describe('app routes', () => {
  function setup(): Router {
    TestBed.configureTestingModule({
      imports: [TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes, withRouterConfig({ paramsInheritanceStrategy: 'always' })),
        {
          provide: AuthStore,
          useValue: { isAuthenticated: () => true, organizationId: () => 'org-1' },
        },
        {
          provide: TenantContextService,
          useValue: { termsVersion: () => CURRENT_TERMS_VERSION },
        },
        {
          provide: PermissionsStore,
          useValue: {
            loadOrgAuthorization: () => of(undefined),
            loadProjectPermissions: () => of(undefined),
            isOrgOwner: () => true,
            isOrgOwnerOrAdmin: () => true,
            has: () => true,
          },
        },
      ],
    });
    return TestBed.inject(Router);
  }

  async function landing(router: Router, url: string): Promise<string> {
    await router.navigateByUrl(url);
    return router.url;
  }

  it.each(PRODUCT_URLS)('resolves %s', async (url) => {
    const router = setup();
    expect(await landing(router, url)).toBe(url);
  });

  it.each([
    ['/members', '/settings/members'],
    ['/projects/p1/members', '/projects/p1/settings/members'],
  ])('redirects the legacy %s to %s', async (url, target) => {
    const router = setup();
    expect(await landing(router, url)).toBe(target);
  });

  it('lands the project settings index on General', async () => {
    const router = setup();
    expect(await landing(router, '/projects/p1/settings')).toBe('/projects/p1/settings/general');
  });

  it.each(['/account/notifications', '/account/tokens', '/nowhere'])(
    'treats %s as an unknown URL (falls back to /projects)',
    async (url) => {
      const router = setup();
      expect(await landing(router, url)).toBe('/projects');
    },
  );
});
