import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubInstallCallback, parseGitHubInstallParams } from './github-install-callback';
import { CodebaseApiService } from '../../data/codebase-api.service';
import { GITHUB_RETURN_KEY } from '../../data/codebase';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ToastService } from '../../../../shared/toast/toast.service';

describe('parseGitHubInstallParams', () => {
  it('reads what GitHub sends and drops blank or malformed values', () => {
    expect(
      parseGitHubInstallParams(
        convertToParamMap({
          installation_id: '1001',
          setup_action: 'install',
          state: ' s.sig ',
          code: 'abc',
        }),
      ),
    ).toEqual({ installationId: 1001, setupAction: 'install', state: 's.sig', code: 'abc' });
    expect(
      parseGitHubInstallParams(convertToParamMap({ installation_id: '12abc', code: '  ' })),
    ).toEqual({ installationId: null, setupAction: null, state: null, code: null });
  });
});

describe('GitHubInstallCallback', () => {
  let api: { completeGitHubInstall: ReturnType<typeof vi.fn> };
  let navigateByUrl: ReturnType<typeof vi.fn>;

  afterEach(() => sessionStorage.removeItem(GITHUB_RETURN_KEY));

  function render(query: Record<string, string>, result: unknown) {
    api = {
      completeGitHubInstall: vi.fn(() =>
        result instanceof HttpErrorResponse ? throwError(() => result) : of(result),
      ),
    };
    navigateByUrl = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({
      imports: [GitHubInstallCallback, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        { provide: CodebaseApiService, useValue: api },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: Router, useValue: { navigateByUrl, navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(GitHubInstallCallback);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const installed = { installation_id: '1001', setup_action: 'install', state: 's', code: 'c' };

  it('links the installation and returns to the page that started the install', () => {
    sessionStorage.setItem(GITHUB_RETURN_KEY, '/projects/p1/code');
    render(installed, { status: 'LINKED', installation: { account: 'acme' } });

    expect(api.completeGitHubInstall).toHaveBeenCalledWith('org-1', {
      installationId: 1001,
      setupAction: 'install',
      state: 's',
      code: 'c',
    });
    expect(navigateByUrl).toHaveBeenCalledWith('/projects/p1/code', {
      state: { githubConnected: true },
    });
    expect(sessionStorage.getItem(GITHUB_RETURN_KEY)).toBeNull();
  });

  it('never returns to another site, whatever was stored', () => {
    sessionStorage.setItem(GITHUB_RETURN_KEY, '//evil.example/path');
    render(installed, { status: 'LINKED', installation: { account: 'acme' } });
    expect(navigateByUrl).toHaveBeenCalledWith('/settings/integrations', {
      state: { githubConnected: true },
    });
  });

  it('explains a request that a GitHub organization owner must approve', () => {
    const el = render(
      { setup_action: 'request', state: 's' },
      { status: 'REQUESTED', installation: null },
    );
    expect(el.querySelector('[data-testid="github-requested"]')).not.toBeNull();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows the error of a refused link, and an abandoned install without calling the API', () => {
    let el = render(
      installed,
      new HttpErrorResponse({ status: 403, error: { code: 'CODE_HOST_INSTALLATION_FORBIDDEN' } }),
    );
    expect(el.querySelector('[data-testid="github-error"]')).not.toBeNull();

    TestBed.resetTestingModule();
    el = render({ setup_action: 'install' }, {});
    expect(api.completeGitHubInstall).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="github-error"]')).not.toBeNull();
  });
});
