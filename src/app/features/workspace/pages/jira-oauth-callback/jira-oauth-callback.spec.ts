import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraOAuthCallback, parseJiraOAuthParams } from './jira-oauth-callback';
import { IntegrationsApiService } from '../../data/integrations-api.service';
import { JIRA_RETURN_KEY } from '../../data/integrations.models';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ToastService } from '../../../../shared/toast/toast.service';

describe('parseJiraOAuthParams', () => {
  it('reads code and state from the redirect', () => {
    const params = parseJiraOAuthParams(
      convertToParamMap({ code: 'auth-code', state: 'signed-state' }),
    );
    expect(params).toEqual({ code: 'auth-code', state: 'signed-state', error: null });
  });

  it('surfaces a provider error', () => {
    const params = parseJiraOAuthParams(convertToParamMap({ error: 'access_denied' }));
    expect(params.error).toBe('access_denied');
    expect(params.code).toBeNull();
  });

  it('normalizes blank/whitespace params to null', () => {
    const params = parseJiraOAuthParams(convertToParamMap({ code: '   ', state: '' }));
    expect(params).toEqual({ code: null, state: null, error: null });
  });

  it('is all-null when no params are present', () => {
    expect(parseJiraOAuthParams(convertToParamMap({}))).toEqual({
      code: null,
      state: null,
      error: null,
    });
  });
});

describe('JiraOAuthCallback', () => {
  let navigateByUrl: ReturnType<typeof vi.fn>;

  afterEach(() => sessionStorage.removeItem(JIRA_RETURN_KEY));

  function render(): void {
    navigateByUrl = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({
      imports: [JiraOAuthCallback, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        {
          provide: IntegrationsApiService,
          useValue: { completeJiraOAuth: vi.fn(() => of({ id: 'c1', provider: 'JIRA' })) },
        },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: Router, useValue: { navigateByUrl, navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ code: 'c', state: 's' }) } },
        },
      ],
    });
    TestBed.createComponent(JiraOAuthCallback).detectChanges();
  }

  it('returns to the project that started the consent', () => {
    sessionStorage.setItem(JIRA_RETURN_KEY, '/projects/p1/settings/integrations');
    render();
    expect(navigateByUrl).toHaveBeenCalledWith('/projects/p1/settings/integrations');
    expect(sessionStorage.getItem(JIRA_RETURN_KEY)).toBeNull();
  });

  it('returns to the organization integrations by default', () => {
    render();
    expect(navigateByUrl).toHaveBeenCalledWith('/settings/integrations');
  });
});
