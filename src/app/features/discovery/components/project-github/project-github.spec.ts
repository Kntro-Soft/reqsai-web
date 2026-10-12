import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectGitHub } from './project-github';
import { CodebaseApiService } from '../../data/codebase-api.service';
import { CodeRepositoryResponse, GitHubConnectionResponse } from '../../data/codebase.models';
import { GITHUB_RETURN_KEY } from '../../data/codebase';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';

const CONNECTED: GitHubConnectionResponse = {
  available: true,
  installations: [
    {
      installationId: 1,
      account: 'kntro-soft',
      accountType: 'Organization',
      repositorySelection: 'selected',
      manageUrl: null,
      suspended: false,
      connectedAt: '2026-10-11T00:00:00Z',
    },
  ],
};

const REPO = {
  id: 'r1',
  fullName: 'kntro-soft/landing',
  htmlUrl: 'https://github.com/kntro-soft/landing',
  branch: 'main',
  private: true,
  autoUpdate: true,
  status: 'READY',
} as CodeRepositoryResponse;

describe('ProjectGitHub', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  afterEach(() => sessionStorage.removeItem(GITHUB_RETURN_KEY));

  function render(
    connection: GitHubConnectionResponse,
    repositories: CodeRepositoryResponse[],
    admin = true,
  ): { fixture: ComponentFixture<ProjectGitHub>; el: HTMLElement } {
    api = {
      projectGitHub: vi.fn(() => of(connection)),
      listRepositories: vi.fn(() => of(repositories)),
      startGitHubInstall: vi.fn(() =>
        of({ url: 'https://github.com/apps/reqsai/installations/new' }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [ProjectGitHub, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideRouter([]),
        { provide: CodebaseApiService, useValue: api },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        { provide: PermissionsStore, useValue: { isOrgOwnerOrAdmin: () => admin } },
      ],
    });
    const fixture = TestBed.createComponent(ProjectGitHub);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it("shows the organization's GitHub and the repositories this project reads", () => {
    const { el } = render(CONNECTED, [REPO]);

    expect(api['projectGitHub']).toHaveBeenCalledWith('p1');
    expect(api['listRepositories']).toHaveBeenCalledWith('p1');
    expect(byTestId(el, 'project-github-connected')).not.toBeNull();
    const repo = byTestId(el, 'project-github-repo')!;
    expect(repo.textContent).toContain('kntro-soft/landing');
    expect(repo.dataset['status']).toBe('READY');
    expect(byTestId(el, 'project-github-manage')!.getAttribute('href')).toBe('/projects/p1/code');
  });

  it('lets an org admin connect GitHub from the project, coming back to it', () => {
    const { fixture, el } = render({ available: true, installations: [] }, []);
    const redirect = vi
      .spyOn(fixture.componentInstance as unknown as { redirect: (u: string) => void }, 'redirect')
      .mockImplementation(() => undefined);

    expect(byTestId(el, 'project-github-no-repos')).not.toBeNull();
    byTestId(el, 'project-github-connect')!.click();

    expect(api['startGitHubInstall']).toHaveBeenCalledWith('org-1');
    expect(redirect).toHaveBeenCalledWith('https://github.com/apps/reqsai/installations/new');
    expect(sessionStorage.getItem(GITHUB_RETURN_KEY)).toBe('/');
  });

  it('tells a member whom to ask, and says when the server has no GitHub App', () => {
    let { el } = render({ available: true, installations: [] }, [], false);
    expect(byTestId(el, 'project-github-connect')).toBeNull();
    expect(byTestId(el, 'project-github-not-connected')).not.toBeNull();

    TestBed.resetTestingModule();
    ({ el } = render({ available: false, installations: [] }, []));
    expect(byTestId(el, 'project-github-unavailable')).not.toBeNull();
  });
});
