import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectIntegrations } from './project-integrations';
import { IntegrationsApiService } from '../../data/integrations-api.service';
import { JIRA_RETURN_KEY } from '../../data/integrations.models';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { ToastService } from '../../../../shared/toast/toast.service';
import { CodebaseApiService } from '../../../discovery/data/codebase-api.service';

describe('ProjectIntegrations without a Jira connection', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  afterEach(() => sessionStorage.removeItem(JIRA_RETURN_KEY));

  function render(
    admin: boolean,
    oauthConfigured = true,
  ): { fixture: ComponentFixture<ProjectIntegrations>; el: HTMLElement } {
    const authorize = oauthConfigured
      ? of({ url: 'https://auth.atlassian.com/authorize?x=1', state: 's' })
      : throwError(
          () =>
            new HttpErrorResponse({ status: 501, error: { code: 'JIRA_OAUTH_NOT_CONFIGURED' } }),
        );
    api = {
      listConnections: vi.fn(() => of([])),
      getJiraAuthorizeUrl: vi.fn(() => authorize),
    };
    TestBed.configureTestingModule({
      imports: [ProjectIntegrations, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideRouter([]),
        { provide: IntegrationsApiService, useValue: api },
        {
          provide: CodebaseApiService,
          useValue: {
            projectGitHub: vi.fn(() => of({ available: false, installations: [] })),
            listRepositories: vi.fn(() => of([])),
          },
        },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        { provide: PermissionsStore, useValue: { isOrgOwnerOrAdmin: () => admin } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ProjectIntegrations);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('lets an org admin connect Jira from the project, coming back to it', () => {
    const { fixture, el } = render(true);
    const redirect = vi
      .spyOn(fixture.componentInstance as unknown as { redirect: (u: string) => void }, 'redirect')
      .mockImplementation(() => undefined);

    byTestId(el, 'project-jira-connect')!.click();

    expect(redirect).toHaveBeenCalledWith('https://auth.atlassian.com/authorize?x=1');
    expect(sessionStorage.getItem(JIRA_RETURN_KEY)).toBe('/');
    expect(byTestId(el, 'project-github')).not.toBeNull();
  });

  it('offers only the API-token path when the server has no Atlassian app', () => {
    const { el } = render(true, false);
    expect(byTestId(el, 'project-jira-connect')).toBeNull();
    expect(byTestId(el, 'project-jira-org-settings')).not.toBeNull();
  });

  it('tells a member whom to ask instead of linking to settings they cannot open', () => {
    const { el } = render(false);
    expect(byTestId(el, 'project-jira-ask-admin')).not.toBeNull();
    expect(byTestId(el, 'project-jira-connect')).toBeNull();
    expect(byTestId(el, 'project-jira-org-settings')).toBeNull();
    expect(api['getJiraAuthorizeUrl']).not.toHaveBeenCalled();
  });
});
