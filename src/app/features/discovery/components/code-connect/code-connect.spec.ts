import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeConnect } from './code-connect';
import { CodebaseApiService } from '../../data/codebase-api.service';
import {
  CodeRepositoryResponse,
  GitHubConnectionResponse,
  GitHubRepositoryResponse,
} from '../../data/codebase.models';
import { GITHUB_RETURN_KEY } from '../../data/codebase';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';

const INSTALLED: GitHubConnectionResponse = {
  available: true,
  installations: [
    {
      installationId: 1001,
      account: 'acme',
      accountType: 'Organization',
      repositorySelection: 'selected',
      manageUrl: 'https://github.com/organizations/acme/settings/installations/1001',
      suspended: false,
      connectedAt: '2026-10-09T00:00:00Z',
    },
  ],
};

function github(overrides: Partial<GitHubRepositoryResponse>): GitHubRepositoryResponse {
  return {
    installationId: 1001,
    owner: 'acme',
    name: 'reservas',
    fullName: 'acme/reservas',
    defaultBranch: 'main',
    htmlUrl: 'https://github.com/acme/reservas',
    private: false,
    description: null,
    pushedAt: '2026-10-01T00:00:00Z',
    connected: false,
    ...overrides,
  };
}

const REPOS = [
  github({
    name: 'facturacion',
    fullName: 'acme/facturacion',
    private: true,
    description: 'Cobros',
  }),
  github({ name: 'reservas', fullName: 'acme/reservas', connected: true }),
  github({ name: 'web', fullName: 'acme/web', defaultBranch: 'develop' }),
];

describe('CodeConnect', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  afterEach(() => sessionStorage.removeItem(GITHUB_RETURN_KEY));

  function render(
    connection: GitHubConnectionResponse | 'error',
    admin = true,
  ): {
    fixture: ComponentFixture<CodeConnect>;
    el: HTMLElement;
    emitted: CodeRepositoryResponse[];
  } {
    api = {
      projectGitHub: vi.fn(() =>
        connection === 'error' ? throwError(() => new Error('boom')) : of(connection),
      ),
      gitHubRepositories: vi.fn(() => of(REPOS)),
      connectRepository: vi.fn((_p: string, body: { repository: string }) =>
        of({ id: 'r1', fullName: body.repository } as CodeRepositoryResponse),
      ),
      startGitHubInstall: vi.fn(() =>
        of({ url: 'https://github.com/apps/reqsai/installations/new?state=s' }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [CodeConnect, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideRouter([]),
        { provide: CodebaseApiService, useValue: api },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        { provide: PermissionsStore, useValue: { isOrgOwnerOrAdmin: () => admin } },
      ],
    });
    const fixture = TestBed.createComponent(CodeConnect);
    fixture.componentRef.setInput('projectId', 'p1');
    const emitted: CodeRepositoryResponse[] = [];
    fixture.componentInstance.connected.subscribe((r) => emitted.push(r));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, emitted };
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const rows = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLElement>('[data-testid="code-github-repo"]'));

  it('lists what the GitHub App shares, already connected ones disabled, and filters them', () => {
    const { fixture, el } = render(INSTALLED);

    expect(api['gitHubRepositories']).toHaveBeenCalledWith('p1');
    expect(rows(el).map((r) => r.dataset['fullName'])).toEqual([
      'acme/facturacion',
      'acme/reservas',
      'acme/web',
    ]);
    expect(rows(el)[1].querySelector('input')!.disabled).toBe(true);
    expect(byTestId(el, 'code-github-manage')!.getAttribute('href')).toContain(
      '/installations/1001',
    );
    // The public form waits behind a link while the picker is there.
    expect(byTestId(el, 'code-connect-form')).toBeNull();

    const filter = byTestId(el, 'code-github-filter') as HTMLInputElement;
    filter.value = 'cobros';
    filter.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(rows(el).map((r) => r.dataset['fullName'])).toEqual(['acme/facturacion']);
  });

  it('connects the picked repository through its installation', () => {
    const { fixture, el, emitted } = render(INSTALLED);

    expect((byTestId(el, 'code-github-submit') as HTMLButtonElement).disabled).toBe(true);
    rows(el)[2].querySelector('input')!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect((byTestId(el, 'code-github-branch') as HTMLInputElement).placeholder).toBe('develop');
    byTestId(el, 'code-github-submit')!.click();
    fixture.detectChanges();

    expect(api['connectRepository']).toHaveBeenCalledWith('p1', {
      repository: 'acme/web',
      branch: null,
      installationId: 1001,
    });
    expect(emitted.map((r) => r.fullName)).toEqual(['acme/web']);
    expect(rows(el)[2].querySelector('input')!.disabled).toBe(true);
  });

  it('closes from the picker when opened over existing repositories', () => {
    const { fixture, el } = render(INSTALLED);
    fixture.componentRef.setInput('showCancel', true);
    fixture.detectChanges();
    let closed = 0;
    fixture.componentInstance.cancelled.subscribe(() => closed++);

    const cancels = el.querySelectorAll('[data-testid="code-connect-cancel"]');
    expect(cancels).toHaveLength(1);
    (cancels[0] as HTMLElement).click();
    expect(closed).toBe(1);
  });

  it('still connects a public repository by name from behind the link', () => {
    const { fixture, el } = render(INSTALLED);

    byTestId(el, 'code-typed-toggle')!.click();
    fixture.detectChanges();
    const input = byTestId(el, 'code-repo-input') as HTMLInputElement;
    input.value = 'octo/public';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    byTestId(el, 'code-connect-submit')!.click();

    expect(api['connectRepository']).toHaveBeenCalledWith('p1', {
      repository: 'octo/public',
      branch: null,
    });
  });

  it('lets an org admin connect GitHub, remembering this page to come back to', () => {
    const { fixture, el } = render({ available: true, installations: [] });
    const redirect = vi
      .spyOn(fixture.componentInstance as unknown as { redirect: (u: string) => void }, 'redirect')
      .mockImplementation(() => undefined);

    expect(byTestId(el, 'code-connect-form')).not.toBeNull();
    byTestId(el, 'code-github-connect')!.click();

    expect(api['startGitHubInstall']).toHaveBeenCalledWith('org-1');
    expect(redirect).toHaveBeenCalledWith(
      'https://github.com/apps/reqsai/installations/new?state=s',
    );
    expect(sessionStorage.getItem(GITHUB_RETURN_KEY)).toBe('/');
  });

  it('tells a member who cannot connect GitHub whom to ask', () => {
    const { el } = render({ available: true, installations: [] }, false);

    expect(byTestId(el, 'code-github-connect')).toBeNull();
    expect(byTestId(el, 'code-github-ask-admin')).not.toBeNull();
  });

  it('falls back to public repositories when GitHub is unavailable or unreachable', () => {
    const cases: (GitHubConnectionResponse | 'error')[] = [
      { available: false, installations: [] },
      'error',
    ];
    for (const connection of cases) {
      TestBed.resetTestingModule();
      const { el } = render(connection);
      expect(byTestId(el, 'code-github-cta')).toBeNull();
      expect(byTestId(el, 'code-github-picker')).toBeNull();
      expect(byTestId(el, 'code-connect-form')).not.toBeNull();
    }
  });
});
