import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanMatchFn, Route, Router, UrlSegment, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { provideFeatureFlags } from '../features/feature-flags';
import { featureGuard } from './feature.guard';

@Component({ template: '' })
class Page {}

const route = {} as Route;
const segments = [] as UrlSegment[];

/** Runs a `CanMatch` guard the way the router does: inside the injection context. */
function run(guard: CanMatchFn): unknown {
  return TestBed.runInInjectionContext(() => guard(route, segments, {} as never));
}

describe('featureGuard', () => {
  describe('as a guard function', () => {
    it('does not match while the feature is off', () => {
      TestBed.configureTestingModule({ providers: [provideFeatureFlags({ billing: false })] });
      expect(run(featureGuard('billing'))).toBe(false);
    });

    it('matches while the feature is on', () => {
      TestBed.configureTestingModule({ providers: [provideFeatureFlags({ billing: true })] });
      expect(run(featureGuard('billing'))).toBe(true);
    });

    it('never runs the chained guard while the feature is off', () => {
      TestBed.configureTestingModule({ providers: [provideFeatureFlags({ members: false })] });
      const next = vi.fn<CanMatchFn>(() => true);

      expect(run(featureGuard('members', next))).toBe(false);
      expect(next).not.toHaveBeenCalled();
    });

    it('defers to the chained guard while the feature is on', () => {
      TestBed.configureTestingModule({ providers: [provideFeatureFlags({ members: true })] });
      const next = vi.fn<CanMatchFn>(() => false);

      expect(run(featureGuard('members', next))).toBe(false);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('in a route table', () => {
    function navigate(flags: { billing: boolean }, url: string): Promise<string> {
      TestBed.configureTestingModule({
        providers: [
          provideFeatureFlags(flags),
          provideRouter([
            { path: 'home', component: Page },
            {
              path: 'settings',
              children: [
                { path: 'general', component: Page },
                { path: 'billing', canMatch: [featureGuard('billing')], component: Page },
              ],
            },
            { path: '**', redirectTo: 'home' },
          ]),
        ],
      });
      const router = TestBed.inject(Router);
      return router.navigateByUrl(url).then(() => router.url);
    }

    it('makes a disabled route behave like an unknown URL (wildcard fallback)', async () => {
      expect(await navigate({ billing: false }, '/settings/billing')).toBe('/home');
    });

    it('leaves sibling routes of a disabled one untouched', async () => {
      expect(await navigate({ billing: false }, '/settings/general')).toBe('/settings/general');
    });

    it('resolves the route normally once the feature is on', async () => {
      expect(await navigate({ billing: true }, '/settings/billing')).toBe('/settings/billing');
    });
  });
});
