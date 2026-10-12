import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { GitHubConnection } from './github-connection';
import { CodebaseApiService } from '../../data/codebase-api.service';
import { GitHubConnectionResponse } from '../../data/codebase.models';
import { ToastService } from '../../../../shared/toast/toast.service';

const CONNECTED: GitHubConnectionResponse = {
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

describe('GitHubConnection', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  function render(connection: GitHubConnectionResponse): {
    fixture: ComponentFixture<GitHubConnection>;
    el: HTMLElement;
  } {
    api = {
      organizationGitHub: vi.fn(() => of(connection)),
      startGitHubInstall: vi.fn(() =>
        of({ url: 'https://github.com/apps/reqsai/installations/new' }),
      ),
      disconnectGitHub: vi.fn(() => of(undefined)),
    };
    toast = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GitHubConnection, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        { provide: CodebaseApiService, useValue: api },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(GitHubConnection);
    fixture.componentRef.setInput('orgId', 'org-1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const byTestId = (el: HTMLElement | Document, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('says when the server has no GitHub App, without a connect button', () => {
    const { el } = render({ available: false, installations: [] });

    expect(api['organizationGitHub']).toHaveBeenCalledWith('org-1');
    expect(byTestId(el, 'github-unavailable')).not.toBeNull();
    expect(byTestId(el, 'github-connect')).toBeNull();
  });

  it('installs the App on GitHub from an unconnected organization', () => {
    const { fixture, el } = render({ available: true, installations: [] });
    const redirect = vi
      .spyOn(fixture.componentInstance as unknown as { redirect: (u: string) => void }, 'redirect')
      .mockImplementation(() => undefined);

    byTestId(el, 'github-connect')!.click();

    expect(api['startGitHubInstall']).toHaveBeenCalledWith('org-1');
    expect(redirect).toHaveBeenCalledWith('https://github.com/apps/reqsai/installations/new');
  });

  it('lists the connected accounts and unlinks one after confirming', () => {
    const { fixture, el } = render(CONNECTED);

    const row = byTestId(el, 'github-installation')!;
    expect(row.dataset['account']).toBe('acme');
    expect(byTestId(row, 'github-manage')!.getAttribute('href')).toContain('/installations/1001');

    byTestId(row, 'github-disconnect')!.click();
    fixture.detectChanges();
    expect(api['disconnectGitHub']).not.toHaveBeenCalled();
    byTestId(document, 'github-disconnect-confirm')!.click();
    fixture.detectChanges();

    expect(api['disconnectGitHub']).toHaveBeenCalledWith('org-1', 1001);
    expect(byTestId(el, 'github-installation')).toBeNull();
    expect(toast.success).toHaveBeenCalled();
  });
});
