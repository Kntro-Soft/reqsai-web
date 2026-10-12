import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { CodebaseApiService } from '../../../discovery/data/codebase-api.service';
import { GitHubConnectionResponse } from '../../../discovery/data/codebase.models';
import { IntegrationsApiService } from '../../data/integrations-api.service';
import { IntegrationConnectionResponse } from '../../data/integrations.models';
import { emptyDraft } from '../../data/project-setup';
import { ProjectSourcesStep } from './project-sources-step';

const JIRA = {
  id: 'c1',
  provider: 'JIRA',
  siteUrl: 'https://acme.atlassian.net',
} as IntegrationConnectionResponse;
const INSTALLED: GitHubConnectionResponse = {
  available: true,
  installations: [
    {
      installationId: 1001,
      account: 'acme',
      accountType: 'Organization',
      repositorySelection: 'selected',
      manageUrl: null,
      suspended: false,
      connectedAt: '2026-10-09T00:00:00Z',
    },
  ],
};
const REPOS = [
  {
    installationId: 1001,
    owner: 'acme',
    name: 'reservas',
    fullName: 'acme/reservas',
    defaultBranch: 'main',
    htmlUrl: '',
    private: false,
    description: null,
    pushedAt: null,
    connected: false,
  },
];

describe('ProjectSourcesStep', () => {
  function render(options: {
    jira: IntegrationConnectionResponse[];
    github: GitHubConnectionResponse;
    admin?: boolean;
  }) {
    const integrations = {
      listConnections: vi.fn(() => of(options.jira)),
      listJiraProjects: vi.fn(() => of([{ key: 'PAY', name: 'Payments' }])),
      listJiraIssueTypes: vi.fn(() => of([{ id: '1', name: 'Story' }])),
      getJiraAuthorizeUrl: vi.fn(() => of({ url: 'https://auth.atlassian.com/x', state: 's' })),
    };
    const codebase = {
      organizationGitHub: vi.fn(() => of(options.github)),
      organizationGitHubRepositories: vi.fn(() => of(REPOS)),
      startGitHubInstall: vi.fn(() => of({ url: 'https://github.com/apps/reqsai/new' })),
    };
    TestBed.configureTestingModule({
      imports: [ProjectSourcesStep, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideRouter([]),
        { provide: IntegrationsApiService, useValue: integrations },
        { provide: CodebaseApiService, useValue: codebase },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        {
          provide: PermissionsStore,
          useValue: {
            isOrgOwnerOrAdmin: () => options.admin ?? true,
            loadOrgAuthorization: () => of(void 0),
          },
        },
      ],
    });
    const fixture: ComponentFixture<ProjectSourcesStep> =
      TestBed.createComponent(ProjectSourcesStep);
    const redirect = vi.fn();
    fixture.componentRef.setInput('jira', emptyDraft().jira);
    fixture.componentRef.setInput('redirectTo', redirect);
    const leaving: string[] = [];
    fixture.componentInstance.leaving.subscribe((k) => leaving.push(k));
    fixture.detectChanges();
    return {
      fixture,
      el: fixture.nativeElement as HTMLElement,
      integrations,
      codebase,
      redirect,
      leaving,
    };
  }

  const byId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('shows owners how to connect both, and keeps the draft before leaving for GitHub', () => {
    const { fixture, el, codebase, redirect, leaving } = render({
      jira: [],
      github: { available: true, installations: [] },
    });

    expect(byId(el, 'sources-jira-connect')).not.toBeNull();
    expect(byId(el, 'sources-github-connect')).not.toBeNull();
    byId(el, 'sources-github-connect-button')!.click();
    fixture.detectChanges();

    expect(codebase.startGitHubInstall).toHaveBeenCalledWith('org-1');
    expect(leaving).toEqual(['github']);
    expect(redirect).toHaveBeenCalledWith('https://github.com/apps/reqsai/new');
  });

  it('keeps the draft before leaving for Atlassian', () => {
    const { el, fixture, redirect, leaving } = render({
      jira: [],
      github: { available: false, installations: [] },
    });

    byId(el, 'sources-jira-connect-button')!.click();
    fixture.detectChanges();

    expect(leaving).toEqual(['jira']);
    expect(redirect).toHaveBeenCalledWith('https://auth.atlassian.com/x');
  });

  it('tells a member to ask an admin instead of offering the connect actions', () => {
    const { el } = render({
      jira: [],
      github: { available: true, installations: [] },
      admin: false,
    });

    expect(byId(el, 'sources-jira-ask-admin')).not.toBeNull();
    expect(byId(el, 'sources-github-ask-admin')).not.toBeNull();
    expect(byId(el, 'sources-jira-connect-button')).toBeNull();
    expect(byId(el, 'sources-github-connect-button')).toBeNull();
  });

  it('lists the shared repositories and picks them, at most three', () => {
    const { fixture, el } = render({ jira: [JIRA], github: INSTALLED });

    const row = el.querySelector<HTMLInputElement>('[data-testid="repo-picker-row"] input')!;
    row.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.picks()).toEqual([
      { installationId: 1001, fullName: 'acme/reservas', branch: '' },
    ]);
  });

  it('enables Jira with the connection, then loads its projects and issue types', () => {
    const { fixture, el, integrations } = render({ jira: [JIRA], github: INSTALLED });

    expect(fixture.componentInstance.jira().connectionId).toBe('c1');
    const toggle = byId(el, 'sources-jira-enable') as HTMLInputElement;
    toggle.click();
    fixture.detectChanges();

    expect(integrations.listJiraProjects).toHaveBeenCalledWith('org-1', 'c1');
    expect(fixture.componentInstance.jira().enabled).toBe(true);
    expect(byId(el, 'sources-jira-fields')).not.toBeNull();
  });
});
