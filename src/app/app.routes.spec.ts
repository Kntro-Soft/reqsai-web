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
import { FeatureFlagMap, provideFeatureFlags } from './core/features/feature-flags';
import { TenantContextService } from './core/tenant/tenant-context.service';

/** Every non-MVP URL, each gated by one feature flag. */
const HIDDEN_URLS = [
  '/settings/billing',
  '/billing/success',
  '/billing/cancel',
  '/settings/usage',
  '/settings/integrations',
  '/settings/integrations/jira/callback',
  '/projects/p1/settings/integrations',
  '/settings/members',
  '/projects/p1/settings/members',
  '/invitations/accept',
  '/projects/p1/settings/roles',
  '/projects/p1/settings/roles/new',
  '/projects/p1/settings/roles/r1/edit',
  '/account/notifications',
  '/account/tokens',
];

/** MVP URLs that must keep resolving with every flag off. */
const MVP_URLS = [
  '/projects',
  '/projects/p1/overview',
  '/projects/p1/sessions/history',
  '/projects/p1/stories',
  '/projects/p1/stories/new',
  '/projects/p1/stories/s1',
  '/projects/p1/glossary',
  '/projects/p1/constraints',
  '/projects/p1/settings/general',
  '/projects/p1/settings/danger',
  '/settings/general',
  '/account/profile',
  '/account/security',
  '/account/appearance',
];

/** The MVP release: every non-MVP feature off (explicit, so the test doesn't follow the env). */
const ALL_OFF: FeatureFlagMap = {
  billing: false,
  usage: false,
  integrations: false,
  members: false,
  customRoles: false,
  notifications: false,
  tokens: false,
};

const ALL_ON: FeatureFlagMap = {
  billing: true,
  usage: true,
  integrations: true,
  members: true,
  customRoles: true,
  notifications: true,
  tokens: true,
};

/**
 * Drives the REAL route table as a signed-in organization owner (stubbed auth, terms and
 * permissions, so every role/permission guard passes) and reports where each URL ends up.
 * No outlet is mounted, so the lazy pages are loaded but never rendered.
 */
describe('app routes with feature flags', () => {
  function setup(flags: FeatureFlagMap): Router {
    TestBed.configureTestingModule({
      imports: [TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes, withRouterConfig({ paramsInheritanceStrategy: 'always' })),
        provideFeatureFlags(flags),
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

  describe('with the MVP flags (all off)', () => {
    it.each(HIDDEN_URLS)('treats %s as an unknown URL (falls back to /projects)', async (url) => {
      const router = setup(ALL_OFF);
      expect(await landing(router, url)).toBe('/projects');
    });

    it.each(['/members', '/projects/p1/members'])(
      'sends the legacy %s redirect to the fallback too',
      async (url) => {
        const router = setup(ALL_OFF);
        expect(await landing(router, url)).toBe('/projects');
      },
    );

    it.each(MVP_URLS)('still resolves %s', async (url) => {
      const router = setup(ALL_OFF);
      expect(await landing(router, url)).toBe(url);
    });

    it('lands the project settings index on General', async () => {
      const router = setup(ALL_OFF);
      expect(await landing(router, '/projects/p1/settings')).toBe('/projects/p1/settings/general');
    });
  });

  describe('with every flag on', () => {
    it.each(HIDDEN_URLS)('resolves %s again', async (url) => {
      const router = setup(ALL_ON);
      expect(await landing(router, url)).toBe(url);
    });
  });
});
