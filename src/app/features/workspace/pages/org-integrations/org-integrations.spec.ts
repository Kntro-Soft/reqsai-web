import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ToastService } from '../../../../shared/toast/toast.service';
import { IntegrationsApiService } from '../../data/integrations-api.service';
import { IntegrationConnectionResponse } from '../../data/integrations.models';
import { OrgIntegrations } from './org-integrations';

function site(id: string, siteUrl: string): IntegrationConnectionResponse {
  return {
    id,
    organizationId: 'o1',
    provider: 'JIRA',
    siteUrl,
    email: 'pm@acme.com',
    status: 'CONNECTED',
    credentialType: 'API_TOKEN',
    lastVerifiedAt: null,
    createdAt: '2026-10-12T00:00:00Z',
  } as IntegrationConnectionResponse;
}

describe('OrgIntegrations (Jira sites)', () => {
  let fixture: ComponentFixture<OrgIntegrations>;
  const api = {
    listConnections: vi.fn(),
    getJiraAuthorizeUrl: vi.fn(),
    deleteConnection: vi.fn(),
    testConnection: vi.fn(),
    createJiraConnection: vi.fn(),
  };

  const all = (testid: string) =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testid}"]`),
    ) as HTMLElement[];

  function create(sites: IntegrationConnectionResponse[]): void {
    api.listConnections.mockReturnValue(of(sites));
    api.getJiraAuthorizeUrl.mockReturnValue(of({ url: 'https://auth', state: 's' }));
    fixture = TestBed.createComponent(OrgIntegrations);
    fixture.detectChanges();
  }

  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    TestBed.configureTestingModule({
      imports: [
        OrgIntegrations,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: IntegrationsApiService, useValue: api },
        { provide: AuthStore, useValue: { organizationId: signal('o1') } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
  });

  it('shows the connect options when no site is connected', () => {
    create([]);

    expect(all('jira-connected')).toHaveLength(0);
    expect(all('jira-oauth-connect')).toHaveLength(1);
    expect(all('jira-site-hint')).toHaveLength(1);
    expect(all('jira-add-site')).toHaveLength(0);
  });

  it('lists every connected site and offers to connect another', () => {
    create([site('c1', 'https://acme.atlassian.net'), site('c2', 'https://beta.atlassian.net')]);

    const rows = all('jira-connected');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('https://acme.atlassian.net');
    expect(rows[1].textContent).toContain('https://beta.atlassian.net');
    expect(all('jira-oauth-connect')).toHaveLength(0);

    all('jira-add-site')[0].click();
    fixture.detectChanges();

    expect(all('jira-oauth-connect')).toHaveLength(1);
    expect(all('jira-connected')).toHaveLength(2);
  });

  it('disconnects one site and keeps the others', () => {
    api.deleteConnection.mockReturnValue(of(undefined));
    create([site('c1', 'https://acme.atlassian.net'), site('c2', 'https://beta.atlassian.net')]);

    all('jira-disconnect')[1].click();
    fixture.detectChanges();
    document.querySelector<HTMLElement>('[data-testid="jira-disconnect-confirm"]')?.click();
    fixture.detectChanges();

    expect(api.deleteConnection).toHaveBeenCalledWith('o1', 'c2');
    const rows = all('jira-connected');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('https://acme.atlassian.net');
  });
});
